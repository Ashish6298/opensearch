/**
 * @opensearch/shared — Privacy & Data-Minimization Policy & Utilities (Phase 27)
 *
 * Implements the core privacy policy constants, audit validators, and helper utilities
 * ensuring OpenSearch conforms to strict privacy-first principles:
 * - Zero user tracking, profiling, or behavioral analytics
 * - Zero persistent user query logs
 * - Zero cookies (session or tracking)
 * - Anonymized IP address handling (IPv4 /24 and IPv6 /48 masking)
 * - Zero external CDN / third-party analytics scripts
 * - Sanitized outbound link referrer policies (noopener noreferrer)
 */

export interface PrivacyAuditResult {
  passed: boolean;
  violations: string[];
  details: {
    noCookiesSet: boolean;
    ipAnonymizationActive: boolean;
    noExternalScripts: boolean;
    noAnalyticsTrackers: boolean;
    noQueryProfiling: boolean;
    safeReferrerPolicy: boolean;
    noSensitiveLogging: boolean;
  };
}

export const PRIVACY_POLICY = {
  version: '1.0.0',
  title: 'OpenSearch Privacy & Data Minimization Policy',
  principles: [
    'No User Accounts: OpenSearch operates entirely without accounts, sign-ups, or authentication.',
    'No Profiling or Fingerprinting: OpenSearch never tracks users across sessions or creates user behavioral profiles.',
    'No Search History Retention: Search queries are processed strictly in-memory to retrieve results and are never stored in a persistent database with user identifiers.',
    'No Cookies: OpenSearch does not set or require HTTP cookies or localStorage tracking tokens.',
    'IP Anonymization: IP addresses in operational request logs are truncated immediately (IPv4 /24 mask, IPv6 /48 mask).',
    'No Third-Party Analytics: Zero Google Analytics, Facebook Pixels, telemetry beacons, or external ad networks.',
    'Zero Outbound Referrer Leakage: External search result links are served with rel="noopener noreferrer" to prevent leaking search terms to destination websites.',
    'Strict Content Security Policy: Strict CSP headers prevent injection or execution of unauthorized third-party scripts.',
  ],
  loggingPolicy: {
    retention: 'Transient in-memory / stdout only for operational debugging',
    ipMasking: 'Last octet truncated for IPv4 (e.g. 192.168.1.0), host truncated for IPv6 (e.g. 2001:db8:abcd::)',
    redactedFields: ['password', 'secret', 'token', 'key', 'authorization', 'cookie', 'credential', 'auth', 'apikey', 'private'],
  },
} as const;

/**
 * Anonymizes an IP address by masking identifying host octets.
 */
export function anonymizeIpAddress(ip: string): string {
  if (!ip || ip === 'unknown') {
    return '0.0.0.0';
  }

  // IPv4 handling: replace last octet (e.g. 192.168.1.123 -> 192.168.1.0)
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
  }

  // IPv6 handling: keep prefix /48 (first 3 groups), zero remainder
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 3) {
      return `${parts[0]}:${parts[1]}:${parts[2]}::`;
    }
  }

  return '0.0.0.0';
}

/**
 * Verifies that an HTML string complies with zero third-party script and privacy requirements.
 */
export function auditHtmlPrivacy(html: string): { compliant: boolean; issues: string[] } {
  const issues: string[] = [];

  // 1. Check for external script sources
  const scriptSrcRegex = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptSrcRegex.exec(html)) !== null) {
    const src = match[1];
    if (src && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//'))) {
      issues.push(`External script detected: ${src}`);
    }
  }

  // 2. Check for third-party font/style CDNs
  const linkHrefRegex = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  while ((match = linkHrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (
      href &&
      (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) &&
      !href.includes('localhost') &&
      !href.includes('127.0.0.1')
    ) {
      issues.push(`External resource link detected: ${href}`);
    }
  }

  // 3. Check for tracking pixels or analytics keywords
  const suspiciousKeywords = [
    'google-analytics.com',
    'googletagmanager.com',
    'doubleclick.net',
    'facebook.net',
    'clarity.ms',
    'hotjar.com',
    'mixpanel.com',
    'segment.io',
    'analytics.js',
    'gtag',
  ];

  for (const kw of suspiciousKeywords) {
    if (html.toLowerCase().includes(kw)) {
      issues.push(`Suspicious analytics/tracker reference detected: ${kw}`);
    }
  }

  return {
    compliant: issues.length === 0,
    issues,
  };
}

/**
 * Validates HTTP response headers for privacy conformance.
 */
export function auditResponseHeaders(headers: Record<string, string | string[] | undefined>): {
  compliant: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // 1. Check that Set-Cookie header is absent
  const setCookie = headers['set-cookie'] || headers['Set-Cookie'];
  if (setCookie) {
    issues.push('Set-Cookie header found in response headers');
  }

  // 2. Check for Referrer-Policy
  const referrerPolicy = headers['referrer-policy'] || headers['Referrer-Policy'];
  if (!referrerPolicy) {
    issues.push('Referrer-Policy header is missing');
  } else if (
    referrerPolicy !== 'strict-origin-when-cross-origin' &&
    referrerPolicy !== 'no-referrer' &&
    referrerPolicy !== 'same-origin'
  ) {
    issues.push(`Referrer-Policy "${referrerPolicy}" does not provide sufficient privacy protection`);
  }

  // 3. Check for Content-Security-Policy
  const csp = headers['content-security-policy'] || headers['Content-Security-Policy'];
  if (!csp) {
    issues.push('Content-Security-Policy header is missing');
  }

  return {
    compliant: issues.length === 0,
    issues,
  };
}
