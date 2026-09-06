/**
 * @opensearch/ranking — Ranking Engine Implementation (Phase 14)
 *
 * Coordinates multi-signal relevance ranking:
 * 1. BM25 Lexical Relevance across fields (Title, Headings, Description, Body)
 * 2. Title & Heading boosting (prioritizing high-salience structural elements)
 * 3. Exact Quoted Phrase & Query Term Coverage Multipliers
 * 4. URL / Domain lexical signal bonus (path slug & hostname term match)
 * 5. Freshness signal (temporal decay for recently indexed documents)
 * 6. Near-duplicate / domain clustering penalty (diversity dampener)
 * 7. Deterministic tie-breaking and rank assignment
 * 8. Comprehensive score explanation generation
 */

import { InvertedIndex } from '@opensearch/indexer';
import { ParsedQuery } from '../query/query-types.js';
import { CandidateDocument } from '../retrieval/retrieval-types.js';
import { BM25Scorer, DEFAULT_BM25_PARAMS, DEFAULT_FIELD_BOOSTS } from './bm25-scorer.js';
import {
  RankingEngine,
  RankingOptions,
  RankingResult,
  RankingStats,
  ScoreExplanation,
  ScoreSignalConfig,
  ScoredDocument,
} from './scorer-types.js';

export const DEFAULT_SCORE_SIGNALS: ScoreSignalConfig = {
  fullMatchBoost: 1.25,
  phraseMatchBoost: 1.5,
  urlMatchBonus: 0.35,
  duplicatePenaltyMultiplier: 0.8,
  freshnessWeight: 0.05,
  freshnessMaxDays: 30,
};

export interface DefaultRankingEngineOptions {
  /** Target InvertedIndex instance for dictionary and corpus statistics */
  index: InvertedIndex;
  /** Global default ranking options */
  defaultOptions?: RankingOptions;
}

export class DefaultRankingEngine implements RankingEngine {
  private readonly index: InvertedIndex;
  private readonly globalOptions: RankingOptions;

  constructor(options: DefaultRankingEngineOptions) {
    this.index = options.index;
    this.globalOptions = options.defaultOptions ?? {};
  }

  computeIdf(totalDocuments: number, documentFrequency: number): number {
    const scorer = new BM25Scorer(this.index);
    return scorer.computeIdf(totalDocuments, documentFrequency);
  }

