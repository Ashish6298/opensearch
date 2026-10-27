/**
 * @opensearch/ranking — Top-k Retrieval & Dynamic Pruning Engine (Phase 96)
 *
 * Implements:
 * 1. ExhaustiveScorer (Ground-Truth Correctness Oracle)
 * 2. MaxScoreRetriever (Prefix upper bound partitioning & dynamic threshold pruning)
 * 3. WandRetriever (Weak AND iterator skipping with block-level score bounds)
 * 4. verifyTopKEquivalence (Strict mathematical tolerance validator)
 * 5. TopKRankingEngine (Unified coordinator with adaptive algorithm selection)
 */

import { InvertedIndex } from '@opensearch/indexer';
import { ParsedQuery } from '../query/query-types.js';
import { DEFAULT_BM25_PARAMS, DEFAULT_FIELD_BOOSTS } from '../scorer/bm25-scorer.js';
import { DefaultRankingEngine, DEFAULT_SCORE_SIGNALS } from '../scorer/ranking-engine.js';
import {
  BM25Params,
  FieldWeightBoosts,
  RankingOptions,
  ScoredDocument,
  ScoreSignalConfig,
} from '../scorer/scorer-types.js';
import { createCandidateRetriever } from './candidate-retriever.js';
import { PostingSkipList } from './posting-skip-list.js';
import { CandidateRetriever } from './retrieval-types.js';
import { TermBoundComputer } from './term-bound-computer.js';
import {
  TopKAlgorithm,
  TopKResult,
  TopKRetrievalOptions,
  TopKVerificationResult,
} from './topk-types.js';

/**
 * Min-Heap for maintaining top-k scored documents with deterministic tie-breaking.
 */
class TopKHeap {
  private readonly items: ScoredDocument[] = [];
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  size(): number {
    return this.items.length;
  }

  getThreshold(): number {
    if (this.items.length < this.capacity) return 0;
    return this.items[0]?.score ?? 0;
  }

  insert(doc: ScoredDocument): boolean {
    if (this.items.length < this.capacity) {
      this.items.push(doc);
      this.bubbleUp(this.items.length - 1);
      return true;
    }

    if (this.isWorse(this.items[0]!, doc)) {
      this.items[0] = doc;
      this.sinkDown(0);
      return true;
    }

    return false;
  }

  getSortedResults(): ScoredDocument[] {
    // Sort descending by score, tie-breaking by documentId ascending
    return [...this.items].sort((a, b) => {
      const diff = b.score - a.score;
      if (Math.abs(diff) > 1e-9) return diff;
      return a.documentId.localeCompare(b.documentId);
    });
  }

  private isWorse(a: ScoredDocument, b: ScoredDocument): boolean {
    const diff = a.score - b.score;
    if (Math.abs(diff) > 1e-9) {
      return diff < 0; // a has lower score than b
    }
    // Equal scores: higher documentId is worse because deterministic ranking prefers lower documentId
    return a.documentId.localeCompare(b.documentId) > 0;
  }

  private bubbleUp(index: number): void {
    const element = this.items[index]!;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.items[parentIndex]!;
      if (!this.isWorse(element, parent)) break;
      this.items[index] = parent;
      this.items[parentIndex] = element;
      index = parentIndex;
    }
  }

  private sinkDown(index: number): void {
    const length = this.items.length;
    while (true) {
      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;
      let worstIndex = index;

      if (
        leftChildIndex < length &&
        this.isWorse(this.items[leftChildIndex]!, this.items[worstIndex]!)
      ) {
        worstIndex = leftChildIndex;
      }

      if (
        rightChildIndex < length &&
        this.isWorse(this.items[rightChildIndex]!, this.items[worstIndex]!)
      ) {
        worstIndex = rightChildIndex;
      }

      if (worstIndex === index) break;
      const temp = this.items[index]!;
      this.items[index] = this.items[worstIndex]!;
      this.items[worstIndex] = temp;
      index = worstIndex;
    }
  }
}

/**
 * Validates equivalence between optimized results and exhaustive ground-truth oracle.
 */
