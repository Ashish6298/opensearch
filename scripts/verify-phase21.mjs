/**
 * OpenSearch — Phase 21 Verification Gate Runner
 *
 * Validates Responsive & Accessibility Hardening:
 * 1. Module boundary and version metadata reporting Phase 21.
 * 2. HTML shell semantic landmarks, skip navigation links, and ARIA live regions.
 * 3. Search form input attributes: aria-label, aria-describedby, placeholder hints.
 * 4. Result card semantics: role="article", aria-labelledby, domain aria-label.
 * 5. Pagination accessibility: role="group", aria-label, aria-current="page".
 * 6. CSS responsive breakpoints: @media (max-width: 768px), @media (max-width: 640px), @media (max-width: 380px).
 * 7. CSS visible focus states (:focus-visible) and skip-link styles.
 * 8. CSS touch-target sizes (min-height/min-width >= 40px/44px).
 * 9. JavaScript keyboard handlers: '/' key focusing, 'Escape' clearing, and screen-reader live announcements.
 * 10. Web server end-to-end integration serving accessible HTML, CSS, and JS assets.
 */

import {
  getWebInfo,
  getWebStatus,
  WEB_APP_INFO,
  generateHtmlShell,
  createWebServer,
  renderResultCard,
  renderPaginationControls,
} from '../apps/web/dist/index.js';

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
  console.log('\n=== Phase 21: Responsive & Accessibility Hardening Verification ===\n');

  // 1. Module Identity & Boundary
  console.log('► 1. Identity & Phase 21 Metadata');
  const status = getWebStatus();
  assert(status.phase === 'Phase 21: Responsive & Accessibility Hardening', 'Status reports Phase 21');
  assert(status.status === 'ok', 'Status reports ok');
  const info = getWebInfo();
  assert(info.phase === 'Phase 21: Responsive & Accessibility Hardening', 'Web info reports Phase 21');
  assert(WEB_APP_INFO.moduleName === '@opensearch/web', 'Module name is @opensearch/web');

  // 2. Semantic Landmarks & Skip Links
  console.log('\n► 2. Semantic Landmarks & Skip Navigation');
  const html = generateHtmlShell();
  assert(html.includes('id="skip-to-search"'), 'HTML contains skip-to-search link');
  assert(html.includes('id="skip-to-results"'), 'HTML contains skip-to-results link');
  assert(html.includes('class="skip-link"'), 'HTML skip links have skip-link class');
  assert(html.includes('id="a11y-announcer"'), 'HTML contains a11y live announcer element');
  assert(html.includes('aria-live="polite"'), 'HTML a11y announcer uses aria-live="polite"');
  assert(html.includes('role="banner"'), 'Header has role="banner" landmark');
  assert(html.includes('role="main"'), 'Main area has role="main" landmark');
  assert(html.includes('role="contentinfo"'), 'Footer has role="contentinfo" landmark');

  // 3. Search Form & Controls Accessibility
  console.log('\n► 3. Search Form & Controls Accessibility');
  assert(html.includes('role="search"'), 'Search form has role="search"');
  assert(html.includes('aria-label="Web Search Form"'), 'Form has aria-label');
  assert(html.includes('aria-label="Search query"'), 'Search input has aria-label');
  assert(html.includes('aria-describedby="search-hint"'), 'Search input has aria-describedby');
  assert(html.includes('id="search-hint"'), 'Screen reader search hint exists');
  assert(html.includes('aria-label="Clear search input"'), 'Clear button has aria-label');
  assert(html.includes('aria-label="Submit search"'), 'Submit button has aria-label');

  // 4. Result Card Semantics
  console.log('\n► 4. Result Card Accessibility Semantics');
  const cardHtml = renderResultCard({
    documentId: 'doc-a11y',
    url: 'https://opensearch.example.org',
    displayUrl: 'opensearch.example.org',
    domain: 'opensearch.example.org',
    title: 'Accessible Search Architecture',
    highlightedTitle: 'Accessible <mark>Search</mark> Architecture',
    snippet: 'Screen reader accessible search results with high contrast.',
    highlightedSnippet: 'Screen reader accessible <mark>search</mark> results.',
  });
  assert(cardHtml.includes('role="article"'), 'Result card has role="article"');
  assert(cardHtml.includes('aria-labelledby="result-title-doc-a11y"'), 'Result card has aria-labelledby matching title ID');
  assert(cardHtml.includes('id="result-title-doc-a11y"'), 'Result card title has unique ID matching labelledby');
  assert(cardHtml.includes('aria-label="Domain"'), 'Domain badge has aria-label="Domain"');
  assert(cardHtml.includes('target="_blank"'), 'Title link opens in external window');
  assert(cardHtml.includes('rel="noopener noreferrer"'), 'External link has noopener noreferrer');

  // 5. Pagination Accessibility
  console.log('\n► 5. Pagination Controls Accessibility');
  const paginationHtml = renderPaginationControls({
    page: 2,
    pageSize: 10,
    totalHits: 50,
    totalPages: 5,
    hasNextPage: true,
    hasPrevPage: true,
    nextPage: 3,
    prevPage: 1,
  });
  assert(paginationHtml.includes('aria-label="Search Results Pagination"'), 'Pagination has descriptive aria-label');
  assert(paginationHtml.includes('role="group"'), 'Pagination pages wrapper has role="group"');
  assert(paginationHtml.includes('aria-label="Page selection"'), 'Pagination pages wrapper has aria-label');
  assert(paginationHtml.includes('aria-current="page"'), 'Active page has aria-current="page"');
  assert(paginationHtml.includes('aria-label="Go to previous page"'), 'Previous button has descriptive aria-label');
  assert(paginationHtml.includes('aria-label="Go to next page"'), 'Next button has descriptive aria-label');

  // 6. HTTP Web Server End-to-End Asset Verification
  console.log('\n► 6. Web Server & Asset Serving Smoke Test');
  const server = createWebServer({
    apiUrl: 'http://localhost:3000/api/v1/search',
  });
  const serverInfo = await server.start(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${serverInfo.port}`;

  try {
    // HTML check
    const indexRes = await fetch(`${baseUrl}/`);
    assert(indexRes.status === 200, 'Server responds 200 OK to root HTML');
    const indexHtml = await indexRes.text();
    assert(indexHtml.includes('id="skip-to-search"'), 'Served HTML contains skip link');

    // CSS check
    const cssRes = await fetch(`${baseUrl}/style.css`);
    assert(cssRes.status === 200, 'Server responds 200 OK to style.css');
    const cssContent = await cssRes.text();
    assert(cssContent.includes('.skip-link'), 'CSS contains skip-link styles');
    assert(cssContent.includes(':focus-visible'), 'CSS contains focus-visible focus ring styles');
    assert(cssContent.includes('@media (max-width: 640px)'), 'CSS contains mobile responsive media query');
    assert(cssContent.includes('@media (max-width: 380px)'), 'CSS contains compact mobile media query');
    assert(cssContent.includes('min-height: 44px'), 'CSS ensures >=44px touch targets on buttons');

    // JS check
    const jsRes = await fetch(`${baseUrl}/app.js`);
    assert(jsRes.status === 200, 'Server responds 200 OK to app.js');
    const jsContent = await jsRes.text();
    assert(jsContent.includes('announceA11y'), 'Client JS contains a11y live announcer function');
    assert(jsContent.includes("e.key === '/'"), 'Client JS handles "/" keyboard shortcut');
    assert(jsContent.includes("e.key === 'Escape'"), 'Client JS handles "Escape" key');
  } finally {
    await server.stop();
  }

  console.log('\n--------------------------------------------------');
  console.log(`Phase 21 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Fatal error during Phase 21 verification:', err);
  process.exit(1);
});
