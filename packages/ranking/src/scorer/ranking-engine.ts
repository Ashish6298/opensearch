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
import { AuthorityScorer, createAuthorityScorer } from './authority-scorer.js';
import {
  evaluateTrackerSignal,
  resolveClassificationFromSource,
  TrackerClassificationSource,
  TrackerScoreExplanation,
} from '../tracker/index.js';
import {
  evaluateLensForDocument,
  FocusLensProfile,
  FocusLensRegistry,
  getDefaultLensRegistry,
  LensScoreExplanation,
} from '../lens/index.js';
import {
  evaluatePageRankSignal,
  PageRankLookupProvider,
} from './pagerank-scorer.js';
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
  freshnessWeight: 0.10,
  freshnessMaxDays: 30,
  domainAuthorityWeight: 0.10,
  pageRankWeight: 0.15,
  pageRankMaxBoost: 2.0,
  pageRankTransform: 'logarithmic',
  pageRankStaleThresholdMs: 7 * 24 * 60 * 60 * 1000,
};

export interface DefaultRankingEngineOptions {
  /** Target InvertedIndex instance for dictionary and corpus statistics */
  index: InvertedIndex;
  /** Global default ranking options */
  defaultOptions?: RankingOptions;
  /** Optional PageRank lookup provider / table */
  pageRankTable?: PageRankLookupProvider;
  /** Optional Tracker classification data source (Phase 100) */
  trackerClassificationSource?: TrackerClassificationSource;
  /** Optional Focus Lens registry (Phase 101) */
  lensRegistry?: FocusLensRegistry;
  /** Default Focus Lens profile or identifier (Phase 101) */
  lens?: FocusLensProfile | string;
}

export class DefaultRankingEngine implements RankingEngine {
  private readonly index: InvertedIndex;
  private readonly globalOptions: RankingOptions;
  private readonly authorityScorer: AuthorityScorer;
  private pageRankTable: PageRankLookupProvider | null = null;
  private trackerClassificationSource: TrackerClassificationSource | null = null;
  private lensRegistry: FocusLensRegistry;

  constructor(options: DefaultRankingEngineOptions) {
    this.index = options.index;
    this.globalOptions = options.defaultOptions ?? {};
    this.authorityScorer = createAuthorityScorer();
    this.pageRankTable = options.pageRankTable ?? this.globalOptions.pageRankTable ?? null;
    this.trackerClassificationSource =
      options.trackerClassificationSource ??
      this.globalOptions.trackerClassificationSource ??
      null;
    this.lensRegistry =
      options.lensRegistry ??
      this.globalOptions.lensRegistry ??
      getDefaultLensRegistry();
  }

  setTrackerClassificationSource(source: TrackerClassificationSource | null): void {
    this.trackerClassificationSource = source;
  }

  getTrackerClassificationSource(): TrackerClassificationSource | null {
    return this.trackerClassificationSource;
  }

  setLensRegistry(registry: FocusLensRegistry): void {
    this.lensRegistry = registry;
  }

  getLensRegistry(): FocusLensRegistry {
    return this.lensRegistry;
  }

  setPageRankTable(table: PageRankLookupProvider | null): void {
    this.pageRankTable = table;
  }

