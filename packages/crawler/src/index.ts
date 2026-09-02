/**
 * @opensearch/crawler
 * Crawler Boundary Scaffolding (Phase 1)
 * URL queue, fetcher, robots.txt, HTML parsing, and crawl orchestrator
 * are strictly scheduled for Milestone 2 (Phases 4-8).
 */

import { ServiceBoundaryInfo } from '@opensearch/shared';

export const CRAWLER_MODULE_INFO: ServiceBoundaryInfo = {
  moduleName: '@opensearch/crawler',
  purpose: 'Polite, safe, policy-aware web discovery and fetching',
  currentPhaseScope: 'Phase 1: Boundary initialization only. Implementation starts in Milestone 2.',
};

export function getCrawlerModuleInfo(): ServiceBoundaryInfo {
  return CRAWLER_MODULE_INFO;
}