export function verifyTopKEquivalence(
  oracleHits: ScoredDocument[],
  optimizedHits: ScoredDocument[],
  options: { scoreEpsilon?: number } = {},
): TopKVerificationResult {
  const scoreEpsilon = options.scoreEpsilon ?? 1e-4;
  const differences: string[] = [];

  const count = Math.min(oracleHits.length, optimizedHits.length);
  if (oracleHits.length !== optimizedHits.length) {
    differences.push(
      `Result count divergence: oracle returned ${oracleHits.length} hits, optimized returned ${optimizedHits.length} hits`,
    );
  }

  for (let i = 0; i < count; i++) {
    const o = oracleHits[i]!;
    const opt = optimizedHits[i]!;

    if (o.documentId !== opt.documentId) {
      differences.push(
        `Rank [${i + 1}] ID mismatch: oracle="${o.documentId}" (score=${o.score.toFixed(4)}), optimized="${opt.documentId}" (score=${opt.score.toFixed(4)})`,
      );
      break;
    }

    const delta = Math.abs(o.score - opt.score);
    if (delta > scoreEpsilon) {
      differences.push(
        `Rank [${i + 1}] (${o.documentId}) score divergence: oracle=${o.score.toFixed(4)}, optimized=${opt.score.toFixed(4)}, delta=${delta.toFixed(6)} > epsilon (${scoreEpsilon})`,
      );
      break;
    }
  }

  return {
    isEquivalent: differences.length === 0,
    oracleCount: oracleHits.length,
    optimizedCount: optimizedHits.length,
    scoreEpsilon,
    differences: differences.length > 0 ? differences : undefined,
  };
}

export class TopKRankingEngine {
  private readonly index: InvertedIndex;
  private readonly candidateRetriever: CandidateRetriever;
  private readonly rankingEngine: DefaultRankingEngine;
  private readonly boundComputer: TermBoundComputer;
  private readonly bm25Params: BM25Params;
  private readonly fieldBoosts: FieldWeightBoosts;
  private readonly signals: ScoreSignalConfig;

  constructor(
    index: InvertedIndex,
    options: {
      rankingOptions?: RankingOptions;
    } = {},
  ) {
    this.index = index;
    this.candidateRetriever = createCandidateRetriever(index);
    const effectiveRankingOptions: RankingOptions = {
      enableDuplicatePenalty: false,
      ...options.rankingOptions,
    };
    this.rankingEngine = new DefaultRankingEngine({
      index,
      defaultOptions: effectiveRankingOptions,
    });
    this.bm25Params = { ...DEFAULT_BM25_PARAMS, ...effectiveRankingOptions.bm25 };
    this.fieldBoosts = { ...DEFAULT_FIELD_BOOSTS, ...effectiveRankingOptions.fieldBoosts };
    this.signals = { ...DEFAULT_SCORE_SIGNALS, ...effectiveRankingOptions.signals };
    this.boundComputer = new TermBoundComputer(index, {
      bm25: this.bm25Params,
      fieldBoosts: this.fieldBoosts,
      signals: this.signals,
    });
  }

  /**
   * Primary entry point: retrieves top-k documents using the specified algorithm.
   */
  retrieveTopK(query: ParsedQuery, options: TopKRetrievalOptions = {}): TopKResult {
    const k = options.k ?? 10;
    const requestedAlgorithm = options.algorithm ?? 'adaptive';
    const scoreEpsilon = options.scoreEpsilon ?? 1e-4;

    // Fast-path: empty query
    if (query.isEmpty || query.uniqueTerms.length === 0) {
      return {
        hits: [],
        stats: {
          algorithmUsed: 'exhaustive',
          totalMatchingDocs: 0,
          evaluatedDocs: 0,
          prunedDocs: 0,
          pruningRatio: 0,
          skippedBlocks: 0,
          finalThreshold: 0,
          durationMs: 0,
        },
      };
    }

    // Determine effective algorithm
    let effectiveAlgorithm: TopKAlgorithm = requestedAlgorithm;
    if (requestedAlgorithm === 'adaptive') {
      const matchingDocs = this.estimateMatchingDocuments(
        query.expandedTerms?.allTerms ?? query.uniqueTerms,
      );
      // For small candidate collections, exhaustive scoring is nearly instant and avoids overhead
      effectiveAlgorithm = matchingDocs <= 20 ? 'exhaustive' : 'wand';
    }

    let result: TopKResult;
    switch (effectiveAlgorithm) {
      case 'maxscore':
        result = this.runMaxScore(query, k, options);
        break;
      case 'wand':
        result = this.runWand(query, k, options);
        break;
      case 'exhaustive':
      default:
        result = this.runExhaustive(query, k);
        break;
    }

    // Verify against exhaustive oracle if requested
    if (options.verifyAgainstOracle && effectiveAlgorithm !== 'exhaustive') {
      const oracle = this.runExhaustive(query, k);
      result.oracleVerification = verifyTopKEquivalence(oracle.hits, result.hits, {
        scoreEpsilon,
      });
    }

    return result;
  }

