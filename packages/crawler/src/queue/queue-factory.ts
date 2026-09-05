/**
 * @opensearch/crawler — Queue Factory (Phase 4)
 * Creates a CrawlQueue from typed AppConfig.
 */

import { AppConfig, Logger, createLogger } from '@opensearch/shared';
import { PersistentCrawlQueue } from './persistent-queue.js';
import { CrawlQueue } from './queue-types.js';

export interface CrawlQueueFactoryOptions {
  config: Pick<AppConfig, 'storage' | 'logging' | 'crawler'>;
  logger?: Logger;
}

/**
 * Creates and returns an initialized CrawlQueue backed by the configured
 * crawler data directory. The caller is responsible for calling initialize()
 * before use and close() on shutdown.
 */
export function createCrawlQueue(options: CrawlQueueFactoryOptions): CrawlQueue {
  const logger =
    options.logger ??
    createLogger('@opensearch/crawler:queue-factory', {
      level: options.config.logging.level,
      format: options.config.logging.format,
    });

  return new PersistentCrawlQueue({
    persistenceDir: options.config.storage.crawlerDataDir,
    maxQueueSize: options.config.crawler.maxPages,
    logger,
  });
}
