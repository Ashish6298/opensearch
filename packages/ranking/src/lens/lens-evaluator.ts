/**
 * @opensearch/ranking — Focus Lens Evaluator (Phase 101)
 *
 * Evaluates document URLs against active Focus Lens profiles to compute:
 * - Domain exclusion filtering
 * - Bounded domain boost multipliers
 * - Bounded domain demotion multipliers
 * - Transparent, reversible explanations with non-endorsement invariants
 */

import {
  DomainMultiplierRule,
  FocusLensProfile,
  LENS_BOOST_MAX,
  LENS_BOOST_MIN,
  LENS_DEMOTE_MAX,
  LENS_DEMOTE_MIN,
  LensScoreExplanation,
} from './lens-types.js';

export interface EvaluatedLensResult {
  action: 'none' | 'boost' | 'demote' | 'exclude';
  multiplier: number;
  explanation: LensScoreExplanation;
}

/**
 * Parses hostname safely from URL with zero network calls and zero external dependencies.
 */
export function extractHostnameFromUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().trim();
  } catch {
    // Fallback regex extraction if raw host or invalid protocol
    const match = url.match(/^(?:https?:\/\/)?([^/:]+)/i);
    return match && match[1] ? match[1].toLowerCase().trim() : '';
  }
}

/**
 * Checks whether a given hostname matches a domain pattern.
 * Supports:
 * - Exact hostname match: 'github.com' matches 'github.com'
 * - Subdomain match: 'github.com' matches 'docs.github.com' or 'gist.github.com'
 * - Wildcard prefix: '*.edu' or '.edu' matches 'cs.mit.edu' or 'stanford.edu'
 */
export function matchesDomainPattern(hostname: string, pattern: string): boolean {
  if (!hostname || !pattern) return false;
  const host = hostname.toLowerCase().trim();
  const pat = pattern.toLowerCase().trim();

  // 1. Exact match
  if (host === pat) return true;

  // 2. Wildcard prefix (e.g. '*.edu' or '.edu')
  if (pat.startsWith('*.')) {
    const root = pat.slice(2);
    return host.endsWith('.' + root) || host === root;
  }
  if (pat.startsWith('.')) {
    const root = pat.slice(1);
    return host.endsWith('.' + root) || host === root;
  }

  // 3. Domain suffix match (e.g. 'wikipedia.org' matches 'en.wikipedia.org')
  if (host.endsWith('.' + pat)) {
    return true;
  }

  return false;
}

/**
 * Evaluates an individual document URL against a Focus Lens profile.
 * Defensively safe: invalid inputs or malformed profiles return neutral action 'none'.
 */
export function evaluateLensForDocument(
  url: string,
  lens: FocusLensProfile | null | undefined,
): EvaluatedLensResult {
  const defaultNeutral: EvaluatedLensResult = {
    action: 'none',
    multiplier: 1.0,
    explanation: {
      lensId: lens?.id ?? 'general',
      lensName: lens?.name ?? 'General',
      action: 'none',
      multiplier: 1.0,
      scoreAdjustment: 0.0,
      explanation: 'No focus lens adjustments applied.',
      isMedicalEndorsement: false,
    },
  };

  if (!lens || lens.id === 'general') {
    return defaultNeutral;
  }

  const hostname = extractHostnameFromUrl(url);
  if (!hostname) {
    return defaultNeutral;
  }

  // 1. Check Exclusion Rules First
  if (Array.isArray(lens.excludeDomains)) {
    for (const excludePattern of lens.excludeDomains) {
      if (matchesDomainPattern(hostname, excludePattern)) {
        return {
          action: 'exclude',
          multiplier: 0.0,
          explanation: {
            lensId: lens.id,
            lensName: lens.name,
            action: 'exclude',
            matchedPattern: excludePattern,
            multiplier: 0.0,
            scoreAdjustment: 0.0,
            explanation: `Document excluded by Focus Lens "${lens.name}" (matched exclusion pattern "${excludePattern}").`,
            disclaimer: lens.disclaimer,
            isMedicalEndorsement: false,
          },
        };
      }
    }
  }

  // 2. Check Boost Rules (find highest matching boost)
  let bestBoostRule: DomainMultiplierRule | null = null;
  if (Array.isArray(lens.boostDomains)) {
    for (const rule of lens.boostDomains) {
      if (matchesDomainPattern(hostname, rule.pattern)) {
        if (!bestBoostRule || rule.multiplier > bestBoostRule.multiplier) {
          bestBoostRule = rule;
        }
      }
    }
  }

  if (bestBoostRule) {
    const boundedMultiplier = Math.min(
      LENS_BOOST_MAX,
      Math.max(LENS_BOOST_MIN, bestBoostRule.multiplier),
    );
    const reasonText = bestBoostRule.reason
      ? ` (${bestBoostRule.reason})`
      : '';

    return {
      action: 'boost',
      multiplier: boundedMultiplier,
      explanation: {
        lensId: lens.id,
        lensName: lens.name,
        action: 'boost',
        matchedPattern: bestBoostRule.pattern,
        multiplier: boundedMultiplier,
        scoreAdjustment: Math.round((boundedMultiplier - 1.0) * 1000) / 1000,
        explanation: `Document boosted by Focus Lens "${lens.name}" for pattern "${bestBoostRule.pattern}"${reasonText}.`,
        disclaimer: lens.disclaimer,
        isMedicalEndorsement: false,
      },
    };
  }

  // 3. Check Demotion Rules (find lowest matching demotion)
  let bestDemoteRule: DomainMultiplierRule | null = null;
  if (Array.isArray(lens.demoteDomains)) {
    for (const rule of lens.demoteDomains) {
      if (matchesDomainPattern(hostname, rule.pattern)) {
        if (!bestDemoteRule || rule.multiplier < bestDemoteRule.multiplier) {
          bestDemoteRule = rule;
        }
      }
    }
  }

  if (bestDemoteRule) {
    const boundedMultiplier = Math.min(
      LENS_DEMOTE_MAX,
      Math.max(LENS_DEMOTE_MIN, bestDemoteRule.multiplier),
    );
    const reasonText = bestDemoteRule.reason
      ? ` (${bestDemoteRule.reason})`
      : '';

    return {
      action: 'demote',
      multiplier: boundedMultiplier,
      explanation: {
        lensId: lens.id,
        lensName: lens.name,
        action: 'demote',
        matchedPattern: bestDemoteRule.pattern,
        multiplier: boundedMultiplier,
        scoreAdjustment: Math.round((boundedMultiplier - 1.0) * 1000) / 1000,
        explanation: `Document demoted by Focus Lens "${lens.name}" for pattern "${bestDemoteRule.pattern}"${reasonText}.`,
        disclaimer: lens.disclaimer,
        isMedicalEndorsement: false,
      },
    };
  }

  // 4. Default: Neutral (no domain match)
  return {
    action: 'none',
    multiplier: 1.0,
    explanation: {
      lensId: lens.id,
      lensName: lens.name,
      action: 'none',
      multiplier: 1.0,
      scoreAdjustment: 0.0,
      explanation: `Active Focus Lens "${lens.name}" evaluated without domain adjustment.`,
      disclaimer: lens.disclaimer,
      isMedicalEndorsement: false,
    },
  };
}
