/**
 * @opensearch/ranking — Top-k Retrieval & Pruning Types (Phase 96)
 *
 * Types for block-level score bounds, skip lists, WAND, MaxScore,
 * and exhaustive correctness oracle verification.
 */

import { Posting } from '@opensearch/indexer';
import { ScoredDocument } from '../scorer/scorer-types.js';

export type TopKAlgorithm = 'exhaustive' | 'maxscore' | 'wand' | 'adaptive';

export interface TermUpperScoreBound {
  /** The normalized query term */
  term: string;
  /** Document frequency of this term across the corpus */
  docFrequency: number;
  /** Inverse Document Frequency */
  idf: number;
  /** Maximum term frequency observed across any document in the corpus */
  maxTf: number;
  /** Maximum achievable BM25 multi-field score for this term */
  maxScore: number;
}

export interface PostingSkipBlock {
  /** First document ID in this block */
  startDocId: string;
  /** Last document ID in this block */
  endDocId: string;
  /** Maximum term frequency within this block */
  maxTf: number;
  /** Maximum achievable score bound for any posting within this block */
  maxBlockScore: number;
  /** Array of postings in this block (typically 16-32 postings) */
  postings: Posting[];
}

export interface TopKRetrievalOptions {
  /** Target number of top documents to retrieve (default: 10) */
  k?: number;
  /** Retrieval and pruning algorithm to execute (default: 'adaptive') */
  algorithm?: TopKAlgorithm;
  /** Tolerance for floating point score equivalence against oracle (default: 1e-4) */
  scoreEpsilon?: number;
  /** Block size for posting skip lists (default: 16) */
  skipBlockSize?: number;
  /** Whether to verify results against exhaustive oracle during execution (default: false) */
  verifyAgainstOracle?: boolean;
}

export interface TopKPruningStats {
  /** Algorithm actually executed */
  algorithmUsed: TopKAlgorithm;
  /** Total matching documents in the index before pruning */
  totalMatchingDocs: number;
  /** Number of documents fully scored */
  evaluatedDocs: number;
  /** Number of documents pruned without full scoring */
  prunedDocs: number;
  /** Pruning ratio: prunedDocs / totalMatchingDocs */
  pruningRatio: number;
  /** Number of posting skip blocks skipped in O(1) */
  skippedBlocks: number;
  /** Final score threshold (score of the k-th document in the heap) */
  finalThreshold: number;
  /** Execution time in milliseconds */
  durationMs: number;
}

export interface TopKResult {
  /** Top-k scored documents ranked by score descending */
  hits: ScoredDocument[];
  /** Detailed diagnostics and pruning statistics */
  stats: TopKPruningStats;
  /** Optional verification comparison against exhaustive oracle */
  oracleVerification?: TopKVerificationResult;
}

export interface TopKVerificationResult {
  /** Whether optimized results match exhaustive oracle results within tolerance */
  isEquivalent: boolean;
  /** Document count from oracle */
  oracleCount: number;
  /** Document count from optimized retriever */
  optimizedCount: number;
  /** Score comparison epsilon tolerance */
  scoreEpsilon: number;
  /** Differences encountered if not equivalent */
  differences?: string[];
}
