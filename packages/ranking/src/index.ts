/**
 * @opensearch/ranking — Ranking & Query Engine Root (Milestone 4 / Phase 12, 13, 14 & 15)
 */

// ── Phase 12: Query Processing ──────────────────────────────────────────
export type {
  ParsedPhrase,
  ParsedQuery,
  QueryParserOptions,
  QueryParser,
} from './query/query-types.js';

export {
  normalizeQueryText,
  foldDiacritics as foldQueryDiacritics,
} from './query/query-normalizer.js';
export type { QueryNormalizerOptions } from './query/query-normalizer.js';

export { DefaultQueryParser, createQueryParser } from './query/query-parser.js';

// ── Phase 13: Candidate Retrieval ───────────────────────────────────────
export type {
  RetrievalMode,
  TermPostingMatch,
  CandidateDocument,
  RetrievalOptions,
  RetrievalStats,
  RetrievalResult,
  CandidateRetriever,
} from './retrieval/retrieval-types.js';

export {
  IndexCandidateRetriever,
  createCandidateRetriever,
} from './retrieval/candidate-retriever.js';
export type { IndexCandidateRetrieverOptions } from './retrieval/candidate-retriever.js';

// ── Phase 14: Ranking Engine ────────────────────────────────────────────
export type {
  BM25Params,
  FieldWeightBoosts,
  ScoreSignalConfig,
  RankingOptions,
  TermScoreBreakdown,
  ScoreExplanation,
  ScoredDocument,
  RankingStats,
  RankingResult,
  RankingEngine,
} from './scorer/scorer-types.js';

export { BM25Scorer, DEFAULT_BM25_PARAMS, DEFAULT_FIELD_BOOSTS } from './scorer/bm25-scorer.js';

export {
  DefaultRankingEngine,
  DEFAULT_SCORE_SIGNALS,
  createRankingEngine,
} from './scorer/ranking-engine.js';
export type { DefaultRankingEngineOptions } from './scorer/ranking-engine.js';

// ── Phase 15: Result Generation & Snippets ───────────────────────────────
export type {
  HighlightTagOptions,
  SnippetOptions,
  PaginationOptions,
  PaginationMeta,
  SearchResultItem,
  SearchResultSet,
  ResultGeneratorOptions,
  ResultGenerator,
} from './results/result-types.js';

export { escapeHtml, unescapeHtml, stripHtmlTags } from './results/html-escaper.js';

export {
  SnippetGenerator,
  DEFAULT_HIGHLIGHT_TAGS,
  DEFAULT_SNIPPET_OPTIONS,
} from './results/snippet-generator.js';

export {
  DefaultResultGenerator,
  DEFAULT_PAGINATION,
  createResultGenerator,
} from './results/result-generator.js';

// ── Phase 24: Search Quality Evaluation ──────────────────────────────────
export type { QueryCategory, EvaluationQuery } from './evaluation/evaluation-dataset.js';

export { SEARCH_QUALITY_DATASET } from './evaluation/evaluation-dataset.js';

export type {
  QueryEvaluationResult,
  CategorySummary,
  SearchQualityEvaluationReport,
  SearchPipelineComponents,
} from './evaluation/quality-evaluator.js';

export { SearchQualityEvaluator } from './evaluation/quality-evaluator.js';

// ── Phase 28: Search Performance & Query Caching ─────────────────────────
export type { CacheEntry, CacheStats, QueryCacheOptions } from './cache/query-cache.js';

export { LruQueryCache, createQueryCache } from './cache/query-cache.js';
