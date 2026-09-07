import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as fs from 'node:fs';
import { AppConfig, loadConfig } from '@opensearch/shared';
import {
  createStorageAdapter,
  StorageAdapter,
} from '@opensearch/storage';
import {
  createCrawlQueue,
  CrawlQueue,
  HttpFetcher,
  FetchTarget,
  FetchResult,
  RobotsPolicyEvaluator,
  RobotsPolicyDecision,
  ROBOTS_DECISION_REASON,
  createHtmlParser,
  createCrawlOrchestrator,
} from '../src/index.js';

class MockHttpFetcher implements HttpFetcher {
  private responses = new Map<
    string,
    { status: number; bodyText: string; contentType?: string; headers?: Record<string, string>; delayMs?: number }
  >();
  public callCount = 0;
  public concurrentCalls = 0;
  public peakConcurrency = 0;

  setResponse(
    url: string,
    status: number,
    bodyText: string,
    contentType = 'text/html; charset=utf-8',
    headers: Record<string, string> = {},
    delayMs = 0,
  ) {
    this.responses.set(url, { status, bodyText, contentType, headers, delayMs });
  }

  async fetch(target: FetchTarget): Promise<FetchResult> {
    this.callCount++;
    this.concurrentCalls++;
    if (this.concurrentCalls > this.peakConcurrency) {
      this.peakConcurrency = this.concurrentCalls;
    }

    const mock = this.responses.get(target.url);

    if (mock?.delayMs && mock.delayMs > 0) {
      await new Promise((r) => setTimeout(r, mock.delayMs));
    }

    this.concurrentCalls--;

    if (!mock) {
      return {
        ok: false,
        url: target.url,
        code: 'NOT_FOUND',
        message: `No mock response configured for ${target.url}`,
        statusCode: 404,
        retriesExhausted: false,
        durationMs: 5,
        redirectCount: 0,
        retryCount: 0,
      };
    }

    if (mock.status >= 400) {
      return {
        ok: false,
        url: target.url,
        code: 'HTTP_ERROR',
        message: `HTTP ${mock.status}`,
        statusCode: mock.status,
        retriesExhausted: false,
        durationMs: 5,
        redirectCount: 0,
        retryCount: 0,
      };
    }

    return {
      ok: true,
      url: target.url,
      finalUrl: target.url,
      statusCode: mock.status,
      contentType: mock.contentType ?? 'text/html',
      bodyText: mock.bodyText,
      contentLength: mock.bodyText.length,
      headers: mock.headers ?? {},
      redirectChain: [],
      redirectCount: 0,
      retryCount: 0,
      durationMs: 5,
    };
  }
}

class MockRobotsEvaluator implements RobotsPolicyEvaluator {
  private disallowedUrls = new Set<string>();

  disallow(url: string) {
    this.disallowedUrls.add(url);
  }

  async isUrlAllowed(url: string, _customUserAgent?: string): Promise<RobotsPolicyDecision> {
    const disallowed = this.disallowedUrls.has(url);
    const parsed = new URL(url);
    return {
      allowed: !disallowed,
      reason: disallowed
        ? ROBOTS_DECISION_REASON.MATCHED_DISALLOW
        : ROBOTS_DECISION_REASON.ALLOWED_BY_DEFAULT,
      matchedPattern: disallowed ? url : undefined,
      matchedType: disallowed ? 'disallow' : 'allow',
      origin: parsed.origin,
      cached: false,
    };
  }

  async getCrawlDelayMs(
    _originOrUrl: string,
    _customUserAgent?: string,
  ): Promise<number | undefined> {
    return 0;
  }

  async clearCache(): Promise<void> {}
}

