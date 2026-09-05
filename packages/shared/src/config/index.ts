import {
  DEFAULT_API_PORT,
  DEFAULT_CRAWLER_DATA_DIR,
  DEFAULT_HOST,
  DEFAULT_INDEX_DIR,
  DEFAULT_STORAGE_DIR,
  DEFAULT_WEB_PORT,
  ENVIRONMENTS,
  Environment,
  LOG_FORMATS,
  LOG_LEVELS,
  LogFormat,
  LogLevel,
  CRAWLER_LIMITS,
  SEARCH_LIMITS,
  API_LIMITS,
} from '../constants.js';
import { readBoolean, readEnum, readInt, readString } from './env.js';
import { AppConfig } from './types.js';

export * from './types.js';
export * from './env.js';

/**
 * Loads, validates, and freezes application configuration from an environment dictionary.
 * Defaults to process.env if no custom source is provided.
 */
export function loadConfig(sourceEnv: Record<string, string | undefined> = process.env): AppConfig {
  const env = readEnum<Environment>(sourceEnv, {
    envKey: 'NODE_ENV',
    allowed: [ENVIRONMENTS.DEVELOPMENT, ENVIRONMENTS.PRODUCTION, ENVIRONMENTS.TEST] as const,
    defaultValue: ENVIRONMENTS.DEVELOPMENT,
  });

  const isProduction = env === ENVIRONMENTS.PRODUCTION;
  const isDevelopment = env === ENVIRONMENTS.DEVELOPMENT;
  const isTest = env === ENVIRONMENTS.TEST;

  // Logging Configuration
  const logLevel = readEnum<LogLevel>(sourceEnv, {
    envKey: 'LOG_LEVEL',
    allowed: [
      LOG_LEVELS.DEBUG,
      LOG_LEVELS.INFO,
      LOG_LEVELS.WARN,
      LOG_LEVELS.ERROR,
      LOG_LEVELS.SILENT,
    ] as const,
    defaultValue: isProduction ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG,
  });

  const logFormat = readEnum<LogFormat>(sourceEnv, {
    envKey: 'LOG_FORMAT',
    allowed: [LOG_FORMATS.PRETTY, LOG_FORMATS.JSON] as const,
    defaultValue: isProduction ? LOG_FORMATS.JSON : LOG_FORMATS.PRETTY,
  });

  // Storage Paths
  const storageDir = readString(sourceEnv, {
    envKey: 'STORAGE_DIR',
    defaultValue: DEFAULT_STORAGE_DIR,
  });
  const indexDir = readString(sourceEnv, {
    envKey: 'INDEX_DIR',
    defaultValue: DEFAULT_INDEX_DIR,
  });
  const crawlerDataDir = readString(sourceEnv, {
    envKey: 'CRAWLER_DATA_DIR',
    defaultValue: DEFAULT_CRAWLER_DATA_DIR,
  });

  // Crawler Configuration
  const crawlerTimeoutMs = readInt(sourceEnv, {
    envKey: 'CRAWLER_TIMEOUT_MS',
    defaultValue: CRAWLER_LIMITS.DEFAULT_TIMEOUT_MS,
    min: CRAWLER_LIMITS.MIN_TIMEOUT_MS,
    max: CRAWLER_LIMITS.MAX_TIMEOUT_MS,
  });
  const crawlerMaxDepth = readInt(sourceEnv, {
    envKey: 'CRAWLER_MAX_DEPTH',
    defaultValue: CRAWLER_LIMITS.DEFAULT_MAX_DEPTH,
    min: 1,
    max: CRAWLER_LIMITS.MAX_DEPTH_CEILING,
  });
  const crawlerMaxPages = readInt(sourceEnv, {
    envKey: 'CRAWLER_MAX_PAGES',
    defaultValue: CRAWLER_LIMITS.DEFAULT_MAX_PAGES,
    min: 1,
  });
  const crawlerMaxPageBytes = readInt(sourceEnv, {
    envKey: 'CRAWLER_MAX_PAGE_BYTES',
    defaultValue: CRAWLER_LIMITS.DEFAULT_MAX_PAGE_BYTES,
    min: 1024,
    max: CRAWLER_LIMITS.MAX_PAGE_BYTES_CEILING,
  });
  const crawlerPolitenessDelayMs = readInt(sourceEnv, {
    envKey: 'CRAWLER_POLITENESS_DELAY_MS',
    defaultValue: CRAWLER_LIMITS.DEFAULT_POLITENESS_DELAY_MS,
    min: CRAWLER_LIMITS.MIN_POLITENESS_DELAY_MS,
  });
  const crawlerUserAgent = readString(sourceEnv, {
    envKey: 'CRAWLER_USER_AGENT',
    defaultValue: CRAWLER_LIMITS.DEFAULT_USER_AGENT,
  });
  const crawlerMaxRedirects = readInt(sourceEnv, {
    envKey: 'CRAWLER_MAX_REDIRECTS',
    defaultValue: CRAWLER_LIMITS.DEFAULT_MAX_REDIRECTS,
    min: 0,
    max: CRAWLER_LIMITS.MAX_REDIRECTS_CEILING,
  });
  const crawlerMaxRetries = readInt(sourceEnv, {
    envKey: 'CRAWLER_MAX_RETRIES',
    defaultValue: CRAWLER_LIMITS.DEFAULT_MAX_RETRIES,
    min: 0,
    max: CRAWLER_LIMITS.MAX_RETRIES_CEILING,
  });
  const crawlerRetryBackoffMs = readInt(sourceEnv, {
    envKey: 'CRAWLER_RETRY_BACKOFF_MS',
    defaultValue: CRAWLER_LIMITS.DEFAULT_RETRY_BACKOFF_MS,
    min: 100,
    max: CRAWLER_LIMITS.MAX_RETRY_BACKOFF_MS,
  });
  // Phase 6 Robots Configuration
  const crawlerRobotsEnabled = readBoolean(sourceEnv, {
    envKey: 'CRAWLER_ROBOTS_ENABLED',
    defaultValue: true,
  });
  const crawlerRobotsCacheTtlMs = readInt(sourceEnv, {
    envKey: 'CRAWLER_ROBOTS_CACHE_TTL_MS',
    defaultValue: CRAWLER_LIMITS.DEFAULT_ROBOTS_CACHE_TTL_MS,
    min: CRAWLER_LIMITS.MIN_ROBOTS_CACHE_TTL_MS,
    max: CRAWLER_LIMITS.MAX_ROBOTS_CACHE_TTL_MS,
  });
  const crawlerRobotsMaxCacheSize = readInt(sourceEnv, {
    envKey: 'CRAWLER_ROBOTS_MAX_CACHE_SIZE',
    defaultValue: CRAWLER_LIMITS.DEFAULT_ROBOTS_MAX_CACHE_SIZE,
    min: 10,
  });
  const crawlerRobotsMaxBytes = readInt(sourceEnv, {
    envKey: 'CRAWLER_ROBOTS_MAX_BYTES',
    defaultValue: CRAWLER_LIMITS.DEFAULT_ROBOTS_MAX_BYTES,
    min: 1024,
    max: CRAWLER_LIMITS.MAX_ROBOTS_BYTES_CEILING,
  });
  const crawlerRobotsMaxCrawlDelayMs = readInt(sourceEnv, {
    envKey: 'CRAWLER_ROBOTS_MAX_CRAWL_DELAY_MS',
    defaultValue: CRAWLER_LIMITS.DEFAULT_ROBOTS_MAX_CRAWL_DELAY_MS,
    min: 0,
    max: CRAWLER_LIMITS.MAX_ROBOTS_CRAWL_DELAY_CEILING,
  });

  // Search Configuration
  const searchMinQueryLength = readInt(sourceEnv, {
    envKey: 'SEARCH_MIN_QUERY_LENGTH',
    defaultValue: SEARCH_LIMITS.MIN_QUERY_LENGTH,
    min: 1,
  });
  const searchMaxQueryLength = readInt(sourceEnv, {
    envKey: 'SEARCH_MAX_QUERY_LENGTH',
    defaultValue: SEARCH_LIMITS.MAX_QUERY_LENGTH,
    min: searchMinQueryLength,
  });
  const searchDefaultPageSize = readInt(sourceEnv, {
    envKey: 'SEARCH_DEFAULT_PAGE_SIZE',
    defaultValue: SEARCH_LIMITS.DEFAULT_PAGE_SIZE,
    min: 1,
    max: SEARCH_LIMITS.MAX_PAGE_SIZE,
  });
  const searchMaxPageSize = readInt(sourceEnv, {
    envKey: 'SEARCH_MAX_PAGE_SIZE',
    defaultValue: SEARCH_LIMITS.MAX_PAGE_SIZE,
    min: searchDefaultPageSize,
  });
  const searchTimeoutMs = readInt(sourceEnv, {
    envKey: 'SEARCH_TIMEOUT_MS',
    defaultValue: SEARCH_LIMITS.DEFAULT_SEARCH_TIMEOUT_MS,
    min: 100,
    max: SEARCH_LIMITS.MAX_SEARCH_TIMEOUT_MS,
  });
  const searchMaxCandidates = readInt(sourceEnv, {
    envKey: 'SEARCH_MAX_CANDIDATES',
    defaultValue: SEARCH_LIMITS.DEFAULT_MAX_CANDIDATES,
    min: 10,
  });

  // API Server Configuration
  const apiHost = readString(sourceEnv, {
    envKey: 'API_HOST',
    defaultValue: DEFAULT_HOST,
  });
  const apiPort = readInt(sourceEnv, {
    envKey: 'API_PORT',
    defaultValue: DEFAULT_API_PORT,
    min: 1,
    max: 65535,
  });
  const corsOrigin = readString(sourceEnv, {
    envKey: 'CORS_ORIGIN',
    defaultValue: isProduction ? undefined : `http://localhost:${DEFAULT_WEB_PORT}`,
    required: isProduction, // In production, CORS_ORIGIN is mandatory for security
  });
  const rateLimitPerMinute = readInt(sourceEnv, {
    envKey: 'RATE_LIMIT_PER_MINUTE',
    defaultValue: API_LIMITS.DEFAULT_RATE_LIMIT_PER_MINUTE,
    min: 1,
    max: API_LIMITS.MAX_RATE_LIMIT_PER_MINUTE,
  });
  const bodyLimitBytes = readInt(sourceEnv, {
    envKey: 'BODY_LIMIT_BYTES',
    defaultValue: API_LIMITS.DEFAULT_BODY_LIMIT_BYTES,
    min: 1024,
  });

  // Web Server Configuration
  const webHost = readString(sourceEnv, {
    envKey: 'WEB_HOST',
    defaultValue: DEFAULT_HOST,
  });
  const webPort = readInt(sourceEnv, {
    envKey: 'WEB_PORT',
    defaultValue: DEFAULT_WEB_PORT,
    min: 1,
    max: 65535,
  });
  const apiUrl = readString(sourceEnv, {
    envKey: 'VITE_API_URL',
    defaultValue: `http://${apiHost}:${apiPort}`,
  });

  const config: AppConfig = {
    env,
    isProduction,
    isDevelopment,
    isTest,
    logging: {
      level: logLevel,
      format: logFormat,
    },
    storage: {
      storageDir,
      indexDir,
      crawlerDataDir,
    },
    crawler: {
      timeoutMs: crawlerTimeoutMs,
      maxDepth: crawlerMaxDepth,
      maxPages: crawlerMaxPages,
      maxPageBytes: crawlerMaxPageBytes,
      politenessDelayMs: crawlerPolitenessDelayMs,
      userAgent: crawlerUserAgent,
      maxRedirects: crawlerMaxRedirects,
      maxRetries: crawlerMaxRetries,
      retryBackoffMs: crawlerRetryBackoffMs,
      robotsEnabled: crawlerRobotsEnabled,
      robotsCacheTtlMs: crawlerRobotsCacheTtlMs,
      robotsMaxCacheSize: crawlerRobotsMaxCacheSize,
      robotsMaxBytes: crawlerRobotsMaxBytes,
      robotsMaxCrawlDelayMs: crawlerRobotsMaxCrawlDelayMs,
    },
    search: {
      minQueryLength: searchMinQueryLength,
      maxQueryLength: searchMaxQueryLength,
      defaultPageSize: searchDefaultPageSize,
      maxPageSize: searchMaxPageSize,
      searchTimeoutMs,
      maxCandidates: searchMaxCandidates,
    },
    api: {
      server: {
        host: apiHost,
        port: apiPort,
      },
      corsOrigin,
      rateLimitPerMinute,
      bodyLimitBytes,
    },
    web: {
      server: {
        host: webHost,
        port: webPort,
      },
      apiUrl,
    },
  };

  return Object.freeze(config);
}

