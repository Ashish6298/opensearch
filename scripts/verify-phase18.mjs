#!/usr/bin/env node
/**
 * OpenSearch — Phase 18: API Security, Limits & Reliability Verification
 *
 * Exercises all security, limits, and reliability controls of the HTTP API:
 *   1. Request Size Limits (413 Payload Too Large for bodies > 64KB)
 *   2. Query Length Limits (400 Bad Request for queries > 200 chars)
 *   3. Rate Limiting & Abuse Prevention (429 Too Many Requests + Retry-After + X-RateLimit-* headers)
 *   4. Request Timeout Enforcement (504 Gateway Timeout on slow routes)
 *   5. Safe Error Responses & Secrets Protection (no stack traces or internal paths exposed)
 *   6. Security Headers (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, X-XSS-Protection)
 *   7. CORS Policy & Preflight handling (OPTIONS 204 No Content with appropriate headers)
 *   8. Privacy-Minimizing Logging (IP anonymization)
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import { createDocumentProcessor, createInvertedIndex } from '../packages/indexer/dist/index.js';
import { createApiServer, anonymizeIp, createRateLimiter } from '../apps/api/dist/index.js';

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
  console.log('\n=== Phase 18: API Security, Limits & Reliability Verification ===\n');

  const index = createInvertedIndex();
  const processor = createDocumentProcessor();

  index.addDocument(
    processor.process({
      id: 'doc-security',
      url: 'https://opensearch.dev/docs/security',
      title: 'OpenSearch API Security & Rate Protection',
      headings: 'Rate Limiting and Safe Error Responses',
      description: 'Defensive architecture and security policies.',
      bodyText:
        'OpenSearch API secures endpoints against DoS with sliding-window rate limiters and strict query bounds.',
      language: 'en',
    }),
  );

  const server = createApiServer({
    index,
    rateLimitPerMinute: 50,
    searchTimeoutMs: 3000,
    corsOrigin: 'http://localhost:5173',
  });
  const info = await server.start(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${info.port}`;

  try {
    // 1. Security Headers
    console.log(`${HEAD} 1. Security Headers & Defense-in-Depth`);
    const headRes = await fetch(`${baseUrl}/health`);
    check('Health endpoint returns HTTP 200 OK', headRes.status === 200);
    check(
      'X-Content-Type-Options is nosniff',
      headRes.headers.get('x-content-type-options') === 'nosniff',
    );
    check('X-Frame-Options is DENY', headRes.headers.get('x-frame-options') === 'DENY');
    check(
      'X-XSS-Protection is enabled',
      headRes.headers.get('x-xss-protection') === '1; mode=block',
    );
    check(
      'Referrer-Policy is strict-origin-when-cross-origin',
      headRes.headers.get('referrer-policy') === 'strict-origin-when-cross-origin',
    );
    check(
      'Content-Security-Policy is restrictive',
      headRes.headers.get('content-security-policy')?.includes("default-src 'none'"),
    );

    // 2. CORS Policy & Preflight
    console.log(`\n${HEAD} 2. CORS Policy & OPTIONS Preflight`);
    const optionsRes = await fetch(`${baseUrl}/api/v1/search`, { method: 'OPTIONS' });
    check('OPTIONS preflight returns HTTP 204 No Content', optionsRes.status === 204);
    check(
      'Access-Control-Allow-Origin matches configured origin',
      optionsRes.headers.get('access-control-allow-origin') === 'http://localhost:5173',
    );
    check(
      'Access-Control-Allow-Methods includes GET and POST',
      optionsRes.headers.get('access-control-allow-methods')?.includes('GET') &&
        optionsRes.headers.get('access-control-allow-methods')?.includes('POST'),
    );

    // 3. Query Length Limits
    console.log(`\n${HEAD} 3. Query Length Limits`);
    const longQuery = 'x'.repeat(250);
    const queryLimitRes = await fetch(`${baseUrl}/api/v1/search?q=${longQuery}`);
    check('Oversized query returns HTTP 400 Bad Request', queryLimitRes.status === 400);
    const queryLimitData = await queryLimitRes.json();
    check(
      'Error code is QUERY_TOO_LONG',
      queryLimitData.error?.code === 'QUERY_TOO_LONG',
      queryLimitData.error?.code,
    );
    check('Error category is VALIDATION', queryLimitData.error?.category === 'VALIDATION');

    // 4. Request Body Size Limits
    console.log(`\n${HEAD} 4. Request Body Size Limits`);
    const oversizedBody = JSON.stringify({
      q: 'security',
      extraData: 'A'.repeat(70 * 1024), // 70KB > 64KB limit
    });
    const bodyLimitRes = await fetch(`${baseUrl}/api/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: oversizedBody,
    });
    check('Oversized payload returns HTTP 413 Payload Too Large', bodyLimitRes.status === 413);
    const bodyLimitData = await bodyLimitRes.json();
    check(
      'Error code is PAYLOAD_TOO_LARGE',
      bodyLimitData.error?.code === 'PAYLOAD_TOO_LARGE',
      bodyLimitData.error?.code,
    );

    // 5. Rate Limiting Enforcement
    console.log(`\n${HEAD} 5. Rate Limiting & Abuse Prevention`);
    const rateLimitedServer = createApiServer({ rateLimitPerMinute: 2 });
    const rateInfo = await rateLimitedServer.start(0, '127.0.0.1');
    const rateBaseUrl = `http://127.0.0.1:${rateInfo.port}`;

    try {
      const r1 = await fetch(`${rateBaseUrl}/health`);
      check('1st request allowed (remaining: 1)', r1.status === 200);
      check(
        'X-RateLimit-Remaining header decremented',
        r1.headers.get('x-ratelimit-remaining') === '1',
      );

      const r2 = await fetch(`${rateBaseUrl}/health`);
      check('2nd request allowed (remaining: 0)', r2.status === 200);

      const r3 = await fetch(`${rateBaseUrl}/health`);
      check('3rd request rejected with HTTP 429 Too Many Requests', r3.status === 429);
      check('Retry-After header present', r3.headers.get('retry-after') !== null);
      const r3Data = await r3.json();
      check(
        'Error code is RATE_LIMIT_EXCEEDED',
        r3Data.error?.code === 'RATE_LIMIT_EXCEEDED',
        r3Data.error?.code,
      );
    } finally {
      await rateLimitedServer.stop();
    }

    // 6. Request Timeout Controls
    console.log(`\n${HEAD} 6. Request Timeout Controls`);
    const timeoutServer = createApiServer({ searchTimeoutMs: 50 });
    timeoutServer.getRouter().get('/test-timeout', async () => {
      await new Promise(r => setTimeout(r, 120));
    });
    const timeoutInfo = await timeoutServer.start(0, '127.0.0.1');
    const timeoutBaseUrl = `http://127.0.0.1:${timeoutInfo.port}`;

    try {
      const slowRes = await fetch(`${timeoutBaseUrl}/test-timeout`);
      check('Slow request returns HTTP 504 Gateway Timeout', slowRes.status === 504);
      const slowData = await slowRes.json();
      check(
        'Error code is REQUEST_TIMEOUT',
        slowData.error?.code === 'REQUEST_TIMEOUT',
        slowData.error?.code,
      );
      check('Error category is TIMEOUT', slowData.error?.category === 'TIMEOUT');
    } finally {
      await timeoutServer.stop();
    }

    // 7. Safe Error Responses & Privacy
    console.log(`\n${HEAD} 7. Safe Error Handling & Privacy`);
    const notFoundRes = await fetch(`${baseUrl}/secret-admin-panel`);
    check('Non-existent endpoint returns HTTP 404', notFoundRes.status === 404);
    const notFoundData = await notFoundRes.json();
    check('No stack trace exposed in response error', notFoundData.error?.stack === undefined);
    check('No top-level stack property present', notFoundData.stack === undefined);

    check('IP anonymization masks IPv4 last octet', anonymizeIp('192.168.1.100') === '192.168.1.0');
    check(
      'IP anonymization masks IPv6 host bits',
      anonymizeIp('2001:db8:85a3::8a2e:370:7334') === '2001:db8:85a3::',
    );

    // 8. Standalone Rate Limiter Verification
    console.log(`\n${HEAD} 8. Standalone MemoryRateLimiter Unit Logic`);
    const directLimiter = createRateLimiter({ maxRequests: 2, windowMs: 1000 });
    const c1 = directLimiter.consume('client-a');
    check('Standalone limiter consumes 1st token', c1.allowed && c1.remaining === 1);
    const c2 = directLimiter.consume('client-a');
    check('Standalone limiter consumes 2nd token', c2.allowed && c2.remaining === 0);
    const c3 = directLimiter.consume('client-a');
    check('Standalone limiter denies 3rd token', !c3.allowed && c3.remaining === 0);
    directLimiter.destroy();
  } finally {
    await server.stop();
  }

  console.log('\n--------------------------------------------------');
  console.log(`Phase 18 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Unhandled error during Phase 18 verification:', err);
  process.exit(1);
});
