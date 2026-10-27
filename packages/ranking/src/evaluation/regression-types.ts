/**
 * @opensearch/ranking — Ranking Regression Types & Thresholds (Phase 93)
 *
 * Defines contracts, thresholds, and diagnostic structures for detecting
 * ranking regressions, query-level degradations, and category trade-offs.
 */

import { JudgedQueryCategory } from './judged-dataset-types.js';

export interface RegressionThresholds {
  /** Maximum allowable drop in macro-averaged nDCG@k before failing gate (default: 0.01 / 1.0%) */
  maxAggregateNdcgDrop: number;

  /** Maximum allowable drop in Mean Reciprocal Rank (MRR) before failing gate (default: 0.02 / 2.0%) */
  maxAggregateMrrDrop: number;

  /** Maximum allowable drop for any single individual query before flagging severe regression (default: 0.10) */
  maxIndividualQueryNdcgDrop: number;

  /** Maximum allowable drop for an entire semantic category (default: 0.03) */
  maxCategoryNdcgDrop: number;

  /** Drop threshold in one category that triggers a review requirement if another category improved (default: 0.02) */
  categoryTradeoffDropThreshold: number;

  /** Maximum fraction of evaluated queries allowed to regress before failing gate (default: 0.20 / 20%) */
  maxAllowedRegressionRatio: number;
}

export type RegressionSeverity = 'severe' | 'moderate' | 'minor' | 'none';

export interface QueryRegressionRecord {
  queryId: string;
  query: string;
  category: JudgedQueryCategory;
  baselineNdcg: number;
  candidateNdcg: number;
  deltaNdcg: number;
  baselineMrr: number;
  candidateMrr: number;
  deltaMrr: number;
  severity: RegressionSeverity;
  reason?: string;
}

export interface CategoryTradeOff {
  improvedCategory: JudgedQueryCategory;
  regressedCategory: JudgedQueryCategory;
  improvedDeltaNdcg: number;
  regressedDeltaNdcg: number;
  requiresReview: boolean;
  notes: string;
}

export interface CategoryRegressionSummary {
  category: JudgedQueryCategory;
  queryCount: number;
  deltaNdcg: number;
  deltaMrr: number;
  regressedQueriesCount: number;
  improvedQueriesCount: number;
  status: 'improved' | 'neutral' | 'regressed';
}

export interface RankingRegressionResult {
  /** Gate pass/fail status: true if all regression thresholds are respected */
  passed: boolean;

  /** Review requirement flag: true if trade-offs or notable regressions require human sign-off */
  requiresReview: boolean;

  /** Specific threshold violations causing gate failure */
  failureReasons: string[];

  /** Diagnostic reasons requiring review (e.g. category trade-offs) */
  reviewReasons: string[];

  /** Threshold settings used for this gate evaluation */
  thresholds: RegressionThresholds;

  /** Aggregate delta values across evaluated queries */
  aggregateDeltas: {
    ndcg: number;
    mrr: number;
    map: number;
    precision: number;
    recall: number;
  };

  /** Queries with negative nDCG shifts, sorted from most severe to minor */
  regressedQueries: QueryRegressionRecord[];

  /** Queries with positive nDCG shifts */
  improvedQueries: QueryRegressionRecord[];

  /** Category trade-off analyses */
  categoryTradeOffs: CategoryTradeOff[];

  /** Per-category summaries */
  categoryBreakdown: Partial<Record<JudgedQueryCategory, CategoryRegressionSummary>>;

  /** Verification that zero private user data was processed */
  privacyVerified: boolean;

  /** ISO timestamp for regression evaluation */
  evaluationTimestamp: string;
}
