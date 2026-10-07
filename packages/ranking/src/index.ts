/**
 * @opensearch/ranking — Ranking & Query Engine Root (Milestone 4 / Phase 12, 13, 14 & 15)
 */

// ── Phase 12: Query Processing ──────────────────────────────────────────
export type {
  ParsedPhrase,
  ParsedQuery,
  QueryFilter,
  QueryParserOptions,
  QueryParser,
} from './query/query-types.js';

export {
  normalizeQueryText,
  foldDiacritics as foldQueryDiacritics,
} from './query/query-normalizer.js';
export type { QueryNormalizerOptions } from './query/query-normalizer.js';

export { DefaultQueryParser, createQueryParser } from './query/query-parser.js';

// ── Phase 46: Synonym Graph & Query Expansion (V1.3.0) ───────────────────
export type {
  SynonymMatch,
  ExpandedQueryTerms,
  SynonymEngineOptions,
} from './query/synonym-engine.js';
export {
  SEED_SYNONYM_GROUPS,
  SynonymEngine,
  createSynonymEngine,
} from './query/synonym-engine.js';

// ── Phase 36: Typo Tolerance & Did You Mean (V1.2.0) ────────────────────
export type {
  TypoCorrectionCandidate,
  DidYouMeanResult,
  TypoToleranceOptions,
} from './query/typo-corrector.js';
export {
  damerauLevenshteinDistance,
  TypoToleranceEngine,
  createTypoToleranceEngine,
} from './query/typo-corrector.js';

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

// ── Phase 48: Temporal Freshness Decay & Domain Trust Authority (V1.3.0) ──
export type {
  AuthorityScorerOptions,
  BlendedScoreComponents,
} from './scorer/authority-scorer.js';
export {
  TRUSTED_DOMAIN_TIERS,
  AuthorityScorer,
  createAuthorityScorer,
} from './scorer/authority-scorer.js';

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

// ── Phase 38: Instant Answers, Conversions & Bangs (V1.2.0) ─────────────
export type { BangDefinition, BangResult } from './answers/bang-registry.js';
export { BANG_CATALOG, evaluateBang } from './answers/bang-registry.js';

export type { MathEvaluationResult } from './answers/math-evaluator.js';
export { MathEvaluator } from './answers/math-evaluator.js';

export type {
  EpochConversionResult,
  ColorConversionResult,
  UnitConversionResult,
  ConversionResult,
} from './answers/conversion-evaluator.js';
export { ConversionEvaluator } from './answers/conversion-evaluator.js';

export type { InstantAnswerPayload } from './answers/instant-answer-engine.js';
export { InstantAnswerEngine, createInstantAnswerEngine } from './answers/instant-answer-engine.js';

// ── Phase 49: Knowledge Graph & Entity Info-Cards (V1.3.0) ───────────────
export type {
  KnowledgeEntity,
  KnowledgeCardResult,
} from './answers/knowledge-engine.js';
export {
  KNOWLEDGE_DATABASE,
  KnowledgeEngine,
  createKnowledgeEngine,
} from './answers/knowledge-engine.js';

// ── Phase 50: World Clock & Timezone Conversions (V1.3.0) ─────────────────
export type {
  TimezoneConversionResult,
  CityTimezoneInfo,
} from './answers/timezone-evaluator.js';
export {
  KNOWN_TIMEZONES,
  CITIES_DATABASE,
  TimezoneEvaluator,
  createTimezoneEvaluator,
} from './answers/timezone-evaluator.js';

// ── Phase 51: Developer Syntax Cheat Sheets (V1.3.0) ──────────────────────
export type {
  CheatSheetEntry,
  CheatSheetResult,
} from './answers/cheatsheet-engine.js';
export {
  CHEATSHEET_DATABASE,
  CheatSheetEngine,
  createCheatSheetEngine,
} from './answers/cheatsheet-engine.js';

// ── Phase 56: Crypto & Encoding Toolkit (V1.4.0) ─────────────────────────
export type { CryptoEngineResult } from './answers/crypto-engine.js';
export { CryptoEngine } from './answers/crypto-engine.js';

// ── Phase 57: Developer Network, Subnet & Cron Explainer (V1.4.0) ────────
export type { NetworkEngineResult } from './answers/network-engine.js';
export { NetworkEngine } from './answers/network-engine.js';

// ── Phase 58: Website Security & Privacy Inspector (V1.4.0) ──────────────
export type { PrivacyAuditResult } from './answers/privacy-audit-engine.js';
export { PrivacyAuditEngine } from './answers/privacy-audit-engine.js';

// ── Phase 60: Real-Time Currency, Crypto & Unit Converter (V1.4.0) ───────
export type { CurrencyConversionResult } from './answers/currency-converter.js';
export { CurrencyConverterEngine } from './answers/currency-converter.js';

// ── Phase 61: Symbolic Math & LaTeX Solver (V1.4.0) ──────────────────────
export type { MathSolverResult } from './answers/math-engine.js';
export { SymbolicMathEngine } from './answers/math-engine.js';

