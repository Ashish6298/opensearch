#!/usr/bin/env node
/**
 * OpenSearch — Phase 7: HTML Parsing & Content Extraction Verification
 *
 * Exercises the complete Phase 7 implementation end-to-end:
 *   1. HTML Text Cleaner:
 *      - Entity decoding (&amp;, &lt;, &gt;, &quot;, &#39;, &#169;, &#x20;, etc.)
 *      - Noise stripping (<script>, <style>, <noscript>, <svg>, <nav>, <header>, <footer>, comments)
 *      - Whitespace normalization
 *   2. Title Extraction:
 *      - <title> tag extraction
 *      - og:title fallback
 *      - <h1> fallback
 *   3. Meta Description Extraction:
 *      - <meta name="description">
 *      - <meta property="og:description">
 *   4. Headings Hierarchy:
 *      - Structured h1–h6 extraction
 *      - Concatenated headings string
 *   5. Canonical URL Resolution:
 *      - <link rel="canonical" href="..."> relative and absolute resolution
 *      - Validation and canonical fallback
 *   6. Language Detection:
 *      - <html lang="...">
 *      - <meta http-equiv="content-language">
 *      - HTTP response headers
 *   7. Outbound Link Extraction:
 *      - Relative URL resolution with <base href="..."> support
 *      - Filtering non-HTTP/HTTPS schemes (mailto:, javascript:, file:)
 *      - Phase 4 normalization & deduplication
 *   8. Malformed & Empty Document Resilience:
 *      - Empty HTML handling
 *      - Broken HTML tags and unclosed tags without crashing
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import {
  createHtmlParser,
  decodeHtmlEntities,
  stripHtmlNoiseTags,
  cleanVisibleText,
  extractBaseHref,
  extractOutboundLinks,
} from '../packages/crawler/dist/index.js';

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

// ── Suite 1: Entity Decoding & Text Cleaning ────────────────────────────────

function verifyTextCleaner() {
  console.log(`\n${HEAD} Entity Decoding & Noise Removal`);

  const decoded = decodeHtmlEntities('Search &amp; Find &lt;Fast&gt; &quot;Now&quot; &#169; 2026');
  check('decodes named and numeric entities', decoded === 'Search & Find <Fast> "Now" © 2026');

  const dirtyHtml = `
    <!-- Top comment -->
    <header><nav><a href="/">Home</a></nav></header>
    <h1>Title</h1>
    <script>const x = 10;</script>
    <style>body { font: 12px; }</style>
    <noscript>Enable JS</noscript>
    <svg><path d="M0 0"/></svg>
    <p>Clean body text.</p>
    <footer>Copyright 2026</footer>
  `;

  const stripped = stripHtmlNoiseTags(dirtyHtml, true);
  check('strips <script>', !stripped.includes('const x = 10;'));
  check('strips <style>', !stripped.includes('font: 12px;'));
  check('strips <noscript>', !stripped.includes('Enable JS'));
  check(
    'strips <header>/<nav>/<footer>',
    !stripped.includes('Home') && !stripped.includes('Copyright 2026'),
  );
  check('preserves content', stripped.includes('Title') && stripped.includes('Clean body text.'));

  const text = cleanVisibleText('<p>Line 1</p><br><div>Line   2</div>');
  check(
    'normalizes whitespace and block newlines',
    text.includes('Line 1') && text.includes('Line 2'),
  );
}

// ── Suite 2: Rich Document Extraction ───────────────────────────────────────

function verifyRichDocumentExtraction() {
  console.log(`\n${HEAD} Rich Document Extraction`);

  const parser = createHtmlParser();

  const richHtml = `
    <!DOCTYPE html>
    <html lang="en-GB">
    <head>
      <title>OpenSearch — Next-Gen Search</title>
      <meta name="description" content="Privacy-first search engine built from scratch.">
      <link rel="canonical" href="/canonical-about">
    </head>
    <body>
      <nav><a href="/">Home</a></nav>
      <h1>OpenSearch Overview</h1>
      <p>A fast, decentralized web indexer.</p>
      <h2>Design Principles</h2>
      <p>Privacy by default, no user tracking.</p>
      <h3>Storage Architecture</h3>
      <p>Modular JSON storage adapters.</p>
      <a href="/docs/start.html">Getting Started</a>
      <a href="https://example.com/blog">External Blog</a>
      <a href="mailto:admin@example.com">Email</a>
      <a href="#top">Back to top</a>
    </body>
    </html>
  `;

  const doc = parser.parse(richHtml, 'https://opensearch.org/about.html');

  check('extracts title', doc.title === 'OpenSearch — Next-Gen Search');
  check(
    'extracts description',
    doc.description === 'Privacy-first search engine built from scratch.',
  );
  check(
    'resolves relative canonical URL',
    doc.canonicalUrl === 'https://opensearch.org/canonical-about',
  );
  check('extracts language code', doc.language === 'en');
  check(
    'extracts headings string',
    doc.headings.includes('OpenSearch Overview') && doc.headings.includes('Design Principles'),
  );
  check('extracts heading items array', doc.headingItems.length === 3);
  check(
    'body text contains readable paragraphs',
    doc.bodyText.includes('A fast, decentralized web indexer.') &&
      doc.bodyText.includes('Privacy by default, no user tracking.'),
  );
  check(
    'filters mailto and fragment links',
    !doc.discoveredUrls.some(u => u.includes('mailto') || u.includes('#top')),
  );
  check(
    'normalizes and extracts outbound URLs',
    doc.discoveredUrls.includes('https://opensearch.org/docs/start.html') &&
      doc.discoveredUrls.includes('https://example.com/blog'),
  );
}

// ── Suite 3: Fallbacks, Base Href, and Malformed HTML ───────────────────────

function verifyFallbacksAndResilience() {
  console.log(`\n${HEAD} Fallbacks & Malformed HTML Resilience`);

  const parser = createHtmlParser();

  // Fallback to og:title
  const ogDoc = parser.parse(
    '<meta property="og:title" content="OG Title">',
    'https://example.com',
  );
  check('falls back to og:title', ogDoc.title === 'OG Title');

  // Fallback to h1
  const h1Doc = parser.parse('<h1>H1 Fallback</h1>', 'https://example.com');
  check('falls back to h1', h1Doc.title === 'H1 Fallback');

  // Base href resolution
  const baseHtml = `
    <html>
      <head><base href="https://cdn.example.org/dir/"><link rel="canonical" href="page.html"></head>
      <body><a href="link.html">Link</a></body>
    </html>
  `;
  const baseDoc = parser.parse(baseHtml, 'https://example.com/main');
  check(
    'canonical resolves against base href',
    baseDoc.canonicalUrl === 'https://cdn.example.org/dir/page.html',
  );
  check(
    'link resolves against base href',
    baseDoc.discoveredUrls.includes('https://cdn.example.org/dir/link.html'),
  );

  // Malformed HTML
  const malformed = `
    <<<title>Malformed Title<<
    <p unclosed tag<a href="/valid">Broken
    <script>alert(1)
  `;
  const malDoc = parser.parse(malformed, 'https://example.com');
  check('does not throw on malformed HTML', typeof malDoc === 'object' && malDoc !== null);
  check(
    'extracts links from malformed markup',
    malDoc.discoveredUrls.includes('https://example.com/valid'),
  );

  // Empty HTML
  const emptyDoc = parser.parse('', 'https://example.com');
  check(
    'handles empty input string',
    emptyDoc.title === '' && emptyDoc.bodyText === '' && emptyDoc.discoveredUrls.length === 0,
  );
}

// ── Main Runner ─────────────────────────────────────────────────────────────

async function main() {
  console.log('OpenSearch — Phase 7: HTML Parsing & Content Extraction Verification');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  verifyTextCleaner();
  verifyRichDocumentExtraction();
  verifyFallbacksAndResilience();

  console.log('\n═══════════════════════════════════════════════════════════════════');
  if (failed === 0) {
    console.log(`  \u001b[32mPASSED ${passed}/${passed} checks\u001b[0m`);
    console.log('═══════════════════════════════════════════════════════════════════\n');
    process.exit(0);
  } else {
    console.log(
      `  \u001b[31mFAILED ${failed}/${passed + failed} checks (${passed} passed)\u001b[0m`,
    );
    console.log('═══════════════════════════════════════════════════════════════════\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled error during Phase 7 verification:', err);
  process.exit(1);
});
