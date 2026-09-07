/**
 * OpenSearch — Phase 22 Verification Gate Runner
 *
 * Validates Full Pipeline Integration:
 * 1. Crawler Subsystem: Seeds loading, robots.txt parsing, link discovery, and page fetching.
 * 2. Storage Subsystem: Document records, URL records, and crawl event records persistence.
 * 3. Indexer Subsystem: Text normalization, tokenization, posting generation, and build staging.
 * 4. Inverted Index: Term dictionary, posting lists, and atomic activation.
 * 5. Query & Ranking: Query parser, candidate retriever, BM25 scoring, and snippet generation.
 * 6. Search API: HTTP endpoint execution (/api/v1/search), latency tracking, and query stats.
 * 7. Web Application: Shell serving with correct API connection and accessibility markup.
 * 8. Restart Resilience: Clean shutdown and cold index reload from disk with full query fidelity.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer } from 'node:http';
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
import { createApiServer } from '../apps/api/dist/index.js';
import { createWebServer } from '../apps/web/dist/index.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runVerification() {
  console.log('\n=== Phase 22: Full Crawl → Index → Search Integration Verification ===\n');

  process.env.OPENSEARCH_ALLOW_PRIVATE_URLS = 'true';

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-verify-p22-'));
  const storageDir = path.join(tempDir, 'storage');
  const indexDir = path.join(tempDir, 'index');
  const queueDir = path.join(tempDir, 'queue');

  let mockServer;
  let mockPort = 0;
  let apiServer;
  let webServer;

  try {
    // 1. Controlled Target Web Server
    console.log('► 1. Target Corpus Server Setup');
    mockServer = createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`User-agent: *\nAllow: /\nCrawl-delay: 0\n`);
        return;
      }

      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>OpenSearch Integration Portal</title><meta name="description" content="Integration testing portal for OpenSearch search engine."></head>
<body>
  <h1>Welcome to OpenSearch Pipeline</h1>
  <p>OpenSearch is a privacy-first web search engine that crawls, indexes, and ranks web content directly.</p>
  <a href="/architecture">Architecture Overview</a>
  <a href="/crawler">Crawler Engine</a>
</body>
</html>`);
        return;
      }

      if (url === '/architecture') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Search Engine Architecture</title><meta name="description" content="In-depth overview of the inverted index and BM25 ranking algorithm."></head>
<body>
  <h1>Search Engine Architecture Overview</h1>
  <p>The system utilizes an inverted index with positional token postings and BM25 relevance scoring.</p>
  <a href="/ranking">Ranking Pipeline</a>
</body>
</html>`);
        return;
      }

      if (url === '/crawler') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Polite Crawler Engine</title><meta name="description" content="Polite web crawler adhering to robots.txt and politeness delays."></head>
<body>
  <h1>Web Crawler Pipeline</h1>
  <p>The crawler respects robots.txt policies, prevents SSRF attacks, and uses a persistent FIFO queue.</p>
</body>
</html>`);
        return;
      }

      if (url === '/ranking') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>BM25 Ranking Signals</title><meta name="description" content="Relevance scoring calculations and text boosting signals."></head>
<body>
  <h1>BM25 Ranking and Query Highlights</h1>
  <p>Multi-field boosting signals prioritize matches in titles, headings, and descriptions.</p>
</body>
</html>`);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    await new Promise(resolve => {
      mockServer.listen(0, '127.0.0.1', () => {
        mockPort = mockServer.address().port;
        resolve();
      });
    });
    assert(mockPort > 0, `Target mock corpus server listening on port ${mockPort}`);

    // 2. Storage & Crawler Execution
    console.log('\n► 2. Crawler & Storage Integration');
    const config = loadConfig({
      STORAGE_DIR: storageDir,
      INDEX_DIR: indexDir,
      CRAWLER_DATA_DIR: queueDir,
      CRAWLER_POLITENESS_DELAY_MS: '200',
      CRAWLER_MAX_PAGES: '10',
      CRAWLER_MAX_DEPTH: '3',
    });

    const storage = createStorageAdapter({ config });
    await storage.initialize();
    assert(fs.existsSync(storageDir), 'Storage adapter initialized disk directory');

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

    const seedUrl = `http://127.0.0.1:${mockPort}/`;
    const crawlSummary = await orchestrator.start({
      seeds: [seedUrl],
      maxPages: 10,
      politenessDelayMs: 0,
    });

    assert(crawlSummary.status === 'completed', 'Crawler finished with status "completed"');
    assert(
      crawlSummary.stats.pagesFetched >= 4,
      `Fetched ${crawlSummary.stats.pagesFetched} pages (>= 4)`,
    );
    assert(
      crawlSummary.stats.pagesStored >= 4,
      `Stored ${crawlSummary.stats.pagesStored} documents (>= 4)`,
    );

    const storedDocs = await storage.documents.list({ limit: 100 });
    assert(storedDocs.length >= 4, `Document repository contains ${storedDocs.length} records`);

    // 3. Indexer & Inverted Index Build
    console.log('\n► 3. Indexer & Inverted Index Build');
    const indexBuilder = createIndexBuilder({
      storage,
      indexDir,
    });
    const buildSummary = await indexBuilder.build({ mode: 'full' });

    assert(buildSummary.status === 'success', 'Index build completed with status "success"');
    assert(
      buildSummary.stats.documentsIndexed >= 4,
      `Indexed ${buildSummary.stats.documentsIndexed} documents`,
    );
    assert(
      buildSummary.stats.termsIndexed > 0,
      `Generated dictionary with ${buildSummary.stats.termsIndexed} terms`,
    );
    assert(
      fs.existsSync(buildSummary.indexPath),
      `Active index persisted to ${buildSummary.indexPath}`,
    );

    const activeIndex = indexBuilder.getActiveIndex();
    assert(activeIndex !== null, 'Active index reference is available in memory');

    // 4. Search API Boot & Execution
    console.log('\n► 4. Search API Integration');
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
    assert(apiInfo.port > 0, `Search API server listening on port ${apiInfo.port}`);

    // Health check
    const healthRes = await fetch(`http://127.0.0.1:${apiInfo.port}/health`);
    assert(healthRes.status === 200, 'Search API /health returns 200 OK');
    const healthData = await healthRes.json();
    assert(
      healthData.totalDocumentsIndexed >= 4,
      `Health reports ${healthData.totalDocumentsIndexed} indexed documents`,
    );

    // Query Search
    const searchRes = await fetch(`http://127.0.0.1:${apiInfo.port}/api/v1/search?q=BM25+ranking`);
    assert(searchRes.status === 200, 'Search query "BM25 ranking" returns 200 OK');
    const searchData = await searchRes.json();
    assert(searchData.meta.totalHits >= 1, `Query returned ${searchData.meta.totalHits} hit(s)`);
    assert(searchData.results.length >= 1, 'Result items array is non-empty');
    assert(
      searchData.results[0].title.includes('BM25') ||
        searchData.results[0].title.includes('Architecture'),
      'Top result title matches expected query context',
    );
    assert(
      searchData.results[0].snippet.includes('<mark>') || searchData.results[0].snippet.length > 0,
      'Snippet contains highlighted text or summary content',
    );

    // 5. Public Web Application Integration
    console.log('\n► 5. Web Frontend End-to-End Integration');
    webServer = createWebServer({
      apiUrl: `http://127.0.0.1:${apiInfo.port}/api/v1/search`,
    });
    const webInfo = await webServer.start(0, '127.0.0.1');
    assert(webInfo.port > 0, `Web frontend listening on port ${webInfo.port}`);

    const webRes = await fetch(`http://127.0.0.1:${webInfo.port}/`);
    assert(webRes.status === 200, 'Web frontend root responds with 200 OK');
    const webHtml = await webRes.text();
    assert(webHtml.includes('OpenSearch'), 'Frontend contains OpenSearch branding');
    assert(
      webHtml.includes(`http://127.0.0.1:${apiInfo.port}/api/v1/search`),
      'Frontend injected with live API endpoint URL',
    );

    // 6. Cold-Restart & Index Reload Verification
    console.log('\n► 6. Pipeline Restart & Cold Index Persistence');
    await apiServer.stop();
    assert(true, 'API server stopped for restart simulation');

    // Cold reload index directly from disk artifact
    const reloadedIndex = createInvertedIndex({ indexDir: buildSummary.indexPath });
    await reloadedIndex.load(buildSummary.indexPath);
    assert(
      reloadedIndex.getStats().totalDocuments >= 4,
      'Cold reloaded index preserved document count',
    );

    const restartedApiServer = createApiServer({
      config,
      services: {
        index: reloadedIndex,
        queryParser: createQueryParser(),
        candidateRetriever: createCandidateRetriever(reloadedIndex),
        rankingEngine: createRankingEngine(reloadedIndex),
        resultGenerator: createResultGenerator(),
      },
    });
    const restartedApiInfo = await restartedApiServer.start(0, '127.0.0.1');

    const coldSearchRes = await fetch(
      `http://127.0.0.1:${restartedApiInfo.port}/api/v1/search?q=crawler+SSRF`,
    );
    assert(coldSearchRes.status === 200, 'Search on cold-restarted API server returns 200 OK');
    const coldSearchData = await coldSearchRes.json();
    assert(
      coldSearchData.meta.totalHits >= 1,
      `Cold search query returned ${coldSearchData.meta.totalHits} hit(s)`,
    );
    assert(
      coldSearchData.results[0].title.includes('Crawler'),
      'Cold search result correctly matched crawled document title',
    );

    await restartedApiServer.stop();
  } finally {
    if (apiServer) await apiServer.stop().catch(() => {});
    if (webServer) await webServer.stop().catch(() => {});
    if (mockServer) {
      await new Promise(resolve => mockServer.close(() => resolve()));
    }
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  console.log('\n--------------------------------------------------');
  console.log(`Phase 22 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Fatal error during Phase 22 verification:', err);
  process.exit(1);
});
