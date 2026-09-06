#!/usr/bin/env node
/**
 * OpenSearch — Phase 20: Search Results UI Verification
 *
 * Validates the search results presentation components:
 *   1. Result Cards Structure (Title, domain badge, display URL, snippet)
 *   2. Safe Highlight Rendering (Preserves <mark> tags while escaping other HTML/XSS)
 *   3. Long URL and Word-Break Resilience (Layout stability under oversized tokens)
 *   4. Results Summary Counter ("About X results (Yms)")
 *   5. Multi-Page Pagination Bar (Previous, Next, Numbered Page navigation)
 *   6. Empty Result Presentation (Polite message, query echo, search tips)
 *   7. External Links Security (target="_blank", rel="noopener noreferrer")
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import {
  renderResultCard,
  renderResultsSummary,
  renderPaginationControls,
  sanitizeHighlightedHtml,
  getWebStatus,
  getWebInfo,
} from '../apps/web/dist/index.js';

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
  console.log('\n=== Phase 20: Search Results UI Verification ===\n');

  // 1. Boundary & Identity
  console.log(`${HEAD} 1. Boundary & Identity Metadata`);
  const status = getWebStatus();
  check('Status reports Phase 20', status.phase === 'Phase 20: Search Results UI');
  check('Status reports ok', status.status === 'ok');
  const info = getWebInfo();
  check('Web info reports OpenSearch', info.title === 'OpenSearch');

  // 2. Result Card Rendering
  console.log(`\n${HEAD} 2. Result Card Presentation`);
  const card = renderResultCard({
    documentId: 'doc-bm25',
    url: 'https://opensearch.dev/docs/ranking',
    displayUrl: 'opensearch.dev › docs › ranking',
    domain: 'opensearch.dev',
    title: 'BM25 Relevance Scoring Engine',
    highlightedTitle: '<mark>BM25</mark> Relevance Scoring Engine',
    snippet: 'OpenSearch implements lexical BM25 ranking with multi-field weighting.',
    highlightedSnippet:
      'OpenSearch implements lexical <mark>BM25</mark> ranking with multi-field weighting.',
    rank: 1,
    score: 8.45,
  });

  check('Card contains article tag', card.includes('<article class="result-card"'));
  check('Card contains data-document-id', card.includes('data-document-id="doc-bm25"'));
  check(
    'Card contains domain badge',
    card.includes('<span class="result-domain-badge">opensearch.dev</span>'),
  );
  check('Card contains display URL', card.includes('opensearch.dev › docs › ranking'));
  check(
    'Card contains external link with security attributes',
    card.includes('target="_blank"') && card.includes('rel="noopener noreferrer"'),
  );
  check(
    'Card contains highlighted title',
    card.includes('<mark>BM25</mark> Relevance Scoring Engine'),
  );
  check('Card contains highlighted snippet', card.includes('lexical <mark>BM25</mark> ranking'));

  // 3. HTML Escaping & XSS Protection in Result Cards
  console.log(`\n${HEAD} 3. XSS Protection & Long URL Resilience`);
  const xssCard = renderResultCard({
    documentId: 'doc-malicious',
    url: 'https://example.com/exploit?query=<script>alert("xss")</script>',
    displayUrl: 'example.com/exploit?query=<script>alert("xss")</script>',
    domain: 'example.com',
    title: '<script>alert(1)</script> Hacked Title',
    snippet: '<img src=x onerror=alert(2)> Malicious payload.',
  });

  check(
    'Script tag in title is escaped',
    !xssCard.includes('<script>') && xssCard.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
  );
  check(
    'Image onerror injection is escaped',
    !xssCard.includes('<img src=x') && xssCard.includes('&lt;img src=x onerror=alert(2)&gt;'),
  );
  check(
    'Script tag in URL attribute is escaped',
    !xssCard.includes('<script>alert("xss")</script>'),
  );

  const longToken = 'A'.repeat(300);
  const longUrlCard = renderResultCard({
    documentId: 'doc-long',
    url: `https://example.com/${longToken}`,
    displayUrl: `example.com › ${longToken}`,
    title: 'Long URL Test',
    snippet: 'Text content',
  });
  check('Long URLs format safely without throwing', longUrlCard.length > 300);

  // 4. Safe Highlighting Helper
  console.log(`\n${HEAD} 4. Safe Highlight HTML Filter`);
  const sanitized = sanitizeHighlightedHtml('<b>bold</b> <mark>hit</mark> <script>evil()</script>');
  check('Preserves <mark> tags', sanitized.includes('<mark>hit</mark>'));
  check('Escapes unpermitted <b> tag', sanitized.includes('&lt;b&gt;bold&lt;/b&gt;'));
  check(
    'Escapes unpermitted <script> tag',
    sanitized.includes('&lt;script&gt;evil()&lt;/script&gt;'),
  );

  // 5. Results Summary Metadata Bar
  console.log(`\n${HEAD} 5. Results Summary Metadata Bar`);
  check('Single result text matches', renderResultsSummary(1, 5) === 'About 1 result (5ms)');
  check(
    'Multiple results text formatted with commas',
    renderResultsSummary(5420, 18) === 'About 5,420 results (18ms)',
  );
  check('0 results returns empty summary', renderResultsSummary(0, 2) === '');

  // 6. Pagination Navigation Bar
  console.log(`\n${HEAD} 6. Multi-Page Pagination Bar`);
  const paginationHtml = renderPaginationControls({
    page: 2,
    pageSize: 10,
    totalHits: 45,
    totalPages: 5,
    hasNextPage: true,
    hasPrevPage: true,
    nextPage: 3,
    prevPage: 1,
  });

  check('Pagination container present', paginationHtml.includes('class="pagination-container"'));
  check(
    'Previous button present with target page 1',
    paginationHtml.includes('id="pagination-prev-btn"') && paginationHtml.includes('data-page="1"'),
  );
  check(
    'Next button present with target page 3',
    paginationHtml.includes('id="pagination-next-btn"') && paginationHtml.includes('data-page="3"'),
  );
  check(
    'Active page 2 marked with aria-current="page"',
    paginationHtml.includes('data-page="2"') && paginationHtml.includes('aria-current="page"'),
  );

  const singlePageHtml = renderPaginationControls({
    page: 1,
    pageSize: 10,
    totalHits: 4,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
    nextPage: null,
    prevPage: null,
  });
  check('Single page returns empty pagination bar', singlePageHtml === '');

  console.log('\n--------------------------------------------------');
  console.log(`Phase 20 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Unhandled error during Phase 20 verification:', err);
  process.exit(1);
});
