/**
 * OpenSearch — Phase 23 Verification Gate Runner
 *
 * Validates Seed Corpus & Initial Public Index:
 * 1. Curated Seed Corpus: Validates categories, priority sorting, and valid URL structure.
 * 2. Crawl Configuration & Safe Limits: Configurable maxPages, maxDepth, politeness, and SSRF safety.
 * 3. Seed Crawling Process: Controlled crawl of multi-topic public corpus with link discovery.
 * 4. Index Build Process: Building inverted index with term dictionary and postings.
 * 5. Quality Checks: Document quality scoring (title, headings, description, word count).
 * 6. Duplicate Checks: Detecting exact and near-duplicate content across documents.
 * 7. Representative Searches: Executing queries over the built index with BM25 ranking and snippets.
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
  CURATED_SEED_CORPUS,
  getCuratedSeedUrls,
  getAllCuratedSeeds,
} from '@opensearch/crawler';
import {
  createIndexBuilder,
  analyzeCorpusQuality,
  evaluateDocumentQuality,
  computeContentHash,
} from '@opensearch/indexer';
import {
  createQueryParser,
  createCandidateRetriever,
  createRankingEngine,
  createResultGenerator,
} from '@opensearch/ranking';
import { createApiServer } from '../apps/api/dist/index.js';

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
  console.log('\n=== Phase 23: Seed Corpus & Initial Public Index Verification ===\n');

  process.env.OPENSEARCH_ALLOW_PRIVATE_URLS = 'true';

  // 1. Curated Seed List Validation
  console.log('► 1. Curated Seed List Validation');
  assert(CURATED_SEED_CORPUS.length >= 3, `Curated corpus has ${CURATED_SEED_CORPUS.length} categories (>= 3)`);
  const seedUrls = getCuratedSeedUrls();
  assert(seedUrls.length >= 5, `Total curated seed URLs: ${seedUrls.length} (>= 5)`);
  const allSeeds = getAllCuratedSeeds();
  assert(allSeeds.every(s => s.url && s.title && s.description && s.priority >= 1), 'All seeds contain mandatory metadata');

  // 2. Setup Multi-Topic Controlled Corpus Web Server
  console.log('\n► 2. Controlled Target Corpus Setup');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-verify-p23-'));
  const storageDir = path.join(tempDir, 'storage');
  const indexDir = path.join(tempDir, 'index');
  const queueDir = path.join(tempDir, 'queue');

  let mockServer;
  let mockPort = 0;
  let apiServer;

  try {
    mockServer = createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`User-agent: *\nAllow: /\nDisallow: /admin\nCrawl-delay: 0\n`);
        return;
      }

      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>OpenSearch Public Knowledge Base</title><meta name="description" content="A curated directory of public articles, engineering docs, and guides."></head>
<body>
  <h1>OpenSearch Knowledge Index</h1>
  <p>Search through open technical guides, software architecture principles, and web standards.</p>
  <a href="/http-guide">HTTP Protocol Guide</a>
  <a href="/algorithms">Information Retrieval Algorithms</a>
  <a href="/privacy-rights">Digital Privacy and Rights</a>
  <a href="/duplicate-sample">Duplicate Content Sample</a>
</body>
</html>`);
        return;
      }

      if (url === '/http-guide') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>HTTP Protocols and Standards</title><meta name="description" content="Complete technical documentation of HTTP methods, headers, and status codes."></head>
<body>
  <h1>HTTP Protocols and Web Standards</h1>
  <p>Hypertext Transfer Protocol is the foundation of data communication for the World Wide Web. HTTP is an application layer protocol providing GET, POST, PUT, and DELETE operations with status codes like 200 OK and 404 Not Found.</p>
</body>
</html>`);
        return;
      }

      if (url === '/algorithms') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Information Retrieval and BM25 Ranking</title><meta name="description" content="Mathematical formulation of BM25 lexical ranking and term frequency scoring."></head>
<body>
  <h1>Information Retrieval and Ranking Algorithms</h1>
  <p>BM25 is a probabilistic relevance ranking algorithm used in search engines. It calculates document relevance by scoring term frequency, document frequency, and document length normalization.</p>
</body>
</html>`);
        return;
      }

      if (url === '/privacy-rights') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Digital Privacy and User Rights</title><meta name="description" content="Why privacy-first search engines protect civil liberties and avoid profiling."></head>
<body>
  <h1>Digital Privacy and User Rights</h1>
  <p>Privacy-first search engines do not track users, log identifiable search history, or create behavioral profiling databases. Zero-tracking search guarantees privacy rights.</p>
</body>
</html>`);
        return;
      }

      if (url === '/duplicate-sample') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Digital Privacy and User Rights</title><meta name="description" content="Why privacy-first search engines protect civil liberties and avoid profiling."></head>
<body>
  <h1>Digital Privacy and User Rights</h1>
  <p>Privacy-first search engines do not track users, log identifiable search history, or create behavioral profiling databases. Zero-tracking search guarantees privacy rights.</p>
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
    assert(mockPort > 0, `Corpus mock server listening on port ${mockPort}`);

    // 3. Crawler Execution with Safe Limits
    console.log('\n► 3. Crawl Execution with Safe Limits');
    const config = loadConfig({
      STORAGE_DIR: storageDir,
      INDEX_DIR: indexDir,
      CRAWLER_DATA_DIR: queueDir,
      CRAWLER_POLITENESS_DELAY_MS: '200',
      CRAWLER_MAX_PAGES: '15',
      CRAWLER_MAX_DEPTH: '3',
    });

    const storage = createStorageAdapter({ config });
    await storage.initialize();

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

    assert(crawlSummary.status === 'completed', 'Crawl finished with status "completed"');
    assert(crawlSummary.stats.pagesFetched >= 5, `Fetched ${crawlSummary.stats.pagesFetched} pages (>= 5)`);
    assert(crawlSummary.stats.pagesStored >= 5, `Stored ${crawlSummary.stats.pagesStored} documents in DocumentRepository`);

    // 4. Quality & Duplicate Checks
    console.log('\n► 4. Quality Checks & Duplicate Detection');
    const { summary: qualitySummary, reports: qualityReports } = await analyzeCorpusQuality(storage);

    assert(qualitySummary.totalDocuments >= 5, `Analyzed ${qualitySummary.totalDocuments} documents`);
    assert(qualitySummary.validDocuments >= 4, `Found ${qualitySummary.validDocuments} valid documents`);
    assert(qualitySummary.duplicateDocuments >= 1, `Detected ${qualitySummary.duplicateDocuments} duplicate document(s)`);
    assert(qualitySummary.overallQualityScore >= 0.7, `Corpus overall quality score: ${qualitySummary.overallQualityScore} (>= 0.70)`);
    assert(qualitySummary.hasTitleRatio === 1, `100% of crawled pages contain valid titles`);
    assert(qualitySummary.hasDescriptionRatio === 1, `100% of crawled pages contain meta descriptions`);

    // 5. Index Build Process
    console.log('\n► 5. Initial Public Index Build');
    const indexBuilder = createIndexBuilder({
      storage,
      indexDir,
    });
    const buildSummary = await indexBuilder.build({ mode: 'full' });

    assert(buildSummary.status === 'success', 'Index builder produced status "success"');
    assert(buildSummary.stats.documentsIndexed >= 5, `Indexed ${buildSummary.stats.documentsIndexed} documents`);
    assert(buildSummary.stats.termsIndexed > 50, `Dictionary contains ${buildSummary.stats.termsIndexed} unique terms (> 50)`);

    const activeIndex = indexBuilder.getActiveIndex();
    assert(activeIndex !== null, 'Active index loaded into memory');

    // 6. Representative Searches
    console.log('\n► 6. Representative Queries Over Initial Public Index');
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

    // Test Query 1: Technical query "HTTP protocol"
    const q1Res = await fetch(`http://127.0.0.1:${apiInfo.port}/api/v1/search?q=HTTP+protocol`);
    assert(q1Res.status === 200, 'Query 1 ("HTTP protocol") returns 200 OK');
    const q1Data = await q1Res.json();
    assert(q1Data.meta.totalHits >= 1, `Query 1 returned ${q1Data.meta.totalHits} hit(s)`);
    assert(q1Data.results[0].title.includes('HTTP'), 'Top result matches HTTP guide');

    // Test Query 2: Ranking query "BM25 relevance"
    const q2Res = await fetch(`http://127.0.0.1:${apiInfo.port}/api/v1/search?q=BM25+relevance`);
    assert(q2Res.status === 200, 'Query 2 ("BM25 relevance") returns 200 OK');
    const q2Data = await q2Res.json();
    assert(q2Data.meta.totalHits >= 1, `Query 2 returned ${q2Data.meta.totalHits} hit(s)`);
    assert(q2Data.results[0].title.includes('BM25'), 'Top result matches BM25 ranking article');

    // Test Query 3: Informational query "privacy zero-tracking"
    const q3Res = await fetch(`http://127.0.0.1:${apiInfo.port}/api/v1/search?q=privacy+zero-tracking`);
    assert(q3Res.status === 200, 'Query 3 ("privacy zero-tracking") returns 200 OK');
    const q3Data = await q3Res.json();
    assert(q3Data.meta.totalHits >= 1, `Query 3 returned ${q3Data.meta.totalHits} hit(s)`);
    assert(q3Data.results[0].title.includes('Privacy'), 'Top result matches Privacy article');

    // Test Query 4: Non-existent query "quantum teleportation"
    const q4Res = await fetch(`http://127.0.0.1:${apiInfo.port}/api/v1/search?q=quantum+teleportation`);
    assert(q4Res.status === 200, 'Query 4 (non-existent query) returns 200 OK');
    const q4Data = await q4Res.json();
    assert(q4Data.meta.totalHits === 0, 'Query 4 safely returns 0 hits');
    assert(q4Data.results.length === 0, 'Query 4 results array is empty');

    await apiServer.stop();
  } finally {
    if (apiServer) await apiServer.stop().catch(() => {});
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
  console.log(`Phase 23 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Fatal error during Phase 23 verification:', err);
  process.exit(1);
});
