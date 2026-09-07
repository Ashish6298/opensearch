/**
 * @opensearch/crawler — Crawl Orchestrator Implementation (Phase 8)
 *
 * Coordinates the full end-to-end crawling lifecycle:
 * 1. Seed loading & queue seeding with URL validation
 * 2. Crawl loop dequeuing URLs in FIFO order
 * 3. Crawl limits enforcement (maxPages, maxDepth, cancellation signal)
 * 4. Robots.txt policy check (skips and logs disallowed paths)
 * 5. Politeness scheduling (domain-aware delay + robots.txt crawl-delay)
 * 6. HTTP resource fetching with timeout, size limits & retry backoff
 * 7. HTML parsing, metadata & visible text extraction
 * 8. Outbound link discovery, filtering & persistent queue insertion
 * 9. Storage persistence (DocumentRecord, UrlRecord, CrawlRecord)
 * 10. Live statistics tracking & graceful shutdown/resume
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppConfig, Logger, createLogger } from '@opensearch/shared';
import { CRAWL_STATUS, INDEX_STATUS, StorageAdapter } from '@opensearch/storage';

import { CrawlQueue } from '../queue/queue-types.js';
import { ENQUEUE_RESULT } from '../url/url-model.js';
import { computeUrlHash } from '../url/url-fingerprint.js';
import { HttpFetcher } from '../fetcher/fetcher-types.js';
import { RobotsPolicyEvaluator } from '../robots/robots-types.js';
import { HtmlParser } from '../parser/parser-types.js';
import {
  CrawlCheckpoint,
  CrawlOrchestrator,
  CrawlRunOptions,
  CrawlRunStats,
  CrawlSummary,
  ProcessedPageOutcome,
} from './orchestrator-types.js';

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface CrawlOrchestratorOptions {
  config: AppConfig;
  queue: CrawlQueue;
  storage: StorageAdapter;
  fetcher: HttpFetcher;
  robotsEvaluator: RobotsPolicyEvaluator;
  parser: HtmlParser;
  logger?: Logger;
}

export class DefaultCrawlOrchestrator implements CrawlOrchestrator {
  private readonly config: AppConfig;
  private readonly queue: CrawlQueue;
  private readonly storage: StorageAdapter;
  private readonly fetcher: HttpFetcher;
  private readonly robotsEvaluator: RobotsPolicyEvaluator;
  private readonly parser: HtmlParser;
  private readonly logger: Logger;

  private isRunning = false;
  private shouldStop = false;
  private initialized = false;

  // Domain -> timestamp of last request start
  private readonly domainLastRequestMs = new Map<string, number>();

  private stats: CrawlRunStats;

  constructor(options: CrawlOrchestratorOptions) {
    this.config = options.config;
    this.queue = options.queue;
    this.storage = options.storage;
    this.fetcher = options.fetcher;
    this.robotsEvaluator = options.robotsEvaluator;
    this.parser = options.parser;
    this.logger = options.logger ?? createLogger('@opensearch/crawler:orchestrator');

    this.stats = this.createInitialStats('idle');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info('Initializing crawl orchestrator');
    await this.queue.initialize();
    await this.storage.initialize();
    this.initialized = true;
    this.logger.info('Crawl orchestrator initialized successfully');
  }

  async addSeeds(seeds: string[]): Promise<number> {
    this.requireInitialized();
    let queuedCount = 0;

    for (const seed of seeds) {
      const outcome = await this.queue.enqueue(seed, 0, null);
      if (outcome.code === ENQUEUE_RESULT.QUEUED && outcome.entry) {
        queuedCount++;

        // Also track seed in UrlRepository if not already present
        const urlHash = computeUrlHash(outcome.entry.normalizedUrl);
        const existing = await this.storage.urls.findByHash(urlHash);
        if (!existing) {
          try {
            const parsed = new URL(outcome.entry.normalizedUrl);
            await this.storage.urls.create({
              url: outcome.entry.normalizedUrl,
              urlHash,
              domain: parsed.hostname,
              scheme: parsed.protocol === 'https:' ? 'https' : 'http',
              crawlStatus: CRAWL_STATUS.PENDING,
              referrerUrl: null,
              depth: 0,
              lastHttpStatus: null,
            });
          } catch (err) {
            this.logger.warn('Failed to insert URL record for seed', { seed, err });
          }
        }
      }
    }

    this.logger.info('Seeds loaded into crawl queue', {
      totalSeeds: seeds.length,
      queued: queuedCount,
    });

    return queuedCount;
  }

  async start(options?: CrawlRunOptions): Promise<CrawlSummary> {
    this.requireInitialized();

    if (this.isRunning) {
      throw new Error('Crawl orchestrator is already running');
    }

    this.isRunning = true;
    this.shouldStop = false;

    const runId = randomUUID();
    const maxPages = options?.maxPages ?? this.config.crawler.maxPages;
    const maxDepth = options?.maxDepth ?? this.config.crawler.maxDepth;
    const defaultPolitenessMs = options?.politenessDelayMs ?? this.config.crawler.politenessDelayMs;
    const maxConcurrency = Math.min(
      options?.maxConcurrency ?? this.config.crawler.maxConcurrency ?? 1,
      10,
    );
    const retryBudget = options?.retryBudget ?? this.config.crawler.retryBudget ?? 50;
    const checkpointInterval =
      options?.checkpointIntervalPages ?? this.config.crawler.checkpointIntervalPages ?? 10;
    const checkpointPath =
      options?.checkpointPath ??
      path.join(this.config.storage.crawlerDataDir, 'crawl-checkpoint.json');

    this.stats = this.createInitialStats(runId);
    this.stats.state = 'running';

    this.logger.info('Starting crawl run', {
      runId,
      maxPages,
      maxDepth,
      defaultPolitenessMs,
      maxConcurrency,
      retryBudget,
      checkpointInterval,
      initialQueueSize: await this.queue.size(),
    });

    // Enqueue initial seeds if provided in options
    if (options?.seeds && options.seeds.length > 0) {
      await this.addSeeds(options.seeds);
    }

    let summaryStatus: 'completed' | 'stopped' | 'limit_reached' | 'failed' = 'completed';
    let summaryMessage = 'Crawl completed normally';

    const startRunMs = Date.now();
    let reservedPages = 0;
    let retriesRemaining = retryBudget;
    let lastCheckpointPageCount = 0;
    let activeWorkers = 0;

    const workerLoop = async (): Promise<void> => {
      while (!this.shouldStop && !options?.signal?.aborted) {
        if (reservedPages >= maxPages || this.stats.pagesFetched >= maxPages) {
          summaryStatus = 'limit_reached';
          summaryMessage = `Reached maximum page limit of ${maxPages}`;
          break;
        }

        const item = await this.queue.dequeue();
        if (!item) {
          // No items available right now
          break;
        }

        if (reservedPages >= maxPages || this.stats.pagesFetched >= maxPages) {
          summaryStatus = 'limit_reached';
          summaryMessage = `Reached maximum page limit of ${maxPages}`;
          break;
        }

        if (item.depth > maxDepth) {
          this.logger.debug('Skipping URL exceeding maxDepth', {
            url: item.normalizedUrl,
            depth: item.depth,
            maxDepth,
          });
          continue;
        }

        reservedPages++;
        activeWorkers++;
        this.stats.activeWorkers = activeWorkers;

        try {
          const outcome = await this.processItem(
            item.normalizedUrl,
            item.depth,
            defaultPolitenessMs,
            maxDepth,
            retriesRemaining,
          );

          if (outcome.status === CRAWL_STATUS.FAILED) {
            reservedPages--; // failed fetch did not count as a fetched page
            if (retriesRemaining > 0) {
              retriesRemaining--;
              this.stats.retriesConsumed++;
            } else {
              this.stats.retryBudgetExhaustedCount++;
            }
          }

          // Progress Checkpointing (Phase 29)
          if (
            this.stats.pagesFetched - lastCheckpointPageCount >= checkpointInterval &&
            this.stats.pagesFetched > 0
          ) {
            lastCheckpointPageCount = this.stats.pagesFetched;
            await this.saveCheckpoint(checkpointPath, {
              maxPages,
              maxDepth,
              politenessDelayMs: defaultPolitenessMs,
              maxConcurrency,
            });
          }
        } finally {
          activeWorkers--;
          this.stats.activeWorkers = activeWorkers;
          this.stats.queuePending = await this.queue.size();
          this.stats.durationMs = Date.now() - startRunMs;
        }
      }
    };

    try {
      if (maxConcurrency <= 1) {
        await workerLoop();
      } else {
        const workers: Promise<void>[] = [];
        for (let i = 0; i < maxConcurrency; i++) {
          workers.push(workerLoop());
        }
        await Promise.all(workers);
      }

      if (options?.signal?.aborted) {
        summaryStatus = 'stopped';
        summaryMessage = 'Crawl aborted by external signal';
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('Fatal error in crawl loop', { error: msg, runId });
      summaryStatus = 'failed';
      summaryMessage = `Crawl failed with error: ${msg}`;
    } finally {
      this.isRunning = false;
      this.stats.state = summaryStatus === 'completed' ? 'completed' : 'stopped';
      this.stats.finishedAt = new Date().toISOString();
      this.stats.durationMs = Date.now() - startRunMs;
      this.stats.queuePending = await this.queue.size();
      this.stats.queueSeen = this.queue.stats().seenCount;
      this.stats.activeWorkers = 0;

      // Final checkpoint save
      await this.saveCheckpoint(checkpointPath, {
        maxPages,
        maxDepth,
        politenessDelayMs: defaultPolitenessMs,
        maxConcurrency,
      });

      this.logger.info('Crawl run finished', {
        runId,
        status: summaryStatus,
        pagesFetched: this.stats.pagesFetched,
        pagesStored: this.stats.pagesStored,
        linksDiscovered: this.stats.linksDiscovered,
        errors: this.stats.fetchErrors,
        retriesConsumed: this.stats.retriesConsumed,
        durationMs: this.stats.durationMs,
      });
    }

    return {
      runId,
      status: summaryStatus,
      stats: { ...this.stats },
      message: summaryMessage,
    };
  }

  async saveCheckpoint(
    checkpointPath: string,
    options: {
      maxPages: number;
      maxDepth: number;
      politenessDelayMs: number;
      maxConcurrency: number;
    },
  ): Promise<void> {
    try {
      const checkpoint: CrawlCheckpoint = {
        version: 1,
        runId: this.stats.crawlRunId,
        savedAt: new Date().toISOString(),
        stats: { ...this.stats },
        options,
      };

      const dir = path.dirname(checkpointPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tmpFile = `${checkpointPath}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(checkpoint, null, 2), 'utf-8');
      fs.renameSync(tmpFile, checkpointPath);

      this.stats.checkpointsSaved++;
      this.logger.debug('Crawl checkpoint saved', {
        pagesFetched: this.stats.pagesFetched,
        checkpointPath,
      });
    } catch (err) {
      this.logger.warn('Failed to write crawl checkpoint', { error: String(err) });
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.logger.info('Graceful stop requested');
    this.shouldStop = true;
  }

  getStats(): CrawlRunStats {
    return { ...this.stats };
  }

  async close(): Promise<void> {
    await this.stop();
    await this.queue.close();
    await this.storage.close();
    this.initialized = false;
    this.logger.info('Crawl orchestrator closed');
  }

  // ── Core Page Processor ───────────────────────────────────────────────────

  private async processItem(
    url: string,
    depth: number,
    defaultPolitenessMs: number,
    maxDepth: number,
    retriesRemaining = 50,
  ): Promise<ProcessedPageOutcome> {
    const startMs = Date.now();
    const urlHash = computeUrlHash(url);
    let domain = '';
    let scheme: 'http' | 'https' = 'https';

    try {
      const p = new URL(url);
      domain = p.hostname;
      scheme = p.protocol === 'http:' ? 'http' : 'https';
    } catch {
      // should not happen since queue items are validated
    }

    // 1. Robots.txt Policy Check
    const robotsDecision = await this.robotsEvaluator.isUrlAllowed(url);
    if (!robotsDecision.allowed) {
      this.stats.robotsDisallowed++;
      this.logger.info('URL disallowed by robots.txt', {
        url,
        matchedPattern: robotsDecision.matchedPattern,
      });

      // Update or create UrlRecord as DISALLOWED
      await this.upsertUrlStatus(
        url,
        urlHash,
        domain,
        scheme,
        depth,
        CRAWL_STATUS.DISALLOWED,
        null,
      );

      return {
        url,
        urlHash,
        depth,
        status: CRAWL_STATUS.DISALLOWED,
        discoveredLinksCount: 0,
        durationMs: Date.now() - startMs,
      };
    }

    // 2. Politeness Scheduling (Domain Delay)
    const effectiveDelayMs = Math.max(defaultPolitenessMs, robotsDecision.crawlDelayMs ?? 0);
    await this.applyPoliteness(domain, effectiveDelayMs);

    // 3. Mark in-progress in UrlRecord & create CrawlRecord
    await this.upsertUrlStatus(url, urlHash, domain, scheme, depth, CRAWL_STATUS.IN_PROGRESS, null);

    const crawlRecordStartedAt = new Date().toISOString();

    // 4. Execute HTTP Fetch
    const fetchResult = await this.fetcher.fetch({ url, depth });

    if (!fetchResult.ok) {
      this.stats.fetchErrors++;
      const durationMs = Date.now() - startMs;

      this.logger.warn('Failed to fetch page', {
        url,
        code: fetchResult.code,
        statusCode: fetchResult.statusCode,
        message: fetchResult.message,
        retriesRemaining,
      });

      // Update UrlRecord & CrawlRecord
      await this.upsertUrlStatus(
        url,
        urlHash,
        domain,
        scheme,
        depth,
        CRAWL_STATUS.FAILED,
        fetchResult.statusCode ?? null,
      );

      await this.storage.crawls.create({
        url,
        urlHash,
        status: CRAWL_STATUS.FAILED,
        httpStatus: fetchResult.statusCode ?? null,
        contentType: fetchResult.contentType ?? null,
        responseBytes: null,
        durationMs,
        startedAt: crawlRecordStartedAt,
        completedAt: new Date().toISOString(),
        errorMessage: fetchResult.message,
        redirectChain: [],
        finalUrl: fetchResult.finalUrl ?? url,
        documentId: null,
      });

      return {
        url,
        urlHash,
        depth,
        status: CRAWL_STATUS.FAILED,
        httpStatus: fetchResult.statusCode,
        errorMessage: fetchResult.message,
        discoveredLinksCount: 0,
        durationMs,
      };
    }

    // 5. Success Fetch — Parse HTML and extract document content
    this.stats.pagesFetched++;
    const parsedDoc = this.parser.parse(fetchResult.body, fetchResult.finalUrl);

    // 6. Store DocumentRecord in DocumentRepository
    let storedDocId: string | null = null;
    try {
      const existingDoc = await this.storage.documents.findByUrlHash(urlHash);
      if (existingDoc) {
        const updated = await this.storage.documents.update(existingDoc.id, {
          title: parsedDoc.title,
          description: parsedDoc.description,
          headings: parsedDoc.headings,
          bodyText: parsedDoc.bodyText,
          language: parsedDoc.language,
          contentType: fetchResult.contentType,
          contentLength: fetchResult.contentLength,
          httpStatus: fetchResult.statusCode,
          outboundLinks: parsedDoc.discoveredUrls,
          indexStatus: INDEX_STATUS.PENDING,
        });
        storedDocId = updated.id;
      } else {
        const created = await this.storage.documents.create({
          url: parsedDoc.canonicalUrl || fetchResult.finalUrl,
          urlHash,
          title: parsedDoc.title,
          description: parsedDoc.description,
          headings: parsedDoc.headings,
          bodyText: parsedDoc.bodyText,
          language: parsedDoc.language,
          contentType: fetchResult.contentType,
          contentLength: fetchResult.contentLength,
          httpStatus: fetchResult.statusCode,
          outboundLinks: parsedDoc.discoveredUrls,
          indexStatus: INDEX_STATUS.PENDING,
        });
        storedDocId = created.id;
      }
      this.stats.pagesStored++;
    } catch (err) {
      this.logger.error('Failed to store document in storage', { url, err });
    }

    // 7. Store Crawl Event Record
    const durationMs = Date.now() - startMs;
    await this.storage.crawls.create({
      url,
      urlHash,
      status: CRAWL_STATUS.SUCCESS,
      httpStatus: fetchResult.statusCode,
      contentType: fetchResult.contentType,
      responseBytes: fetchResult.contentLength,
      durationMs,
      startedAt: crawlRecordStartedAt,
      completedAt: new Date().toISOString(),
      errorMessage: null,
      redirectChain: fetchResult.redirectChain,
      finalUrl: fetchResult.finalUrl,
      documentId: storedDocId,
    });

    // 8. Update URL record as SUCCESS
    await this.upsertUrlStatus(
      url,
      urlHash,
      domain,
      scheme,
      depth,
      CRAWL_STATUS.SUCCESS,
      fetchResult.statusCode,
    );

    // 9. Discover & Enqueue Outbound Links (if depth < maxDepth)
    let enqueuedLinksCount = 0;
    if (depth < maxDepth) {
      for (const nextUrl of parsedDoc.discoveredUrls) {
        const enqueueOutcome = await this.queue.enqueue(nextUrl, depth + 1, url);
        if (enqueueOutcome.code === ENQUEUE_RESULT.QUEUED && enqueueOutcome.entry) {
          enqueuedLinksCount++;
          this.stats.linksDiscovered++;

          // Register in UrlRepository as PENDING
          const nextHash = computeUrlHash(enqueueOutcome.entry.normalizedUrl);
          const existing = await this.storage.urls.findByHash(nextHash);
          if (!existing) {
            try {
              const np = new URL(enqueueOutcome.entry.normalizedUrl);
              await this.storage.urls.create({
                url: enqueueOutcome.entry.normalizedUrl,
                urlHash: nextHash,
                domain: np.hostname,
                scheme: np.protocol === 'https:' ? 'https' : 'http',
                crawlStatus: CRAWL_STATUS.PENDING,
                referrerUrl: url,
                depth: depth + 1,
                lastHttpStatus: null,
              });
            } catch {
              // ignore
            }
          }
        } else if (enqueueOutcome.code === ENQUEUE_RESULT.DUPLICATE_SKIPPED) {
          this.stats.duplicatesSkipped++;
        }
      }
    }

    this.logger.debug('Page processed successfully', {
      url,
      title: parsedDoc.title.slice(0, 50),
      linksDiscovered: enqueuedLinksCount,
      durationMs,
    });

    return {
      url,
      urlHash,
      depth,
      status: CRAWL_STATUS.SUCCESS,
      httpStatus: fetchResult.statusCode,
      documentId: storedDocId,
      discoveredLinksCount: enqueuedLinksCount,
      durationMs,
    };
  }

  // ── Helper Utilities ──────────────────────────────────────────────────────

  private async applyPoliteness(domain: string, delayMs: number): Promise<void> {
    if (delayMs <= 0 || !domain) return;

    const lastTime = this.domainLastRequestMs.get(domain);
    const now = Date.now();

    if (lastTime !== undefined) {
      const elapsed = now - lastTime;
      if (elapsed < delayMs) {
        const waitTime = delayMs - elapsed;
        this.logger.debug('Politeness delay applied', { domain, waitTime });
        await sleep(waitTime);
      }
    }

    this.domainLastRequestMs.set(domain, Date.now());
  }

  private async upsertUrlStatus(
    url: string,
    urlHash: string,
    domain: string,
    scheme: 'http' | 'https',
    depth: number,
    status: (typeof CRAWL_STATUS)[keyof typeof CRAWL_STATUS],
    httpStatus: number | null,
  ): Promise<void> {
    try {
      const existing = await this.storage.urls.findByHash(urlHash);
      const now = Date.now();
      if (existing) {
        await this.storage.urls.update(urlHash, {
          crawlStatus: status,
          lastAttemptedAt: now,
          lastHttpStatus: httpStatus,
          attemptCount: (existing.attemptCount || 0) + 1,
          ...(status === CRAWL_STATUS.SUCCESS ? { lastSucceededAt: now } : {}),
        });
      } else {
        await this.storage.urls.create({
          url,
          urlHash,
          domain,
          scheme,
          crawlStatus: status,
          referrerUrl: null,
          depth,
          lastHttpStatus: httpStatus,
          attemptCount: 1,
        });
      }
    } catch (err) {
      this.logger.warn('Failed to upsert URL record', { url, status, err });
    }
  }

  private requireInitialized(): void {
    if (!this.initialized) {
      throw new Error('CrawlOrchestrator must be initialized before use. Call initialize() first.');
    }
  }

  private createInitialStats(crawlRunId: string): CrawlRunStats {
    return {
      crawlRunId,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      state: 'idle',
      pagesFetched: 0,
      pagesStored: 0,
      fetchErrors: 0,
      robotsDisallowed: 0,
      linksDiscovered: 0,
      duplicatesSkipped: 0,
      queuePending: 0,
      queueSeen: 0,
      durationMs: 0,
      retriesConsumed: 0,
      retryBudgetExhaustedCount: 0,
      activeWorkers: 0,
      checkpointsSaved: 0,
    };
  }
}
