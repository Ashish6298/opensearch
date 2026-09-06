/**
 * @opensearch/ranking — BM25 Relevance Scorer (Phase 14)
 *
 * Implements the standard Okapi BM25 ranking function tailored for multi-field documents:
 *
 * Formula:
 *   IDF(q_i) = ln( 1 + (N - n(q_i) + 0.5) / (n(q_i) + 0.5) )
 *   TF_weight(q_i, D, field) = (TF * (k1 + 1)) / (TF + k1 * (1 - b + b * (fieldLen / avgFieldLen)))
 *   BM25(D, Q) = sum_{q_i in Q} ( IDF(q_i) * sum_{field} ( weight_field * TF_weight(q_i, D, field) ) )
 */

import { InvertedIndex } from '@opensearch/indexer';
import { BM25Params, FieldWeightBoosts, TermScoreBreakdown } from './scorer-types.js';
import { CandidateDocument } from '../retrieval/retrieval-types.js';

export const DEFAULT_BM25_PARAMS: BM25Params = {
  k1: 1.2,
  b: 0.75,
};

export const DEFAULT_FIELD_BOOSTS: FieldWeightBoosts = {
  title: 3.0,
  headings: 2.0,
  description: 1.5,
  body: 1.0,
  defaultWeight: 1.0,
};

export class BM25Scorer {
  private readonly index: InvertedIndex;
  private readonly params: BM25Params;
  private readonly fieldBoosts: FieldWeightBoosts;

  constructor(
    index: InvertedIndex,
    params?: Partial<BM25Params>,
    fieldBoosts?: Partial<FieldWeightBoosts>,
  ) {
    this.index = index;
    this.params = {
      ...DEFAULT_BM25_PARAMS,
      ...params,
    };
    this.fieldBoosts = {
      ...DEFAULT_FIELD_BOOSTS,
      ...fieldBoosts,
    };
  }

  /**
   * Computes probabilistic BM25 Inverse Document Frequency (IDF) with smoothing.
   * Ensures non-negative values via ln(1 + ...).
   *
   * @param totalDocs - Total documents indexed in the corpus (N)
   * @param docFreq - Number of documents containing the term (n)
   */
  computeIdf(totalDocs: number, docFreq: number): number {
    if (totalDocs <= 0 || docFreq <= 0) {
      return 0;
    }
    const safeDocFreq = Math.min(docFreq, totalDocs);
    const idf = Math.log(1 + (totalDocs - safeDocFreq + 0.5) / (safeDocFreq + 0.5));
    return Math.max(0, idf);
  }

  /**
   * Computes BM25 score for a single candidate document across all matched terms
   * with multi-field weighting.
   */
  scoreCandidate(
    candidate: CandidateDocument,
    queryTerms: string[],
  ): {
    bm25Score: number;
    termBreakdowns: TermScoreBreakdown[];
    fieldScoreSums: Record<string, number>;
  } {
    const stats = this.index.getStats();
    const totalDocs = Math.max(1, stats.totalDocuments);
    const avgFieldLengths = stats.avgFieldLengths ?? {
      title: 10,
      headings: 20,
      description: 30,
      body: 150,
    };

    const { k1, b } = this.params;
    const docMeta = candidate.documentMeta;
    const fieldLengths = docMeta.fieldLengths ?? {
      title: 0,
      headings: 0,
      description: 0,
      body: 0,
    };

    let totalBM25 = 0;
    const termBreakdowns: TermScoreBreakdown[] = [];
    const fieldScoreSums: Record<string, number> = {
      title: 0,
      headings: 0,
      description: 0,
      body: 0,
    };

    for (const term of queryTerms) {
      const posting = candidate.termPostings.get(term);
      if (!posting) {
        continue;
      }

      const df = this.index.getDocumentFrequency(term);
      const idf = this.computeIdf(totalDocs, df > 0 ? df : 1);

      const fieldScores: Record<string, number> = {};
      let termBM25Subtotal = 0;

      // Calculate score contribution from each field
      const fieldTFs = posting.fieldTermFrequencies;
      for (const [fieldName, tf] of Object.entries(fieldTFs)) {
        if (tf <= 0) {
          continue;
        }

        const fieldBoostsMap = this.fieldBoosts as unknown as Record<string, number>;
        const fieldLengthsMap = fieldLengths as unknown as Record<string, number>;
        const avgFieldLengthsMap = avgFieldLengths as unknown as Record<string, number>;

        const fieldWeight = fieldBoostsMap[fieldName] ?? this.fieldBoosts.defaultWeight;
        const fieldLen = fieldLengthsMap[fieldName] ?? 1;
        const avgLen = Math.max(1, avgFieldLengthsMap[fieldName] ?? 1);

        // Standard BM25 term frequency saturation formula with length normalization
        const tfNumerator = tf * (k1 + 1);
        const tfDenominator = tf + k1 * (1 - b + b * (fieldLen / avgLen));
        const tfWeight = tfDenominator > 0 ? tfNumerator / tfDenominator : 0;

        const fieldScore = fieldWeight * tfWeight * idf;
        fieldScores[fieldName] = fieldScore;
        termBM25Subtotal += fieldScore;

        fieldScoreSums[fieldName] = (fieldScoreSums[fieldName] ?? 0) + fieldScore;
      }

      totalBM25 += termBM25Subtotal;
      termBreakdowns.push({
        term,
        idf,
        fieldScores,
        totalTermScore: termBM25Subtotal,
      });
    }

    return {
      bm25Score: totalBM25,
      termBreakdowns,
      fieldScoreSums,
    };
  }
}
