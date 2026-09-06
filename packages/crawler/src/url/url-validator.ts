/**
 * @opensearch/crawler — URL Validator (Phase 4)
 *
 * Accepts ONLY http: and https: URLs that are:
 *   - Well-formed (parseable by WHATWG URL)
 *   - Within the configured length limit
 *   - Targeting public hosts (not loopback/private ranges)
 *
 * Rejects ALL other input:
 *   - Non-string / empty / null / undefined input
 *   - Unsupported schemes: javascript:, data:, file:, ftp:, blob:,
 *     mailto:, tel:, ws:, wss:, about:, chrome:, and any other scheme
 *   - Malformed URLs that fail WHATWG parse
 *   - URLs exceeding MAX_URL_LENGTH
 *   - Private/loopback IP targets (SSRF guard — basic, not exhaustive)
 *   - Hostnames with no dot (bare single-label hosts outside localhost)
 *
 * This validator does NOT perform DNS resolution or HTTP requests.
 * It is a syntactic + structural safety gate only.
 */

import { CRAWLER_LIMITS } from '@opensearch/shared';
import { ParsedCrawlUrl, UrlValidationResult } from './url-model.js';
import { normalizeUrl } from './url-normalizer.js';

// ============================================================
// Allowed schemes
// ============================================================

const ALLOWED_PROTOCOLS = new Set<string>(['http:', 'https:']);

// ============================================================
// Private / reserved IP ranges (basic SSRF guard)
// Covers IPv4 loopback, RFC-1918, link-local, CGNAT, and broadcast.
// Full SSRF protection requires DNS-resolution checks (Phase 5+).
// ============================================================

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./, // IPv4 loopback
  /^10\./, // RFC-1918 class A
  /^192\.168\./, // RFC-1918 class C
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC-1918 class B
  /^169\.254\./, // Link-local (APIPA)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT (100.64/10)
  /^0\./, // Network address
  /^255\./, // Broadcast
];

const LOOPBACK_HOSTNAMES = new Set<string>(['localhost', '::1', '[::1]']);

function isPrivateHost(hostname: string): boolean {
  if (LOOPBACK_HOSTNAMES.has(hostname)) return true;
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) return true;
  }
  // IPv6 loopback literal
  if (hostname === '::1' || hostname === '[::1]') return true;
  return false;
}

export interface UrlValidationOptions {
  allowPrivate?: boolean;
}

// ============================================================
// Core validation function
// ============================================================

export function validateUrl(
  rawUrl: unknown,
  options: UrlValidationOptions = {},
): UrlValidationResult {
  // Type check
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return { ok: false, reason: 'URL must be a non-empty string' };
  }

  const trimmed = rawUrl.trim();

  // Length guard (before parse — cheap)
  if (trimmed.length > CRAWLER_LIMITS.MAX_URL_LENGTH) {
    return {
      ok: false,
      reason: `URL exceeds maximum length of ${CRAWLER_LIMITS.MAX_URL_LENGTH} characters (got ${trimmed.length})`,
    };
  }

  // WHATWG parse
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: `Malformed URL: "${trimmed.slice(0, 120)}"` };
  }

  // Scheme check
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      ok: false,
      reason: `Unsupported scheme "${parsed.protocol}" — only http: and https: are accepted`,
    };
  }

  // Hostname required (length must be > 0; WHATWG URL may produce "" for "https:///path")
  if (
    typeof parsed.hostname !== 'string' ||
    parsed.hostname.length === 0 ||
    parsed.hostname.trim().length === 0
  ) {
    return { ok: false, reason: 'URL has an empty or missing hostname' };
  }

  // Private/loopback host guard (can be bypassed for local integration testing with allowPrivate)
  const allowPrivate = options.allowPrivate || process.env.OPENSEARCH_ALLOW_PRIVATE_URLS === 'true';
  if (!allowPrivate && isPrivateHost(parsed.hostname)) {
    return {
      ok: false,
      reason: `Host "${parsed.hostname}" resolves to a private/loopback address and is not crawlable`,
    };
  }

  // Normalize (normalizeUrl is deterministic and strips fragment)
  const normalizeResult = normalizeUrl(trimmed);
  if (!normalizeResult.ok) {
    return { ok: false, reason: normalizeResult.reason };
  }

  const norm = normalizeResult.normalized;

  // Re-parse normalized form to fill ParsedCrawlUrl fields
  const np = new URL(norm);
  const protocol = np.protocol as 'http:' | 'https:';
  const defaultPort = protocol === 'http:' ? '80' : '443';
  const portStr = np.port === defaultPort ? '' : np.port;

  const result: ParsedCrawlUrl = {
    href: norm,
    protocol,
    hostname: np.hostname,
    host: np.host,
    pathname: np.pathname,
    search: np.search,
    port: portStr,
    originalUrl: trimmed,
  };

  return { ok: true, parsed: result };
}
