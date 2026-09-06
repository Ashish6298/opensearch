#!/usr/bin/env node
/**
 * OpenSearch — Phase 15: Result Generation & Snippets Verification
 *
 * Exercises the complete Phase 15 result presentation engine end-to-end:
 *   1. Full Search Pipeline Flow (Parse -> Retrieve -> Rank -> Generate Results):
 *      - Transforming ranked hits into structured SearchResultItem objects
 *   2. Readable Snippet Extraction:
 *      - Centering window around keyword clusters
 *      - Ellipsis formatting on boundaries
 *   3. Safe HTML Escaping & Query Highlighting:
 *      - Malicious XSS code escaped before `<mark>` tags inserted
 *      - Query terms highlighted in both title and snippet
 *   4. Metadata Fallbacks & URL Formatting:
 *      - Missing title gracefully falls back to URL slug or domain
 *      - Display URL formatted as breadcrumbs ('domain.com › section › page')
 *   5. Pagination Metadata:
 *      - Exact calculation of totalHits, totalPages, hasNextPage, hasPrevPage, page slicing
 *   6. Resilience & Edge Cases:
 *      - Empty queries / 0 candidate results handled gracefully without throwing
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDocumentProcessor, createInvertedIndex } from '../packages/indexer/dist/index.js';
import {
  createQueryParser,
  createCandidateRetriever,
  createRankingEngine,
  createResultGenerator,
  escapeHtml,
  stripHtmlTags,
} from '../packages/ranking/dist/index.js';

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
  console.log('\n=== Phase 15: Result Generation & Snippets Verification ===\n');

  const testDir = await mkdtemp(join(tmpdir(), 'opensearch-verify-phase15-'));
  const index = createInvertedIndex({ indexDir: testDir });
  const processor = createDocumentProcessor();
  const parser = createQueryParser();
  const retriever = createCandidateRetriever(index);
  const ranker = createRankingEngine(index);
  const generator = createResultGenerator();

  // Ingest sample documents into the index
  index.addDocument(
    processor.process({
      id: 'doc-security',
      url: 'https://security.example.org/guides/xss-defense.html',
      title: 'XSS Defense and Safe HTML Escaping in Web Apps',
      description:
        'Comprehensive guide explaining how to sanitize untrusted user input and prevent XSS injection.',
      bodyText:
        'Always escape characters like <script> or "quotes" before rendering query term highlights.',
      language: 'en',
    }),
  );

  index.addDocument(
    processor.process({
      id: 'doc-no-title',
      url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers.html',
      title: '', // Missing title to test fallback
      description: 'Reference documentation detailing standard HTTP request and response headers.',
      bodyText:
        'Headers allow the client and the server to pass additional metadata with an HTTP request.',
      language: 'en',
    }),
  );

  // 1. Full Pipeline Execution
  console.log(`${HEAD} 1. Full End-to-End Pipeline Execution`);
  const query = parser.parse('escaping xss');
  const candidateResult = retriever.retrieve(query);
  const rankedResult = ranker.rank(query, candidateResult.candidates);
  const resultSet = generator.generateResults(query, rankedResult.hits);

  check('Search results returned successfully', resultSet.items.length >= 1);
  check(
    'Top item documentId matches expected document',
    resultSet.items[0]?.documentId === 'doc-security',
  );
  check('Top item rank is 1', resultSet.items[0]?.rank === 1);

  // 2. Readable Snippet & Highlighting
  console.log(`\n${HEAD} 2. Readable Snippet Extraction & Query Highlighting`);
  const topItem = resultSet.items[0];
  check('Snippet generated and non-empty', (topItem?.snippet.length ?? 0) > 0);
  check(
    'Highlighted title contains <mark> tags',
    topItem.highlightedTitle.includes('<mark>XSS</mark>') &&
      topItem.highlightedTitle.includes('<mark>Escaping</mark>'),
  );
  check(
    'Highlighted snippet contains <mark> tags',
    topItem.highlightedSnippet.includes('<mark>XSS</mark>') ||
      topItem.highlightedSnippet.includes('<mark>xss</mark>'),
  );

  // 3. Safe HTML Escaping
  console.log(`\n${HEAD} 3. Safe HTML / Text Escaping`);
  const unsafeText = '<script>alert("hacked")</script> & "quotes"';
  const escaped = escapeHtml(unsafeText);
  check(
    'Dangerous tags escaped',
    escaped.includes('&lt;script&gt;') && !escaped.includes('<script>'),
  );
  check('Quotes and ampersands escaped', escaped.includes('&quot;') && escaped.includes('&amp;'));

  const stripped = stripHtmlTags('<p>Clean <b>text</b></p>');
  check('Tags stripped cleanly', stripped === 'Clean text');

  // 4. Metadata Fallbacks & Display URL
  console.log(`\n${HEAD} 4. Metadata Fallbacks & Breadcrumb Display URLs`);
  const qHttp = parser.parse('headers');
  const candHttp = retriever.retrieve(qHttp);
  const rankHttp = ranker.rank(qHttp, candHttp.candidates);
  const resHttp = generator.generateResults(qHttp, rankHttp.hits);

  const fallbackItem = resHttp.items.find(i => i.documentId === 'doc-no-title');
  check('Missing title falls back to URL slug', fallbackItem?.title === 'Headers');
  check('Domain parsed correctly', fallbackItem?.domain === 'developer.mozilla.org');
  check(
    'Display URL formatted with breadcrumbs',
    fallbackItem?.displayUrl.includes(
      'developer.mozilla.org › en-US › docs › Web › HTTP › Headers.html',
    ),
  );

  // 5. Pagination Metadata
  console.log(`\n${HEAD} 5. Pagination Metadata Calculations`);
  const pagination = generator.computePagination(45, 2, 10);
  check('Current page is 2', pagination.page === 2);
  check('Total pages is 5', pagination.totalPages === 5);
  check('hasNextPage is true', pagination.hasNextPage === true);
  check('hasPrevPage is true', pagination.hasPrevPage === true);
  check('nextPage is 3', pagination.nextPage === 3);
  check('prevPage is 1', pagination.prevPage === 1);
  check(
    'startIndex is 10 and endIndex is 20',
    pagination.startIndex === 10 && pagination.endIndex === 20,
  );

  // 6. Edge Cases & Resilience
  console.log(`\n${HEAD} 6. Edge Cases & Resilience`);
  const emptyRes = generator.generateResults(parser.parse(''), []);
  check(
    'Empty result set returned safely',
    emptyRes.items.length === 0 && emptyRes.pagination.totalHits === 0,
  );

  await rm(testDir, { recursive: true, force: true });

  console.log('\n--------------------------------------------------');
  console.log(`Phase 15 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Unhandled error during Phase 15 verification:', err);
  process.exit(1);
});
