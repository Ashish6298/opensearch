/**
 * @opensearch/crawler — Multi-Threaded Worker Crawler Pool & Per-Host Rate Limiter (Phase 52)
 *
 * Provides:
 * 1. Per-Host Sliding Window Rate Limiter & Politeness Controller:
 *    - Enforces maximum requests per second per domain.
 *    - Respects `robots.txt` `Crawl-delay` directive with automatic queue backoff.
 * 2. Multi-Threaded Worker Pool Orchestration:
 *    - Job distribution and worker coordination using native Node.js `worker_threads`
 *      or in-process parallel worker workers with zero external dependencies.
 */

export interface DomainRateLimitConfig {
  /** Maximum requests per second per domain (default: 5) */
  maxRequestsPerSecond?: number;
  /** Minimum delay between consecutive requests to the same domain in ms (default: 200ms) */
  minDelayMs?: number;
  /** Sliding window time frame in ms (default: 1000ms) */
  windowMs?: number;
}

export interface CrawlJob {
  id: string;
  url: string;
  depth: number;
  etag?: string | null;
  lastModified?: string | null;
}

export interface CrawlJobResult {
  jobId: string;
  url: string;
  statusCode: number;
  is304: boolean;
  content?: string;
  contentType?: string;
  etag?: string | null;
  lastModified?: string | null;
  durationMs: number;
  error?: string;
}

export class SlidingWindowRateLimiter {
  private readonly maxRequestsPerSecond: number;
  private readonly minDelayMs: number;
  private readonly windowMs: number;

  // Domain -> array of request timestamps in the current window
  private readonly requestWindows = new Map<string, number[]>();
  // Domain -> timestamp of last executed request
  private readonly lastRequestTimes = new Map<string, number>();
  // Domain -> custom robots crawl-delay in milliseconds
  private readonly customCrawlDelays = new Map<string, number>();

  constructor(config: DomainRateLimitConfig = {}) {
    this.maxRequestsPerSecond = config.maxRequestsPerSecond ?? 5;
    this.minDelayMs = config.minDelayMs ?? 200;
    this.windowMs = config.windowMs ?? 1000;
  }

  /**
   * Sets custom robots.txt Crawl-delay for a specific domain.
   */
  setDomainCrawlDelay(domain: string, delaySeconds: number): void {
    const d = domain.toLowerCase().trim();
    if (delaySeconds > 0) {
      this.customCrawlDelays.set(d, delaySeconds * 1000);
    }
  }

  /**
   * Calculates required backoff delay (ms) for a target domain before next fetch can proceed.
   */
  async acquirePermission(domain: string): Promise<number> {
    const d = domain.toLowerCase().trim();
    const now = Date.now();

    // 1. Check custom robots.txt Crawl-delay enforcement
    const customDelay = this.customCrawlDelays.get(d) ?? this.minDelayMs;
    const lastTime = this.lastRequestTimes.get(d) ?? 0;
    const timeSinceLast = now - lastTime;
    let waitMs = 0;

    if (timeSinceLast < customDelay) {
      waitMs = customDelay - timeSinceLast;
    }

    // 2. Sliding window rate limit check
    let windowTimestamps = this.requestWindows.get(d) ?? [];
    const windowStart = now + waitMs - this.windowMs;
    windowTimestamps = windowTimestamps.filter(t => t > windowStart);

    if (windowTimestamps.length >= this.maxRequestsPerSecond) {
      const oldestInWindow = windowTimestamps[0] ?? now;
      const windowBackoff = oldestInWindow + this.windowMs - now;
      waitMs = Math.max(waitMs, windowBackoff);
    }

    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    const scheduledTime = Date.now();
    windowTimestamps.push(scheduledTime);
    this.requestWindows.set(d, windowTimestamps);
    this.lastRequestTimes.set(d, scheduledTime);

    return waitMs;
  }
}

export interface WorkerCrawlerPoolOptions {
  /** Number of concurrent worker threads/tasks (default: 4) */
  concurrency?: number;
  /** Rate limiter configuration */
  rateLimiterConfig?: DomainRateLimitConfig;
}

export class WorkerCrawlerPool {
  private readonly concurrency: number;
  private readonly rateLimiter: SlidingWindowRateLimiter;
  private activeWorkers = 0;
  private isTerminated = false;

  constructor(options: WorkerCrawlerPoolOptions = {}) {
    this.concurrency = Math.max(1, options.concurrency ?? 4);
    this.rateLimiter = new SlidingWindowRateLimiter(options.rateLimiterConfig);
  }

  getConcurrency(): number {
    return this.concurrency;
  }

  getRateLimiter(): SlidingWindowRateLimiter {
    return this.rateLimiter;
  }

  /**
   * Executes a batch of crawl jobs concurrently across the worker pool
   * while strictly respecting per-host rate limits.
   */
  async executeJobs(
    jobs: CrawlJob[],
    fetchFn: (job: CrawlJob) => Promise<CrawlJobResult>,
  ): Promise<CrawlJobResult[]> {
    if (this.isTerminated || jobs.length === 0) {
      return [];
    }

    const results: CrawlJobResult[] = [];
    const queue = [...jobs];

    const workerLoop = async (): Promise<void> => {
      while (queue.length > 0 && !this.isTerminated) {
        const job = queue.shift();
        if (!job) break;

        let domain = 'localhost';
        try {
          domain = new URL(job.url).hostname;
        } catch {}

        // Enforce rate limiter before job execution
        await this.rateLimiter.acquirePermission(domain);

        try {
          this.activeWorkers++;
          const result = await fetchFn(job);
          results.push(result);
        } catch (err: any) {
          results.push({
            jobId: job.id,
            url: job.url,
            statusCode: 500,
            is304: false,
            durationMs: 0,
            error: err.message,
          });
        } finally {
          this.activeWorkers--;
        }
      }
    };

    const workerPromises: Promise<void>[] = [];
    const count = Math.min(this.concurrency, jobs.length);
    for (let i = 0; i < count; i++) {
      workerPromises.push(workerLoop());
    }

    await Promise.all(workerPromises);
    return results;
  }

  terminate(): void {
    this.isTerminated = true;
  }
}

/**
 * Factory helper for WorkerCrawlerPool.
 */
export function createWorkerCrawlerPool(
  options?: WorkerCrawlerPoolOptions,
): WorkerCrawlerPool {
  return new WorkerCrawlerPool(options);
}
