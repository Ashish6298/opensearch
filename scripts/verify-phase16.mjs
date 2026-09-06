#!/usr/bin/env node
/**
 * OpenSearch — Phase 16: Search API Foundation Verification
 *
 * Exercises the complete Phase 16 HTTP Search API service end-to-end:
 *   1. Server Lifecycle:
 *      - Starting server on ephemeral port
 *      - Clean address and port allocation
 *   2. Health Endpoint (GET /health):
 *      - Returns 200 OK
 *      - Content-Type is application/json
 *      - Uptime, memory usage, and routes present
 *   3. Root Discovery (GET /) & System Status (GET /api/v1/status):
 *      - Service discovery metadata
 *   4. Routing & Error Handling:
 *      - 404 Not Found returns structured SafeErrorResponse
 *      - 405 Method Not Allowed returns structured error JSON
 *   5. Middlewares & Security:
 *      - CORS headers and preflight OPTIONS handling (204)
 *      - Security headers (X-Content-Type-Options: nosniff, X-Frame-Options: DENY)
 *   6. Clean Shutdown:
 *      - Server stops gracefully closing all listeners
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

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
  console.log('\n=== Phase 16: Search API Foundation Verification ===\n');

  const server = createApiServer();
  const info = await server.start(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${info.port}`;

  try {
    // 1. Server Startup
    console.log(`${HEAD} 1. HTTP Server Startup`);
    check('Server started successfully on ephemeral port', info.port > 0);
    check('Server host bound to 127.0.0.1', info.host === '127.0.0.1');

    // 2. Health Endpoint (GET /health)
    console.log(`\n${HEAD} 2. Health Check Endpoint (GET /health)`);
    const healthRes = await fetch(`${baseUrl}/health`);
    check('Health check returns HTTP 200 OK', healthRes.status === 200);
    check(
      'Health Content-Type is application/json',
      healthRes.headers.get('content-type')?.includes('application/json'),
    );

    const healthData = await healthRes.json();
    check('Health status is "ok"', healthData.status === 'ok');
    check('Health name is "OpenSearch"', healthData.name === 'OpenSearch');
    check('Health version is "1.0.0"', healthData.version === '1.0.0');
    check('Uptime seconds reported', typeof healthData.uptimeSeconds === 'number');
    check('Memory usage in MB reported', typeof healthData.memoryUsageMb === 'number');
    check('Routes available listed', healthData.routesAvailable?.includes('GET /health'));

    // 3. API Root & Discovery (GET /)
    console.log(`\n${HEAD} 3. API Discovery Endpoints (GET / & GET /api/v1/status)`);
    const rootRes = await fetch(`${baseUrl}/`);
    check('Root returns HTTP 200 OK', rootRes.status === 200);
    const rootData = await rootRes.json();
    check('Root contains healthEndpoint link', rootData.healthEndpoint === '/health');

    const statusRes = await fetch(`${baseUrl}/api/v1/status`);
    check('Status returns HTTP 200 OK', statusRes.status === 200);
    const statusData = await statusRes.json();
    check('Status contains server port info', statusData.server?.port !== undefined);

    // 4. Routing & Error Handling
    console.log(`\n${HEAD} 4. Routing & Error Handling`);
    const notFoundRes = await fetch(`${baseUrl}/unknown-endpoint-xyz`);
    check('Non-existent route returns HTTP 404', notFoundRes.status === 404);
    const notFoundData = await notFoundRes.json();
    check('404 error code is NOT_FOUND_ERROR', notFoundData.error?.code === 'NOT_FOUND_ERROR');
    check('404 error category is NOT_FOUND', notFoundData.error?.category === 'NOT_FOUND');

    const notAllowedRes = await fetch(`${baseUrl}/health`, { method: 'POST' });
    check('Method not allowed returns HTTP 405', notAllowedRes.status === 405);
    const notAllowedData = await notAllowedRes.json();
    check(
      '405 error code is METHOD_NOT_ALLOWED',
      notAllowedData.error?.code === 'METHOD_NOT_ALLOWED',
    );

    // 5. Middlewares & Security Headers
    console.log(`\n${HEAD} 5. Middlewares & Security Headers`);
    check('CORS header present', healthRes.headers.get('access-control-allow-origin') !== null);
    check(
      'X-Content-Type-Options: nosniff present',
      healthRes.headers.get('x-content-type-options') === 'nosniff',
    );
    check('X-Frame-Options: DENY present', healthRes.headers.get('x-frame-options') === 'DENY');

    const optionsRes = await fetch(`${baseUrl}/health`, { method: 'OPTIONS' });
    check('CORS preflight OPTIONS returns HTTP 204', optionsRes.status === 204);
  } finally {
    // 6. Graceful Shutdown
    console.log(`\n${HEAD} 6. Graceful Server Shutdown`);
    await server.stop();
    check('Server stopped successfully', true);
  }

  console.log('\n--------------------------------------------------');
  console.log(`Phase 16 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Unhandled error during Phase 16 verification:', err);
  process.exit(1);
});
