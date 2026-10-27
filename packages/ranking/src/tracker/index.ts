/**
 * @opensearch/ranking — Tracker-Aware Search & Privacy Indicators (Phase 100)
 */

export type {
  TrackerRankingOptions,
  TrackerScoreExplanation,
  TrackerIndicator,
  QueryLevelRankShift,
  TrackerQualityComparisonReport,
  TrackerClassificationSource,
} from './tracker-signal-types.js';

export {
  TRACKER_DETECTION_DISCLAIMER,
  DEFAULT_TRACKER_RANKING_OPTIONS,
  resolveClassificationFromSource,
} from './tracker-signal-types.js';

export type { EvaluatedTrackerSignal } from './tracker-scorer.js';
export { evaluateTrackerSignal } from './tracker-scorer.js';

export { createTrackerIndicator } from './tracker-indicator.js';

export type {
  TrackerQualityComparisonOptions,
  PreparedQueryTestItem,
} from './tracker-quality-evaluator.js';
export { TrackerQualityEvaluator } from './tracker-quality-evaluator.js';

export type { TrackerBenchmarkCliOptions } from './tracker-benchmark.js';
export { runTrackerQualityBenchmark } from './tracker-benchmark.js';
