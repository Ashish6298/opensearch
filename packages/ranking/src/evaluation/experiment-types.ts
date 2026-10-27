/**
 * @opensearch/ranking — Experiment Runner Types & Contracts (Phase 92)
 *
 * Defines configuration schemas, execution records, sweep specifications,
 * and reporting contracts for repeatable IR ranking experiments.
 */

import { JudgedQuery, JudgedQueryCategory } from './judged-dataset-types.js';
import { AggregateMetricsResult, EvaluationMetricOptions } from './metrics-types.js';

export interface RankingExperimentConfig {
  /** Identifier name for the configuration (e.g. 'baseline-v1', 'candidate-bm25-high-k1') */
  name: string;
  /** Human-readable explanation of the hypothesis or parameter variation */
  description?: string;
  /** BM25 / BM25F parameters and field weights */
  bm25: {
    k1: number;
    b: number;
    titleBoost: number;
    headingBoost: number;
    urlBoost: number;
  };
  /** PageRank signal parameters */
  pageRank: {
    enabled: boolean;
    weight: number;
    maxBoost: number;
    transform: 'logarithmic' | 'linear' | 'min-max' | 'sigmoid';
  };
  /** Term coverage weighting */
  coverageWeight?: number;
  /** Exact phrase multiplier */
  exactPhraseMultiplier?: number;
}

export interface ExperimentMetadata {
  /** Unique execution identifier */
  experimentId: string;
  /** ISO timestamp of experiment execution */
  timestamp: string;
  /** Execution runtime in milliseconds */
  runtimeMs: number;
  /** Target index version / build identifier */
  indexVersion: string;
  /** Git commit revision if available */
  gitRevision?: string;
  /** Evaluated dataset identifier */
  datasetName: string;
  /** Evaluated dataset schema version */
  datasetVersion: string;
  /** Dataset partition evaluated: 'tuning' | 'held_out' | 'all' */
  datasetSplit: 'tuning' | 'held_out' | 'all';
  /** Total number of queries evaluated */
  queryCount: number;
  /** Cutoff and metric policies used during evaluation */
  metricOptions: EvaluationMetricOptions;
  /** Strict safeguard notice preventing unreviewed automated production changes */
  productionSafeguard: string;
}

export interface MetricDelta {
  baseline: number;
  candidate: number;
  absoluteDelta: number;
  percentChange: number;
}

export interface MetricComparison {
  ndcg: MetricDelta;
  mrr: MetricDelta;
  map: MetricDelta;
  precision: MetricDelta;
  recall: MetricDelta;
}

export interface QueryWinLoss {
  wins: number;
  ties: number;
  losses: number;
  winQueries: string[];
  lossQueries: string[];
  tieQueries: string[];
}

export interface CategoryComparison {
  category: JudgedQueryCategory;
  queryCount: number;
  baselineNDCG: number;
  candidateNDCG: number;
  deltaNDCG: number;
  baselineMRR: number;
  candidateMRR: number;
  deltaMRR: number;
}

export interface ExperimentComparisonResult {
  metadata: ExperimentMetadata;
  baselineConfig: RankingExperimentConfig;
  candidateConfig: RankingExperimentConfig;
  baselineMetrics: AggregateMetricsResult;
  candidateMetrics: AggregateMetricsResult;
  comparison: MetricComparison;
  queryWinLoss: QueryWinLoss;
  categoryComparisons: CategoryComparison[];
  conclusion: {
    improved: boolean;
    evidenceRationale: string;
  };
}

export interface SweepParameterGrid {
  k1?: number[];
  b?: number[];
  titleBoost?: number[];
  pageRankWeight?: number[];
  pageRankTransform?: Array<'logarithmic' | 'linear' | 'min-max' | 'sigmoid'>;
}

export interface SweepResultEntry {
  config: RankingExperimentConfig;
  metrics: AggregateMetricsResult;
  comparisonToBaseline: MetricComparison;
  rank: number;
}

export interface SweepExperimentResult {
  metadata: ExperimentMetadata;
  baselineConfig: RankingExperimentConfig;
  candidatesEvaluated: number;
  rankedConfigurations: SweepResultEntry[];
  bestConfiguration: SweepResultEntry;
}

export type ScorerFunction = (
  query: JudgedQuery,
  config: RankingExperimentConfig,
) => Array<{ id: string; score: number }>;