  /**
   * Correctness Oracle: Exhaustive scoring of all matching candidates.
   */
  runExhaustive(query: ParsedQuery, k: number): TopKResult {
    const t0 = performance.now();
    const retrieved = this.candidateRetriever.retrieve(query, {
      mode: 'union',
      maxCandidates: 100000,
    });
    const ranked = this.rankingEngine.rank(query, retrieved.candidates, { topK: k });
    const durationMs = performance.now() - t0;

    const hits = ranked.hits.slice(0, k);
    const totalMatching = retrieved.candidates.length;

    return {
      hits,
      stats: {
        algorithmUsed: 'exhaustive',
        totalMatchingDocs: totalMatching,
        evaluatedDocs: totalMatching,
        prunedDocs: 0,
        pruningRatio: 0,
        skippedBlocks: 0,
        finalThreshold: hits[hits.length - 1]?.score ?? 0,
        durationMs: Math.round(durationMs * 100) / 100,
      },
    };
  }

  /**
   * MaxScore Retrieval: Sorts terms by upper bounds, builds prefix bounds, and prunes non-essential postings.
   */
  runMaxScore(query: ParsedQuery, k: number, _options: TopKRetrievalOptions): TopKResult {
    const t0 = performance.now();
    const queryTerms = query.expandedTerms?.allTerms ?? query.uniqueTerms;
    const termBounds = this.boundComputer.computeBoundsForTerms(queryTerms);

    // Filter terms present in index
    const activeTerms = queryTerms
      .filter(t => (termBounds.get(t)?.maxScore ?? 0) > 0)
      .sort((a, b) => (termBounds.get(a)?.maxScore ?? 0) - (termBounds.get(b)?.maxScore ?? 0));

    if (activeTerms.length === 0) {
      return this.runExhaustive(query, k);
    }

    // Precompute prefix sums: prefixBound[i] = sum_{j=0..i} maxScore(activeTerms[j])
    const prefixBounds: number[] = [];
    let cumulative = 0;
    for (const term of activeTerms) {
      cumulative += termBounds.get(term)!.maxScore;
      prefixBounds.push(cumulative);
    }

    const maxMultiplier = this.boundComputer.getMaxMultiplierBoost(query.phrases.length > 0);
    const maxBonus = this.boundComputer.getMaxAdditiveBonus();

    const heap = new TopKHeap(k);
    let totalMatchingDocs = 0;
    let evaluatedDocs = 0;
    let prunedDocs = 0;

    // Collect all candidate documents matching active terms
    const retrieved = this.candidateRetriever.retrieve(query, {
      mode: 'union',
      maxCandidates: 100000,
    });
    totalMatchingDocs = retrieved.candidates.length;

    for (const candidate of retrieved.candidates) {
      const threshold = heap.getThreshold();

      // Find highest rank term in activeTerms matched by this candidate
      let maxMatchedTermRank = -1;
      for (let i = 0; i < activeTerms.length; i++) {
        if (candidate.termPostings.has(activeTerms[i]!)) {
          maxMatchedTermRank = i;
        }
      }

      // MaxScore Pruning condition:
      // If the candidate only matches terms up to rank p, and prefixBounds[p] * maxMultiplier + maxBonus <= threshold,
      // then this candidate can NEVER achieve a score higher than the current threshold!
      if (maxMatchedTermRank >= 0 && threshold > 0) {
        const potentialMaxScore = prefixBounds[maxMatchedTermRank]! * maxMultiplier + maxBonus;
        if (potentialMaxScore <= threshold) {
          prunedDocs++;
          continue; // Pruned without full scoring
        }
      }

      // Fully score candidate
      evaluatedDocs++;
      const singleDocRank = this.rankingEngine.rank(query, [candidate], { topK: 1 });
      if (singleDocRank.hits[0]) {
        heap.insert(singleDocRank.hits[0]);
      }
    }

    const durationMs = performance.now() - t0;
    const sortedHits = heap.getSortedResults();

    return {
      hits: sortedHits,
      stats: {
        algorithmUsed: 'maxscore',
        totalMatchingDocs,
        evaluatedDocs,
        prunedDocs,
        pruningRatio: totalMatchingDocs > 0 ? Math.round((prunedDocs / totalMatchingDocs) * 1000) / 1000 : 0,
        skippedBlocks: 0,
        finalThreshold: heap.getThreshold(),
        durationMs: Math.round(durationMs * 100) / 100,
      },
    };
  }

