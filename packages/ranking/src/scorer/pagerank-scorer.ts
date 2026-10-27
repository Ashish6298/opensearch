/**
 * @opensearch/ranking — PageRank Signal Transformation & Scorer (Phase 89)
 *
 * Provides mathematically sound transformations and blending for PageRank signals:
 * - Normalizes raw graph stationary probabilities (typically ~1/N) to IR-comparable scales
 * - Logarithmic diminishing-returns scaling prevents authoritative hubs from drowning BM25
 * - Diagnostic state classification: 'computed', 'unavailable', 'stale', 'disabled', 'fallback'
 * - Clean pluggable interface: PageRankLookupProvider
 */

import type { PageRankLookupResult, PageRankMetadata } from '@opensearch/crawler';

export interface PageRankLookupProvider {
  isAvailable(): boolean;
  get(url: string): PageRankLookupResult;
  getMetadata?(): PageRankMetadata;
}

export type PageRankTransformType = 'logarithmic' | 'linear' | 'min-max' | 'sigmoid';

export interface PageRankSignalOptions {
  /** Weight factor for PageRank contribution (default: 0.15) */
  weight?: number;
  /** Maximum boost ceiling to protect lexical relevance (default: 2.0) */
  maxBoost?: number;
  /** Mathematical transformation applied to raw probability (default: 'logarithmic') */
  transform?: PageRankTransformType;
  /** Maximum age before PageRank is considered stale (default: 7 days in ms) */
  staleThresholdMs?: number;
  /** Whether PageRank is globally enabled (default: true) */
  enabled?: boolean;
}

export interface PageRankScoreExplanation {
  /** Whether PageRank evaluation was active */
  enabled: boolean;
  /** Status of PageRank for this document */
  status: 'computed' | 'unavailable' | 'stale' | 'disabled' | 'fallback';
  /** Raw stationary probability from the link graph (null if unavailable or disabled) */
  rawScore: number | null;
  /** Normalized score in [0.0, 1.0] range */
  normalizedScore: number;
  /** Configured weight applied to normalized score */
  weight: number;
  /** Maximum allowable boost ceiling */
  maxBoost: number;
  /** Final additive bonus added to relevance score (weight * normalizedScore * maxBoost) */
  bonus: number;
  /** Transformation method applied */
  transform: PageRankTransformType;
  /** Diagnostic reason explaining the state */
  reason: string;
}

export const DEFAULT_PAGERANK_SIGNAL_OPTIONS: Required<PageRankSignalOptions> = {
  weight: 0.15,
  maxBoost: 2.0,
  transform: 'logarithmic',
  staleThresholdMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  enabled: true,
};

/**
 * Transforms a raw PageRank probability into a normalized [0.0, 1.0] score.
 *
 * In a graph of N nodes, average PageRank is 1/N.
 * High-authority nodes may have 10x-50x the average, while peripheral nodes have < 1x.
 * A logarithmic curve provides diminishing returns to avoid rank distortion.
 */
export function transformPageRankScore(
  rawScore: number | null,
  totalNodes: number,
  transform: PageRankTransformType = 'logarithmic',
  maxScore?: number,
  minScore = 0,
): number {
  if (rawScore === null || rawScore === undefined || rawScore <= 0 || totalNodes <= 0) {
    return 0;
  }

  // Handle single node graph where rawScore is 1.0
  if (totalNodes === 1) {
    return 1.0;
  }

  const expectedUniform = 1.0 / totalNodes;
  // Relative ratio compared to average node (r = 1.0 for average node)
  const relativeRatio = rawScore / expectedUniform;

  switch (transform) {
    case 'logarithmic': {
      // Scales relative ratio with log10 diminishing returns.
      // At r = 1 (average), score is ~0.30
      // At r = 10 (strong hub), score is ~0.60
      // At r = 50+ (mega authority), score approaches 1.0
      const saturatedRatio = Math.min(relativeRatio, 100);
      const logVal = Math.log10(1 + saturatedRatio);
      const maxLog = Math.log10(1 + 100); // log10(101) ~ 2.004
      return Math.min(1.0, Math.max(0.0, logVal / maxLog));
    }

    case 'min-max': {
      const hi = maxScore && maxScore > minScore ? maxScore : expectedUniform * 10;
      const lo = minScore;
      const normalized = (rawScore - lo) / (hi - lo);
      return Math.min(1.0, Math.max(0.0, normalized));
    }

    case 'sigmoid': {
      // Sigmoid centered at r = 1.0
      const z = (relativeRatio - 1.0) / 2.0;
      return 1.0 / (1.0 + Math.exp(-z));
    }

    case 'linear':
    default: {
      const ceiling = maxScore && maxScore > 0 ? maxScore : expectedUniform * 20;
      return Math.min(1.0, Math.max(0.0, rawScore / ceiling));
    }
  }
}

