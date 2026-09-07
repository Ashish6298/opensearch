/**
 * OpenSearch Central Constants & Configurable Operational Limits
 */

export const PROJECT_NAME = 'OpenSearch';
export const PROJECT_VERSION = '1.0.0';

export const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
} as const;

export type Environment = (typeof ENVIRONMENTS)[keyof typeof ENVIRONMENTS];

// Default Network & Service Coordinates
export const DEFAULT_HOST = 'localhost';
export const DEFAULT_API_PORT = 3000;
export const DEFAULT_WEB_PORT = 5173;

// Default File System Coordinates (Relative to workspace root)
export const DEFAULT_STORAGE_DIR = './data/storage';
export const DEFAULT_INDEX_DIR = './data/index';
export const DEFAULT_CRAWLER_DATA_DIR = './data/crawler';

// Default Logging Values
export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  SILENT: 'silent',
} as const;

export type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

export const LOG_FORMATS = {
  PRETTY: 'pretty',
  JSON: 'json',
} as const;

export type LogFormat = (typeof LOG_FORMATS)[keyof typeof LOG_FORMATS];

// Crawler Operational Limits & Timeouts
export const CRAWLER_LIMITS = {
  DEFAULT_TIMEOUT_MS: 10_000,
  MIN_TIMEOUT_MS: 1_000,
  MAX_TIMEOUT_MS: 60_000,
  DEFAULT_MAX_DEPTH: 3,
  MAX_DEPTH_CEILING: 10,
  DEFAULT_MAX_PAGES: 1_000,
  DEFAULT_MAX_PAGE_BYTES: 2 * 1024 * 1024, // 2MB
  MAX_PAGE_BYTES_CEILING: 10 * 1024 * 1024, // 10MB
  DEFAULT_POLITENESS_DELAY_MS: 1_000,
  MIN_POLITENESS_DELAY_MS: 200,
  /** Default worker concurrency for parallel crawl processing (Phase 29). */
  DEFAULT_MAX_CONCURRENCY: 1,
  /** Hard ceiling on worker concurrency for free-tier resource safety. */
  MAX_CONCURRENCY_CEILING: 10,
  /** Global retry budget limit per crawl run to prevent retry storms. */
  DEFAULT_MAX_RETRY_BUDGET: 50,
  /** Frequency of progress checkpoint saves (in pages processed). */
  DEFAULT_CHECKPOINT_INTERVAL_PAGES: 10,
  DEFAULT_USER_AGENT: 'OpenSearchBot/1.0 (+https://github.com/Ashish6298/opensearch)',
  /** Maximum length of any URL accepted by the crawler (characters). */
  MAX_URL_LENGTH: 2_048,
  /** Maximum number of entries in the persistent crawl queue. */
  MAX_QUEUE_SIZE: 100_000,
  // ── Phase 5: HTTP Fetcher ──────────────────────────────────────────────
  /** Maximum number of HTTP redirects to follow per request. */
  DEFAULT_MAX_REDIRECTS: 5,
  /** Hard ceiling on redirect count; config values above this are clamped. */
  MAX_REDIRECTS_CEILING: 10,
  /** Maximum retry attempts for transient errors (not counting the initial attempt). */
  DEFAULT_MAX_RETRIES: 2,
  /** Hard ceiling on retry count. */
  MAX_RETRIES_CEILING: 5,
  /** Initial retry backoff delay in milliseconds (doubles on each retry). */
  DEFAULT_RETRY_BACKOFF_MS: 1_000,
  /** Maximum backoff delay cap, regardless of retry count. */
  MAX_RETRY_BACKOFF_MS: 30_000,
  // ── Phase 6: Robots.txt & Crawl Policy ──────────────────────────────────
  /** Default robots cache TTL: 24 hours in milliseconds. */
  DEFAULT_ROBOTS_CACHE_TTL_MS: 24 * 60 * 60 * 1000,
  /** Minimum robots cache TTL: 5 minutes in milliseconds. */
  MIN_ROBOTS_CACHE_TTL_MS: 5 * 60 * 1000,
  /** Maximum robots cache TTL: 7 days in milliseconds. */
  MAX_ROBOTS_CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  /** Default max robots response size (512 KB). */
  DEFAULT_ROBOTS_MAX_BYTES: 512 * 1024,
  /** Hard ceiling on robots response size (2 MB). */
  MAX_ROBOTS_BYTES_CEILING: 2 * 1024 * 1024,
  /** Maximum cache capacity (number of origins). */
  DEFAULT_ROBOTS_MAX_CACHE_SIZE: 5_000,
  /** Default maximum acceptable crawl delay in milliseconds (30 seconds). */
  DEFAULT_ROBOTS_MAX_CRAWL_DELAY_MS: 30_000,
  /** Hard cap on acceptable crawl delay in milliseconds (60 seconds). */
  MAX_ROBOTS_CRAWL_DELAY_CEILING: 60_000,
} as const;

/**
 * Content-type prefixes that the fetcher accepts as web documents.
 * Comparison is done with startsWith, so "text/html" matches "text/html; charset=utf-8".
 * Rejection of all other content types is intentional and documented.
 */
export const ALLOWED_CONTENT_TYPE_PREFIXES = [
  'text/html',
  'text/plain',
  'application/xhtml+xml',
  'application/xml',
  'text/xml',
] as const;

export type AllowedContentTypePrefix = (typeof ALLOWED_CONTENT_TYPE_PREFIXES)[number];

// Search & Query Operational Limits
export const SEARCH_LIMITS = {
  MIN_QUERY_LENGTH: 1,
  MAX_QUERY_LENGTH: 200,
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50,
  DEFAULT_SEARCH_TIMEOUT_MS: 2_000,
  MAX_SEARCH_TIMEOUT_MS: 10_000,
  DEFAULT_MAX_CANDIDATES: 500,
} as const;

// API Security & Rate Protection Limits
export const API_LIMITS = {
  DEFAULT_RATE_LIMIT_PER_MINUTE: 60,
  MAX_RATE_LIMIT_PER_MINUTE: 1_000,
  DEFAULT_BODY_LIMIT_BYTES: 64 * 1024, // 64KB
} as const;

// Standard HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;
