/**
 * @opensearch/crawler — Queue Types (Phase 4)
 *
 * Defines the CrawlQueue abstraction and all supporting types.
 * Implementations (e.g. PersistentCrawlQueue) satisfy this interface.
 * The crawler orchestrator (Phase 8) depends on this interface only,
 * not on any concrete implementation.
 */

import { CrawlQueueEntry, EnqueueOutcome } from '../url/url-model.js';

// Re-export for convenience — callers import queue types from one place
export type { CrawlQueueEntry, EnqueueOutcome };
export { ENQUEUE_RESULT } from '../url/url-model.js';

// ============================================================
// Core CrawlQueue interface
// ============================================================

export interface CrawlQueue {
  /**
   * Enqueue a raw (un-normalized) URL at the given depth.
   *
   * Internally: validates → normalizes → deduplicates → persists.
   * Returns an EnqueueOutcome with one of:
   *   - 'queued'            — accepted and added
   *   - 'duplicate_skipped' — already seen (even if dequeued)
   *   - 'queue_full'        — at capacity; entry not added
   *   - 'invalid_url'       — failed validation/normalization
   */
  enqueue(rawUrl: string, depth: number, discoveredFrom: string | null): Promise<EnqueueOutcome>;

  /**
   * Remove and return the next entry (FIFO order).
   * Returns null if the queue is empty.
   */
  dequeue(): Promise<CrawlQueueEntry | null>;

  /**
   * Return the next entry without removing it.
   * Returns null if the queue is empty.
   */
  peek(): Promise<CrawlQueueEntry | null>;

  /**
   * Returns true if the given urlHash has ever been enqueued
   * (including already-dequeued entries). Used for dedup across restarts.
   */
  contains(urlHash: string): Promise<boolean>;

  /**
   * Returns the number of entries currently waiting in the queue
   * (does not include already-dequeued entries).
   */
  size(): Promise<number>;

  /**
   * Returns true if there are no entries waiting to be dequeued.
   */
  isEmpty(): Promise<boolean>;

  /**
   * Removes all pending entries from the queue.
   * Does NOT clear the seen-set — already-seen URLs remain deduped.
   */
  clear(): Promise<void>;

  /**
   * Flush any pending writes and release resources.
   * Should be called before process exit.
   */
  close(): Promise<void>;
}

// ============================================================
// Queue statistics (returned by health/diagnostic calls)
// ============================================================

export interface QueueStats {
  pendingCount: number;
  seenCount: number;
  maxQueueSize: number;
  persistencePath: string;
}
