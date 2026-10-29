/**
 * @opensearch/ranking — Feedback Review Workflow Types (Phase 106)
 *
 * Defines contracts, domain models, and safety boundaries for:
 * - Local review queue for search quality feedback
 * - Strict physical separation between feedback votes and judged relevance labels
 * - Prevention of silent contamination of held-out evaluation datasets
 * - Manual curator approval workflows for candidate evaluation cases
 * - Prevention of automated production ranking modifications
 * - Non-invasive anti-abuse heuristics without privacy violations
 */

import type { StoredFeedbackRecord } from '../feedback-types.js';
import type {
  JudgedDocument,
  JudgedQueryCategory,
  DatasetSplit,
} from '../../evaluation/judged-dataset-types.js';

export type ReviewStatus =
  | 'pending'
  | 'under_investigation'
  | 'approved_for_evaluation'
  | 'rejected'
  | 'archived';

export interface ProposedEvaluationCase {
  /** Unique case ID */
  caseId: string;
  /** Manually curated query expression (never untrusted raw user input) */
  query: string;
  /** Domain category for evaluation */
  category: JudgedQueryCategory;
  /** Split allocation: strictly defaults to 'tuning'; held_out requires independent curation */
  split: DatasetSplit;
  /** Detailed information intent written by the curator */
  intent: string;
  /** Candidate document judgments */
  judgments: JudgedDocument[];
  /** Manual human curator approval details */
  approval: {
    approvedBy: string;
    approvedAt: string;
    curatorRationale: string;
    requiresReproducibleBenchmark: true;
  };
}

export interface ReviewQueueItem {
  /** Unique queue item identifier */
  queueId: string;
  /** Source feedback ID from Phase 105 */
  sourceFeedbackId: string;
  /** Current review state */
  status: ReviewStatus;
  /** ISO timestamp when imported into the queue */
  importedAt: string;
  /** ISO timestamp of last review update */
  reviewedAt?: string;
  /** Identifier or handle of human curator */
  curatorId?: string;
  /** Human curator review notes */
  curatorNotes?: string;
  /** The underlying sanitized feedback payload */
  feedback: StoredFeedbackRecord;
  /** Aggregation cluster key (e.g. 'cat:developer|bucket:0|reason:poor_relevance') */
  clusterKey: string;
  /** Non-invasive signal strength weight (0.0 to 1.0) */
  signalStrength: number;
  /** Flagged if volume burst anomaly was detected */
  isSuspiciousBurst?: boolean;
  /** Candidate evaluation case if approved */
  candidateCase?: ProposedEvaluationCase;
}

export interface FeedbackClusterSummary {
  clusterKey: string;
  category: string;
  resultCountBucket: string;
  reasonCode?: string;
  totalVotes: number;
  helpfulCount: number;
  notHelpfulCount: number;
  signalConfidence: number;
  items: ReviewQueueItem[];
}

export interface ReviewQueueStats {
  totalItems: number;
  pendingCount: number;
  underInvestigationCount: number;
  approvedCount: number;
  rejectedCount: number;
  archivedCount: number;
  clustersCount: number;
  suspiciousBurstCount: number;
}

export interface CaseApprovalParams {
  curatorId: string;
  curatorRationale: string;
  syntheticQuery: string;
  category: JudgedQueryCategory;
  intent: string;
  judgments: JudgedDocument[];
  /** Target dataset split: strictly prohibited from automatically using 'held_out' */
  targetSplit?: 'tuning';
}

export interface RankingChangeReviewRecord {
  changeId: string;
  proposedBy: string;
  approvedBy: string;
  reviewDate: string;
  description: string;
  parameterDiff: Record<string, { before: unknown; after: unknown }>;
  reproducibleBenchmark: {
    runId: string;
    tuningNdcgDelta: number;
    heldOutNdcgDelta: number;
    regressionDetected: boolean;
    verificationDate: string;
  };
  safetyGatePassed: boolean;
}