  /**
   * WAND (Weak AND) Retrieval: Iterates postings with skip blocks and pivot threshold jumping.
   */
  runWand(query: ParsedQuery, k: number, options: TopKRetrievalOptions): TopKResult {
    const t0 = performance.now();
    const queryTerms = query.expandedTerms?.allTerms ?? query.uniqueTerms;
    const blockSize = options.skipBlockSize ?? 16;
    const termBounds = this.boundComputer.computeBoundsForTerms(queryTerms);

    // Initialize posting skip lists for all active query terms
    const skipLists: PostingSkipList[] = [];
    for (const term of queryTerms) {
      const postings = this.index.getPostings(term);
      if (postings && postings.length > 0) {
        skipLists.push(new PostingSkipList(term, postings, this.boundComputer, blockSize));
      }
    }

    if (skipLists.length === 0) {
      return this.runExhaustive(query, k);
    }

    const heap = new TopKHeap(k);
    const maxMultiplier = this.boundComputer.getMaxMultiplierBoost(query.phrases.length > 0);
    const maxBonus = this.boundComputer.getMaxAdditiveBonus();

    // Map docId -> candidate representation for fast lookup
    const retrieved = this.candidateRetriever.retrieve(query, {
      mode: 'union',
      maxCandidates: 100000,
    });
    const candidateMap = new Map<string, (typeof retrieved.candidates)[0]>();
    for (const c of retrieved.candidates) {
      candidateMap.set(c.documentId, c);
    }

    const totalMatchingDocs = retrieved.candidates.length;
    let evaluatedDocs = 0;
    let prunedDocs = 0;
    let totalSkippedBlocks = 0;

    // Active iterator loop
    while (true) {
      // 1. Filter out exhausted iterators
      const activeIterators = skipLists.filter(iter => !iter.isExhausted());
      if (activeIterators.length === 0) break;

      // 2. Sort active iterators by currentDocId ascending
      activeIterators.sort((a, b) => a.currentDocId()!.localeCompare(b.currentDocId()!));

      // 3. Find pivot index where accumulated upper bounds >= threshold
      const threshold = heap.getThreshold();
      let accumulatedBound = 0;
      let pivotIndex = -1;

      for (let i = 0; i < activeIterators.length; i++) {
        const iter = activeIterators[i]!;
        // Use block-level max score if available for tighter bound, or term upper bound
        const blockScore = iter.currentBlockMaxScore();
        const termBound = termBounds.get(iter.term)?.maxScore ?? 0;
        accumulatedBound += Math.max(blockScore, termBound);

        if (accumulatedBound * maxMultiplier + maxBonus > threshold) {
          pivotIndex = i;
          break;
        }
      }

      // If even the sum of all upper bounds cannot beat threshold, we can terminate early!
      if (pivotIndex === -1) {
        break;
      }

      const pivotIter = activeIterators[pivotIndex]!;
      const pivotDocId = pivotIter.currentDocId()!;
      const leadIter = activeIterators[0]!;
      const leadDocId = leadIter.currentDocId()!;

      // 4. If lead docId matches pivot docId, we found a viable candidate document!
      if (leadDocId === pivotDocId) {
        const candidate = candidateMap.get(pivotDocId);
        if (candidate) {
          evaluatedDocs++;
          const singleDocRank = this.rankingEngine.rank(query, [candidate], { topK: 1 });
          if (singleDocRank.hits[0]) {
            heap.insert(singleDocRank.hits[0]);
          }
        }

        // Advance all iterators pointing to this document
        for (const iter of activeIterators) {
          if (iter.currentDocId() === pivotDocId) {
            iter.advance();
          }
        }
      } else {
        // 5. Pivot skip: fast-forward the leading iterator ahead to at least pivotDocId
        leadIter.advanceTo(pivotDocId);
      }
    }

    for (const iter of skipLists) {
      totalSkippedBlocks += iter.getSkippedBlockCount();
    }

    prunedDocs = Math.max(0, totalMatchingDocs - evaluatedDocs);
    const durationMs = performance.now() - t0;
    const sortedHits = heap.getSortedResults();

    return {
      hits: sortedHits,
      stats: {
        algorithmUsed: 'wand',
        totalMatchingDocs,
        evaluatedDocs,
        prunedDocs,
        pruningRatio: totalMatchingDocs > 0 ? Math.round((prunedDocs / totalMatchingDocs) * 1000) / 1000 : 0,
        skippedBlocks: totalSkippedBlocks,
        finalThreshold: heap.getThreshold(),
        durationMs: Math.round(durationMs * 100) / 100,
      },
    };
  }

  private estimateMatchingDocuments(terms: readonly string[]): number {
    let count = 0;
    for (const term of terms) {
      count += this.index.getDocumentFrequency(term);
    }
    return count;
  }
}
