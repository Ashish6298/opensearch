/**
 * @opensearch/ranking — Tracker-Aware Scorer Implementation (Phase 100)
 *
 * Implements transparent, optional relevance adjustments based on static tracker
 * subresource classification evidence.
 *
 * Key principles:
 * - Deterministic and explainable multiplier adjustments.
 * - Incomplete or unverified evidence defaults to neutral (1.0x).
 * - High-risk tracking (session replays, canvas fingerprinting, high density)
 *   receives heavier penalties than standard telemetry.
 * - Sites with verified clean profiles receive modest boosts.
 * - Explicitly non-speculative: never guarantees absolute security or privacy.
 */

import type { TrackerClassificationResult } from '@opensearch/crawler';
import {
  DEFAULT_TRACKER_RANKING_OPTIONS,
  TRACKER_DETECTION_DISCLAIMER,
  TrackerRankingOptions,
  TrackerScoreExplanation,
} from './tracker-signal-types.js';

export interface EvaluatedTrackerSignal {
  multiplier: number;
  explanation: TrackerScoreExplanation;
}

/**
 * Evaluates tracker classification evidence for a document URL and computes
 * an explainable ranking score multiplier.
 */
export function evaluateTrackerSignal(
  _documentUrl: string,
  classification: TrackerClassificationResult | null | undefined,
  options?: Partial<TrackerRankingOptions>,
): EvaluatedTrackerSignal {
  const mergedOptions: TrackerRankingOptions = {
    ...DEFAULT_TRACKER_RANKING_OPTIONS,
    ...options,
  };

  // 1. If signal is disabled, return strict neutral multiplier
  if (!mergedOptions.enabled) {
    return {
      multiplier: 1.0,
      explanation: {
        enabled: false,
        status: classification?.status ?? 'unknown',
        confidence: classification?.confidence ?? 'none',
        trackerCount: classification?.trackerCount ?? 0,
        detectedCategories: classification?.categoriesDetected ?? [],
        multiplier: 1.0,
        scoreAdjustment: 0.0,
        explanation: 'Tracker-aware ranking signal is disabled. Neutral relevance multiplier (1.00x) applied.',
        isSecurityGuarantee: false,
        disclaimer: TRACKER_DETECTION_DISCLAIMER,
      },
    };
  }

  // 2. If classification data is missing or status is unknown/unverified
  if (!classification || classification.status === 'unknown') {
    return {
      multiplier: 1.0,
      explanation: {
        enabled: true,
        status: 'unknown',
        confidence: 'none',
        trackerCount: 0,
        detectedCategories: [],
        multiplier: 1.0,
        scoreAdjustment: 0.0,
        explanation: 'No tracker classification metadata available for document origin. Neutral multiplier (1.00x) applied.',
        isSecurityGuarantee: false,
        disclaimer: TRACKER_DETECTION_DISCLAIMER,
      },
    };
  }

  if (classification.status === 'unverified') {
    return {
      multiplier: 1.0,
      explanation: {
        enabled: true,
        status: 'unverified',
        confidence: classification.confidence,
        trackerCount: classification.trackerCount,
        detectedCategories: classification.categoriesDetected,
        multiplier: 1.0,
        scoreAdjustment: 0.0,
        explanation:
          'Subresource classification evidence was incomplete or unverified. Neutral multiplier (1.00x) applied without speculation.',
        isSecurityGuarantee: false,
        disclaimer: TRACKER_DETECTION_DISCLAIMER,
      },
    };
  }

  // 3. Document has 0 known third-party trackers detected
  if (classification.status === 'no_trackers_detected') {
    // Only grant clean boost if confidence is high or medium
    if (classification.confidence === 'high' || classification.confidence === 'medium') {
      const weight = Math.max(0, Math.min(1.0, mergedOptions.weight));
      // Blended boost: 1.0 + weight * (cleanSiteBoost - 1.0)
      const targetBoost = mergedOptions.cleanSiteBoost;
      const effectiveMultiplier = Math.round((1.0 + weight * (targetBoost - 1.0)) * 10000) / 10000;

      return {
        multiplier: effectiveMultiplier,
        explanation: {
          enabled: true,
          status: 'no_trackers_detected',
          confidence: classification.confidence,
          trackerCount: 0,
          detectedCategories: [],
          multiplier: effectiveMultiplier,
          scoreAdjustment: Math.round((effectiveMultiplier - 1.0) * 10000) / 10000,
          explanation: `Zero known third-party trackers detected across verified subresources (${classification.confidence} confidence). Applied clean telemetry boost of ${effectiveMultiplier.toFixed(3)}x.`,
          isSecurityGuarantee: false,
          disclaimer: TRACKER_DETECTION_DISCLAIMER,
        },
      };
    }

    // Low confidence clean determinations remain neutral
    return {
      multiplier: 1.0,
      explanation: {
        enabled: true,
        status: 'no_trackers_detected',
        confidence: classification.confidence,
        trackerCount: 0,
        detectedCategories: [],
        multiplier: 1.0,
        scoreAdjustment: 0.0,
        explanation:
          'Zero known third-party trackers detected, but low confidence prevents applying positive boost. Neutral multiplier (1.00x) applied.',
        isSecurityGuarantee: false,
        disclaimer: TRACKER_DETECTION_DISCLAIMER,
      },
    };
  }

  // 4. Trackers detected
  const trackerCount = classification.trackerCount;
  const categories = classification.categoriesDetected;
  const hasIntrusiveTracking =
    categories.includes('fingerprinting') ||
    categories.includes('session-recording') ||
    trackerCount >= 5;

  const targetPenalty = hasIntrusiveTracking
    ? mergedOptions.heavyTrackingPenalty
    : mergedOptions.trackingPenalty;

  const weight = Math.max(0, Math.min(1.0, mergedOptions.weight));
  // Blended penalty: 1.0 - weight * (1.0 - targetPenalty)
  const effectiveMultiplier = Math.round((1.0 - weight * (1.0 - targetPenalty)) * 10000) / 10000;

  const reasonDetail = hasIntrusiveTracking
    ? `Identified ${trackerCount} third-party tracker(s) including high-intrusiveness categories (${categories.join(', ')}). Applied heavy tracking penalty of ${effectiveMultiplier.toFixed(3)}x.`
    : `Identified ${trackerCount} standard third-party tracker(s) (${categories.join(', ') || 'telemetry'}). Applied tracking penalty of ${effectiveMultiplier.toFixed(3)}x.`;

  return {
    multiplier: effectiveMultiplier,
    explanation: {
      enabled: true,
      status: 'trackers_detected',
      confidence: classification.confidence,
      trackerCount,
      detectedCategories: categories,
      multiplier: effectiveMultiplier,
      scoreAdjustment: Math.round((effectiveMultiplier - 1.0) * 10000) / 10000,
      explanation: reasonDetail,
      isSecurityGuarantee: false,
      disclaimer: TRACKER_DETECTION_DISCLAIMER,
    },
  };
}
