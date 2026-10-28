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
export type { QueryCategory as EvaluationCategory, EvaluationQuery } from './evaluation/evaluation-dataset.js';

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

export type {
  InstantAnswerAttribution,
  InstantAnswerPrivacyBehavior,
  InstantAnswerProvenance,
  InstantAnswerContext,
  InstantAnswerType,
  InstantAnswerPayload,
  InstantAnswerProviderMetadata,
  InstantAnswerProvider,
  InstantAnswerRegistryOptions,
  WeatherProviderOptions,
} from './answers/index.js';
export {
  InstantAnswerEngine,
  createInstantAnswerEngine,
  InstantAnswerRegistry,
  getDefaultInstantAnswerRegistry,
  UnitConversionProvider,
  MathCalculationProvider,
  CurrencyInstantAnswerProvider,
  OpenMeteoWeatherProvider,
  DefinitionInstantAnswerProvider,
  PlacesInstantAnswerProvider,
} from './answers/index.js';

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

// ── Phase 69: Standard Provider Interface (V1.5.0) ───────────────────────
export * from './providers/index.js';


// ── Phase 81: Safe Search & Content Controls (V1.5.0) ───────────────────
export * from './safety/safe-search.js';
// ── Phase 89: PageRank Integration & Explainability (V1.5.0) ────────────
export type {
  PageRankLookupProvider,
  PageRankSignalOptions,
  PageRankScoreExplanation,
  PageRankTransformType,
} from './scorer/pagerank-scorer.js';
export {
  evaluatePageRankSignal,
  transformPageRankScore,
  DEFAULT_PAGERANK_SIGNAL_OPTIONS,
} from './scorer/pagerank-scorer.js';
// ── Phase 90: Judged Query Dataset & Quality Lab (Milestone 32) ──────────
export type {
  JudgedQueryCategory,
  DatasetSplit,
  RelevanceGrade,
  RelevanceLabel,
  JudgedDocument,
  JudgedQuery,
  JudgedDatasetProvenance,
  JudgedDataset,
  JudgedDatasetFilterOptions,
} from './evaluation/judged-dataset-types.js';

export {
  CI_JUDGED_DATASET,
} from './evaluation/datasets/ci-judged-dataset.js';

export {
  FULL_JUDGED_DATASET,
} from './evaluation/datasets/full-judged-dataset.js';

export {
  validateJudgedDataset,
  scanDatasetForPrivacyViolations,
  getTuningQueries,
  getHeldOutQueries,
  getQueriesByCategory,
  filterJudgedDataset,
  getIdealQrels,
} from './evaluation/judged-dataset-loader.js';

// ── Phase 91: Evaluation Metrics (Milestone 32) ──────────────────────────
export type {
  GainMethod,
  UnjudgedDocPolicy,
  NoRelevantDocsPolicy,
  TieBreakingRule,
  EvaluationMetricOptions,
  QueryMetricsResult,
  CategoryMetricSummary,
  AggregateMetricsResult,
  HandCalculatedFixture,
} from './evaluation/metrics-types.js';

export type { EvaluableQuery } from './evaluation/evaluation-metrics.js';

export {
  computeDCG,
  computeIDCG,
  computeNDCG,
  computePrecisionAtK,
  computeRecallAtK,
  computeReciprocalRank,
  computeAveragePrecision,
  evaluateRankedList,
  evaluateQuerySet,
} from './evaluation/evaluation-metrics.js';

// ── Phase 92: Experiment Runner (Milestone 32) ───────────────────────────
export type {
  RankingExperimentConfig,
  ExperimentMetadata,
  MetricDelta,
  MetricComparison,
  QueryWinLoss,
  CategoryComparison,
  ExperimentComparisonResult,
  SweepParameterGrid,
  SweepResultEntry,
  SweepExperimentResult,
  ScorerFunction,
} from './evaluation/experiment-types.js';

export {
  PRODUCTION_SAFEGUARD_NOTICE,
  DEFAULT_BASELINE_CONFIG,
  defaultDeterministicScorer,
  runSingleEvaluation,
  compareExperiments,
  runParameterSweep,
  exportExperimentJson,
  exportExperimentMarkdown,
  resolveDataset,
} from './evaluation/experiment-runner.js';