  rank(
    query: ParsedQuery,
    candidates: CandidateDocument[],
    options: RankingOptions = {},
  ): RankingResult {
    const startMs = Date.now();

    // Fast-path: empty candidate list
    if (!candidates || candidates.length === 0) {
      return {
        hits: [],
        stats: {
          totalCandidates: 0,
          rankedCount: 0,
          maxScore: 0,
          minScore: 0,
          durationMs: Date.now() - startMs,
        },
      };
    }

    const mergedOptions: RankingOptions = {
      ...this.globalOptions,
      ...options,
      bm25: { ...this.globalOptions.bm25, ...options.bm25 },
      fieldBoosts: { ...this.globalOptions.fieldBoosts, ...options.fieldBoosts },
      signals: { ...this.globalOptions.signals, ...options.signals },
    };

    const topK = mergedOptions.topK ?? 50;
    const enableDuplicatePenalty = mergedOptions.enableDuplicatePenalty ?? true;
    const includeExplanation = mergedOptions.explain ?? true;

    const bm25Params = { ...DEFAULT_BM25_PARAMS, ...mergedOptions.bm25 };
    const fieldBoosts = { ...DEFAULT_FIELD_BOOSTS, ...mergedOptions.fieldBoosts };
    const signals = { ...DEFAULT_SCORE_SIGNALS, ...mergedOptions.signals };

    const bm25Scorer = new BM25Scorer(this.index, bm25Params, fieldBoosts);

    // 1. Compute individual candidate scores and preliminary explanations
    const intermediateList: Array<{
      candidate: CandidateDocument;
      rawScore: number;
      explanation: ScoreExplanation;
      hostname: string;
      titlePrefix: string;
    }> = [];

    const now = Date.now();

    for (const candidate of candidates) {
      const { bm25Score, termBreakdowns, fieldScoreSums } = bm25Scorer.scoreCandidate(
        candidate,
        query.uniqueTerms,
      );

      // Multiplier signals
      const fullMatchMultiplier = candidate.isFullMatch ? signals.fullMatchBoost : 1.0;
      const phraseMultiplier =
        candidate.phraseMatches && query.phrases.length > 0 ? signals.phraseMatchBoost : 1.0;

      // Additive / heuristic signals
      const urlBonus = this.calculateUrlBonus(
        candidate.documentMeta.url,
        query.uniqueTerms,
        signals.urlMatchBonus,
      );
      const freshnessBonus = this.calculateFreshnessBonus(
        candidate.documentMeta.indexedAt,
        now,
        signals.freshnessWeight,
        signals.freshnessMaxDays,
      );

      // Base combination formula:
      // (BM25 * fullMatchMultiplier * phraseMultiplier) + urlBonus + freshnessBonus
      let combinedScore =
        bm25Score * fullMatchMultiplier * phraseMultiplier + urlBonus + freshnessBonus;
      combinedScore = Math.max(0, combinedScore);

      const parsedUrl = this.safeParseHostname(candidate.documentMeta.url);
      const titlePrefix = candidate.documentMeta.title.toLowerCase().trim().slice(0, 30);

      const explanation: ScoreExplanation = {
        bm25Score: Math.round(bm25Score * 10000) / 10000,
        termBreakdowns,
        fieldScoreSums,
        fullMatchMultiplier,
        phraseMultiplier,
        urlBonus: Math.round(urlBonus * 10000) / 10000,
        freshnessBonus: Math.round(freshnessBonus * 10000) / 10000,
        duplicatePenalty: 1.0, // May be updated below
        finalScore: Math.round(combinedScore * 10000) / 10000,
      };

      intermediateList.push({
        candidate,
        rawScore: combinedScore,
        explanation,
        hostname: parsedUrl,
        titlePrefix,
      });
    }

    // 2. Preliminary sort by raw score descending
    intermediateList.sort((a, b) => {
      const diff = b.rawScore - a.rawScore;
      if (Math.abs(diff) > 1e-9) {
        return diff;
      }
      // Deterministic tie-breaking by documentId ascending
      return a.candidate.documentId.localeCompare(b.candidate.documentId);
    });

    // 3. Apply Near-Duplicate & Domain Clustering Penalty if enabled
    if (enableDuplicatePenalty) {
      const domainSeenCount = new Map<string, number>();
      const titleSeenCount = new Map<string, number>();

      for (const item of intermediateList) {
        let penalty = 1.0;

        // Check domain repetition
        if (item.hostname) {
          const count = domainSeenCount.get(item.hostname) ?? 0;
          domainSeenCount.set(item.hostname, count + 1);
          if (count > 0) {
            // Apply cumulative dampener per extra document from same host
            penalty *= Math.pow(signals.duplicatePenaltyMultiplier, count);
          }
        }

        // Check near-identical title repetition
        if (item.titlePrefix.length > 5) {
          const tCount = titleSeenCount.get(item.titlePrefix) ?? 0;
          titleSeenCount.set(item.titlePrefix, tCount + 1);
          if (tCount > 0) {
            penalty *= signals.duplicatePenaltyMultiplier;
          }
        }

        if (penalty < 1.0) {
          item.rawScore = item.rawScore * penalty;
          item.explanation.duplicatePenalty = Math.round(penalty * 10000) / 10000;
          item.explanation.finalScore = Math.round(item.rawScore * 10000) / 10000;
        }
      }

      // Re-sort after duplicate dampening
      intermediateList.sort((a, b) => {
        const diff = b.rawScore - a.rawScore;
        if (Math.abs(diff) > 1e-9) {
          return diff;
        }
        return a.candidate.documentId.localeCompare(b.candidate.documentId);
      });
    }

    // 4. Select top-K and assign ranks (1-based)
    const finalCount = Math.min(topK, intermediateList.length);
    const hits: ScoredDocument[] = [];

    let maxScore = 0;
    let minScore = Number.MAX_VALUE;

    for (let i = 0; i < finalCount; i++) {
      const item = intermediateList[i];
      if (!item) break;

      const score = Math.round(item.rawScore * 10000) / 10000;
      if (score > maxScore) maxScore = score;
      if (score < minScore) minScore = score;

      hits.push({
        documentId: item.candidate.documentId,
        score,
        rank: i + 1,
        documentMeta: item.candidate.documentMeta,
        candidate: item.candidate,
        explanation: includeExplanation ? item.explanation : undefined,
      });
    }

    if (hits.length === 0) {
      minScore = 0;
    }

    const stats: RankingStats = {
      totalCandidates: candidates.length,
      rankedCount: hits.length,
      maxScore: Math.round(maxScore * 10000) / 10000,
      minScore: Math.round(minScore * 10000) / 10000,
      durationMs: Date.now() - startMs,
    };

    return {
      hits,
      stats,
    };
  }

  /**
   * Computes a bonus score if query terms are present in the URL slug or hostname.
   */
  private calculateUrlBonus(url: string, queryTerms: string[], unitBonus: number): number {
    if (!url || queryTerms.length === 0 || unitBonus <= 0) {
      return 0;
    }

    const lowerUrl = url.toLowerCase();
    let matches = 0;

    for (const term of queryTerms) {
      if (term.length > 2 && lowerUrl.includes(term.toLowerCase())) {
        matches++;
      }
    }

    // Proportional bonus up to 2x unitBonus
    return Math.min(matches * unitBonus, unitBonus * 2.0);
  }

  /**
   * Computes a freshness boost decay based on days elapsed since indexedAt.
   */
  private calculateFreshnessBonus(
    indexedAtStr: string | undefined,
    now: number,
    weight: number,
    maxDays: number,
  ): number {
    if (!indexedAtStr || weight <= 0) {
      return 0;
    }

    const indexedAt = Date.parse(indexedAtStr);
    if (isNaN(indexedAt)) {
      return 0;
    }

    const ageDays = Math.max(0, (now - indexedAt) / (1000 * 60 * 60 * 24));
    if (ageDays >= maxDays) {
      return 0;
    }

    // Linear decay from 1.0 (fresh) down to 0.0 (maxDays old)
    const decay = 1.0 - ageDays / maxDays;
    return weight * decay;
  }

  /**
   * Extracts hostname safely from a URL.
   */
  private safeParseHostname(url: string): string {
    if (!url) return '';
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }
}

/**
 * Factory function creating a RankingEngine instance.
 */
export function createRankingEngine(
  index: InvertedIndex,
  defaultOptions?: RankingOptions,
): RankingEngine {
  return new DefaultRankingEngine({
    index,
    defaultOptions,
  });
}
