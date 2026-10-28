/**
 * @opensearch/ranking — Term Score Bound Computer (Phase 96)
 *
 * Computes tight term upper score bounds (U_t) for BM25 and multi-signal scoring:
 * - U_t = max_{d in postings(t)} score(t, d)
 * - Computes maximum multiplier boosts and additive heuristic signal upper bounds
 * - Enables safe, correct pruning in WAND and MaxScore algorithms
 */

import { InvertedIndex, Posting } from '@opensearch/indexer';
import { BM25Scorer, DEFAULT_BM25_PARAMS, DEFAULT_FIELD_BOOSTS } from '../scorer/bm25-scorer.js';
import { DEFAULT_SCORE_SIGNALS } from '../scorer/ranking-engine.js';
import { BM25Params, FieldWeightBoosts, ScoreSignalConfig } from '../scorer/scorer-types.js';
import { TermUpperScoreBound } from './topk-types.js';

export interface TermBoundComputerOptions {
  bm25?: Partial<BM25Params>;
  fieldBoosts?: Partial<FieldWeightBoosts>;
  signals?: Partial<ScoreSignalConfig>;
}

export class TermBoundComputer {
  private readonly index: InvertedIndex;
  private readonly bm25Scorer: BM25Scorer;
  private readonly bm25Params: BM25Params;
  private readonly fieldBoosts: FieldWeightBoosts;
  private readonly signals: ScoreSignalConfig;
  private readonly boundCache = new Map<string, TermUpperScoreBound>();

  constructor(index: InvertedIndex, options: TermBoundComputerOptions = {}) {
    this.index = index;
    this.bm25Params = { ...DEFAULT_BM25_PARAMS, ...options.bm25 };
    this.fieldBoosts = { ...DEFAULT_FIELD_BOOSTS, ...options.fieldBoosts };
    this.signals = { ...DEFAULT_SCORE_SIGNALS, ...options.signals };
    this.bm25Scorer = new BM25Scorer(index, this.bm25Params, this.fieldBoosts);
  }

  /**
   * Computes the maximum possible score multiplier boost.
   * Full match multiplier (e.g. 1.25) * phrase match multiplier (e.g. 1.5).
   */
  getMaxMultiplierBoost(hasPhrases: boolean): number {
    const fullBoost = this.signals.fullMatchBoost || 1.25;
    const phraseBoost = hasPhrases ? this.signals.phraseMatchBoost || 1.5 : 1.0;
    return fullBoost * phraseBoost;
  }

  /**
   * Computes the maximum possible additive score bonus (URL, freshness, authority, PageRank).
   */
  getMaxAdditiveBonus(): number {
    const urlBonus = this.signals.urlMatchBonus || 0.35;
    const freshnessBonus = (this.signals.freshnessWeight || 0.10) * 1.0;
    const authorityBonus = (this.signals.domainAuthorityWeight || 0.10) * 1.0;
    const pageRankBonus = (this.signals.pageRankWeight || 0.15) * (this.signals.pageRankMaxBoost || 2.0);
    return urlBonus + freshnessBonus + authorityBonus + pageRankBonus;
  }

  /**
   * Computes the exact BM25 score contribution for a specific posting.
   */
  computePostingScore(term: string, posting: Posting): number {
    const docMeta = this.index.getDocumentMeta(posting.documentId);
    if (!docMeta) return 0;

    const stats = this.index.getStats();
    const totalDocs = Math.max(1, stats.totalDocuments);
    const avgFieldLengths = stats.avgFieldLengths ?? {
      title: 10,
      headings: 20,
      description: 30,
      body: 150,
    };

    const df = this.index.getDocumentFrequency(term);
    const idf = this.bm25Scorer.computeIdf(totalDocs, df > 0 ? df : 1);

    const { k1, b } = this.bm25Params;
    const fieldLengths = docMeta.fieldLengths ?? {
      title: 0,
      headings: 0,
      description: 0,
      body: 0,
    };

    let totalTermScore = 0;
    const fieldBoostsMap = this.fieldBoosts as unknown as Record<string, number>;
    const fieldLengthsMap = fieldLengths as unknown as Record<string, number>;
    const avgFieldLengthsMap = avgFieldLengths as unknown as Record<string, number>;

    for (const [fieldName, tf] of Object.entries(posting.fieldTermFrequencies)) {
      if (tf <= 0) continue;

      const fieldWeight = fieldBoostsMap[fieldName] ?? this.fieldBoosts.defaultWeight;
      const fieldLen = fieldLengthsMap[fieldName] ?? 1;
      const avgLen = Math.max(1, avgFieldLengthsMap[fieldName] ?? 1);

      const tfNumerator = tf * (k1 + 1);
      const tfDenominator = tf + k1 * (1 - b + b * (fieldLen / avgLen));
      const tfWeight = tfDenominator > 0 ? tfNumerator / tfDenominator : 0;

      const fieldScore = fieldWeight * tfWeight * idf;
      totalTermScore += fieldScore;
    }

    return totalTermScore;
  }

  /**
   * Computes the tight upper score bound for a query term.
   */
  computeTermBound(term: string): TermUpperScoreBound {
    const cached = this.boundCache.get(term);
    if (cached) return cached;

    const stats = this.index.getStats();
    const totalDocs = Math.max(1, stats.totalDocuments);
    const df = this.index.getDocumentFrequency(term);
    const idf = this.bm25Scorer.computeIdf(totalDocs, df > 0 ? df : 1);

    const postings = this.index.getPostings(term) ?? [];
    let maxTf = 0;
    let maxScore = 0;

    for (const p of postings) {
      if (p.termFrequency > maxTf) {
        maxTf = p.termFrequency;
      }
      const score = this.computePostingScore(term, p);
      if (score > maxScore) {
        maxScore = score;
      }
    }

    const bound: TermUpperScoreBound = {
      term,
      docFrequency: df,
      idf,
      maxTf,
      maxScore: Math.round(maxScore * 10000) / 10000,
    };

    this.boundCache.set(term, bound);
    return bound;
  }

  /**
   * Computes upper bounds for multiple query terms.
   */
  computeBoundsForTerms(terms: readonly string[]): Map<string, TermUpperScoreBound> {
    const map = new Map<string, TermUpperScoreBound>();
    for (const term of terms) {
      map.set(term, this.computeTermBound(term));
    }
    return map;
  }

  /**
   * Clears the cached bounds (e.g. after index modifications).
   */
  clearCache(): void {
    this.boundCache.clear();
  }
}
