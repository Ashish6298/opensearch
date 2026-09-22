import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '@opensearch/shared';
import {
  createStorageAdapter,
  StorageAdapter,
  CRAWL_STATUS,
  INDEX_STATUS,
} from '@opensearch/storage';
import {
  createCrawlQueue,
  HttpFetcher,
  FetchTarget,
  FetchResult,
  RobotsPolicyEvaluator,
  RobotsPolicyDecision,
  ROBOTS_DECISION_REASON,
  createHtmlParser,
  DefaultCrawlOrchestrator,
} from '../src/index.js';

class MockConditionalFetcher implements HttpFetcher {
  public recordedRequests: FetchTarget[] = [];
  private responses = new Map<
    string,
    {
      status: number;
      bodyText: string;
      contentType?: string;
      etag?: string;
      lastModified?: string;
    }
  >();

  setResponse(
    url: string,
    status: number,
    bodyText: string,
    options?: { contentType?: string; etag?: string; lastModified?: string },
  ) {
    this.responses.set(url, {
      status,
      bodyText,
      contentType: options?.contentType ?? 'text/html; charset=utf-8',
      etag: options?.etag,
      lastModified: options?.lastModified,
    });
  }

  async fetch(target: FetchTarget): Promise<FetchResult> {
    this.recordedRequests.push({ ...target });
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

    // Check conditional ETag
    if (target.etag && resp.etag && target.etag === resp.etag) {
      return {
        ok: true,
        finalUrl: target.url,
        statusCode: 304,
        contentType: resp.contentType ?? 'text/html',
        body: '',
        contentLength: 0,
        durationMs: 5,
        redirectCount: 0,
        redirectChain: [],
        retryCount: 0,
        etag: resp.etag,
        lastModified: resp.lastModified,
      };
    }

    // Check conditional Last-Modified
    if (target.lastModified && resp.lastModified && target.lastModified === resp.lastModified) {
      return {
        ok: true,
        finalUrl: target.url,
        statusCode: 304,
        contentType: resp.contentType ?? 'text/html',
        body: '',
        contentLength: 0,
        durationMs: 5,
        redirectCount: 0,
        redirectChain: [],
        retryCount: 0,
        etag: resp.etag,
        lastModified: resp.lastModified,
      };
    }

    if (resp.status >= 200 && resp.status < 300) {
      return {
        ok: true,
        finalUrl: target.url,
        statusCode: resp.status,
        contentType: resp.contentType ?? 'text/html',
        body: resp.bodyText,
        contentLength: Buffer.byteLength(resp.bodyText, 'utf-8'),
        durationMs: 10,
        redirectCount: 0,
        redirectChain: [],
        retryCount: 0,
        etag: resp.etag,
        lastModified: resp.lastModified,
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
}

class AllowAllRobotsEvaluator implements RobotsPolicyEvaluator {
  async isUrlAllowed(url: string): Promise<RobotsPolicyDecision> {
    const parsed = new URL(url);
    return {
      allowed: true,
      origin: parsed.origin,
      targetPath: parsed.pathname,
      reason: ROBOTS_DECISION_REASON.DEFAULT_ALLOW,
      crawlDelayMs: 0,
    };
  }
}

describe('Phase 42 — Conditional Re-Crawling & ETag Cache Validation', () => {
  let tempDir: string;
  let storage: StorageAdapter;
  let fetcher: MockConditionalFetcher;
  let orchestrator: DefaultCrawlOrchestrator;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'opensearch-p42-'));
    const config = loadConfig({
      NODE_ENV: 'test',
      STORAGE_DIR: join(tempDir, 'storage'),
      INDEX_DIR: join(tempDir, 'index'),
      CRAWLER_DATA_DIR: tempDir,
      CRAWLER_POLITENESS_DELAY_MS: '200',
      CRAWLER_MAX_PAGES: '10',
      CRAWLER_MAX_DEPTH: '2',
    });

    storage = createStorageAdapter({ config });
    await storage.initialize();

    const queue = createCrawlQueue({ config });
    await queue.initialize();

    fetcher = new MockConditionalFetcher();
    const parser = createHtmlParser();
    const robotsEvaluator = new AllowAllRobotsEvaluator();

    orchestrator = new DefaultCrawlOrchestrator({
      config,
      queue,
      storage,
      fetcher,
      robotsEvaluator,
      parser,
    });

    await orchestrator.initialize();
  });

