/**
 * @opensearch/ranking — Feedback Review Queue (Phase 106)
 *
 * Implements a local review queue for search quality feedback:
 * - Aggregates and clusters feedback items without invasive telemetry
 * - Prevents raw votes from being treated as ground truth
 * - Strictly isolates feedback cases from judged evaluation datasets
 * - Guards held-out evaluation splits from silent contamination
 * - Enforces human curator sign-off before proposing candidate evaluation cases
 */

import type { StoredFeedbackRecord } from '../feedback-types.js';
import type {
  ReviewStatus,
  ReviewQueueItem,
  ProposedEvaluationCase,
  FeedbackClusterSummary,
  ReviewQueueStats,
  CaseApprovalParams,
} from './review-types.js';
import { NonInvasiveAbuseFilter } from './non-invasive-abuse-filter.js';

export class HeldOutContaminationError extends Error {
  constructor(message: string) {
    super(`[HeldOutContaminationError] ${message}`);
    this.name = 'HeldOutContaminationError';
  }
}

export class FeedbackNotFoundError extends Error {
  constructor(id: string) {
    super(`Feedback review item '${id}' was not found.`);
    this.name = 'FeedbackNotFoundError';
  }
}

export interface ReviewQueueFilter {
  status?: ReviewStatus;
  clusterKey?: string;
  isSuspiciousBurst?: boolean;
  limit?: number;
  offset?: number;
}

export class FeedbackReviewQueue {
  private items: Map<string, ReviewQueueItem> = new Map();
  private abuseFilter: NonInvasiveAbuseFilter;

  constructor(abuseFilter?: NonInvasiveAbuseFilter) {
    this.abuseFilter = abuseFilter || new NonInvasiveAbuseFilter();
  }

  /**
   * Imports feedback records into the review queue.
   * Duplicate sourceFeedbackIds are ignored to preserve idempotency.
   */
  public importRecords(records: StoredFeedbackRecord[]): {
    importedCount: number;
    skippedCount: number;
    items: ReviewQueueItem[];
  } {
    let importedCount = 0;
    let skippedCount = 0;
    const resultItems: ReviewQueueItem[] = [];

    // Collect all timestamps from existing queue items plus new batch
    const existingTimestamps = Array.from(this.items.values()).map((it) => it.feedback.timestamp);
    const allTimestamps = [...existingTimestamps, ...records.map((r) => r.timestamp)];

    for (let i = 0; i < records.length; i++) {
      const record = records[i]!;
      // Check if already in queue by sourceFeedbackId
      const exists = Array.from(this.items.values()).some(
        (it) => it.sourceFeedbackId === record.feedbackId
      );

      if (exists) {
        skippedCount++;
        continue;
      }

      const queueId = `rq_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const otherTimestamps = allTimestamps.filter((_, idx) => idx !== existingTimestamps.length + i);
      const abuseResult = this.abuseFilter.evaluateRecord(record, otherTimestamps);
      const clusterKey = this.abuseFilter.generateClusterKey(record);

      const queueItem: ReviewQueueItem = {
        queueId,
        sourceFeedbackId: record.feedbackId,
        status: 'pending',
        importedAt: new Date().toISOString(),
        feedback: record,
        clusterKey,
        signalStrength: abuseResult.signalStrength,
        isSuspiciousBurst: abuseResult.isSuspiciousBurst,
      };

      this.items.set(queueId, queueItem);
      resultItems.push(queueItem);
      importedCount++;
    }

    return { importedCount, skippedCount, items: resultItems };
  }

  /**
   * Imports feedback records from a JSON array or string export.
   */
  public importFromJson(jsonOrArray: string | StoredFeedbackRecord[]): {
    importedCount: number;
    skippedCount: number;
    items: ReviewQueueItem[];
  } {
    let parsed: StoredFeedbackRecord[];
    if (typeof jsonOrArray === 'string') {
      try {
        const raw = JSON.parse(jsonOrArray);
        parsed = Array.isArray(raw) ? raw : (raw.records ?? []);
      } catch (err) {
        throw new Error(`Invalid feedback JSON payload: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      parsed = jsonOrArray;
    }

    return this.importRecords(parsed);
  }

  /**
   * Retrieves a queue item by its queue ID.
   */
  public getItem(queueId: string): ReviewQueueItem | null {
    return this.items.get(queueId) || null;
  }

  /**
   * Queries queue items with optional filters and pagination.
   */
  public listItems(filter: ReviewQueueFilter = {}): {
    items: ReviewQueueItem[];
    total: number;
  } {
    let result = Array.from(this.items.values());

    if (filter.status) {
      result = result.filter((it) => it.status === filter.status);
    }
    if (filter.clusterKey) {
      result = result.filter((it) => it.clusterKey === filter.clusterKey);
    }
    if (filter.isSuspiciousBurst !== undefined) {
      result = result.filter((it) => !!it.isSuspiciousBurst === filter.isSuspiciousBurst);
    }

    // Sort descending by importedAt
    result.sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());

    const total = result.length;
    const offset = Math.max(0, filter.offset ?? 0);
    const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;

