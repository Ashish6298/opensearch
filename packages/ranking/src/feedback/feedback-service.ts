/**
 * @opensearch/ranking — Privacy-Conscious Feedback Service (Phase 105)
 *
 * Coordinates search quality feedback handling:
 * - Enforces zero transmission without explicit user consent
 * - Guarantees minimal validated payloads (no raw queries, no IPs, no trackers)
 * - Manages bounded retention and immediate user deletion
 * - Exposes documented privacy notices and network metadata disclosures
 */

import {
  FeedbackExportPayload,
  FeedbackRetentionPolicy,
  FeedbackStats,

  StoredFeedbackRecord,
} from './feedback-types.js';
import { validateFeedbackPayload } from './feedback-validator.js';
import { FeedbackStorage } from './feedback-storage.js';

export interface SubmitFeedbackResult {
  success: boolean;
  errors?: string[];
  record?: StoredFeedbackRecord;
}

export class FeedbackService {
  private readonly storage: FeedbackStorage;

  constructor(storage?: FeedbackStorage, retentionPolicy?: Partial<FeedbackRetentionPolicy>) {
    this.storage = storage ?? new FeedbackStorage(retentionPolicy);
  }

  /**
   * Submits a search quality feedback entry after rigorous privacy validation.
   *
   * @param rawPayload Untrusted feedback payload
   * @returns SubmitFeedbackResult with stored record or validation errors
   */
  public submitFeedback(rawPayload: unknown): SubmitFeedbackResult {
    const validation = validateFeedbackPayload(rawPayload);

    if (!validation.isValid || !validation.sanitizedPayload) {
      return {
        success: false,
        errors: validation.errors,
      };
    }

    const record = this.storage.addRecord(validation.sanitizedPayload);
    return {
      success: true,
      record,
    };
  }

  /**
   * Retrieves all active feedback records.
   */
  public getRecords(): StoredFeedbackRecord[] {
    return this.storage.getAllRecords();
  }

  /**
   * Retrieves a record by ID.
   */
  public getRecordById(id: string): StoredFeedbackRecord | null {
    return this.storage.getRecordById(id);
  }

  /**
   * Deletes a record by ID.
   */
  public deleteRecord(id: string): boolean {
    return this.storage.deleteById(id);
  }

  /**
   * Clears/purges all feedback records (user deletion right).
   */
  public purgeAllRecords(): number {
    return this.storage.purgeAll();
  }

  /**
   * Exports feedback records as a formatted JSON document.
   */
  public exportFeedback(): FeedbackExportPayload {
    return this.storage.exportToJson();
  }

  /**
   * Aggregates rating stats.
   */
  public getStats(): FeedbackStats {
    return this.storage.getStats();
  }

  /**
   * Returns the documented privacy policy, retention rules, and network metadata limitations.
   */
  public getPrivacyNotice(): FeedbackRetentionPolicy {
    return this.storage.getRetentionPolicy();
  }
}

/**
 * Shared singleton instance for feedback operations.
 */
let sharedFeedbackService: FeedbackService | null = null;

export function getSharedFeedbackService(): FeedbackService {
  if (!sharedFeedbackService) {
    sharedFeedbackService = new FeedbackService();
  }
  return sharedFeedbackService;
}

export function createFeedbackService(retentionPolicy?: Partial<FeedbackRetentionPolicy>): FeedbackService {
  return new FeedbackService(undefined, retentionPolicy);
}
