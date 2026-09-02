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
  userAgent: string;
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
