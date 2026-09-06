import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer, Server } from 'node:http';
import { loadConfig } from '@opensearch/shared';
import { createStorageAdapter } from '@opensearch/storage';
import {
  createCrawlQueue,
  createFetcher,
  createRobotsPolicyEvaluator,
  createHtmlParser,
  createCrawlOrchestrator,
} from '@opensearch/crawler';
import { createIndexBuilder, createInvertedIndex } from '@opensearch/indexer';
import {
  createQueryParser,
  createCandidateRetriever,
  createRankingEngine,
  createResultGenerator,
} from '@opensearch/ranking';
import { createApiServer, ApiServer } from '../../../apps/api/src/index.js';
import { createWebServer, WebServer } from '../../../apps/web/src/index.js';

describe('Phase 22 — Full Crawl → Index → Search Pipeline Integration', () => {
  let tempDir: string;
  let mockServer: Server;
  let mockServerPort: number;
  let apiServer: ApiServer;
  let webServer: WebServer;
  let apiPort: number;
  let webPort: number;

  beforeAll(async () => {
    process.env.OPENSEARCH_ALLOW_PRIVATE_URLS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-p22-'));

    // 1. Boot Controlled Target Web Server
    mockServer = createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`User-agent: *\nAllow: /\nDisallow: /private\nCrawl-delay: 0\n`);
        return;
      }

      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>OpenSearch Documentation Portal</title><meta name="description" content="Official technical documentation for OpenSearch privacy search engine."></head>
<body>
  <h1>Welcome to OpenSearch Engine</h1>
  <p>OpenSearch is an independent, privacy-first web search engine that indexes the web directly.</p>
  <a href="/architecture">Architecture Overview</a>
  <a href="/crawler">Crawler Documentation</a>
</body>
</html>`);
        return;
      }

      if (url === '/architecture') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>System Architecture Guide</title><meta name="description" content="Deep dive into OpenSearch modular design and pipeline."></head>
<body>
  <h1>OpenSearch System Architecture</h1>
  <p>The system features an inverted index with BM25 ranking algorithm and zero-tracking privacy.</p>
  <a href="/ranking">Ranking Signals</a>
</body>
</html>`);
        return;
      }

      if (url === '/crawler') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Polite Crawler System</title><meta name="description" content="Guide on how the web crawler respects robots.txt and politeness."></head>
<body>
  <h1>Crawler Subsystem Details</h1>
  <p>Features SSRF protection, robots caching, and persistent queues.</p>
  <a href="/">Home</a>
