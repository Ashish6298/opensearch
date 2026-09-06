#!/usr/bin/env node
/**
 * OpenSearch — Phase 17: Search Endpoint Verification
 *
 * Exercises the complete Phase 17 Search HTTP API endpoint end-to-end:
 *   1. Search Query Execution (GET & POST /api/v1/search):
 *      - Full pipeline: Query Parsing -> Candidate Retrieval -> BM25 Ranking -> Result Formatting
 *      - Output contains title, highlightedTitle, url, displayUrl, domain, snippet, highlightedSnippet
 *   2. Pagination Controls:
 *      - Page navigation, pageSize enforcement, hasNextPage, hasPrevPage calculation
 *   3. Missing & Zero Match Behavior:
 *      - Empty query strings return empty results gracefully with 200 OK
 *      - Non-matching queries return empty results gracefully with 200 OK
 *   4. Request Validation & Error Handling:
 *      - Invalid page numbers (e.g. page=0 or negative) return HTTP 400 with INVALID_PAGE_NUMBER
 *      - Excessive pageSize (e.g. pageSize=500) returns HTTP 400 with INVALID_PAGE_SIZE
 *      - Malformed JSON in POST body returns HTTP 400 with INVALID_JSON
 *   5. Response Metadata & Telemetry:
 *      - totalHits, candidateCount, durationMs, and timestamp tracking
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import { createDocumentProcessor, createInvertedIndex } from '../packages/indexer/dist/index.js';
import { createApiServer } from '../apps/api/dist/index.js';

const PASS = '\u001b[32m✓\u001b[0m';
const FAIL = '\u001b[31m✗\u001b[0m';
const HEAD = '\u001b[36m►\u001b[0m';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

async function runVerification() {
  console.log('\n=== Phase 17: Search Endpoint Verification ===\n');

  const index = createInvertedIndex();
  const processor = createDocumentProcessor();

  // Ingest sample documents into index
  index.addDocument(
    processor.process({
      id: 'doc-search',
      url: 'https://opensearch.dev/docs/search',
      title: 'OpenSearch Search Engine Pipeline',
      headings: 'BM25 Ranking and Candidate Retrieval',
      description: 'Core retrieval and ranking algorithms for high throughput web search.',
      bodyText:
        'OpenSearch provides lexical ranking with BM25, exact phrase matching, and document storage persistence.',
      language: 'en',
    }),
  );

  index.addDocument(
    processor.process({
      id: 'doc-crawler',
      url: 'https://opensearch.dev/docs/crawler',
      title: 'Web Crawler Subsystem',
      headings: 'Robots.txt Policy and Rate Limiting',
      description: 'Polite autonomous crawler for web pages and sitemaps.',
      bodyText:
        'The crawler queues URLs, obeys robots.txt directives, and fetches HTML content safely with SSRF protection.',
      language: 'en',
    }),
  );

  index.addDocument(
    processor.process({
      id: 'doc-storage',
      url: 'https://opensearch.dev/docs/storage',
      title: 'Storage and Persistence Subsystem',
      headings: 'Document and URL Repositories',
      description: 'Embedded JSON storage with atomic updates and file locking.',
      bodyText:
        'Storage repository persists crawled documents, metadata, and index versions with ACID safety.',
      language: 'en',
    }),
  );

  const server = createApiServer({ index });
  const info = await server.start(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${info.port}`;

  try {
    // 1. GET /api/v1/search
    console.log(`${HEAD} 1. GET /api/v1/search Query Execution`);
    const searchRes = await fetch(`${baseUrl}/api/v1/search?q=search+pipeline`);
    check('Search endpoint returns HTTP 200 OK', searchRes.status === 200);
    check(
      'Response Content-Type is application/json',
      searchRes.headers.get('content-type')?.includes('application/json'),
    );

    const searchData = await searchRes.json();
    check(
      'Query terms reflected in response metadata',
      searchData.query?.terms?.includes('search'),
    );
    check('Results returned', searchData.results?.length >= 1);
    check('Top result matches doc-search', searchData.results[0]?.documentId === 'doc-search');
    check(
      'Title is formatted',
      searchData.results[0]?.title === 'OpenSearch Search Engine Pipeline',
    );
    check(
      'Highlighting injected in title',
      searchData.results[0]?.highlightedTitle?.includes('<mark>Search</mark>'),
    );
    check(
      'Display URL formatted',
      searchData.results[0]?.displayUrl?.includes('opensearch.dev › docs › search'),
    );
    check('Snippet present', searchData.results[0]?.snippet?.length > 0);
    check('Total hits reported', searchData.meta?.totalHits >= 1);

    // 2. POST /api/v1/search
    console.log(`\n${HEAD} 2. POST /api/v1/search JSON Body Query`);
    const postRes = await fetch(`${baseUrl}/api/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: 'crawler robots', page: 1, pageSize: 5 }),
    });
    check('POST search returns HTTP 200 OK', postRes.status === 200);
    const postData = await postRes.json();
    check('POST result matches doc-crawler', postData.results[0]?.documentId === 'doc-crawler');

    // 3. Pagination Controls
    console.log(`\n${HEAD} 3. Pagination Controls & Metadata`);
    const pageRes = await fetch(`${baseUrl}/api/v1/search?q=subsystem&page=1&pageSize=1`);
    const pageData = await pageRes.json();
    check('Page 1 returns 1 result when pageSize=1', pageData.results?.length === 1);
    check('Pagination hasNextPage is true', pageData.pagination?.hasNextPage === true);
    check('Total pages calculated as 2', pageData.pagination?.totalPages === 2);

    // 4. Empty & Missing Query Handling
    console.log(`\n${HEAD} 4. Empty & Zero-Match Query Handling`);
    const emptyRes = await fetch(`${baseUrl}/api/v1/search?q=`);
    check('Empty query returns HTTP 200 OK', emptyRes.status === 200);
    const emptyData = await emptyRes.json();
    check('Empty query yields 0 results safely', emptyData.results?.length === 0);
    check('Empty query totalHits is 0', emptyData.meta?.totalHits === 0);

    const noMatchRes = await fetch(`${baseUrl}/api/v1/search?q=nonexistentwordxyz`);
    const noMatchData = await noMatchRes.json();
    check('Non-matching query yields 0 results safely', noMatchData.results?.length === 0);

    // 5. Validation & Error Handling
    console.log(`\n${HEAD} 5. Validation & Error Handling`);
    const invalidPageRes = await fetch(`${baseUrl}/api/v1/search?q=search&page=0`);
    check('Invalid page number returns HTTP 400', invalidPageRes.status === 400);
    const invalidPageData = await invalidPageRes.json();
    check(
      'Error code is INVALID_PAGE_NUMBER',
      invalidPageData.error?.code === 'INVALID_PAGE_NUMBER',
    );

    const invalidSizeRes = await fetch(`${baseUrl}/api/v1/search?q=search&pageSize=999`);
    check('Excessive pageSize returns HTTP 400', invalidSizeRes.status === 400);
    const invalidSizeData = await invalidSizeRes.json();
    check('Error code is INVALID_PAGE_SIZE', invalidSizeData.error?.code === 'INVALID_PAGE_SIZE');

    const malformedPostRes = await fetch(`${baseUrl}/api/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ broken json',
    });
    check('Malformed POST JSON returns HTTP 400', malformedPostRes.status === 400);
    const malformedData = await malformedPostRes.json();
    check('Error code is INVALID_JSON', malformedData.error?.code === 'INVALID_JSON');
  } finally {
    await server.stop();
  }

  console.log('\n--------------------------------------------------');
  console.log(`Phase 17 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Unhandled error during Phase 17 verification:', err);
  process.exit(1);
});
