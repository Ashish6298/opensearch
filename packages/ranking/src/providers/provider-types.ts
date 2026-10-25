/**
 * @opensearch/ranking — Standard Search Provider Interface & Schema (Phase 69 & Phase 71)
 *
 * Defines typed contracts for external and local search providers, ensuring:
 * 1. Complete provider metadata: identifier, display name, categories, endpoint,
 *    attribution, rate limits, timeout, cache policy, and privacy behavior.
 * 2. Shared normalized result schema retaining full provenance: title, canonicalUrl,
 *    snippet, source, content type, timestamp, attribution, and optional thumbnail.
 * 3. Provider-specific response formats remain strictly outside the UI and ranking layers.
 * 4. Failure isolation: Provider errors do not crash or block the search pipeline.
 * 5. Robust resilience: Timeouts, exponential backoff with jitter, Retry-After compliance,
 *    circuit breakers, response caching, bounded concurrency, and partial result reporting.
 */

export type QueryCategory =
  | 'general'
  | 'academic'
  | 'code'
  | 'encyclopedia'
  | 'news'
  | 'reference'
  | 'multimedia';

export type ContentType =
  | 'webpage'
  | 'article'
  | 'documentation'
  | 'paper'
  | 'repository'
  | 'encyclopedia'
  | 'dataset';

export type ProviderErrorCode =
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'OVERSIZED_RESPONSE'
  | 'CANCELLED'
  | 'CIRCUIT_OPEN'
  | 'DISABLED';

export interface ProviderAttribution {
  /** Name of the data source / provider */
  name: string;
  /** Official URL of provider or project */
  url?: string;
  /** License name (e.g., 'CC-BY-SA 4.0', 'MIT', 'Public Domain') */
  license?: string;
  /** Required attribution or copyright notice */
  requiredText?: string;
}

export interface ProviderRateLimits {
  /** Maximum requests allowed per minute */
  maxRequestsPerMinute: number;
  /** Minimum delay between consecutive requests in milliseconds */
  minDelayMs?: number;
}

export interface ProviderCachePolicy {
  /** Whether response caching is enabled for this provider */
  enabled: boolean;
  /** Cache time-to-live in seconds (default: 300) */
  ttlSeconds: number;
  /** Maximum entries retained in cache */
  maxSize?: number;
}

export interface ProviderPrivacyBehavior {
  /** Whether user query text is transmitted to the provider origin */
  querySentToOrigin: boolean;
  /** Guarantees client IP address is NEVER forwarded to provider */
  forwardClientIp: false;
  /** Guarantees client cookies / session tokens are NEVER forwarded */
  forwardCookies: false;
  /** Data retention policy of upstream provider according to terms */
  logsRetentionPolicy: string;
  /** Whether provider requires authentication/credentials */
  requiresAuth: boolean;
}

export interface ProviderMetadata {
  /** Unique provider identifier slug (e.g., 'wikimedia', 'stackexchange') */
  id: string;
  /** Human-readable display name (e.g., 'Wikimedia Foundation APIs') */
  displayName: string;
  /** Categories supported by this provider */
  supportedCategories: QueryCategory[];
  /** Canonical base endpoint URL */
  endpoint: string;
  /** Attribution, licensing, and credit specifications */
  attribution: ProviderAttribution;
  /** Rate limiting and politeness constraints */
  rateLimits: ProviderRateLimits;
  /** Default timeout in milliseconds (default: 3000) */
  timeoutMs: number;
  /** Caching rules conforming to source terms */
  cachePolicy: ProviderCachePolicy;
  /** Privacy and network disclosure metadata */
  privacy: ProviderPrivacyBehavior;
}

export interface ThumbnailInfo {
  /** Direct URL to thumbnail image */
  url: string;
  /** Width in pixels if known */
  width?: number;
  /** Height in pixels if known */
  height?: number;
}

export interface NormalizedSearchResult {
  /** Normalized display title */
  title: string;
  /** Canonical destination URL */
  canonicalUrl: string;
  /** High-salience text snippet or abstract */
  snippet: string;
  /** Result provenance source identifier (matches provider ID or 'local-index') */
  source: string;
  /** Content type classification */
  contentType: ContentType;
  /** ISO 8601 publication or last-modified timestamp if provided by source */
  timestamp?: string;
  /** Formatted attribution string for user display */
  attribution?: string;
  /** Optional thumbnail preview */
  thumbnail?: ThumbnailInfo;
  /** Optional provider-calculated relevance score (normalized 0.0 - 1.0) */
  score?: number;
  /** Optional provider-specific metadata (isolated from ranking and UI layers) */
  metadata?: Record<string, unknown>;
}

export interface ProviderQueryOptions {
  /** Maximum items to retrieve from this provider (default: 10) */
  limit?: number;
  /** 1-based page number for pagination */
  page?: number;
  /** Per-provider timeout override in milliseconds for this execution */
  timeoutMs?: number;
  /** Overall search deadline in milliseconds across all dispatched providers */
  searchDeadlineMs?: number;
  /** Maximum concurrent provider requests executing simultaneously (default: 4) */
  maxConcurrency?: number;
  /** Maximum retries for transient failures (default: 2) */
  maxRetries?: number;
  /** Whether to consult the in-memory response cache (default: true) */
  enableCache?: boolean;
  /** Force bypass circuit breaker checks (default: false) */
  bypassCircuitBreaker?: boolean;
  /** Categories associated with the query */
  categories?: QueryCategory[];
  /** Abort signal for request cancellation */
  signal?: AbortSignal;
}

export interface ProviderQueryResult {
  /** Identifier of the provider that produced this result */
  providerId: string;
  /** Normalized search results conforming to shared schema */
  results: NormalizedSearchResult[];
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Total matching items reported by provider if available */
  totalHits?: number;
  /** Error message if provider encountered a failure (isolated) */
  error?: string;
  /** Standardized error category code */
  errorCode?: ProviderErrorCode;
  /** User-friendly sanitized explanation without leaking internal errors */
  sanitizedMessage?: string;
  /** Number of retry attempts executed for this request */
  retriesAttempted?: number;
  /** Retry-After duration in seconds if provider returned HTTP 429 */
  retryAfterSeconds?: number;
  /** Whether result was served from provider cache */
  cached?: boolean;
}

/**
 * Standard typed interface for search providers.
 * All providers (local, mock, or external APIs) must implement this contract.
 */
export interface SearchProvider {
  /** Immutable or registered provider metadata */
  readonly metadata: ProviderMetadata;

  /** Checks whether this provider is currently enabled */
  isEnabled(): boolean;

  /** Enables or disables this provider dynamically */
  setEnabled(enabled: boolean): void;

  /**
   * Executes a search query against this provider.
   * Implementations MUST isolate failures (catch errors and return empty results with error message).
   */
  search(query: string, options?: ProviderQueryOptions): Promise<ProviderQueryResult>;
}
