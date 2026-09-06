#!/usr/bin/env node
/**
 * OpenSearch — Phase 19: Search UI Foundation Verification
 *
 * Validates the core public search interface:
 *   1. Application Shell Structure (Header, Main, Footer, ARIA roles, semantics)
 *   2. Search Box & Actions (Input attributes, clear button, submit button)
 *   3. Responsive Layout & CSS Design Tokens (CSS asset serving and variables)
 *   4. Client JavaScript & State Controllers (Event bindings, state transitions)
 *   5. State Placeholders (Loading skeleton, Empty state, Error state)
 *   6. Embedded WebServer Lifecycle (HTTP 200, Content-Type, security headers, health)
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import {
  generateHtmlShell,
  createWebServer,
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
  console.log('\n=== Phase 19: Search UI Foundation Verification ===\n');

  // 1. Boundary & Identity Metadata
  console.log(`${HEAD} 1. Boundary & Identity Metadata`);
  const status = getWebStatus();
  check('Status reports Phase 19', status.phase === 'Phase 19: Search UI Foundation');
  check('Status reports ok', status.status === 'ok');
  const info = getWebInfo();
  check('Web info reports OpenSearch', info.title === 'OpenSearch');

  // 2. Application Shell & HTML Semantics
  console.log(`\n${HEAD} 2. Application Shell & Semantic HTML5`);
  const html = generateHtmlShell({
    title: 'OpenSearch Verification',
    apiUrl: 'http://localhost:3000/api/v1/search',
  });

  check('Contains DOCTYPE html5', html.includes('<!DOCTYPE html>'));
  check('Contains semantic <header>', html.includes('<header class="app-header"'));
  check('Contains semantic <main>', html.includes('<main class="main-content center-mode"'));
  check('Contains semantic <footer>', html.includes('<footer class="app-footer"'));
  check('Contains ARIA landmarks', html.includes('role="search"') && html.includes('role="main"'));

  // 3. Search Controls & Input Attributes
  console.log(`\n${HEAD} 3. Search Controls & Attributes`);
  check('Search input element present', html.includes('id="search-input"'));
  check('Search input type is "search"', html.includes('type="search"'));
  check('Search input max query length bound (200)', html.includes('maxlength="200"'));
  check('Search submit button present', html.includes('id="search-submit-btn"'));
  check('Clear input button present', html.includes('id="search-clear-btn"'));

  // 4. UI State Components
  console.log(`\n${HEAD} 4. UI State Components`);
  check(
    'Loading state indicator & skeleton cards present',
    html.includes('id="loading-indicator"') && html.includes('skeleton-card'),
  );
  check(
    'Empty state with search tips present',
    html.includes('id="empty-state"') && html.includes('No search results found'),
  );
  check(
    'Error state with retry button present',
    html.includes('id="error-state"') && html.includes('id="error-retry-btn"'),
  );

  // 5. Web Server Lifecycle & Static Asset Serving
  console.log(`\n${HEAD} 5. Web Server Lifecycle & Static Asset Serving`);
  const server = createWebServer({
    apiUrl: 'http://localhost:3000/api/v1/search',
  });
  const serverInfo = await server.start(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${serverInfo.port}`;

  try {
    // GET /
    const homeRes = await fetch(`${baseUrl}/`);
    check('GET / returns HTTP 200 OK', homeRes.status === 200);
    check('GET / returns text/html', homeRes.headers.get('content-type')?.includes('text/html'));
    check(
      'Security header X-Content-Type-Options is nosniff',
      homeRes.headers.get('x-content-type-options') === 'nosniff',
    );
    check(
      'Security header X-Frame-Options is DENY',
      homeRes.headers.get('x-frame-options') === 'DENY',
    );

    // GET /style.css
    const cssRes = await fetch(`${baseUrl}/style.css`);
    check('GET /style.css returns HTTP 200 OK', cssRes.status === 200);
    check(
      'GET /style.css returns text/css',
      cssRes.headers.get('content-type')?.includes('text/css'),
    );
    const cssText = await cssRes.text();
    check(
      'CSS contains color variables and responsive styles',
      cssText.includes('--bg-primary') && cssText.includes('@media (max-width: 640px)'),
    );

    // GET /app.js
    const jsRes = await fetch(`${baseUrl}/app.js`);
    check('GET /app.js returns HTTP 200 OK', jsRes.status === 200);
    check(
      'GET /app.js returns application/javascript',
      jsRes.headers.get('content-type')?.includes('application/javascript'),
    );
    const jsText = await jsRes.text();
    check(
      'JS contains search execution and state controllers',
      jsText.includes('performSearch') && jsText.includes('renderSearchResults'),
    );

    // GET /health
    const healthRes = await fetch(`${baseUrl}/health`);
    check('GET /health returns HTTP 200 OK', healthRes.status === 200);
    const healthData = await healthRes.json();
    check('Health status reports ok', healthData.status === 'ok');

    // GET 404
    const notFoundRes = await fetch(`${baseUrl}/non-existent`);
    check('Non-existent path returns HTTP 404', notFoundRes.status === 404);
  } finally {
    await server.stop();
  }

  console.log('\n--------------------------------------------------');
  console.log(`Phase 19 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Unhandled error during Phase 19 verification:', err);
  process.exit(1);
});