  afterEach(async () => {
    await orchestrator.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('first crawl stores ETag and Last-Modified metadata', async () => {
    const seedUrl = 'https://example.com/docs';
    fetcher.setResponse(
      seedUrl,
      200,
      '<html><head><title>Docs</title></head><body><h1>Documentation</h1><p>Main content</p></body></html>',
      { etag: '"v1-etag"', lastModified: 'Wed, 21 Oct 2026 07:28:00 GMT' },
    );

    const summary = await orchestrator.start({
      seeds: [seedUrl],
      maxPages: 10,
      discoverSitemaps: false,
    });

    expect(summary.stats.pagesFetched).toBe(1);
    expect(summary.stats.contentChanged).toBe(1);

    const doc = await storage.documents.findByUrl(seedUrl);
    expect(doc).toBeDefined();
    expect(doc?.etag).toBe('"v1-etag"');
    expect(doc?.lastModified).toBe('Wed, 21 Oct 2026 07:28:00 GMT');
    expect(doc?.contentHash).toBeDefined();
    expect(doc?.indexStatus).toBe(INDEX_STATUS.PENDING);
  });

  it('re-crawl sends If-None-Match and If-Modified-Since headers and handles HTTP 304 fast path', async () => {
    const seedUrl = 'https://example.com/docs';
    fetcher.setResponse(
      seedUrl,
      200,
      '<html><head><title>Docs</title></head><body><h1>Documentation</h1><p>Main content</p></body></html>',
      { etag: '"v1-etag"', lastModified: 'Wed, 21 Oct 2026 07:28:00 GMT' },
    );

    // Initial crawl
    await orchestrator.start({ seeds: [seedUrl], maxPages: 1, discoverSitemaps: false });

    const docBefore = await storage.documents.findByUrl(seedUrl);
    expect(docBefore).toBeDefined();
    // Simulate that indexer already processed this doc
    await storage.documents.update(docBefore!.id, { indexStatus: INDEX_STATUS.INDEXED });

    // Second crawl (re-crawl)
    fetcher.recordedRequests = [];
    const reCrawlSummary = await orchestrator.start({
      seeds: [seedUrl],
      maxPages: 10,
      allowRecrawl: true,
      discoverSitemaps: false,
    });

    expect(reCrawlSummary.stats.pagesFetched).toBe(1);
    expect(fetcher.recordedRequests.length).toBe(1);
    expect(fetcher.recordedRequests[0].etag).toBe('"v1-etag"');
    expect(fetcher.recordedRequests[0].lastModified).toBe('Wed, 21 Oct 2026 07:28:00 GMT');

    // Stats reflect 304 fast path
    expect(reCrawlSummary.stats.notModified304).toBe(1);
    expect(reCrawlSummary.stats.contentUnchanged).toBe(1);

    // Index status must remain INDEXED (not reset to PENDING on 304)
    const docAfter = await storage.documents.findByUrl(seedUrl);
    expect(docAfter?.indexStatus).toBe(INDEX_STATUS.INDEXED);
    expect(docAfter?.httpStatus).toBe(304);
  });

  it('re-crawl with modified content (HTTP 200) invalidates indexStatus to PENDING', async () => {
    const seedUrl = 'https://example.com/article';
    fetcher.setResponse(
      seedUrl,
      200,
      '<html><head><title>Initial</title></head><body><p>Initial content</p></body></html>',
      { etag: '"v1"' },
    );

    // Initial crawl
    await orchestrator.start({ seeds: [seedUrl], maxPages: 10, discoverSitemaps: false });
    const doc = await storage.documents.findByUrl(seedUrl);
    await storage.documents.update(doc!.id, { indexStatus: INDEX_STATUS.INDEXED });

    // Server updates content & ETag
    fetcher.setResponse(
      seedUrl,
      200,
      '<html><head><title>Updated Article</title></head><body><p>Fresh content has arrived</p></body></html>',
      { etag: '"v2"' },
    );

    const reCrawlSummary = await orchestrator.start({
      seeds: [seedUrl],
      maxPages: 10,
      allowRecrawl: true,
      discoverSitemaps: false,
    });

    expect(reCrawlSummary.stats.pagesFetched).toBe(1);
    expect(reCrawlSummary.stats.contentChanged).toBe(1);

    const docAfter = await storage.documents.findByUrl(seedUrl);
    expect(docAfter?.title).toBe('Updated Article');
    expect(docAfter?.etag).toBe('"v2"');
    expect(docAfter?.indexStatus).toBe(INDEX_STATUS.PENDING); // Content changed -> needs re-indexing
  });

  it('transient failure on re-crawl does not drop existing document or index metadata', async () => {
    const seedUrl = 'https://example.com/resilient';
    fetcher.setResponse(
      seedUrl,
      200,
      '<html><head><title>Resilient</title></head><body><p>Existing resilient content</p></body></html>',
      { etag: '"v1"' },
    );

    await orchestrator.start({ seeds: [seedUrl], maxPages: 10, discoverSitemaps: false });
    const doc = await storage.documents.findByUrl(seedUrl);
    await storage.documents.update(doc!.id, { indexStatus: INDEX_STATUS.INDEXED });

    // Server returns 500 error on re-crawl
    fetcher.setResponse(seedUrl, 500, 'Server error');

    const failSummary = await orchestrator.start({
      seeds: [seedUrl],
      maxPages: 10,
      allowRecrawl: true,
      discoverSitemaps: false,
    });

    expect(failSummary.stats.fetchErrors).toBe(1);

    // Document must still exist and keep its INDEXED status
    const docAfterFail = await storage.documents.findByUrl(seedUrl);
    expect(docAfterFail).toBeDefined();
    expect(docAfterFail?.title).toBe('Resilient');
    expect(docAfterFail?.indexStatus).toBe(INDEX_STATUS.INDEXED);
  });
});