describe('Phase 29 — Crawler Efficiency & Resource Controls', () => {
  let testDir: string;
  let config: AppConfig;
  let storage: StorageAdapter;
  let queue: CrawlQueue;
  let mockFetcher: MockHttpFetcher;
  let mockRobots: MockRobotsEvaluator;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'opensearch-eff-test-'));
    config = loadConfig({
      NODE_ENV: 'test',
      STORAGE_DIR: join(testDir, 'storage'),
      INDEX_DIR: join(testDir, 'index'),
      CRAWLER_DATA_DIR: testDir,
      CRAWLER_POLITENESS_DELAY_MS: '200',
      CRAWLER_MAX_RETRIES: '1',
      CRAWLER_MAX_DEPTH: '3',
      CRAWLER_MAX_PAGES: '10',
      CRAWLER_MAX_CONCURRENCY: '3',
      CRAWLER_RETRY_BUDGET: '5',
      CRAWLER_CHECKPOINT_INTERVAL_PAGES: '2',
      CRAWLER_USER_AGENT: 'OpenSearchBot/1.0',
    });

    storage = createStorageAdapter({ config });
    queue = createCrawlQueue({ config });
    mockFetcher = new MockHttpFetcher();
    mockRobots = new MockRobotsEvaluator();
  });

  afterEach(async () => {
    try {
      await storage.close();
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('respects configurable crawl limit maxPages', async () => {
    mockFetcher.setResponse('https://example.com/1', 200, '<html><body>Page 1</body></html>');
    mockFetcher.setResponse('https://example.com/2', 200, '<html><body>Page 2</body></html>');
    mockFetcher.setResponse('https://example.com/3', 200, '<html><body>Page 3</body></html>');

    const orchestrator = createCrawlOrchestrator({
      config,
      storage,
      queue,
      fetcher: mockFetcher,
      robotsEvaluator: mockRobots,
      parser: createHtmlParser(),
    });

    await orchestrator.initialize();
    await orchestrator.addSeeds([
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3',
    ]);

    const summary = await orchestrator.start({ maxPages: 2, politenessDelayMs: 0 });

    expect(summary.status).toBe('limit_reached');
    expect(summary.stats.pagesFetched).toBe(2);

    await orchestrator.close();
  });

  it('bounds worker concurrency controls', async () => {
    mockFetcher.setResponse('https://example.com/1', 200, '<html><body>Page 1</body></html>', 'text/html', {}, 30);
    mockFetcher.setResponse('https://example.com/2', 200, '<html><body>Page 2</body></html>', 'text/html', {}, 30);
    mockFetcher.setResponse('https://example.com/3', 200, '<html><body>Page 3</body></html>', 'text/html', {}, 30);
    mockFetcher.setResponse('https://example.com/4', 200, '<html><body>Page 4</body></html>', 'text/html', {}, 30);

    const orchestrator = createCrawlOrchestrator({
      config,
      storage,
      queue,
      fetcher: mockFetcher,
      robotsEvaluator: mockRobots,
      parser: createHtmlParser(),
    });

    await orchestrator.initialize();
    await orchestrator.addSeeds([
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3',
      'https://example.com/4',
    ]);

    const summary = await orchestrator.start({ maxConcurrency: 3, politenessDelayMs: 0 });

    expect(summary.status).toBe('completed');
    expect(summary.stats.pagesFetched).toBe(4);
    expect(mockFetcher.peakConcurrency).toBeLessThanOrEqual(3);

    await orchestrator.close();
  });

  it('tracks retry budgets and prevents retry storms on failed targets', async () => {
    mockFetcher.setResponse('https://example.com/fail1', 500, 'Server Error');
    mockFetcher.setResponse('https://example.com/fail2', 500, 'Server Error');
    mockFetcher.setResponse('https://example.com/fail3', 500, 'Server Error');

    const orchestrator = createCrawlOrchestrator({
      config,
      storage,
      queue,
      fetcher: mockFetcher,
      robotsEvaluator: mockRobots,
      parser: createHtmlParser(),
    });

    await orchestrator.initialize();
    await orchestrator.addSeeds([
      'https://example.com/fail1',
      'https://example.com/fail2',
      'https://example.com/fail3',
    ]);

    const summary = await orchestrator.start({ retryBudget: 2, politenessDelayMs: 0 });

    expect(summary.stats.fetchErrors).toBe(3);
    expect(summary.stats.retriesConsumed).toBe(2);
    expect(summary.stats.retryBudgetExhaustedCount).toBe(1);

    await orchestrator.close();
  });

  it('saves progress checkpoints to disk periodically', async () => {
    mockFetcher.setResponse('https://example.com/1', 200, '<html><body>Page 1</body></html>');
    mockFetcher.setResponse('https://example.com/2', 200, '<html><body>Page 2</body></html>');

    const checkpointFile = join(testDir, 'crawl-checkpoint.json');
    const orchestrator = createCrawlOrchestrator({
      config,
      storage,
      queue,
      fetcher: mockFetcher,
      robotsEvaluator: mockRobots,
      parser: createHtmlParser(),
    });

    await orchestrator.initialize();
    await orchestrator.addSeeds([
      'https://example.com/1',
      'https://example.com/2',
    ]);

    const summary = await orchestrator.start({
      checkpointIntervalPages: 1,
      checkpointPath: checkpointFile,
      politenessDelayMs: 0,
    });

    expect(summary.status).toBe('completed');
    expect(fs.existsSync(checkpointFile)).toBe(true);

    const raw = fs.readFileSync(checkpointFile, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.runId).toBe(summary.runId);
    expect(parsed.stats.pagesFetched).toBe(2);
    expect(summary.stats.checkpointsSaved).toBeGreaterThanOrEqual(1);

    await orchestrator.close();
  });

  it('allows clean crawl stop via AbortController signal', async () => {
    mockFetcher.setResponse('https://example.com/1', 200, '<html><body>Page 1</body></html>', 'text/html', {}, 100);
    mockFetcher.setResponse('https://example.com/2', 200, '<html><body>Page 2</body></html>', 'text/html', {}, 100);

    const orchestrator = createCrawlOrchestrator({
      config,
      storage,
      queue,
      fetcher: mockFetcher,
      robotsEvaluator: mockRobots,
      parser: createHtmlParser(),
    });

    await orchestrator.initialize();
    await orchestrator.addSeeds([
      'https://example.com/1',
      'https://example.com/2',
    ]);

    const abortController = new AbortController();
    setTimeout(() => abortController.abort(), 15);

    const summary = await orchestrator.start({
      signal: abortController.signal,
      politenessDelayMs: 0,
    });

    expect(summary.status).toBe('stopped');
    expect(summary.message).toContain('aborted');

    await orchestrator.close();
  });
});