/**
 * Evaluates PageRank contribution for a document URL given a provider and options.
 */
export function evaluatePageRankSignal(
  url: string,
  provider?: PageRankLookupProvider,
  options?: PageRankSignalOptions,
  now = Date.now(),
): { bonus: number; explanation: PageRankScoreExplanation } {
  const opts: Required<PageRankSignalOptions> = {
    ...DEFAULT_PAGERANK_SIGNAL_OPTIONS,
    ...options,
  };

  // Case 1: PageRank globally disabled or weight is 0
  if (!opts.enabled || opts.weight <= 0) {
    return {
      bonus: 0,
      explanation: {
        enabled: false,
        status: 'disabled',
        rawScore: null,
        normalizedScore: 0,
        weight: opts.weight,
        maxBoost: opts.maxBoost,
        bonus: 0,
        transform: opts.transform,
        reason: 'pageRank-disabled-in-ranking-options',
      },
    };
  }

  // Case 2: No provider or provider has no available data
  if (!provider || !provider.isAvailable()) {
    return {
      bonus: 0,
      explanation: {
        enabled: true,
        status: 'unavailable',
        rawScore: null,
        normalizedScore: 0,
        weight: opts.weight,
        maxBoost: opts.maxBoost,
        bonus: 0,
        transform: opts.transform,
        reason: 'pageRank-provider-data-unavailable',
      },
    };
  }

  // Case 3: Document URL lookup
  const lookup = provider.get(url);

  if (!lookup.isComputed || lookup.score === null) {
    return {
      bonus: 0,
      explanation: {
        enabled: true,
        status: lookup.status === 'fallback' ? 'fallback' : 'unavailable',
        rawScore: lookup.score,
        normalizedScore: 0,
        weight: opts.weight,
        maxBoost: opts.maxBoost,
        bonus: 0,
        transform: opts.transform,
        reason: lookup.reason || 'url-not-in-link-graph',
      },
    };
  }

  const rawScore = lookup.score;
  const meta = lookup.metadata || (provider.getMetadata ? provider.getMetadata() : undefined);
  const totalNodes = meta?.totalNodes ?? 1;
  const maxScore = meta?.scoreStats?.max;
  const minScore = meta?.scoreStats?.min ?? 0;

  // Check Staleness
  let isStale = false;
  if (meta?.computedAt) {
    const computedTimestamp = new Date(meta.computedAt).getTime();
    if (!isNaN(computedTimestamp) && now - computedTimestamp > opts.staleThresholdMs) {
      isStale = true;
    }
  }

  const normalizedScore = transformPageRankScore(
    rawScore,
    totalNodes,
    opts.transform,
    maxScore,
    minScore,
  );

  // If stale, apply a 50% discount to signal weight and flag status
  const effectiveWeight = isStale ? opts.weight * 0.5 : opts.weight;
  const rawBonus = effectiveWeight * normalizedScore * opts.maxBoost;
  const roundedBonus = Math.round(rawBonus * 10000) / 10000;

  return {
    bonus: roundedBonus,
    explanation: {
      enabled: true,
      status: isStale ? 'stale' : 'computed',
      rawScore,
      normalizedScore: Math.round(normalizedScore * 10000) / 10000,
      weight: effectiveWeight,
      maxBoost: opts.maxBoost,
      bonus: roundedBonus,
      transform: opts.transform,
      reason: isStale
        ? 'pageRank-stale-decay-applied'
        : 'pageRank-computed-from-link-graph',
    },
  };
}