  getPageRankTable(): PageRankLookupProvider | null {
    return this.pageRankTable;
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
    const pageRankTable = mergedOptions.pageRankTable ?? this.pageRankTable ?? undefined;
    const enablePageRank = mergedOptions.enablePageRank ?? true;
    const lensRegistry = mergedOptions.lensRegistry ?? this.lensRegistry;
    const activeLens = lensRegistry.resolveLens(mergedOptions.lens ?? this.globalOptions.lens);

    let enableTrackerSignal = mergedOptions.enableTrackerSignal ?? false;
    let trackerOptions = mergedOptions.trackerOptions;

    // Apply Focus Lens ranking weight overrides if specified
    if (activeLens.rankingWeights) {
      const rw = activeLens.rankingWeights;
      if (rw.bm25) {
        Object.assign(bm25Params, rw.bm25);
      }
      if (rw.fieldBoosts) {
        Object.assign(fieldBoosts, rw.fieldBoosts);
      }
      if (rw.freshnessWeight !== undefined) {
        signals.freshnessWeight = rw.freshnessWeight;
      }
      if (rw.domainAuthorityWeight !== undefined) {
        signals.domainAuthorityWeight = rw.domainAuthorityWeight;
      }
      if (rw.pageRankWeight !== undefined) {
        signals.pageRankWeight = rw.pageRankWeight;
      }
      if (rw.enableTrackerSignal !== undefined && mergedOptions.enableTrackerSignal === undefined) {
        enableTrackerSignal = rw.enableTrackerSignal;
      }
      if (rw.trackerSignalWeight !== undefined) {
        trackerOptions = {
          ...trackerOptions,
          weight: rw.trackerSignalWeight,
        };
      }
    }
    const trackerSource =
      mergedOptions.trackerClassificationSource ?? this.trackerClassificationSource ?? undefined;

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
      const scoringTerms = query.expandedTerms?.allTerms ?? query.uniqueTerms;
      const { bm25Score, termBreakdowns, fieldScoreSums } = bm25Scorer.scoreCandidate(
        candidate,
        scoringTerms,
        query.expandedTerms?.termWeights,
      );

      // Multiplier signals
      const fullMatchMultiplier = candidate.isFullMatch ? signals.fullMatchBoost : 1.0;
      const phraseMultiplier =
        candidate.phraseMatches && query.phrases.length > 0 ? signals.phraseMatchBoost : 1.0;

      // Additive / heuristic signals (Freshness decay & Domain authority - Phase 48)
      const urlBonus = this.calculateUrlBonus(
        candidate.documentMeta.url,
        query.uniqueTerms,
        signals.urlMatchBonus,
      );
      
      const docTimestamp =
        candidate.documentMeta.lastModified ??
        candidate.documentMeta.lastCrawledAt ??
        candidate.documentMeta.indexedAt;
      const freshnessScore = this.authorityScorer.computeFreshnessScore(docTimestamp, now);
      const freshnessWeight = signals.freshnessWeight ?? 0.10;
      const freshnessBonus = freshnessWeight * freshnessScore;

      const domainAuthority = this.authorityScorer.computeDomainAuthority(candidate.documentMeta.url);
      const authorityWeight = signals.domainAuthorityWeight ?? 0.10;
      const authorityBonus = authorityWeight * domainAuthority;

      // Phase 89: PageRank signal evaluation & blending
      const prEvaluation = evaluatePageRankSignal(
        candidate.documentMeta.url,
        pageRankTable,
        {
          enabled: enablePageRank,
          weight: signals.pageRankWeight,
          maxBoost: signals.pageRankMaxBoost,
          transform: signals.pageRankTransform,
          staleThresholdMs: signals.pageRankStaleThresholdMs,
        },
        now,
      );
      const pageRankBonus = prEvaluation.bonus;

      // Base combination formula:
      // (BM25 * fullMatchMultiplier * phraseMultiplier) + urlBonus + freshnessBonus + authorityBonus + pageRankBonus
      let combinedScore =
        bm25Score * fullMatchMultiplier * phraseMultiplier +
        urlBonus +
        freshnessBonus +
        authorityBonus +
        pageRankBonus;
      combinedScore = Math.max(0, combinedScore);

      let trackerMultiplier: number | undefined;
      let trackerExplain: TrackerScoreExplanation | undefined;

      if (enableTrackerSignal) {
        const classification =
          resolveClassificationFromSource(trackerSource, candidate.documentId) ??
          resolveClassificationFromSource(trackerSource, candidate.documentMeta.url);

        const trackerEval = evaluateTrackerSignal(
          candidate.documentMeta.url,
          classification,
          {
            ...trackerOptions,
            enabled: enableTrackerSignal && (trackerOptions?.enabled ?? true),
          },
        );

        trackerMultiplier = trackerEval.multiplier;
        trackerExplain = trackerEval.explanation;
        combinedScore = combinedScore * trackerMultiplier;
        combinedScore = Math.max(0, combinedScore);
      }

      // Focus Lens evaluation (Phase 101)
      const lensEval = evaluateLensForDocument(candidate.documentMeta.url, activeLens);
      if (lensEval.action === 'exclude') {
        // Exclude document from candidate results
        continue;
      }

      let lensMultiplier: number | undefined;
      let lensExplain: LensScoreExplanation | undefined;
      if (lensEval.action !== 'none' || activeLens.id !== 'general') {
        lensMultiplier = lensEval.multiplier;
        lensExplain = lensEval.explanation;
        if (lensEval.action === 'boost' || lensEval.action === 'demote') {
          combinedScore = combinedScore * lensMultiplier;
          combinedScore = Math.max(0, combinedScore);
        }
      }

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
        authorityBonus: Math.round(authorityBonus * 10000) / 10000,
        pageRankBonus: Math.round(pageRankBonus * 10000) / 10000,
        pageRankExplain: prEvaluation.explanation,
        trackerMultiplier,
        trackerExplain,
        lensMultiplier,
        lensExplain,
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
  pageRankTable?: PageRankLookupProvider,
): RankingEngine {
  return new DefaultRankingEngine({
    index,
    defaultOptions,
    pageRankTable,
  });
}