// ── Phase 93: Ranking Regression Checks (Milestone 32) ───────────────────
export type {
  RegressionThresholds,
  RegressionSeverity,
  QueryRegressionRecord,
  CategoryTradeOff,
  CategoryRegressionSummary,
  RankingRegressionResult,
} from './evaluation/regression-types.js';

export {
  DEFAULT_REGRESSION_THRESHOLDS,
  checkRankingRegression,
  runCiRegressionGate,
  formatRegressionReport,
} from './evaluation/regression-checker.js';

// ── Phase 94: Benchmark Harness (Milestone 33) ───────────────────────────
export type {
  HardwareEnvironment,
  MemorySnapshot,
  IndexingBenchmarkResult,
  LatencyDistribution,
  QueryPhaseBenchmarkResult,
  QueryLevelBenchmarkItem,
  BenchmarkReport,
  BenchmarkHarnessOptions,
} from './benchmark/benchmark-types.js';

export {
  BENCHMARK_QUERY_SET_VERSION,
  REPEATABLE_BENCHMARK_QUERIES,
} from './benchmark/benchmark-queries.js';

export {
  FIXED_BENCHMARK_CORPUS_VERSION,
  getMemorySnapshot,
  captureEnvironment,
  calculateDistribution,
  benchmarkIndexingPhase,
  benchmarkQueryPhases,
  runBenchmark,
  exportBenchmarkJson,
  exportBenchmarkMarkdown,
} from './benchmark/benchmark-harness.js';

// ── Phase 95: Profile Before Optimizing (Milestone 33) ───────────────────
export type {
  SearchSubsystemStage,
  StageExecutionStats,
  DominantCostFinding,
  OptimizationRecommendation,
  ProfilerReport,
  CorrectnessComparisonResult,
} from './benchmark/profiler-types.js';

export type { ProfilerOptions } from './benchmark/subsystem-profiler.js';

export {
  runSubsystemProfiling,
  compareOptimizedCorrectness,
  exportProfilerJson,
  exportProfilerMarkdown,
} from './benchmark/subsystem-profiler.js';

// ── Phase 96: Top-k Retrieval Optimization (Milestone 33) ────────────────
export type {
  TopKAlgorithm,
  TermUpperScoreBound,
  PostingSkipBlock,
  TopKRetrievalOptions,
  TopKPruningStats,
  TopKResult,
  TopKVerificationResult,
} from './retrieval/topk-types.js';

export { TermBoundComputer } from './retrieval/term-bound-computer.js';
export { PostingSkipList } from './retrieval/posting-skip-list.js';
export {
  TopKRankingEngine,
  verifyTopKEquivalence,
} from './retrieval/topk-retriever.js';

export type {
  CorpusScaleEvaluation,
  TopKBenchmarkReport,
} from './retrieval/topk-benchmark.js';

export {
  runTopKMultiCorpusBenchmark,
  exportTopKBenchmarkMarkdown,
} from './retrieval/topk-benchmark.js';

// ── Phase 97: Segment-Based Indexing & Compaction (Milestone 33) ────────
export type {
  SegmentMetadata,
  SegmentPayload,
  SegmentManifest,
  SegmentMergeOptions,
  SegmentMergeResult,
  SegmentCrashRecoveryReport,
  SegmentCompactionPolicy,
  SegmentedIndexOptions,
  IngestionBatchMetric,
  SegmentBenchmarkReport,
} from '@opensearch/indexer';

export {
  CURRENT_SEGMENT_SCHEMA_VERSION,
  CURRENT_MANIFEST_SCHEMA_VERSION,
  MANIFEST_FILE_NAME,
  MANIFEST_TMP_FILE_NAME,
  SEGMENTS_SUBDIR,
  computeManifestChecksum,
  loadSegmentManifest,
  saveSegmentManifestAtomic,
  computeSegmentChecksum,
  writeSegmentAtomic,
  loadSegment,
  recoverOrCleanDanglingSegments,
  mergeSegments,
  SegmentedInvertedIndex,
  runSegmentJustificationBenchmark,
  exportSegmentBenchmarkMarkdown,
} from '@opensearch/indexer';

// ── Phase 98: Publish Benchmark Results (Milestone 33) ───────────────────
export type {
  ProgressiveScaleTierConfig,
  TierBenchmarkResult,
  BenchmarkChartSet,
  HardwareLimitGuard,
  PublishBenchmarkReport,
  PublishBenchmarkOptions,
} from './benchmark/publish-benchmark-types.js';

