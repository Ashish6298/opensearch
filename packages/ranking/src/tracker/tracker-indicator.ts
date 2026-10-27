/**
 * @opensearch/ranking — Tracker Indicator Generator (Phase 100)
 *
 * Generates user-facing, evidence-grounded privacy indicators, badges, and tooltips
 * for search results.
 *
 * Ensures:
 * - Deterministic indicator generation based strictly on recorded subresource classification.
 * - Prominent display of the mandatory disclaimer that tracker detection is heuristic
 *   and does NOT provide a security guarantee.
 * - Clear badges: "Clean (0 Trackers)", "N Trackers Detected", "Telemetry: Unverified".
 */

import type { TrackerClassificationResult } from '@opensearch/crawler';
import {
  TRACKER_DETECTION_DISCLAIMER,
  TrackerIndicator,
  TrackerScoreExplanation,
} from './tracker-signal-types.js';

export function createTrackerIndicator(
  classification: TrackerClassificationResult | null | undefined,
  _explanation?: TrackerScoreExplanation,
): TrackerIndicator {
  if (!classification || classification.status === 'unknown') {
    return {
      status: 'unknown',
      badgeText: 'Telemetry: Unknown',
      severity: 'neutral',
      trackerCount: 0,
      categories: [],
      tooltip:
        'No static subresource or tracker classification records exist for this document.',
      evidenceNote: 'No subresources analyzed.',
      disclaimer: TRACKER_DETECTION_DISCLAIMER,
    };
  }

  if (classification.status === 'unverified') {
    return {
      status: 'unverified',
      badgeText: 'Telemetry: Unverified',
      severity: 'neutral',
      trackerCount: classification.trackerCount,
      categories: classification.categoriesDetected,
      tooltip:
        'Subresource evidence was incomplete or lacked verified HTML document structure.',
      evidenceNote: classification.evidence?.rationale ?? 'Incomplete markup evidence.',
      disclaimer: TRACKER_DETECTION_DISCLAIMER,
    };
  }

  if (classification.status === 'no_trackers_detected') {
    const confidenceText = classification.confidence === 'high' ? 'High' : 'Moderate';
    return {
      status: 'no_trackers_detected',
      badgeText: 'No Trackers Detected',
      severity: 'clean',
      trackerCount: 0,
      categories: [],
      tooltip: `Zero known third-party trackers identified across ${classification.totalResources} subresource(s) (${confidenceText} confidence). Static analysis only; scripts are not executed.`,
      evidenceNote: classification.evidence?.rationale ?? 'All subresources originated from first-party origins.',
      disclaimer: TRACKER_DETECTION_DISCLAIMER,
    };
  }

  // trackers_detected
  const trackerCount = classification.trackerCount;
  const categories = classification.categoriesDetected;
  const isHighSeverity =
    categories.includes('fingerprinting') ||
    categories.includes('session-recording') ||
    trackerCount >= 5;

  const names = classification.trackers.map(t => t.trackerName);
  const sampleNames = Array.from(new Set(names)).slice(0, 3).join(', ');
  const moreSuffix = names.length > 3 ? `, and ${names.length - 3} more` : '';

  const badgeText = trackerCount === 1 ? '1 Tracker Detected' : `${trackerCount} Trackers Detected`;
  const severity = isHighSeverity ? 'alert' : 'warning';
  const tooltip = `Detected ${trackerCount} third-party tracker(s) (${sampleNames}${moreSuffix}) across categories: ${categories.join(', ') || 'general'}.`;
  const evidenceNote = `${trackerCount} tracker(s) matched against reviewable registry across ${classification.thirdPartyCount} third-party resource(s).`;

  return {
    status: 'trackers_detected',
    badgeText,
    severity,
    trackerCount,
    categories,
    tooltip,
    evidenceNote,
    disclaimer: TRACKER_DETECTION_DISCLAIMER,
  };
}
