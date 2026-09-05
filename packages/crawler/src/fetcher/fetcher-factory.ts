/**
 * @opensearch/crawler — Fetcher Factory (Phase 5)
 * Creates an HttpFetcher from typed AppConfig.
 */

import { AppConfig, Logger, createLogger } from '@opensearch/shared';
import { NodeFetcher } from './node-fetcher.js';
import { HttpFetcher } from './fetcher-types.js';

export interface FetcherFactoryOptions {
  config: Pick<AppConfig, 'crawler' | 'logging'>;
  logger?: Logger;
}

/**
 * Creates and returns an HttpFetcher wired to the typed configuration.
 * Uses NodeFetcher (WHATWG fetch + AbortController) as the concrete implementation.
 * The caller receives only the HttpFetcher interface — swap implementation by changing factory only.
 */
export function createHttpFetcher(options: FetcherFactoryOptions): HttpFetcher {
  const logger =
    options.logger ??
    createLogger('@opensearch/crawler:fetcher', {
      level: options.config.logging.level,
      format: options.config.logging.format,
    });

  return new NodeFetcher({
    timeoutMs: options.config.crawler.timeoutMs,
    maxRedirects: options.config.crawler.maxRedirects,
    maxRetries: options.config.crawler.maxRetries,
    retryBackoffMs: options.config.crawler.retryBackoffMs,
    maxPageBytes: options.config.crawler.maxPageBytes,
    userAgent: options.config.crawler.userAgent,
    logger,
  });
}
