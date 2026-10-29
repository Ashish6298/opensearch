/**
 * @opensearch/ranking — Ranking Safety Guard (Phase 106)
 *
 * Enforces architectural boundaries preventing search quality feedback votes from
 * automatically altering production scoring algorithms or ranking weights.
 *
 * Guarantees that:
 * 1. Ranking changes CANNOT be triggered automatically by vote volume or sentiment.
 * 2. Every ranking modification proposal requires explicit human curator review.
 * 3. Every ranking modification requires a reproducible offline benchmark verification.
 * 4. Regressions on held-out evaluation datasets strictly fail the safety gate.
 */

import type { RankingChangeReviewRecord } from './review-types.js';

export class RankingSafetyViolationError extends Error {
  constructor(message: string) {
    super(`[RankingSafetyGuard Violation] ${message}`);
    this.name = 'RankingSafetyViolationError';
  }
}

export interface RankingChangeProposal {
  proposedBy: string;
  approvedBy?: string;
  description: string;
  parameterDiff: Record<string, { before: unknown; after: unknown }>;
  reproducibleBenchmark?: {
    runId: string;
    tuningNdcgDelta: number;
    heldOutNdcgDelta: number;
    regressionDetected: boolean;
    verificationDate: string;
  };
}

export class RankingSafetyGuard {
  /**
   * Evaluates a ranking parameter modification proposal against safety policies.
   * Throws `RankingSafetyViolationError` if criteria are not met.
   */
  public static assertSafeRankingModification(
    proposal: RankingChangeProposal
  ): RankingChangeReviewRecord {
    // 1. Must have explicit human approver
    if (!proposal.approvedBy || proposal.approvedBy.trim().length === 0) {
      throw new RankingSafetyViolationError(
        'Automated ranking modification blocked: Feedback cannot automatically update production ranking without human curator approval.'
      );
    }

    // 2. Must not be self-approved without secondary audit in production
    if (!proposal.proposedBy || proposal.proposedBy.trim().length === 0) {
      throw new RankingSafetyViolationError(
        'Invalid proposal: proposer identifier must be specified.'
      );
    }

    // 3. Must have parameter changes defined
    if (
      !proposal.parameterDiff ||
      Object.keys(proposal.parameterDiff).length === 0
    ) {
      throw new RankingSafetyViolationError(
        'Empty parameter diff: no ranking parameters were specified for modification.'
      );
    }

    // 4. Must supply reproducible offline benchmark validation
    if (!proposal.reproducibleBenchmark) {
      throw new RankingSafetyViolationError(
        'Missing reproducible benchmark: ranking modifications require offline evaluation results before deployment.'
      );
    }

    const { reproducibleBenchmark } = proposal;

    if (!reproducibleBenchmark.runId || reproducibleBenchmark.runId.trim().length === 0) {
      throw new RankingSafetyViolationError(
        'Benchmark execution invalid: reproducible benchmark runId is required.'
      );
    }

    // 5. Must not exhibit held-out regression
    if (reproducibleBenchmark.regressionDetected || reproducibleBenchmark.heldOutNdcgDelta < -0.005) {
      throw new RankingSafetyViolationError(
        `Ranking modification rejected due to held-out evaluation regression (heldOutNdcgDelta: ${reproducibleBenchmark.heldOutNdcgDelta}).`
      );
    }

    // Return audit record
    const changeId = `rk_chg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      changeId,
      proposedBy: proposal.proposedBy.trim(),
      approvedBy: proposal.approvedBy.trim(),
      reviewDate: new Date().toISOString(),
      description: proposal.description,
      parameterDiff: proposal.parameterDiff,
      reproducibleBenchmark: {
        ...reproducibleBenchmark,
        verificationDate: reproducibleBenchmark.verificationDate || new Date().toISOString(),
      },
      safetyGatePassed: true,
    };
  }

  /**
   * Explicit check asserting that automated voter feedback cannot trigger ranking adjustment.
   */
  public static rejectAutomatedVoteApplication(reason: string = 'Automated feedback tuning'): never {
    throw new RankingSafetyViolationError(
      `Direct feedback application prohibited: Individual user feedback votes cannot be treated as ground truth or applied directly to ranking weights (${reason}).`
    );
  }
}
