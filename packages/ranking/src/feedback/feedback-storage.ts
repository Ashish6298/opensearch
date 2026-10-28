/**
 * @opensearch/ranking — Privacy-Conscious Feedback Storage (Phase 105)
 *
 * Manages privacy-first storage for search quality feedback:
 * - Implements a strict bounded FIFO ring buffer (max 1,000 records)
 * - Enforces automatic 30-day expiration and record purging
 * - Completely omits IP addresses, raw queries, user IDs, and fingerprints
 * - Supports instant user deletion / purge of all feedback
 * - Supports local JSON export with embedded retention policy disclosure
 */

import { randomUUID } from 'node:crypto';
import {
  DEFAULT_RETENTION_POLICY,
  FeedbackExportPayload,
  FeedbackRetentionPolicy,
  FeedbackStats,
  FeedbackSubmissionPayload,
  ResultCountBucket,
  StoredFeedbackRecord,
} from './feedback-types.js';

export class FeedbackStorage {
  private records: StoredFeedbackRecord[] = [];
  private readonly retentionPolicy: FeedbackRetentionPolicy;

  constructor(retentionPolicy: Partial<FeedbackRetentionPolicy> = {}) {
    this.retentionPolicy = {
      ...DEFAULT_RETENTION_POLICY,
      ...retentionPolicy,
    };
  }

  /**
   * Adds a validated feedback record to storage with 30-day expiration.
   */
  public addRecord(payload: FeedbackSubmissionPayload): StoredFeedbackRecord {
    this.purgeExpired();

    const now = new Date();
    const expirationDate = new Date(
      now.getTime() + this.retentionPolicy.maxRetentionDays * 24 * 60 * 60 * 1000,
    );

    const record: StoredFeedbackRecord = {
      feedbackId: payload.feedbackId || randomUUID(),
      timestamp: now.toISOString(),
      rating: payload.rating,
      category: payload.category || 'general',
      resultCountBucket: payload.resultCountBucket,
      reasonCode: payload.reasonCode,
      consent: payload.consent,
      expiresAt: expirationDate.toISOString(),
    };

    // FIFO ring buffer enforcement: remove oldest record if at capacity
    if (this.records.length >= this.retentionPolicy.maxStoredRecords) {
      this.records.shift();
    }

    this.records.push(record);
    return record;
  }

  /**
   * Returns all active, non-expired feedback records.
   */
  public getAllRecords(): StoredFeedbackRecord[] {
    this.purgeExpired();
    return [...this.records];
  }

  /**
   * Returns a single feedback record by ID.
   */
  public getRecordById(id: string): StoredFeedbackRecord | null {
    this.purgeExpired();
    return this.records.find(r => r.feedbackId === id) || null;
  }

  /**
   * Deletes a specific feedback record.
   */
  public deleteById(id: string): boolean {
    const idx = this.records.findIndex(r => r.feedbackId === id);
    if (idx !== -1) {
      this.records.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Purges all feedback records immediately (user deletion right).
   */
  public purgeAll(): number {
    const count = this.records.length;
    this.records = [];
    return count;
  }

  /**
   * Purges any records that have exceeded the 30-day retention window.
   */
  public purgeExpired(): number {
    const nowIso = new Date().toISOString();
    const initialCount = this.records.length;
    this.records = this.records.filter(r => r.expiresAt > nowIso);
    return initialCount - this.records.length;
  }

  /**
   * Exports all stored records formatted as JSON along with retention policy metadata.
   */
  public exportToJson(): FeedbackExportPayload {
    const active = this.getAllRecords();
    return {
      exportTimestamp: new Date().toISOString(),
      totalRecords: active.length,
      retentionPolicy: this.retentionPolicy,
      records: active,
    };
  }

  /**
   * Aggregates feedback statistics for evaluation without exposing individual records.
   */
  public getStats(): FeedbackStats {
    const active = this.getAllRecords();
    const stats: FeedbackStats = {
      totalSubmissions: active.length,
      helpfulCount: 0,
      notHelpfulCount: 0,
      byCategory: {},
      byBucket: {
        '0': { helpful: 0, notHelpful: 0 },
        '1-5': { helpful: 0, notHelpful: 0 },
        '6-10': { helpful: 0, notHelpful: 0 },
        '10+': { helpful: 0, notHelpful: 0 },
      },
    };

    if (active.length === 0) {
      return stats;
    }

    stats.oldestRecordTimestamp = active[0]?.timestamp;
    stats.newestRecordTimestamp = active[active.length - 1]?.timestamp;

    for (const record of active) {
      if (record.rating === 'helpful') {
        stats.helpfulCount++;
      } else {
        stats.notHelpfulCount++;
      }

      // By category
      if (!stats.byCategory[record.category]) {
        stats.byCategory[record.category] = { helpful: 0, notHelpful: 0 };
      }
      const catStat = stats.byCategory[record.category]!;
      if (record.rating === 'helpful') {
        catStat.helpful++;
      } else {
        catStat.notHelpful++;
      }

      // By bucket
      const bucket = record.resultCountBucket as ResultCountBucket;
      if (stats.byBucket[bucket]) {
        if (record.rating === 'helpful') {
          stats.byBucket[bucket].helpful++;
        } else {
          stats.byBucket[bucket].notHelpful++;
        }
      }
    }

    return stats;
  }

  /**
   * Returns current retention policy.
   */
  public getRetentionPolicy(): FeedbackRetentionPolicy {
    return { ...this.retentionPolicy };
  }
}
