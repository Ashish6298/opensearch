/**
 * @opensearch/ranking — Evaluation Metrics Types & Policies (Phase 91)
 *
 * Defines mathematical configurations, option structures, and result contracts
 * for information retrieval (IR) evaluation metrics:
 * - nDCG@k (Normalized Discounted Cumulative Gain)
 * - MRR (Mean Reciprocal Rank)
 * - Precision@k
 * - Recall@k
 * - MAP@k (Mean Average Precision)
 */

import { JudgedQueryCategory, RelevanceGrade } from './judged-dataset-types.js';

export type GainMethod = 'exponential' | 'linear';

export type UnjudgedDocPolicy = 'zero' | 'ignore' | 'defaultGrade';

export type NoRelevantDocsPolicy = 'zero' | 'one' | 'ignore';

export type TieBreakingRule = 'docIdAsc' | 'none';

export interface EvaluationMetricOptions {
  /** Ranking cutoff depth (e.g. 1, 3, 5, 10, 20). Defaults to 10. */
  k?: number;

  /**
   * Minimum grade threshold to treat a document as binary-relevant in
   * Precision, Recall, MRR, and MAP.
   * On a 0..3 scale:
   * 1 = marginal or higher is relevant (default)
   * 2 = relevant or higher is relevant
   */
  relevanceThreshold?: RelevanceGrade;

  /**
   * Formulation for graded gain in DCG:
   * - 'exponential': (2^grade - 1) / log2(rank + 1) [Standard TREC / industry default]
   * - 'linear': grade / log2(rank + 1)
   */
  gainMethod?: GainMethod;

  /**
   * Treatment of retrieved documents missing from the ground truth judgment pool:
   * - 'zero': treated as non-relevant (grade 0). Standard in offline IR benchmarks.
   * - 'ignore': filtered out of the retrieved list before evaluation.
   * - 'defaultGrade': assigned a predetermined fallback grade.
   */
  unjudgedPolicy?: UnjudgedDocPolicy;

  /** Fallback grade if unjudgedPolicy is 'defaultGrade'. Defaults to 0. */
  defaultGrade?: RelevanceGrade;

  /**
   * Treatment for queries with no relevant documents in ground truth:
   * - 'zero': metric returns 0.0 (default for strict penalization).
   * - 'one': metric returns 1.0 (vacuously true / zero false positives).
   * - 'ignore': excluded from aggregate mean averages across queries.
   */
  noRelevantDocsPolicy?: NoRelevantDocsPolicy;

  /**
   * Deterministic tie-breaking rule when documents have identical scores or grades:
   * - 'docIdAsc': sorts lexicographically ascending by document ID (deterministic).
   * - 'none': preserves incoming list order.
   */
  tieBreaking?: TieBreakingRule;
}

export interface QueryMetricsResult {
  /** Identifier of the evaluated query */
  queryId: string;
  /** Cutoff rank k applied */
  k: number;
  /** Discounted Cumulative Gain at k */
  dcg: number;
  /** Ideal Discounted Cumulative Gain at k */
  idcg: number;
  /** Normalized Discounted Cumulative Gain at k (in [0.0, 1.0]) */
  ndcg: number;
  /** Precision at k (in [0.0, 1.0]) */
  precision: number;
  /** Recall at k (in [0.0, 1.0]) */
  recall: number;
  /** Reciprocal Rank (1 / rank of first relevant item, or 0.0) */
  reciprocalRank: number;
  /** Average Precision at k (in [0.0, 1.0]) */
  averagePrecision: number;
  /** Total documents retrieved within cutoff k */
  retrievedCount: number;
  /** Number of binary-relevant documents retrieved within cutoff k */
  relevantRetrievedCount: number;
  /** Total binary-relevant documents known in judgment pool */
  totalRelevantCount: number;
  /** Count of unjudged documents encountered within top k */
  unjudgedCount: number;
  /** Informative flags or warnings (e.g. unjudged items, no ground truth) */
  notes: string[];
}

export interface CategoryMetricSummary {
  category: JudgedQueryCategory;
  queryCount: number;
  meanNDCG: number;
  meanReciprocalRank: number;
  meanAveragePrecision: number;
  meanPrecision: number;
  meanRecall: number;
}

export interface AggregateMetricsResult {
  /** Total number of queries submitted for evaluation */
  queryCount: number;
  /** Number of queries included in metric averages */
  evaluatedQueryCount: number;
  /** Number of queries skipped (e.g. due to 'ignore' policy on zero ground-truth) */
  ignoredQueryCount: number;
  /** Cutoff rank k */
  k: number;
  /** Mean Normalized Discounted Cumulative Gain across queries */
  meanNDCG: number;
  /** Mean Reciprocal Rank (MRR) across queries */
  meanReciprocalRank: number;
  /** Mean Average Precision (MAP) across queries */
  meanAveragePrecision: number;
  /** Macro-averaged Precision@k across queries */
  meanPrecision: number;
  /** Macro-averaged Recall@k across queries */
  meanRecall: number;
  /** Per-category breakdown summaries */
  categoryBreakdown: Partial<Record<JudgedQueryCategory, CategoryMetricSummary>>;
  /** Individual query-level results */
  queryResults: QueryMetricsResult[];
}

export interface HandCalculatedFixture {
  name: string;
  description: string;
  qrels: Record<string, RelevanceGrade>;
  retrieved: Array<{ id: string; score?: number }>;
  options: EvaluationMetricOptions;
  expected: {
    dcg: number;
    idcg: number;
    ndcg: number;
    precision: number;
    recall: number;
    reciprocalRank: number;
    averagePrecision: number;
  };
}
