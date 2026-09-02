/**
 * @opensearch/ranking
 * Ranking Engine Boundary Scaffolding (Phase 1)
 * Query processing, candidate retrieval, BM25 ranking, and snippets
 * are strictly scheduled for Milestone 4 (Phases 12-15).
 */

import { ServiceBoundaryInfo } from '@opensearch/shared';

export const RANKING_MODULE_INFO: ServiceBoundaryInfo = {
  moduleName: '@opensearch/ranking',
  purpose: 'Deterministic lexical relevance scoring (BM25, signals, candidate ranking)',
  currentPhaseScope: 'Phase 1: Boundary initialization only. Implementation starts in Milestone 4.',
};

export function getRankingModuleInfo(): ServiceBoundaryInfo {
  return RANKING_MODULE_INFO;
}
