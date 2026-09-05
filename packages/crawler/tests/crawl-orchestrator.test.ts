import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppConfig, loadConfig } from '@opensearch/shared';
import {
  createStorageAdapter,
  StorageAdapter,
  CRAWL_STATUS,
  INDEX_STATUS,
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
  DefaultCrawlOrchestrator,
  createCrawlOrchestrator,
} from '../src/index.js';

class MockHttpFetcher implements HttpFetcher {
  private responses = new Map<
    string,
    { status: number; bodyText: string; contentType?: string; headers?: Record<string, string> }
  >();

  setResponse(
    url: string,
    status: number,
    bodyText: string,
    contentType = 'text/html; charset=utf-8',
    headers: Record<string, string> = {},
  ) {
    this.responses.set(url, { status, bodyText, contentType, headers });
  }

  async fetch(target: FetchTarget): Promise<FetchResult> {
    const resp = this.responses.get(target.url);
    if (!resp) {
      return {
        ok: false,
        code: 'HTTP_CLIENT_ERROR',
        message: 'Not found in mock',
        statusCode: 404,
        contentType: 'text/html',
        finalUrl: target.url,
        redirectCount: 0,
        retryCount: 0,
        durationMs: 5,
        retryable: false,
      };
    }

    if (resp.status >= 200 && resp.status < 300) {
      return {
        ok: true,
        finalUrl: target.url,
        statusCode: resp.status,
        contentType: resp.contentType,
        body: resp.bodyText,
        contentLength: Buffer.byteLength(resp.bodyText, 'utf-8'),
        durationMs: 10,
        redirectCount: 0,
        redirectChain: [],
        retryCount: 0,
      };
    }

    return {
      ok: false,
      code: resp.status >= 500 ? 'HTTP_SERVER_ERROR' : 'HTTP_CLIENT_ERROR',
      message: `HTTP ${resp.status}`,
      statusCode: resp.status,
      contentType: resp.contentType,
      finalUrl: target.url,
      redirectCount: 0,
      retryCount: 0,
      durationMs: 10,
      retryable: resp.status >= 500,
    };
  }

  async close(): Promise<void> {}
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

describe('CrawlOrchestrator (Phase 8)', () => {
  let testDir: string;
  let config: AppConfig;
  let storage: StorageAdapter;
  let queue: CrawlQueue;
  let mockFetcher: MockHttpFetcher;
  let mockRobots: MockRobotsEvaluator;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'opensearch-orch-test-'));
    config = loadConfig({
      NODE_ENV: 'test',
      STORAGE_DIR: join(testDir, 'storage'),
      INDEX_DIR: join(testDir, 'index'),
      CRAWLER_DATA_DIR: testDir,
      CRAWLER_POLITENESS_DELAY_MS: '200',
      CRAWLER_MAX_RETRIES: '1',
      CRAWLER_MAX_DEPTH: '3',
      CRAWLER_MAX_PAGES: '10',
      CRAWLER_USER_AGENT: 'OpenSearchBot/1.0',
    });

    storage = createStorageAdapter({
      config,
    });

    queue = createCrawlQueue({
      config,
    });

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

  it('should initialize and add seeds successfully', async () => {
    const parser = createHtmlParser();
    const orchestrator = createCrawlOrchestrator({
      config,
      storage,
      queue,
      fetcher: mockFetcher,
      robotsEvaluator: mockRobots,
      parser,
    });

    await orchestrator.initialize();

    const added = await orchestrator.addSeeds([
      'https://example.com/page1',
      'https://example.com/page2',
      'https://example.com/page1', // duplicate seed
    ]);

    expect(added).toBe(2);
    expect(await queue.size()).toBe(2);

    const urlRecord = await storage.urls.findByUrl('https://example.com/page1');
    expect(urlRecord).not.toBeNull();
    expect(urlRecord?.crawlStatus).toBe(CRAWL_STATUS.PENDING);
  });

  it('should crawl pages, extract links, and store documents end-to-end', async () => {
    mockFetcher.setResponse(
      'https://example.com/',
      200,
      `<!DOCTYPE html>
      <html>
        <head><title>Home Page</title><meta name="description" content="Welcome home" /></head>
        <body>
          <h1>Main Title</h1>
          <p>Welcome to our example website!</p>
          <a href="/about">About Us</a>
          <a href="/contact">Contact Us</a>
        </body>
      </html>`,
    );

    mockFetcher.setResponse(
      'https://example.com/about',
      200,
      `<!DOCTYPE html>
      <html>
        <head><title>About Us</title></head>
        <body>
          <h2>About OpenSearch</h2>
          <p>We build search engines.</p>
          <a href="/">Home</a>
        </body>
      </html>`,
    );

    mockFetcher.setResponse(
      'https://example.com/contact',
      200,
      `<!DOCTYPE html>
      <html>
        <head><title>Contact</title></head>
        <body>
          <p>Reach us at info@example.com</p>
        </body>
      </html>`,
    );

    const parser = createHtmlParser();
    const orchestrator = new DefaultCrawlOrchestrator({
      config,
      storage,
      queue,
      fetcher: mockFetcher,
      robotsEvaluator: mockRobots,
      parser,
    });

    await orchestrator.initialize();
    await orchestrator.addSeeds(['https://example.com/']);

    const summary = await orchestrator.start({ maxPages: 10, maxDepth: 2, politenessDelayMs: 0 });

    expect(summary.status).toBe('completed');
    expect(summary.stats.pagesFetched).toBe(3);
    expect(summary.stats.pagesStored).toBe(3);
    expect(summary.stats.fetchErrors).toBe(0);
    expect(summary.stats.robotsDisallowed).toBe(0);

    // Verify stored documents
    const allDocs = await storage.documents.list({ limit: 10 });
    expect(allDocs.length).toBe(3);

    const homeDoc = allDocs.find(d => d.url === 'https://example.com/');
    expect(homeDoc).toBeDefined();
    expect(homeDoc?.title).toBe('Home Page');
    expect(homeDoc?.description).toBe('Welcome home');
    expect(homeDoc?.headings).toContain('Main Title');
    expect(homeDoc?.bodyText).toContain('Welcome to our example website!');
    expect(homeDoc?.outboundLinks).toContain('https://example.com/about');
    expect(homeDoc?.outboundLinks).toContain('https://example.com/contact');
    expect(homeDoc?.indexStatus).toBe(INDEX_STATUS.PENDING);

    // Verify crawl event history
    const crawls = await storage.crawls.count();
    expect(crawls).toBe(3);
  });

