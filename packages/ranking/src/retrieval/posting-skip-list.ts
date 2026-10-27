/**
 * @opensearch/ranking — Posting Skip List with Block-Level Score Bounds (Phase 96)
 *
 * Implements a high-throughput iterator over a term's posting list partitioned into blocks:
 * - Each block records startDocId, endDocId, maxTf, and maxBlockScore
 * - Supports O(1) block skipping during WAND and MaxScore traversals
 * - Supports fast-forward advanceTo(targetDocId)
 */

import { Posting } from '@opensearch/indexer';
import { TermBoundComputer } from './term-bound-computer.js';
import { PostingSkipBlock } from './topk-types.js';

export class PostingSkipList {
  readonly term: string;
  readonly blocks: PostingSkipBlock[];
  readonly totalPostings: number;

  private currentBlockIndex = 0;
  private currentPostingIndexInBlock = 0;
  private skippedBlockCount = 0;

  constructor(
    term: string,
    postings: Posting[],
    boundComputer: TermBoundComputer,
    blockSize: number = 16,
  ) {
    this.term = term;
    this.totalPostings = postings.length;
    this.blocks = [];

    // Sort postings by documentId for deterministic iterator alignment
    const sortedPostings = [...postings].sort((a, b) => a.documentId.localeCompare(b.documentId));

    // Construct skip blocks
    for (let i = 0; i < sortedPostings.length; i += blockSize) {
      const chunk = sortedPostings.slice(i, i + blockSize);
      const startDocId = chunk[0]!.documentId;
      const endDocId = chunk[chunk.length - 1]!.documentId;

      let maxTf = 0;
      let maxBlockScore = 0;

      for (const p of chunk) {
        if (p.termFrequency > maxTf) maxTf = p.termFrequency;
        const score = boundComputer.computePostingScore(term, p);
        if (score > maxBlockScore) maxBlockScore = score;
      }

      this.blocks.push({
        startDocId,
        endDocId,
        maxTf,
        maxBlockScore,
        postings: chunk,
      });
    }
  }

  /**
   * Resets iterator back to start.
   */
  reset(): void {
    this.currentBlockIndex = 0;
    this.currentPostingIndexInBlock = 0;
    this.skippedBlockCount = 0;
  }

  /**
   * Returns whether this iterator has exhausted all postings.
   */
  isExhausted(): boolean {
    return this.currentBlockIndex >= this.blocks.length;
  }

  /**
   * Returns the current posting document ID, or null if exhausted.
   */
  currentDocId(): string | null {
    if (this.isExhausted()) return null;
    const block = this.blocks[this.currentBlockIndex]!;
    return block.postings[this.currentPostingIndexInBlock]?.documentId ?? null;
  }

  /**
   * Returns the current posting object, or null if exhausted.
   */
  currentPosting(): Posting | null {
    if (this.isExhausted()) return null;
    const block = this.blocks[this.currentBlockIndex]!;
    return block.postings[this.currentPostingIndexInBlock] ?? null;
  }

  /**
   * Returns the maximum score bound for the current block.
   */
  currentBlockMaxScore(): number {
    if (this.isExhausted()) return 0;
    return this.blocks[this.currentBlockIndex]!.maxBlockScore;
  }

  /**
   * Total number of skip blocks skipped so far.
   */
  getSkippedBlockCount(): number {
    return this.skippedBlockCount;
  }

  /**
   * Advances the iterator to the next posting.
   */
  advance(): void {
    if (this.isExhausted()) return;

    const block = this.blocks[this.currentBlockIndex]!;
    this.currentPostingIndexInBlock++;

    if (this.currentPostingIndexInBlock >= block.postings.length) {
      this.currentBlockIndex++;
      this.currentPostingIndexInBlock = 0;
    }
  }

  /**
   * Fast-forwards the iterator to the first document with documentId >= targetDocId.
   * Leverages block-level skip boundaries to skip entire blocks in O(1).
   */
  advanceTo(targetDocId: string): void {
    while (!this.isExhausted()) {
      const block = this.blocks[this.currentBlockIndex]!;

      // 1. If targetDocId is strictly greater than the block's last document, skip entire block!
      if (block.endDocId.localeCompare(targetDocId) < 0) {
        this.currentBlockIndex++;
        this.currentPostingIndexInBlock = 0;
        this.skippedBlockCount++;
        continue;
      }

      // 2. Otherwise targetDocId falls within this block (or before startDocId)
      while (this.currentPostingIndexInBlock < block.postings.length) {
        const posting = block.postings[this.currentPostingIndexInBlock]!;
        if (posting.documentId.localeCompare(targetDocId) >= 0) {
          return; // Found candidate >= targetDocId
        }
        this.currentPostingIndexInBlock++;
      }

      // If we walked through the block without finding >= targetDocId, move to next block
      this.currentBlockIndex++;
      this.currentPostingIndexInBlock = 0;
    }
  }
}
