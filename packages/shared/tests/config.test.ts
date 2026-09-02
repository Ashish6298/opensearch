import { describe, it, expect } from 'vitest';
import {
  loadConfig,
  ConfigError,
  ENVIRONMENTS,
  LOG_LEVELS,
  LOG_FORMATS,
  sanitizeConfigForLogging,
} from '../src/index.js';

describe('Centralized Configuration System', () => {
  it('should load default development configuration when no environment is set', () => {
    const config = loadConfig({});
    expect(config.env).toBe(ENVIRONMENTS.DEVELOPMENT);
    expect(config.isDevelopment).toBe(true);
    expect(config.isProduction).toBe(false);
    expect(config.api.server.port).toBe(3000);
    expect(config.web.server.port).toBe(5173);
    expect(config.logging.level).toBe(LOG_LEVELS.DEBUG);
    expect(config.logging.format).toBe(LOG_FORMATS.PRETTY);
    expect(config.storage.storageDir).toBe('./data/storage');
    expect(config.crawler.timeoutMs).toBe(10_000);
    expect(config.search.maxQueryLength).toBe(200);
  });

  it('should correctly parse overrides for custom ports and log levels', () => {
    const config = loadConfig({
      API_PORT: '4000',
      LOG_LEVEL: 'warn',
      LOG_FORMAT: 'json',
      CRAWLER_MAX_DEPTH: '5',
    });

    expect(config.api.server.port).toBe(4000);
    expect(config.logging.level).toBe(LOG_LEVELS.WARN);
    expect(config.logging.format).toBe(LOG_FORMATS.JSON);
    expect(config.crawler.maxDepth).toBe(5);
  });

  it('should enforce production validation requirements (CORS_ORIGIN required in prod)', () => {
    expect(() => {
      loadConfig({
        NODE_ENV: 'production',
      });
    }).toThrowError(ConfigError);

    // With CORS_ORIGIN provided, production config loads properly
    const prodConfig = loadConfig({
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://opensearch.example.com',
    });

    expect(prodConfig.isProduction).toBe(true);
    expect(prodConfig.logging.level).toBe(LOG_LEVELS.INFO);
    expect(prodConfig.logging.format).toBe(LOG_FORMATS.JSON);
    expect(prodConfig.api.corsOrigin).toBe('https://opensearch.example.com');
  });

  it('should reject invalid integer values safely', () => {
    expect(() => {
      loadConfig({
        API_PORT: 'not-a-number',
      });
    }).toThrowError(ConfigError);
  });

  it('should reject out-of-range integer values', () => {
    expect(() => {
      loadConfig({
        API_PORT: '99999',
      });
    }).toThrowError(ConfigError);

    expect(() => {
      loadConfig({
        CRAWLER_TIMEOUT_MS: '100', // below min 1000ms
      });
    }).toThrowError(ConfigError);
  });

  it('should reject invalid enum values', () => {
    expect(() => {
      loadConfig({
        LOG_LEVEL: 'verbose', // invalid enum
      });
    }).toThrowError(ConfigError);
  });

  it('should sanitize configuration for safe diagnostic logging', () => {
    const config = loadConfig({});
    const sanitized = sanitizeConfigForLogging(config);
    expect(sanitized.env).toBe('development');
    expect(sanitized.api).toBeDefined();
    // Verify object is serializable
    expect(JSON.stringify(sanitized)).toBeTypeOf('string');
  });
});