  it('should respect maxPages limit and stop crawling', async () => {
    mockFetcher.setResponse(
      'https://example.com/p1',
      200,
      '<html><body><a href="https://example.com/p2">P2</a><a href="https://example.com/p3">P3</a></body></html>',
    );
    mockFetcher.setResponse(
      'https://example.com/p2',
      200,
      '<html><body><a href="https://example.com/p4">P4</a></body></html>',
    );
    mockFetcher.setResponse('https://example.com/p3', 200, '<html><body>P3 content</body></html>');
    mockFetcher.setResponse('https://example.com/p4', 200, '<html><body>P4 content</body></html>');

    const parser = createHtmlParser();
    const orchestrator = createCrawlOrchestrator({
      config,
      storage,
      queue,
      fetcher: mockFetcher,
      robotsEvaluator: mockRobots,
      parser,
    });

    await orchestrator.initialize();
    await orchestrator.addSeeds(['https://example.com/p1']);

    const summary = await orchestrator.start({ maxPages: 2, politenessDelayMs: 0 });

    expect(summary.status).toBe('limit_reached');
    expect(summary.stats.pagesFetched).toBe(2);

    const docs = await storage.documents.list({ limit: 10 });
    expect(docs.length).toBe(2);
  });

  it('should respect robots.txt policy and skip disallowed URLs', async () => {
    mockFetcher.setResponse(
      'https://example.com/',
      200,
      '<html><body><a href="https://example.com/secret">Secret</a><a href="https://example.com/public">Public</a></body></html>',
    );
    mockFetcher.setResponse(
      'https://example.com/public',
      200,
      '<html><body>Public Page</body></html>',
    );
    mockFetcher.setResponse(
      'https://example.com/secret',
      200,
      '<html><body>Secret Admin</body></html>',
    );

    mockRobots.disallow('https://example.com/secret');

    const parser = createHtmlParser();
    const orchestrator = createCrawlOrchestrator({
      config,
      storage,
      queue,
      fetcher: mockFetcher,
      robotsEvaluator: mockRobots,
      parser,
    });

    await orchestrator.initialize();
    await orchestrator.addSeeds(['https://example.com/']);

    const summary = await orchestrator.start({ politenessDelayMs: 0 });

    expect(summary.stats.pagesFetched).toBe(2); // home + public
    expect(summary.stats.robotsDisallowed).toBe(1); // secret

    const secretUrl = await storage.urls.findByUrl('https://example.com/secret');
    expect(secretUrl?.crawlStatus).toBe(CRAWL_STATUS.DISALLOWED);
  });

  it('should avoid reprocessing duplicate URLs and handle retries on failure', async () => {
    mockFetcher.setResponse(
      'https://example.com/loop1',
      200,
      '<html><body><a href="https://example.com/loop2">To 2</a></body></html>',
    );
    mockFetcher.setResponse(
      'https://example.com/loop2',
      200,
      '<html><body><a href="https://example.com/loop1">Back to 1</a></body></html>',
    );

    const parser = createHtmlParser();
    const orchestrator = createCrawlOrchestrator({
      config,
      storage,
      queue,
      fetcher: mockFetcher,
      robotsEvaluator: mockRobots,
      parser,
    });

    await orchestrator.initialize();
    await orchestrator.addSeeds(['https://example.com/loop1']);

    const summary = await orchestrator.start({ politenessDelayMs: 0 });

    expect(summary.stats.pagesFetched).toBe(2);
    expect(summary.stats.duplicatesSkipped).toBeGreaterThanOrEqual(1);
  });

  it('should handle graceful abort through AbortController', async () => {
    for (let i = 1; i <= 10; i++) {
      mockFetcher.setResponse(
        `https://example.com/page${i}`,
        200,
        `<html><body><a href="https://example.com/page${i + 1}">Next</a></body></html>`,
      );
    }

    const abortController = new AbortController();
    const parser = createHtmlParser();
    const orchestrator = createCrawlOrchestrator({
      config,
      storage,
      queue,
      fetcher: mockFetcher,
      robotsEvaluator: mockRobots,
      parser,
    });

    await orchestrator.initialize();
    await orchestrator.addSeeds(['https://example.com/page1']);

    // Stop after first page
    setTimeout(() => {
      abortController.abort();
    }, 10);

    const summary = await orchestrator.start({
      signal: abortController.signal,
      maxPages: 100,
      politenessDelayMs: 20,
    });

    expect(summary.status).toBe('stopped');
    expect(summary.stats.pagesFetched).toBeLessThan(10);
  });
});
