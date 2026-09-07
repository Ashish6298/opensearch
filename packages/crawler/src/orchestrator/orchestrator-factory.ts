/**
 * @opensearch/crawler — Crawl Orchestrator Factory (Phase 8)
 */

import { AppConfig, Logger, createLogger } from '@opensearch/shared';
import { StorageAdapter } from '@opensearch/storage';
import { CrawlQueue } from '../queue/queue-types.js';
import { HttpFetcher } from '../fetcher/fetcher-types.js';
import { RobotsPolicyEvaluator } from '../robots/robots-types.js';
import { HtmlParser } from '../parser/parser-types.js';
import { CrawlOrchestrator } from './orchestrator-types.js';
import { DefaultCrawlOrchestrator } from './crawl-orchestrator.js';

import { createFetcher } from '../fetcher/fetcher-factory.js';
import { createRobotsPolicyEvaluator } from '../robots/robots-factory.js';
import { createHtmlParser } from '../parser/parser-factory.js';

export interface CrawlOrchestratorFactoryOptions {
  config: AppConfig;
  queue: CrawlQueue;
  storage: StorageAdapter;
  fetcher?: HttpFetcher;
  robotsEvaluator?: RobotsPolicyEvaluator;
  parser?: HtmlParser;
  logger?: Logger;
}

/**
 * Creates and configures a CrawlOrchestrator instance.
 */
export function createCrawlOrchestrator(
  options: CrawlOrchestratorFactoryOptions,
): CrawlOrchestrator {
  const logger = options.logger ?? createLogger('@opensearch/crawler:orchestrator');
  const fetcher = options.fetcher ?? createFetcher({ config: options.config });
  const robotsEvaluator =
    options.robotsEvaluator ?? createRobotsPolicyEvaluator({ config: options.config, fetcher });
  const parser = options.parser ?? createHtmlParser();

  return new DefaultCrawlOrchestrator({
    ...options,
    fetcher,
    robotsEvaluator,
    parser,
    logger,
  });
}
