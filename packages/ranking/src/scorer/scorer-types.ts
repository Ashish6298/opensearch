/**
 * @opensearch/ranking — Ranking & Scorer Types (Phase 14)
 *
 * Defines the domain models, score breakdown structures, parameter configurations,
 * and ranking engine contracts for BM25 relevance scoring, field boosting,
 * exact phrase boosts, URL/domain signals, duplicate penalties, and freshness signals.
 */

import { IndexedDocumentMeta } from '@opensearch/indexer';
import { ParsedQuery } from '../query/query-types.js';
import { CandidateDocument } from '../retrieval/retrieval-types.js';

export interface BM25Params {
  /** Term frequency saturation parameter (default: 1.2) */
  k1: number;
  /** Field length normalization parameter (default: 0.75) */
  b: number;
}

export interface FieldWeightBoosts {
  /** Boost multiplier for title matches (default: 3.0) */
  title: number;
  /** Boost multiplier for headings matches (default: 2.0) */
  headings: number;
  /** Boost multiplier for meta description matches (default: 1.5) */
  description: number;
  /** Boost multiplier for main body text matches (default: 1.0) */
  body: number;
  /** Default fallback multiplier for any other fields (default: 1.0) */
  defaultWeight: number;
}

export interface ScoreSignalConfig {
  /** Boost multiplier when all positive query terms are matched in the candidate (default: 1.25) */
  fullMatchBoost: number;
  /** Boost multiplier when exact quoted phrases match positional sequence (default: 1.5) */
  phraseMatchBoost: number;
  /** Bonus score when query terms match the document URL slug or host (default: 0.3) */
  urlMatchBonus: number;
  /** Multiplier penalty for near-duplicate documents (same host or identical title prefix) (default: 0.8) */
  duplicatePenaltyMultiplier: number;
  /** Weight for optional freshness signal based on indexedAt timestamp (default: 0.05, 0 = disabled) */
  freshnessWeight: number;
  /** Maximum days considered for freshness decay (default: 30) */
  freshnessMaxDays: number;
}

export interface RankingOptions {
  /** Custom BM25 tuning parameters */
  bm25?: Partial<BM25Params>;
  /** Custom field boost weights */
  fieldBoosts?: Partial<FieldWeightBoosts>;
  /** Custom heuristic signal configuration */
  signals?: Partial<ScoreSignalConfig>;
  /** Maximum number of ranked documents to return (default: 50) */
  topK?: number;
  /** Whether to enable near-duplicate domain/title dampening (default: true) */
  enableDuplicatePenalty?: boolean;
  /** Whether to include detailed score explanations in results (default: true) */
  explain?: boolean;
}

export interface TermScoreBreakdown {
  /** The normalized query term */
  term: string;
  /** Inverse Document Frequency computed across the corpus */
  idf: number;
  /** Weighted TF scores per field */
  fieldScores: Record<string, number>;
  /** Combined BM25 score for this term across all fields */
  totalTermScore: number;
}

export interface ScoreExplanation {
  /** Sum of BM25 scores across all matching query terms */
  bm25Score: number;
  /** Breakdown of score per query term */
  termBreakdowns: TermScoreBreakdown[];
  /** Breakdown of score sum per field */
  fieldScoreSums: Record<string, number>;
  /** Coverage multiplier applied (e.g. 1.25 for full match) */
  fullMatchMultiplier: number;
  /** Exact phrase multiplier applied (e.g. 1.5 for phrase match) */
  phraseMultiplier: number;
  /** Additional score bonus from URL / hostname matching */
  urlBonus: number;
  /** Freshness bonus score based on indexedAt timestamp */
  freshnessBonus: number;
  /** Near-duplicate / domain clustering penalty factor (<= 1.0) */
  duplicatePenalty: number;
  /** Final calculated total relevance score */
  finalScore: number;
}

export interface ScoredDocument {
  /** Document identifier */
  documentId: string;
  /** Final combined relevance score (higher is more relevant) */
  score: number;
  /** Document rank index (1-based, 1 = top result) */
  rank: number;
  /** Document metadata cached from inverted index */
  documentMeta: IndexedDocumentMeta;
  /** Original candidate document match details */
  candidate: CandidateDocument;
  /** Detailed score calculation breakdown and signal explanation */
  explanation?: ScoreExplanation;
}

export interface RankingStats {
  /** Total candidate documents received from retrieval */
  totalCandidates: number;
  /** Total documents returned after ranking and top-K filtering */
  rankedCount: number;
  /** Highest score in the result set */
  maxScore: number;
  /** Lowest score in the result set */
  minScore: number;
  /** Time spent in ranking calculation in milliseconds */
  durationMs: number;
}

export interface RankingResult {
  /** Ranked list of scored documents, sorted by score descending */
  hits: ScoredDocument[];
  /** Ranking diagnostics and metrics */
  stats: RankingStats;
}

export interface RankingEngine {
  /**
   * Ranks a collection of candidate documents against a parsed query.
   * Deterministic, safe, and explainable.
   */
  rank(
    query: ParsedQuery,
    candidates: CandidateDocument[],
    options?: RankingOptions,
  ): RankingResult;

  /**
   * Computes BM25 IDF for a given term given total documents in corpus (N)
   * and number of documents containing term (n).
   */
  computeIdf(totalDocuments: number, documentFrequency: number): number;
}
