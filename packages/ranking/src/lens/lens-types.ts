/**
 * @opensearch/ranking — Focus Lens Schema & Types (Phase 101)
 *
 * Defines contracts, domain models, validation schemas, and explanations for Focus Lenses:
 * - Versioned schema for ranking profiles (schemaVersion: 1)
 * - Initial profiles: General, Student, Developer, Research, Trusted Health Sources, No-Trackers
 * - Bounded boosts, demotions, domain exclusions, and documented ranking weights
 * - Explicit medical non-endorsement invariants for health lenses
 * - Strict local-only and no-code-execution safety constraints
 */

import type { BM25Params, FieldWeightBoosts } from '../scorer/scorer-types.js';

export const CURRENT_LENS_SCHEMA_VERSION = 1;
export const SUPPORTED_LENS_SCHEMA_VERSIONS: readonly number[] = [1];

export const HEALTH_LENS_DISCLAIMER =
  'Notice: This Focus Lens prioritizes established public health institutions, national medical libraries, and peer-reviewed reference portals as an informational source preference. It is NOT medical advice, diagnosis, treatment, or endorsement. Always consult a qualified medical professional for health concerns.';

export const NO_TRACKERS_LENS_DISCLAIMER =
  'Notice: The No-Trackers Focus Lens prioritizes sites with zero detected third-party tracking resources based on static analysis. Static detection is heuristic and does not constitute a security guarantee or certification.';

export const LENS_BOOST_MIN = 1.0;
export const LENS_BOOST_MAX = 3.0;
export const LENS_DEMOTE_MIN = 0.05;
export const LENS_DEMOTE_MAX = 1.0;
export const LENS_WEIGHT_MIN = 0.0;
export const LENS_WEIGHT_MAX = 1.0;
export const MAX_LENS_FILE_SIZE_BYTES = 256 * 1024; // 256 KB max to prevent DoS

export type DomainRuleAction = 'boost' | 'demote' | 'exclude';

export interface DomainMultiplierRule {
  /** Domain pattern (e.g., 'wikipedia.org', '*.edu', 'github.com') */
  pattern: string;
  /** Multiplier factor (boost: 1.0 - 3.0, demote: 0.05 - 1.0) */
  multiplier: number;
  /** Optional human-readable rationale */
  reason?: string;
}

export interface FocusLensRankingWeights {
  /** Custom BM25 tuning parameters override */
  bm25?: Partial<BM25Params>;
  /** Custom field boost multipliers override */
  fieldBoosts?: Partial<FieldWeightBoosts>;
  /** Weight for freshness decay signal [0.0 - 1.0] */
  freshnessWeight?: number;
  /** Weight for domain authority signal [0.0 - 1.0] */
  domainAuthorityWeight?: number;
  /** Weight for PageRank signal [0.0 - 1.0] */
  pageRankWeight?: number;
  /** Weight for Tracker classification signal [0.0 - 1.0] */
  trackerSignalWeight?: number;
  /** Whether to force enable tracker-aware ranking signal */
  enableTrackerSignal?: boolean;
}

export interface FocusLensProfileMetadata {
  author?: string;
  version?: string;
  license?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
}

export interface FocusLensProfile {
  /** Schema version identifier (must be 1) */
  schemaVersion: number;
  /** Unique profile slug identifier (e.g. 'developer', 'student') */
  id: string;
  /** Human-readable display title */
  name: string;
  /** Descriptive overview of the lens profile */
  description: string;
  /** UI icon identifier or emoji */
  icon?: string;
  /** Whether this is a system built-in profile (cannot be deleted) */
  isBuiltin: boolean;
  /** Mandatory legal/informational disclaimer if applicable */
  disclaimer?: string;
  /** Strict invariant: health and other lenses never constitute medical endorsement */
  isMedicalEndorsement?: false;
  /** List of domain patterns with positive boost multipliers */
  boostDomains: DomainMultiplierRule[];
  /** List of domain patterns with demotion multipliers */
  demoteDomains: DomainMultiplierRule[];
  /** List of domain patterns to completely exclude from results */
  excludeDomains: string[];
  /** Optional ranking weight tuning overrides */
  rankingWeights?: FocusLensRankingWeights;
  /** Profile provenance and documentation metadata */
  metadata?: FocusLensProfileMetadata;
}

export interface LensScoreExplanation {
  /** Active lens identifier */
  lensId: string;
  /** Active lens friendly name */
  lensName: string;
  /** Action applied to document */
  action: 'none' | 'boost' | 'demote' | 'exclude';
  /** The domain rule pattern that matched, if any */
  matchedPattern?: string;
  /** Multiplier modifier applied to candidate score */
  multiplier: number;
  /** Score delta attributed to the lens */
  scoreAdjustment: number;
  /** Clear human-readable reason for the adjustment */
  explanation: string;
  /** Mandatory medical disclaimer for health lens */
  disclaimer?: string;
  /** Strict invariant: never a medical endorsement */
  isMedicalEndorsement: false;
}

export interface LensValidationResult {
  valid: boolean;
  errors: string[];
  profile?: FocusLensProfile;
}