</body>
</html>`);
        return;
      }

      if (url === '/ranking') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>BM25 Relevance Ranking</title><meta name="description" content="How ranking scores are computed across titles and text fields."></head>
<body>
  <h1>Relevance Ranking and BM25</h1>
  <p>Uses multi-field boosting and positional phrase matching for deterministic score ordering.</p>
</body>
</html>`);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    await new Promise<void>(resolve => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address();
        mockServerPort = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (apiServer) await apiServer.stop();
    if (webServer) await webServer.stop();
    if (mockServer) {
      await new Promise<void>(resolve => mockServer.close(() => resolve()));
    }
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('executes full pipeline: Crawl → Storage → Indexer → Inverted Index → API → Web Frontend', async () => {
    const storageDir = path.join(tempDir, 'storage');
    const indexDir = path.join(tempDir, 'index');
    const queueDir = path.join(tempDir, 'queue');

    const config = loadConfig({
      STORAGE_DIR: storageDir,
      INDEX_DIR: indexDir,
      CRAWLER_DATA_DIR: queueDir,
      CRAWLER_POLITENESS_DELAY_MS: '200',
      CRAWLER_MAX_PAGES: '10',
      CRAWLER_MAX_DEPTH: '3',
    });

    // 1. Initialize Storage & Repositories
    const storage = createStorageAdapter({ config });
    await storage.initialize();

    // 2. Initialize Crawler Subsystems
    const queue = createCrawlQueue({ config });
    const fetcher = createFetcher({ config });
    const robotsEvaluator = createRobotsPolicyEvaluator({ config, fetcher });
    const parser = createHtmlParser();

    const orchestrator = createCrawlOrchestrator({
      config,
      queue,
      storage,
      fetcher,
      robotsEvaluator,
      parser,
    });
    await orchestrator.initialize();

    // 3. Crawl Controlled Target Corpus
    const seedUrl = `http://127.0.0.1:${mockServerPort}/`;
    const crawlSummary = await orchestrator.start({
      seeds: [seedUrl],
      maxPages: 10,
      politenessDelayMs: 0,
    });

    expect(crawlSummary.status).toBe('completed');
    expect(crawlSummary.stats.pagesFetched).toBeGreaterThanOrEqual(4);
    expect(crawlSummary.stats.pagesStored).toBeGreaterThanOrEqual(4);

    // Verify Document Repository populated
    const storedDocs = await storage.documents.list({ limit: 100 });
    expect(storedDocs.length).toBeGreaterThanOrEqual(4);

    // 4. Build Inverted Index
    const indexBuilder = createIndexBuilder({
      storage,
      indexDir,
    });
    const buildSummary = await indexBuilder.build({ mode: 'full' });

    expect(buildSummary.status).toBe('success');
    expect(buildSummary.stats.documentsIndexed).toBeGreaterThanOrEqual(4);
    expect(buildSummary.stats.termsIndexed).toBeGreaterThan(0);

    const activeIndex = indexBuilder.getActiveIndex()!;
    expect(activeIndex).toBeDefined();

    // 5. Initialize Search Subsystem & Start API Server
    const queryParser = createQueryParser();
    const candidateRetriever = createCandidateRetriever(activeIndex);
    const rankingEngine = createRankingEngine(activeIndex);
    const resultGenerator = createResultGenerator();

    apiServer = createApiServer({
      config,
      services: {
        index: activeIndex,
        queryParser,
        candidateRetriever,
        rankingEngine,
        resultGenerator,
      },
    });

    const apiInfo = await apiServer.start(0, '127.0.0.1');
    apiPort = apiInfo.port;

    // 6. Start Public Web Server
    webServer = createWebServer({
      apiUrl: `http://127.0.0.1:${apiPort}/api/v1/search`,
    });
    const webInfo = await webServer.start(0, '127.0.0.1');
    webPort = webInfo.port;

    // 7. Perform Search API Queries
    const searchRes = await fetch(`http://127.0.0.1:${apiPort}/api/v1/search?q=architecture+BM25`);
    expect(searchRes.status).toBe(200);
    const searchData = (await searchRes.json()) as any;

    expect(searchData.meta.totalHits).toBeGreaterThanOrEqual(1);
    expect(searchData.results.length).toBeGreaterThanOrEqual(1);
    expect(searchData.results[0].title).toBeDefined();
    expect(searchData.results[0].url).toContain(`127.0.0.1:${mockServerPort}`);
    expect(searchData.results[0].snippet).toBeDefined();

    // 8. Verify Web Frontend Serves Shell
    const webRes = await fetch(`http://127.0.0.1:${webPort}/`);
    expect(webRes.status).toBe(200);
    const webHtml = await webRes.text();
    expect(webHtml).toContain('OpenSearch');
    expect(webHtml).toContain(`http://127.0.0.1:${apiPort}/api/v1/search`);

    // 9. Verify Cold-Restart & Index Persistence
    await apiServer.stop();

    // Re-create cold index from saved disk path
    const coldIndex = createInvertedIndex({ indexDir: buildSummary.indexPath });
    await coldIndex.load(buildSummary.indexPath);

    const restartedApiServer = createApiServer({
      config,
      services: {
        index: coldIndex,
        queryParser: createQueryParser(),
        candidateRetriever: createCandidateRetriever(coldIndex),
        rankingEngine: createRankingEngine(coldIndex),
        resultGenerator: createResultGenerator(),
      },
    });

    const restartedApiInfo = await restartedApiServer.start(0, '127.0.0.1');
    const restartedRes = await fetch(
      `http://127.0.0.1:${restartedApiInfo.port}/api/v1/search?q=crawler`,
    );
    expect(restartedRes.status).toBe(200);
    const restartedData = (await restartedRes.json()) as any;
    expect(restartedData.meta.totalHits).toBeGreaterThanOrEqual(1);
    expect(restartedData.results[0].title).toContain('Crawler');

    await restartedApiServer.stop();
  });
});