/**
 * Strips or redacts any private details for safe diagnostic logging of loaded configuration.
 */
export function sanitizeConfigForLogging(config: AppConfig): Record<string, unknown> {
  return {
    env: config.env,
    isProduction: config.isProduction,
    logging: config.logging,
    storage: config.storage,
    crawler: {
      timeoutMs: config.crawler.timeoutMs,
      maxDepth: config.crawler.maxDepth,
      maxPages: config.crawler.maxPages,
      politenessDelayMs: config.crawler.politenessDelayMs,
      userAgent: config.crawler.userAgent,
      maxRedirects: config.crawler.maxRedirects,
      maxRetries: config.crawler.maxRetries,
      retryBackoffMs: config.crawler.retryBackoffMs,
      robotsEnabled: config.crawler.robotsEnabled,
      robotsCacheTtlMs: config.crawler.robotsCacheTtlMs,
      robotsMaxCacheSize: config.crawler.robotsMaxCacheSize,
      robotsMaxBytes: config.crawler.robotsMaxBytes,
      robotsMaxCrawlDelayMs: config.crawler.robotsMaxCrawlDelayMs,
    },
    search: config.search,
    api: {
      host: config.api.server.host,
      port: config.api.server.port,
      corsOrigin: config.api.corsOrigin,
      rateLimitPerMinute: config.api.rateLimitPerMinute,
    },
    web: {
      host: config.web.server.host,
      port: config.web.server.port,
      apiUrl: config.web.apiUrl,
    },
  };
}
