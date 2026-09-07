/**
 * @opensearch/crawler — Crawl Orchestrator Types (Phase 8)
 *
 * Defines domain models and type contracts for crawl orchestration:
 * - CrawlRunOptions: options for starting a crawl run
 * - CrawlRunStats: metrics and status counters
 * - CrawlResult: summary of a completed run
 * - CrawlOrchestrator: primary crawler execution interface
 */

import { CrawlStatus } from '@opensearch/storage';

export interface CrawlRunOptions {
  /** Array of initial seed URLs to crawl */
  seeds: string[];
  /** Override max pages to crawl (defaults to config.crawler.maxPages) */
  maxPages?: number;
  /** Override max crawl depth (defaults to config.crawler.maxDepth) */
  maxDepth?: number;
  /** Override politeness delay in milliseconds between requests */
  politenessDelayMs?: number;
  /** Override worker concurrency (defaults to config.crawler.maxConcurrency) */
  maxConcurrency?: number;
  /** Override global retry budget (defaults to config.crawler.retryBudget) */
  retryBudget?: number;
  /** Interval in processed pages between state checkpoints */
  checkpointIntervalPages?: number;
  /** File path to save progress checkpoints (default: <crawlerDataDir>/checkpoint.json) */
  checkpointPath?: string;
  /** Optional custom user-agent string */
  userAgent?: string;
  /** Optional abort signal for external cancellation */
  signal?: AbortSignal;
}

export interface CrawlCheckpoint {
  version: 1;
  runId: string;
  savedAt: string;
  stats: CrawlRunStats;
  options: {
    maxPages: number;
    maxDepth: number;
    politenessDelayMs: number;
    maxConcurrency: number;
  };
}

export interface CrawlRunStats {
  /** Unique ID for the current crawl run */
  crawlRunId: string;
  /** ISO timestamp when the run started */
  startedAt: string;
  /** ISO timestamp when the run finished (or null if running) */
  finishedAt: string | null;
  /** Current state of the crawl run */
  state: 'idle' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed';
  /** Total URLs successfully fetched, parsed, and stored */
  pagesFetched: number;
  /** Total pages stored to document repository */
  pagesStored: number;
  /** Total fetch / network errors encountered */
  fetchErrors: number;
  /** Total retries consumed from retry budget */
  retriesConsumed: number;
  /** Total times retry budget was exhausted */
  retryBudgetExhaustedCount: number;
  /** Total URLs disallowed by robots.txt policy */
  robotsDisallowed: number;
  /** Total new outbound links discovered and queued */
  linksDiscovered: number;
  /** Total duplicate links skipped */
  duplicatesSkipped: number;
  /** Current number of pending URLs in the queue */
  queuePending: number;
  /** Total seen URLs in queue history */
  queueSeen: number;
  /** Active concurrent worker count */
  activeWorkers: number;
  /** Number of progress checkpoints successfully written */
  checkpointsSaved: number;
  /** Duration in milliseconds */
  durationMs: number;
}

export interface ProcessedPageOutcome {
  url: string;
  urlHash: string;
  depth: number;
  status: CrawlStatus;
  httpStatus?: number;
  documentId?: string | null;
  discoveredLinksCount: number;
  errorMessage?: string;
  durationMs: number;
}

export interface CrawlSummary {
  runId: string;
  status: 'completed' | 'stopped' | 'limit_reached' | 'failed';
  stats: CrawlRunStats;
  message?: string;
}

export interface CrawlOrchestrator {
  /**
   * Initializes the orchestrator and underlying components (queue, storage).
   */
  initialize(): Promise<void>;

  /**
   * Seeds the queue with the provided list of URLs.
   */
  addSeeds(seeds: string[]): Promise<number>;

  /**
   * Runs the crawl loop until limits are reached or queue is empty.
   */
  start(options?: CrawlRunOptions): Promise<CrawlSummary>;

  /**
   * Requests a graceful stop of the active crawl loop.
   */
  stop(): Promise<void>;

  /**
   * Returns live snapshot of current run statistics.
   */
  getStats(): CrawlRunStats;

  /**
   * Closes orchestrator and flushes queue/storage state.
   */
  close(): Promise<void>;
}
