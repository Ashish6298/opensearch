import { Environment, LogLevel, LogFormat } from '../constants.js';

export interface ServerConfig {
  host: string;
  port: number;
}

export interface StorageConfig {
  storageDir: string;
  indexDir: string;
  crawlerDataDir: string;
}

export interface LoggingConfig {
  level: LogLevel;
  format: LogFormat;
}

export interface CrawlerConfig {
  timeoutMs: number;
  maxDepth: number;
  maxPages: number;
  maxPageBytes: number;
  politenessDelayMs: number;
  /** Maximum concurrent request workers (Phase 29). Default: 1. */
  maxConcurrency: number;
  /** Global retry budget limit per run to prevent retry storms (Phase 29). Default: 50. */
  retryBudget: number;
  /** Interval in pages processed between progress checkpoints (Phase 29). Default: 10. */
  checkpointIntervalPages: number;
  userAgent: string;
  /** Maximum number of HTTP redirects to follow per request (Phase 5) */
  maxRedirects: number;
  /** Maximum retry attempts for transient fetch failures (Phase 5) */
  maxRetries: number;
  /** Initial retry backoff delay in milliseconds (Phase 5) */
  retryBackoffMs: number;
  // ── Phase 6: Robots.txt & Policy ──────────────────────────────────────────
  /** Whether robots.txt checking is enabled. Default true. */
  robotsEnabled: boolean;
  /** TTL for cached robots.txt policies in milliseconds. */
  robotsCacheTtlMs: number;
  /** Maximum cache size (number of origins). */
  robotsMaxCacheSize: number;
  /** Max response size for robots.txt files (bytes). */
  robotsMaxBytes: number;
  /** Maximum allowable crawl-delay from robots.txt in milliseconds. */
  robotsMaxCrawlDelayMs: number;
}

export interface SearchConfig {
  minQueryLength: number;
  maxQueryLength: number;
  defaultPageSize: number;
  maxPageSize: number;
  searchTimeoutMs: number;
  maxCandidates: number;
}

export interface ApiConfig {
  server: ServerConfig;
  corsOrigin: string;
  rateLimitPerMinute: number;
  bodyLimitBytes: number;
}

export interface WebConfig {
  server: ServerConfig;
  apiUrl: string;
}

export interface AppConfig {
  env: Environment;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  logging: LoggingConfig;
  storage: StorageConfig;
  crawler: CrawlerConfig;
  search: SearchConfig;
  api: ApiConfig;
  web: WebConfig;
}
