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
  DEFAULT_USER_AGENT: 'OpenSearchBot/1.0 (+https://github.com/Ashish6298/opensearch)',
} as const;

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
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;
