/**
 * @opensearch/ranking — Non-Invasive Abuse Filter (Phase 106)
 *
 * Provides privacy-preserving heuristics to detect unnatural bursts and rapid automated
 * vote flooding without collecting invasive client telemetry such as IP addresses,
 * MAC addresses, canvas hashes, cookie identifiers, or device fingerprints.
 */

import type { StoredFeedbackRecord } from '../feedback-types.js';

export interface AbuseFilterConfig {
  /** Maximum allowable votes in a time window before flagging as suspicious burst (default: 5) */
  burstThreshold: number;
  /** Burst time window in milliseconds (default: 10_000 ms = 10s) */
  burstWindowMs: number;
  /** Minimum signal strength multiplier for suspicious items (default: 0.1) */
  suspiciousSignalWeight: number;
  /** Default signal strength multiplier for normal items (default: 1.0) */
  normalSignalWeight: number;
}

export const DEFAULT_ABUSE_FILTER_CONFIG: AbuseFilterConfig = {
  burstThreshold: 5,
  burstWindowMs: 10_000,
  suspiciousSignalWeight: 0.1,
  normalSignalWeight: 1.0,
};

export interface AbuseEvaluationResult {
  isSuspiciousBurst: boolean;
  signalStrength: number;
  burstCountInWindow: number;
  reason?: string;
}

export class NonInvasiveAbuseFilter {
  private config: AbuseFilterConfig;

  constructor(config: Partial<AbuseFilterConfig> = {}) {
    this.config = { ...DEFAULT_ABUSE_FILTER_CONFIG, ...config };
  }

  /**
   * Evaluates a batch or single feedback record against surrounding timestamps
   * using privacy-safe rolling frequency without inspecting personal identifiers.
   */
  public evaluateRecord(
    record: StoredFeedbackRecord,
    historicalTimestamps: string[] = []
  ): AbuseEvaluationResult {
    const recordTime = new Date(record.timestamp).getTime();
    if (isNaN(recordTime)) {
      return {
        isSuspiciousBurst: false,
        signalStrength: this.config.normalSignalWeight,
        burstCountInWindow: 1,
      };
    }

    // Count records falling within [recordTime - burstWindowMs, recordTime + burstWindowMs]
    let countInWindow = 1;
    for (const ts of historicalTimestamps) {
      const t = new Date(ts).getTime();
      if (!isNaN(t) && Math.abs(recordTime - t) <= this.config.burstWindowMs) {
        countInWindow++;
      }
    }

    const isSuspiciousBurst = countInWindow > this.config.burstThreshold;
    const signalStrength = isSuspiciousBurst
      ? this.config.suspiciousSignalWeight
      : this.config.normalSignalWeight;

    return {
      isSuspiciousBurst,
      signalStrength,
      burstCountInWindow: countInWindow,
      reason: isSuspiciousBurst
        ? `High-frequency burst detected (${countInWindow} submissions within ${this.config.burstWindowMs / 1000}s) without invasive tracking.`
        : undefined,
    };
  }

  /**
   * Generates a structural cluster key based strictly on non-identifying categorical metadata.
   */
  public generateClusterKey(record: StoredFeedbackRecord): string {
    const cat = record.category || 'general';
    const bucket = record.resultCountBucket || 'unknown';
    const reason = record.reasonCode || 'none';
    return `cat:${cat}|bucket:${bucket}|reason:${reason}`;
  }
}