    return {
      items: result.slice(offset, offset + limit),
      total,
    };
  }

  /**
   * Updates review state and attaches curator notes.
   */
  public updateStatus(
    queueId: string,
    status: ReviewStatus,
    curatorId?: string,
    curatorNotes?: string
  ): ReviewQueueItem {
    const item = this.items.get(queueId);
    if (!item) {
      throw new FeedbackNotFoundError(queueId);
    }

    item.status = status;
    item.reviewedAt = new Date().toISOString();
    if (curatorId) item.curatorId = curatorId;
    if (curatorNotes) item.curatorNotes = curatorNotes;

    return item;
  }

  /**
   * Curates a candidate evaluation case from a feedback item.
   *
   * CRITICAL SAFETY GUARANTEE:
   * Prohibits silent contamination of held-out datasets. Any attempt to allocate
   * an uncurated feedback case to 'held_out' throws a HeldOutContaminationError.
   */
  public approveCandidateEvaluationCase(
    queueId: string,
    params: CaseApprovalParams
  ): ProposedEvaluationCase {
    const item = this.items.get(queueId);
    if (!item) {
      throw new FeedbackNotFoundError(queueId);
    }

    if (!params.curatorId || params.curatorId.trim().length === 0) {
      throw new Error('Case approval requires a valid curatorId.');
    }

    if (!params.curatorRationale || params.curatorRationale.trim().length === 0) {
      throw new Error('Case approval requires an explicit curator rationale explaining the evaluation intent.');
    }

    // STRICT REJECTION: Feedback cases can never automatically populate held_out split!
    // Held-out evaluation must remain strictly independent of collected user feedback.
    if ((params as unknown as { targetSplit?: string }).targetSplit === 'held_out') {
      throw new HeldOutContaminationError(
        'Feedback review cannot contaminate the held-out evaluation dataset. All proposed feedback cases must be assigned to "tuning" split for offline development.'
      );
    }

    const caseId = `eval_case_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const candidateCase: ProposedEvaluationCase = {
      caseId,
      query: params.syntheticQuery.trim(),
      category: params.category,
      split: 'tuning', // Strictly tuning
      intent: params.intent.trim(),
      judgments: params.judgments,
      approval: {
        approvedBy: params.curatorId.trim(),
        approvedAt: new Date().toISOString(),
        curatorRationale: params.curatorRationale.trim(),
        requiresReproducibleBenchmark: true,
      },
    };

    item.status = 'approved_for_evaluation';
    item.candidateCase = candidateCase;
    item.curatorId = params.curatorId;
    item.curatorNotes = params.curatorRationale;
    item.reviewedAt = new Date().toISOString();

    return candidateCase;
  }

  /**
   * Aggregates review queue into structural clusters.
   */
  public getClusters(): FeedbackClusterSummary[] {
    const clusterMap = new Map<string, ReviewQueueItem[]>();

    for (const item of this.items.values()) {
      const list = clusterMap.get(item.clusterKey) || [];
      list.push(item);
      clusterMap.set(item.clusterKey, list);
    }

    const clusters: FeedbackClusterSummary[] = [];

    for (const [key, items] of clusterMap.entries()) {
      if (!items || items.length === 0) continue;
      const sample = items[0]!.feedback;
      const helpfulCount = items.filter((it) => it.feedback.rating === 'helpful').length;
      const notHelpfulCount = items.filter((it) => it.feedback.rating === 'not_helpful').length;

      // Average signal strength across items
      const avgSignal = items.reduce((acc, it) => acc + it.signalStrength, 0) / items.length;

      clusters.push({
        clusterKey: key,
        category: sample.category || 'general',
        resultCountBucket: sample.resultCountBucket || 'unknown',
        reasonCode: sample.reasonCode,
        totalVotes: items.length,
        helpfulCount,
        notHelpfulCount,
        signalConfidence: Number(avgSignal.toFixed(2)),
        items,
      });
    }

    // Sort by total votes descending
    clusters.sort((a, b) => b.totalVotes - a.totalVotes);
    return clusters;
  }

  /**
   * Computes queue statistics.
   */
  public getStats(): ReviewQueueStats {
    let pendingCount = 0;
    let underInvestigationCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let archivedCount = 0;
    let suspiciousBurstCount = 0;

    for (const item of this.items.values()) {
      switch (item.status) {
        case 'pending':
          pendingCount++;
          break;
        case 'under_investigation':
          underInvestigationCount++;
          break;
        case 'approved_for_evaluation':
          approvedCount++;
          break;
        case 'rejected':
          rejectedCount++;
          break;
        case 'archived':
          archivedCount++;
          break;
      }

      if (item.isSuspiciousBurst) {
        suspiciousBurstCount++;
      }
    }

    const clustersCount = new Set(Array.from(this.items.values()).map((it) => it.clusterKey)).size;

    return {
      totalItems: this.items.size,
      pendingCount,
      underInvestigationCount,
      approvedCount,
      rejectedCount,
      archivedCount,
      clustersCount,
      suspiciousBurstCount,
    };
  }

  /**
   * Clears all items in the queue (e.g. for testing or local reset).
   */
  public clear(): void {
    this.items.clear();
  }
}

/**
 * Shared singleton instance for feedback review queue operations.
 */
let sharedFeedbackReviewQueue: FeedbackReviewQueue | null = null;

export function getSharedFeedbackReviewQueue(): FeedbackReviewQueue {
  if (!sharedFeedbackReviewQueue) {
    sharedFeedbackReviewQueue = new FeedbackReviewQueue();
  }
  return sharedFeedbackReviewQueue;
}

export function createFeedbackReviewQueue(abuseFilter?: NonInvasiveAbuseFilter): FeedbackReviewQueue {
  return new FeedbackReviewQueue(abuseFilter);
}

