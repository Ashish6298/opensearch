/**
 * @opensearch/crawler — Robots Policy Factory (Phase 6)
 *
 * Factory function creating a fully configured RobotsPolicyEvaluator from typed AppConfig and HttpFetcher.
 */

import { AppConfig, Logger, createLogger } from '@opensearch/shared';
import { HttpFetcher } from '../fetcher/fetcher-types.js';
import { RobotsFetcher } from './robots-fetcher.js';
import { RobotsPolicyEvaluator } from './robots-types.js';
import { RobotsPolicyService } from './robots-policy-service.js';
import { MemoryRobotsCache } from './robots-cache.js';

export interface RobotsPolicyFactoryOptions {
  config: Pick<AppConfig, 'crawler' | 'logging'>;
  fetcher: HttpFetcher;
  logger?: Logger;
}

export function createRobotsPolicyEvaluator(
  options: RobotsPolicyFactoryOptions,
): RobotsPolicyEvaluator {
  const logger =
    options.logger ??
    createLogger('@opensearch/crawler:robots', {
      level: options.config.logging.level,
      format: options.config.logging.format,
    });

  const robotsFetcher = new RobotsFetcher({
    fetcher: options.fetcher,
    logger: logger.child('fetcher'),
    maxRobotsBytes: options.config.crawler.robotsMaxBytes,
  });

  const cache = new MemoryRobotsCache({
    maxSize: options.config.crawler.robotsMaxCacheSize,
    defaultTtlMs: options.config.crawler.robotsCacheTtlMs,
  });

  return new RobotsPolicyService({
    fetcher: robotsFetcher,
    logger: logger.child('service'),
    cache,
    defaultTtlMs: options.config.crawler.robotsCacheTtlMs,
    maxCrawlDelayMs: options.config.crawler.robotsMaxCrawlDelayMs,
    crawlerUserAgent: options.config.crawler.userAgent,
    enabled: options.config.crawler.robotsEnabled,
  });
}
