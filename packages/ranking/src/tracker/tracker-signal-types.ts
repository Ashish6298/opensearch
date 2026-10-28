/**
 * @opensearch/ranking — Tracker-Aware Ranking Types & Contracts (Phase 100)
 *
 * Defines contracts, options, indicator schemas, and quality comparison structures
 * for tracker-aware relevance ranking and evidence-based privacy indicators.
 */

import type {
  ClassificationConfidence,
  TrackerCategory,
  TrackerClassificationResult,
  TrackerClassificationStatus,
} from '@opensearch/crawler';
import type { AggregateMetricsResult } from '../evaluation/metrics-types.js';

export const TRACKER_DETECTION_DISCLAIMER =
  'Notice: Tracker detection is heuristic, static, and based on known third-party domain lists. It is incomplete and does NOT constitute a security guarantee, vulnerability audit, or privacy certification.';

export interface TrackerRankingOptions {
  /** Whether the tracker-aware ranking signal is enabled (default: false) */
  enabled: boolean;
  /** Blending weight applied to tracker adjustment factor [0.0 - 1.0] (default: 0.15) */
  weight: number;
  /** Multiplier boost applied to documents verified with zero detected trackers (default: 1.10) */
  cleanSiteBoost: number;
  /** Multiplier penalty applied to documents with standard third-party trackers (default: 0.85) */
  trackingPenalty: number;
  /** Multiplier penalty applied to documents with heavy tracking, session replays, or fingerprinting (default: 0.70) */
  heavyTrackingPenalty: number;
}

export const DEFAULT_TRACKER_RANKING_OPTIONS: Readonly<TrackerRankingOptions> = {
  enabled: false,
  weight: 0.15,
  cleanSiteBoost: 1.10,
  trackingPenalty: 0.85,
  heavyTrackingPenalty: 0.70,
};

export type TrackerClassificationSource =
  | Map<string, TrackerClassificationResult>
  | Record<string, TrackerClassificationResult>
  | ((urlOrDocId: string) => TrackerClassificationResult | null | undefined)
  | { getClassification(urlOrDocId: string): TrackerClassificationResult | null | undefined };

export function resolveClassificationFromSource(
  source: TrackerClassificationSource | undefined | null,
  urlOrDocId: string,
): TrackerClassificationResult | null {
  if (!source) return null;
  if (typeof source === 'function') {
    return source(urlOrDocId) ?? null;
  }
  if (source instanceof Map) {
    return source.get(urlOrDocId) ?? null;
  }
  if ('getClassification' in source && typeof (source as any).getClassification === 'function') {
    return (source as any).getClassification(urlOrDocId) ?? null;
  }
  if (typeof source === 'object') {
    return (source as Record<string, TrackerClassificationResult>)[urlOrDocId] ?? null;
  }
  return null;
}

export interface TrackerScoreExplanation {
  /** Whether tracker-aware signal was active */
  enabled: boolean;
  /** Classification status evaluated */
  status: TrackerClassificationStatus;
  /** Classification confidence */
  confidence: ClassificationConfidence;
  /** Total number of third-party trackers detected */
  trackerCount: number;
  /** Categories of trackers identified */
  detectedCategories: TrackerCategory[];
  /** Multiplier modifier applied to base relevance score */
  multiplier: number;
  /** Score difference attributed to tracker signal */
  scoreAdjustment: number;
  /** Human-readable explanation of the adjustment */
  explanation: string;
  /** Invariant: tracker score never claims absolute security or privacy */
  isSecurityGuarantee: false;
  /** Mandatory disclaimer */
  disclaimer: string;
}

export interface TrackerIndicator {
  /** Classification status */
  status: TrackerClassificationStatus;
  /** Short badge label for result card display */
  badgeText: string;
  /** Visual severity level */
  severity: 'clean' | 'warning' | 'alert' | 'neutral';
  /** Total detected trackers */
  trackerCount: number;
  /** List of detected tracker categories */
  categories: TrackerCategory[];
  /** Detailed tooltip text for user hover/inspection */
  tooltip: string;
  /** Structural evidence note */
  evidenceNote: string;
  /** Prominent disclaimer */
  disclaimer: string;
}

export interface QueryLevelRankShift {
  queryId: string;
  query: string;
  baselineTopDocId: string;
  candidateTopDocId: string;
  topDocChanged: boolean;
  baselineScore: number;
  candidateScore: number;
  baselineTopRankInCandidate: number;
  explanation: string;
}

export interface TrackerQualityComparisonReport {
  reportId: string;
  timestamp: string;
  datasetName: string;
  datasetSplit: string;
  queryCount: number;
  signalConfig: TrackerRankingOptions;
  baselineMetrics: AggregateMetricsResult;
  candidateMetrics: AggregateMetricsResult;
  metricDeltas: {
    ndcg10Delta: number;
    mapDelta: number;
    mrrDelta: number;
    precision10Delta: number;
  };
  rankShifts: {
    totalQueriesEvaluated: number;
    queriesWithRankShifts: number;
    shiftPercentage: number;
  };
  queryLevelShifts: QueryLevelRankShift[];
  tradeoffAnalysis: string;
  productionSafeguard: string;
}
