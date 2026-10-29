/**
 * @opensearch/shared — Privacy Guards & Low-Cardinality Enforcers (Phase 113)
 *
 * Enforces zero-surveillance invariants for operational observability:
 * 1. Strictly prohibits high-cardinality labels, user queries, user IDs, and client IPs.
 * 2. Normalizes request paths to bounded, static canonical route templates.
 * 3. Redacts credentials, tokens, and query strings from measured URLs.
 */

/**
 * Forbidden label keys that must never be used in metrics due to privacy or cardinality risks.
 */
export const FORBIDDEN_METRIC_LABEL_KEYS = new Set([
  'q',
  'query',
  'raw_query',
  'search_query',
  'ip',
  'client_ip',
  'user',
  'user_id',
  'userid',
  'account',
  'account_id',
  'email',
  'token',
  'auth',
  'secret',
  'password',
  'key',
  'apikey',
  'cookie',
  'session',
  'session_id',
  'url',
  'full_url',
  'referer',
  'referrer',
  'body',
  'fingerprint',
  'click',
]);

/**
 * Approved low-cardinality metric label keys.
 */
export const ALLOWED_METRIC_LABEL_KEYS = new Set([
  'method',
  'path',
  'status',
  'status_family',
  'provider',
  'queue',
  'mode',
  'code',
  'error_type',
  'tier',
  'le',
  'quantile',
  'format',
]);

const SENSITIVE_QUERY_PARAMS = new Set([
  'q',
  'query',
  'search',
  'token',
  'key',
  'password',
  'secret',
  'auth',
  'authorization',
  'credential',
  'apikey',
  'api_key',
  'session',
  'cookie',
  'access_token',
  'refresh_token',
  'bearer',
]);

/**
 * Validates metric labels to ensure zero query surveillance and low cardinality.
 * Throws an error or scrubs forbidden fields according to strict privacy invariants.
 */
export function validateMetricLabels(
  labels: Record<string, string | number>,
  metricName: string,
): Record<string, string | number> {
  const sanitized: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(labels)) {
    const lowerKey = key.toLowerCase();

    // 1. Check against forbidden label keys
    if (FORBIDDEN_METRIC_LABEL_KEYS.has(lowerKey)) {
      throw new Error(
        `[Privacy Violation] Metric "${metricName}" attempted to register forbidden label key "${key}". Raw query text, user IDs, and IPs are strictly prohibited in metrics labels.`,
      );
    }

    // 2. Reject unapproved label keys
    if (!ALLOWED_METRIC_LABEL_KEYS.has(lowerKey)) {
      throw new Error(
        `[Cardinality Violation] Metric "${metricName}" attempted to use unapproved label key "${key}". Labels must remain low-cardinality.`,
      );
    }

    // 3. Inspect label value for PII, query text, or high-cardinality patterns
    if (typeof value === 'string') {
      if (value.length > 64) {
        sanitized[lowerKey] = value.substring(0, 60) + '...';
        continue;
      }

      // Check for URLs, email addresses, or query-bearing substrings
      if (value.includes('?') || value.includes('&') || value.includes('http://') || value.includes('https://')) {
        sanitized[lowerKey] = '[REDACTED_URL_OR_QUERY]';
        continue;
      }

      if (value.includes('@') && value.includes('.')) {
        sanitized[lowerKey] = '[REDACTED_EMAIL]';
        continue;
      }

      sanitized[lowerKey] = value;
    } else {
      sanitized[lowerKey] = value;
    }
  }

  return sanitized;
}

/**
 * Normalizes an arbitrary request pathname into a canonical, bounded low-cardinality route template.
 * Strips all query parameters, IDs, and dynamic segments.
 */
export function normalizeRoutePath(rawPath: string): string {
  if (!rawPath) return '/';

  // Strip query string and fragments
  const pathname = rawPath.split('?')[0]?.split('#')[0] || '/';

  // Clean double slashes and trailing slashes (except root)
  const cleanPath = pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';

  // Exact static routes
  switch (cleanPath) {
    case '/':
    case '/docs':
    case '/health':
    case '/healthz':
    case '/ready':
    case '/readyz':
    case '/metrics':
    case '/opensearch.xml':
    case '/opensearchdescription.xml':
    case '/openapi.json':
    case '/api/v1/openapi.json':
    case '/api/v1/status':
    case '/api/v1/search':
    case '/api/v1/search/stream':
    case '/api/v1/suggest':
    case '/api/v1/instant-answer':
    case '/api/v1/lenses':
    case '/api/v1/lenses/validate':
    case '/api/v1/lenses/preview':
    case '/api/v1/feedback':
    case '/api/v1/feedback/privacy':
    case '/api/v1/feedback/review':
    case '/api/v1/feedback/review/import':
    case '/api/v1/feedback/review/stats':
    case '/api/v1/feedback/review/ranking-check':
    case '/api/v1/mcp':
    case '/api/v1/mcp/sse':
      return cleanPath;
  }

  // Parameterized routes
  if (cleanPath.startsWith('/api/v1/lenses/')) {
    return '/api/v1/lenses/:id';
  }

  if (cleanPath.startsWith('/api/v1/feedback/review/')) {
    if (cleanPath.endsWith('/approve-case')) {
      return '/api/v1/feedback/review/:id/approve-case';
    }
    return '/api/v1/feedback/review/:id';
  }

  // Fallback for static assets or unknown paths to strictly bound cardinality
  if (cleanPath.startsWith('/assets/') || cleanPath.startsWith('/static/')) {
    return '/static/:file';
  }

  return '/other';
}

/**
 * Redacts credentials, tokens, and query strings from a URL or query string.
 */
export function redactSensitiveUrl(rawUrl: string): string {
  if (!rawUrl) return '';

  try {
    // If it's a relative URL, prepend a dummy base for parsing
    const isRelative = rawUrl.startsWith('/') || !rawUrl.includes('://');
    const parsed = new URL(rawUrl, 'http://localhost');

    // Redact password in auth if present
    if (parsed.password) {
      parsed.password = '[REDACTED]';
    }

    // Redact sensitive query parameters
    const params = new URLSearchParams(parsed.search);
    for (const [key] of Array.from(params.entries())) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_QUERY_PARAMS.has(lowerKey)) {
        params.set(key, '[REDACTED]');
      }
    }
    parsed.search = params.toString() ? `?${params.toString()}` : '';

    if (isRelative) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    // If URL parsing fails, perform regex redaction on common sensitive parameters
    return rawUrl
      .replace(/([?&](?:q|query|token|key|password|secret|auth)=)[^&#]*/gi, '$1[REDACTED]')
      .replace(/(:\/\/[^:]+:)[^@]+@/g, '$1[REDACTED]@');
  }
}

/**
 * Strips all query parameters from a URL completely.
 */
export function stripQueryParams(rawUrl: string): string {
  if (!rawUrl) return '';
  return rawUrl.split('?')[0]?.split('#')[0] || '';
}
