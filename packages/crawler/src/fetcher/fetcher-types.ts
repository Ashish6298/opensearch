/**
 * @opensearch/crawler — HTTP Fetcher Types (Phase 5)
 *
 * Defines all types for the HTTP fetcher abstraction:
 * - FetchTarget: validated fetch input
 * - FetchResult: structured success result
 * - FetchError: structured failure result (integrates with OpenSearchError hierarchy)
 * - HttpFetcher: the replaceable interface
 */

// ============================================================
// Fetch target — always a validated, normalized URL from Phase 4
// ============================================================

export interface FetchTarget {
  /** Normalized URL (output of Phase 4 normalizeUrl, validated by validateUrl) */
  url: string;
  /** Optional override for the crawl depth (used for logging context only) */
  depth?: number;
}

// ============================================================
// Fetch success result
// ============================================================

export interface FetchSuccess {
  ok: true;
  /** Final URL after all redirects, normalized */
  finalUrl: string;
  /** HTTP status code of the final response */
  statusCode: number;
  /** Content-Type header value (lowercased, trimmed) */
  contentType: string;
  /** Response body as UTF-8 string (guaranteed ≤ maxPageBytes) */
  body: string;
  /** Content-Length from headers, or actual bytes received if header absent */
  contentLength: number;
  /** Total time from request start to body completion, in milliseconds */
  durationMs: number;
  /** Number of redirects followed (0 if none) */
  redirectCount: number;
  /** Ordered list of URLs visited during redirect chain (not including the initial URL) */
  redirectChain: string[];
  /** Number of retry attempts made before this success (0 = first attempt succeeded) */
  retryCount: number;
}

// ============================================================
// Fetch error result (structured, not thrown)
// ============================================================

export const FETCH_ERROR_CODE = {
  /** URL validation failed before sending any request */
  INVALID_TARGET: 'INVALID_TARGET',
  /** Target or redirect resolves to a private/loopback/internal address */
  SSRF_REJECTED: 'SSRF_REJECTED',
  /** Request exceeded the configured timeout */
  TIMEOUT: 'TIMEOUT',
  /** DNS resolution failed or hostname not found */
  DNS_FAILURE: 'DNS_FAILURE',
  /** TCP connection refused or reset */
  CONNECTION_FAILURE: 'CONNECTION_FAILURE',
  /** General network error not covered by the above */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /** Redirect to unsupported scheme, redirect loop, or max redirects exceeded */
  REDIRECT_FAILURE: 'REDIRECT_FAILURE',
  /** Server returned a 4xx status (non-retriable) */
  HTTP_CLIENT_ERROR: 'HTTP_CLIENT_ERROR',
  /** Server returned a 5xx status that was not retried / exhausted retries */
  HTTP_SERVER_ERROR: 'HTTP_SERVER_ERROR',
  /** Response body exceeded the configured maxPageBytes */
  CONTENT_SIZE_EXCEEDED: 'CONTENT_SIZE_EXCEEDED',
  /** Content-Type was absent, malformed, or not in the allowed list */
  UNSUPPORTED_CONTENT_TYPE: 'UNSUPPORTED_CONTENT_TYPE',
  /** All retry attempts exhausted after transient failures */
  RETRY_EXHAUSTED: 'RETRY_EXHAUSTED',
} as const;

export type FetchErrorCode = (typeof FETCH_ERROR_CODE)[keyof typeof FETCH_ERROR_CODE];

export interface FetchFailure {
  ok: false;
  code: FetchErrorCode;
  /** Human-readable message, safe to log (no secrets, no credentials) */
  message: string;
  /** HTTP status code if a response was received; undefined for network failures */
  statusCode?: number;
  /** Content-Type header if a response was received */
  contentType?: string;
  /** Final URL at the point of failure (may differ from initial if redirected) */
  finalUrl?: string;
  /** Number of redirects followed before failure */
  redirectCount: number;
  /** Number of retries attempted before giving up */
  retryCount: number;
  /** Elapsed milliseconds at point of failure */
  durationMs: number;
  /** Whether this error is considered retryable */
  retryable: boolean;
}

export type FetchResult = FetchSuccess | FetchFailure;

// ============================================================
// HttpFetcher interface — replaceable abstraction
// ============================================================

export interface HttpFetcherOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  maxPageBytes?: number;
  userAgent?: string;
}

export interface HttpFetcher {
  /**
   * Fetches a web resource specified by target.
   * NEVER throws — always returns FetchResult (discriminated union on ok: true | false).
   */
  fetch(target: FetchTarget): Promise<FetchResult>;
}