export {
  DEFAULT_SCALE_TIERS,
  PRODUCTION_DISCLAIMER,
  BENCHMARK_LIMITATIONS,
  evaluateHardwareGuard,
  generateAsciiBarChart,
  generateBenchmarkCharts,
  runPublishBenchmark,
  exportPublishBenchmarkJson,
  exportPublishBenchmarkMarkdown,
} from './benchmark/publish-benchmark.js';

// ── Phase 100: Tracker-Aware Ranking & Privacy Indicators ────────────────
export type {
  TrackerRankingOptions,
  TrackerScoreExplanation,
  TrackerIndicator,
  QueryLevelRankShift,
  TrackerQualityComparisonReport,
  TrackerClassificationSource,
  EvaluatedTrackerSignal,
  TrackerQualityComparisonOptions,
  PreparedQueryTestItem,
  TrackerBenchmarkCliOptions,
} from './tracker/index.js';

export {
  TRACKER_DETECTION_DISCLAIMER,
  DEFAULT_TRACKER_RANKING_OPTIONS,
  resolveClassificationFromSource,
  evaluateTrackerSignal,
  createTrackerIndicator,
  TrackerQualityEvaluator,
  runTrackerQualityBenchmark,
} from './tracker/index.js';

// ── Phase 101: Focus Lens Schema & Local Profiles (Milestone 34) ──────────
export type {
  DomainRuleAction,
  DomainMultiplierRule,
  FocusLensRankingWeights,
  FocusLensProfileMetadata,
  FocusLensProfile,
  LensScoreExplanation,
  LensValidationResult,
  EvaluatedLensResult,
  FocusLensRegistryOptions,
  LensExportOptions,
  LensEditorOptions,
  SampleQueryDocument,
  PreviewResultHit,
  QueryPreviewSummary,
  LensPreviewReport,
  LensPreviewOptions,
} from './lens/index.js';

export {
  CURRENT_LENS_SCHEMA_VERSION,
  SUPPORTED_LENS_SCHEMA_VERSIONS,
  HEALTH_LENS_DISCLAIMER,
  NO_TRACKERS_LENS_DISCLAIMER,
  LENS_BOOST_MIN,
  LENS_BOOST_MAX,
  LENS_DEMOTE_MIN,
  LENS_DEMOTE_MAX,
  LENS_WEIGHT_MIN,
  LENS_WEIGHT_MAX,
  MAX_LENS_FILE_SIZE_BYTES,
  FOCUS_LENS_JSON_SCHEMA,
  isValidDomainPattern,
  validateLensProfile,
  GENERAL_LENS,
  STUDENT_LENS,
  DEVELOPER_LENS,
  RESEARCH_LENS,
  TRUSTED_HEALTH_LENS,
  NO_TRACKERS_LENS,
  BUILTIN_LENSES,
  getBuiltinLens,
  isBuiltinLensId,
  extractHostnameFromUrl,
  matchesDomainPattern,
  evaluateLensForDocument,
  FocusLensRegistry,
  getDefaultLensRegistry,
  exportLensToJson,
  importLensFromJson,
  FocusLensEditor,
  FIXED_PREVIEW_CORPUS,
  FIXED_SAMPLE_QUERIES,
  previewLensEffects,
} from './lens/index.js';

// ── Phase 104: Quick Answer Panel & Extractive Summarizer (Milestone 35) ──
export type {
  QuickAnswerStatus,
  QuickAnswerCitation,
  QuickAnswerStatement,
  QuickAnswerDisagreement,
  QuickAnswerModelInfo,
  QuickAnswerProvenance,
  QuickAnswerPayload,
  QuickAnswerOptions,
  IQuickAnswerEngine,
} from './answers/quick-answer/index.js';

export {
  sanitizeUntrustedText,
  validateSourceUrl,
  detectDisagreement,
  tokenizeText,
  calculateJaccardSimilarity,
  splitIntoSentences,
  isBoilerplateOrLowQuality,
  scoreCandidateSentence,
  selectTopExtractiveSentences,
  DEFAULT_QUICK_ANSWER_OPTIONS,
  QuickAnswerEngine,
  createQuickAnswerEngine,
  getSharedQuickAnswerEngine,
} from './answers/quick-answer/index.js';





