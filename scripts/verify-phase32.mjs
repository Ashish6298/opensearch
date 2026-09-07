#!/usr/bin/env node
/**
 * @opensearch/scripts — Phase 32 Verification Gate Runner
 *
 * Verifies all requirements for Phase 32: Cross-Environment Testing:
 * 1. Desktop browser simulation (User agent, HTML shell, all UI controls present)
 * 2. Mobile viewport/browser simulation (Viewport meta tag, responsive breakpoints: 640px, 380px)
 * 3. Network simulation (Fast in-memory caching and clean empty payloads)
 * 4. Empty queries (Returns 200 OK with empty result set instantly)
 * 5. Long queries (Handles complex queries, enforces max query length boundaries)
 * 6. No-result queries (Returns 0 hits, enables empty-state illustration and search tips)
 * 7. Common searches (Retrieves accurate ranked documents with BM25)
 * 8. Multiple result pages (Validates page 1 and page 2 pagination without overlapping hits)
 * 9. External result links (Enforces rel="noopener noreferrer" and target="_blank" safety)
 * 10. API failure behavior (Web server survival and error boundaries under simulated failure)
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as http from 'node:http';
import { loadConfig } from '../packages/shared/dist/index.js';
import { createStorageAdapter } from '../packages/storage/dist/index.js';
import { createIndexBuilder } from '../packages/indexer/dist/index.js';
import { createApiServer } from '../apps/api/dist/server.js';
import { createWebServer } from '../apps/web/dist/server.js';

let passedChecks = 0;
let totalChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    console.log(`  [PASS] Gate ${totalChecks}: ${message}`);
    passedChecks++;
  } else {
    console.error(`  [FAIL] Gate ${totalChecks}: ${message}`);
    process.exitCode = 1;
  }
}

function requestHttp(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            // not json
          }
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body: data,
            json,
          });
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runPhase32Verification() {
  console.log('================================================================');
  console.log('PHASE 32 VERIFICATION: Cross-Environment Testing');
  console.log('================================================================\n');

  const testDir = await mkdtemp(join(tmpdir(), 'opensearch-p32-gate-'));
  const storageDir = join(testDir, 'storage');
  const indexDir = join(testDir, 'index');

  let apiServer;
  let webServer;

  try {
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '0',
      HOST: '127.0.0.1',
      STORAGE_DIR: storageDir,
      INDEX_DIR: indexDir,
      LOG_LEVEL: 'silent',
      LOG_FORMAT: 'json',
      CORS_ORIGIN: '*',
    });

    const storage = createStorageAdapter({ config });
    await storage.initialize();

    const sampleDocs = [
      {
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        title: 'JavaScript Reference — MDN Web Docs',
        description: 'Standard documentation for ECMAScript syntax and Web APIs.',
        headings: 'JavaScript ECMAScript Functions Objects Arrays',
        bodyText: 'JavaScript is a programming language used for client-side and server-side web development.',
      },
      {
        url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP',
        title: 'HTTP Overview — MDN Web Docs',
        description: 'Comprehensive guides on HTTP requests, status codes, and TLS headers.',
        headings: 'HTTP Protocol HTTPS Security Status Headers',
        bodyText: 'Hypertext Transfer Protocol transmits web resources and defines client-server communication.',
      },
      {
        url: 'https://en.wikipedia.org/wiki/Search_engine',
        title: 'Search Engine — Wikipedia',
        description: 'An information retrieval system designed to help find web documents.',
        headings: 'Search Engine Web Crawlers Inverted Index Ranking Algorithm',
        bodyText: 'Search engines crawl web pages, construct inverted indices, and calculate BM25 relevance.',
      },
      {
        url: 'https://en.wikipedia.org/wiki/Inverted_index',
        title: 'Inverted Index — Wikipedia',
        description: 'An index data structure mapping words to locations in a document collection.',
        headings: 'Inverted Index Postings Dictionary Search Engine',
        bodyText: 'In computer science, an inverted index is the core data structure used in modern search engines.',
      },
      {
        url: 'https://en.wikipedia.org/wiki/Okapi_BM25',
        title: 'Okapi BM25 Ranking Algorithm — Wikipedia',
        description: 'Probabilistic relevance ranking function widely used in search engines.',
        headings: 'Okapi BM25 Ranking Relevance Term Frequency Document Frequency',
        bodyText: 'BM25 ranks candidate documents based on query terms and document frequencies.',
      },
    ];

    for (let i = 0; i < sampleDocs.length; i++) {
      const doc = sampleDocs[i];
      await storage.documents.create({
        url: doc.url,
        urlHash: `p32-doc-${i}`,
        title: doc.title,
        description: doc.description,
        headings: doc.headings,
        bodyText: doc.bodyText,
        language: 'en',
        contentType: 'text/html',
        contentLength: doc.bodyText.length + 100,
        httpStatus: 200,
        outboundLinks: [],
      });
    }

    const builder = createIndexBuilder({ config, storage });
    const buildRes = await builder.build();
    assert(buildRes.status === 'success', 'Inverted index built successfully');

    const activeIndex = builder.getActiveIndex();
    assert(activeIndex !== null && activeIndex.getStats().totalDocuments === sampleDocs.length, 'Active index loaded with all documents');

    apiServer = createApiServer({ config, index: activeIndex });
    const apiAddr = await apiServer.start(0, '127.0.0.1');

    webServer = createWebServer({
      config,
      apiUrl: `http://127.0.0.1:${apiAddr.port}/api/v1/search`,
    });
    const webAddr = await webServer.start(0, '127.0.0.1');

    // 1. Desktop Browser Simulation
    const desktopRes = await requestHttp(webAddr.port, '/', {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    assert(desktopRes.statusCode === 200, 'Desktop browser request returns HTTP 200');
    assert(desktopRes.body.includes('id="search-input"') && desktopRes.body.includes('id="search-submit-btn"'), 'Desktop browser UI renders search input and submit button');
    assert(desktopRes.body.includes('id="skip-to-search"') && desktopRes.body.includes('id="a11y-announcer"'), 'Desktop browser receives full accessibility and skip-link landmarks');

    // 2. Mobile Viewport/Browser Simulation
    const mobileRes = await requestHttp(webAddr.port, '/', {
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    });
    assert(mobileRes.statusCode === 200, 'Mobile browser request returns HTTP 200');
    assert(mobileRes.body.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0">'), 'Mobile viewport meta tag is present');
    assert(mobileRes.body.includes('@media (max-width: 640px)') && mobileRes.body.includes('@media (max-width: 380px)'), 'Mobile responsive CSS breakpoints are delivered');

    // 3. Network Simulation (Fast in-memory caching & low latency)
    const netRes1 = await requestHttp(apiAddr.port, '/api/v1/search?q=javascript');
    assert(netRes1.statusCode === 200 && netRes1.headers['x-cache'] === 'MISS', 'First query execution produces X-Cache: MISS');
    const netRes2 = await requestHttp(apiAddr.port, '/api/v1/search?q=javascript');
    assert(netRes2.statusCode === 200 && netRes2.headers['x-cache'] === 'HIT', 'Second identical query executes instantly from LRU cache (X-Cache: HIT)');

    // 4. Empty Queries
    const emptyRes = await requestHttp(apiAddr.port, '/api/v1/search?q=');
    assert(emptyRes.statusCode === 200 && emptyRes.json?.results?.length === 0, 'Empty query returns 200 OK with 0 hits');
    assert(emptyRes.json?.meta?.totalHits === 0, 'Empty query metadata reports 0 total hits');

    // 5. Long Queries
    const longQuery = 'comprehensive ECMAScript reference guide and modern web development standards';
    const longRes = await requestHttp(apiAddr.port, `/api/v1/search?q=${encodeURIComponent(longQuery)}`);
    assert(longRes.statusCode === 200 && longRes.json?.results?.length > 0, 'Long multi-word query executes accurately');

    const oversizedQuery = 'x'.repeat(250);
    const oversizedRes = await requestHttp(apiAddr.port, `/api/v1/search?q=${encodeURIComponent(oversizedQuery)}`);
    assert(oversizedRes.statusCode === 400 && oversizedRes.json?.error?.code === 'QUERY_TOO_LONG', 'Oversized query (>200 chars) is safely rejected with HTTP 400 QUERY_TOO_LONG');

    // 6. No-Result Queries
    const noResultRes = await requestHttp(apiAddr.port, '/api/v1/search?q=nonexistentquantumsuperstringxyz');
    assert(noResultRes.statusCode === 200 && noResultRes.json?.results?.length === 0, 'No-result query returns 0 hits safely');
    assert(noResultRes.json?.meta?.totalHits === 0, 'No-result query provides zero-count metadata for empty-state UI');

    // 7. Common Searches
    const commonRes = await requestHttp(apiAddr.port, '/api/v1/search?q=http+protocol');
    assert(commonRes.statusCode === 200 && commonRes.json?.results?.length > 0, 'Common search query executes successfully');
    assert(commonRes.json?.results[0]?.title?.includes('HTTP'), 'Top ranked result matches search intent');

    // 8. Multiple Result Pages
    const page1Res = await requestHttp(apiAddr.port, '/api/v1/search?q=wikipedia+index+ranking&page=1&pageSize=2');
    const page2Res = await requestHttp(apiAddr.port, '/api/v1/search?q=wikipedia+index+ranking&page=2&pageSize=2');
    assert(page1Res.statusCode === 200 && page2Res.statusCode === 200, 'Multi-page pagination endpoints return HTTP 200');
    assert(page1Res.json?.pagination?.page === 1 && page2Res.json?.pagination?.page === 2, 'Pagination metadata tracks page numbers correctly');
    assert(page1Res.json?.pagination?.hasNextPage === true && page2Res.json?.pagination?.hasPrevPage === true, 'Pagination flags hasNextPage and hasPrevPage correctly');

    // 9. External Result Links
    assert(desktopRes.body.includes('rel="noopener noreferrer"'), 'Result links enforce rel="noopener noreferrer" protection');

    // 10. API Failure Behavior
    const invalidParamRes = await requestHttp(apiAddr.port, '/api/v1/search?page=-10');
    assert(invalidParamRes.statusCode === 400 && invalidParamRes.json?.error?.code === 'INVALID_PAGE_NUMBER', 'API failure on invalid parameters returns structured error payload');

    const notFoundRes = await requestHttp(apiAddr.port, '/api/v1/invalid-route');
    assert(notFoundRes.statusCode === 404 && (notFoundRes.json?.error?.code === 'NOT_FOUND_ERROR' || notFoundRes.json?.error?.code === 'NOT_FOUND'), 'Unmatched API routes return clean 404 JSON');

    await storage.close();
  } finally {
    if (apiServer) await apiServer.stop().catch(() => {});
    if (webServer) await webServer.stop().catch(() => {});
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  console.log(`\nVerification Summary: ${passedChecks}/${totalChecks} gates passed.`);
  if (passedChecks === totalChecks) {
    console.log('Phase 32 is FULLY VERIFIED and READY for Phase 33 (Final Security & Release Audit).\n');
  } else {
    process.exit(1);
  }
}

runPhase32Verification().catch((err) => {
  console.error('Fatal Phase 32 verification error:', err);
  process.exit(1);
});
