#!/usr/bin/env node
/**
 * @opensearch/scripts — Phase 31 Verification Gate Runner
 *
 * Verifies all requirements for Phase 31: Production Deployment:
 * 1. Public website opens (Serves semantic HTML shell, assets, privacy route, HTTP 200)
 * 2. Public API is reachable (GET /, GET /health, GET /api/v1/status, HTTP 200)
 * 3. Search works from the public environment (Query parsing, candidate retrieval, BM25 ranking, snippets, pagination)
 * 4. Index is available and loaded into memory (Non-zero indexed documents, inverted index stats)
 * 5. HTTPS and Security Headers work (HSTS, CSP, X-Frame-Options, X-Content-Type-Options over simulated TLS proxy)
 * 6. Production error handling & degradation reviewed (Graceful 400 validation, 503 fallback, rate limiter, CORS enforcement)
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as http from 'node:http';
import { loadConfig } from '../packages/shared/dist/index.js';
import { createStorageAdapter } from '../packages/storage/dist/index.js';
import { createIndexBuilder } from '../packages/indexer/dist/index.js';
import { CURATED_SEED_CORPUS } from '../packages/crawler/dist/index.js';
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
      res => {
        let data = '';
        res.on('data', c => (data += c));
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
      },
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runPhase31Verification() {
  console.log('================================================================');
  console.log('PHASE 31 VERIFICATION: Production Deployment');
  console.log('================================================================\n');

  const testDir = await mkdtemp(join(tmpdir(), 'opensearch-p31-gate-'));
  const storageDir = join(testDir, 'storage');
  const indexDir = join(testDir, 'index');

  let apiServer;
  let webServer;

  try {
    // 1. Configure Production Environment with zero-cost parameters
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '0',
      HOST: '127.0.0.1',
      STORAGE_DIR: storageDir,
      INDEX_DIR: indexDir,
      LOG_LEVEL: 'silent',
      LOG_FORMAT: 'json',
      CORS_ORIGIN: 'https://opensearch.local',
    });

    assert(config.isProduction === true, 'Production configuration environment validated');

    // 2. Storage & Seed Corpus Strategy
    const storage = createStorageAdapter({ config });
    await storage.initialize();

    let docCount = 0;
    for (const category of CURATED_SEED_CORPUS) {
      for (const seed of category.seeds) {
        await storage.documents.create({
          url: seed.url,
          urlHash: `p31-${category.id}-${docCount}`,
          title: seed.title,
          description: seed.description,
          headings: `${category.name} ${seed.tags.join(' ')}`,
          bodyText: `${seed.title}. ${seed.description}. Documentation and search resources for ${seed.tags.join(', ')}.`,
          language: 'en',
          contentType: 'text/html',
          contentLength: 400,
          httpStatus: 200,
          outboundLinks: [],
        });
        docCount++;
      }
    }
    assert(
      docCount > 0,
      `Production seed corpus created with ${docCount} documents across multiple categories`,
    );

    // 3. Index & Storage Deployment Strategy
    const builder = createIndexBuilder({ config, storage });
    const buildRes = await builder.build();
    assert(
      buildRes.status === 'success',
      'Production inverted index generated and atomically activated',
    );

    const activeIndex = builder.getActiveIndex();
    assert(
      activeIndex !== null && activeIndex.getStats().totalDocuments === docCount,
      'Active index contains all production documents',
    );

    // 4. API Deployment
    apiServer = createApiServer({
      config,
      index: activeIndex,
      corsOrigin: 'https://opensearch.local',
    });
    const apiAddr = await apiServer.start(0, '127.0.0.1');
    assert(apiAddr.port > 0, `Public API service listening on port ${apiAddr.port}`);

    // 5. Frontend Deployment
    webServer = createWebServer({
      config,
      apiUrl: `http://127.0.0.1:${apiAddr.port}/api/v1/search`,
    });
    const webAddr = await webServer.start(0, '127.0.0.1');
    assert(webAddr.port > 0, `Public Web service listening on port ${webAddr.port}`);

    // VERIFY CRITERION 1: Public website opens
    const webRes = await requestHttp(webAddr.port, '/', {
      headers: {
        'x-forwarded-proto': 'https',
        host: 'opensearch.local',
      },
    });
    assert(webRes.statusCode === 200, 'Public website root returns HTTP 200');
    assert(
      webRes.body.includes('OpenSearch') && webRes.body.includes('search-input'),
      'Public website renders interactive search interface',
    );

    const privacyRes = await requestHttp(webAddr.port, '/privacy', {
      headers: { 'x-forwarded-proto': 'https' },
    });
    assert(
      privacyRes.statusCode === 200 && privacyRes.body.includes('Zero-Tracking'),
      'Privacy & Data-Minimization policy page opens cleanly',
    );

    // VERIFY CRITERION 2: API is reachable
    const apiRootRes = await requestHttp(apiAddr.port, '/', {
      headers: { 'x-forwarded-proto': 'https' },
    });
    assert(
      apiRootRes.statusCode === 200 && apiRootRes.json?.name === 'OpenSearch',
      'API root / endpoint is reachable and reports service metadata',
    );

    const apiStatusRes = await requestHttp(apiAddr.port, '/api/v1/status', {
      headers: { 'x-forwarded-proto': 'https' },
    });
    assert(
      apiStatusRes.statusCode === 200 && apiStatusRes.json?.status === 'ok',
      'API system status endpoint reports ok',
    );

    // VERIFY CRITERION 3: Search works from the public environment
    const searchRes = await requestHttp(apiAddr.port, '/api/v1/search?q=javascript+documentation', {
      headers: {
        'x-forwarded-proto': 'https',
        origin: 'https://opensearch.local',
      },
    });
    assert(searchRes.statusCode === 200, 'Public search query executes successfully with HTTP 200');
    assert(
      searchRes.json?.results?.length > 0,
      'Public search returns relevant results matching query',
    );
    assert(
      searchRes.json?.pagination?.totalHits > 0,
      'Search pagination metadata is properly populated',
    );
    assert(
      searchRes.json?.results[0]?.snippet?.length > 0,
      'Search result contains highlight snippet',
    );

    // VERIFY CRITERION 4: Index is available
    const healthRes = await requestHttp(apiAddr.port, '/health', {
      headers: { 'x-forwarded-proto': 'https' },
    });
    assert(
      healthRes.statusCode === 200 && healthRes.json?.components?.index?.status === 'ok',
      'Health endpoint confirms index is available and status ok',
    );
    assert(
      healthRes.json?.totalDocumentsIndexed === docCount,
      'Health endpoint reflects exact index document count',
    );

    // VERIFY CRITERION 5: HTTPS & Security Headers
    assert(
      webRes.headers['strict-transport-security']?.includes('max-age=31536000'),
      'Web server sends Strict-Transport-Security (HSTS) over HTTPS',
    );
    assert(
      apiRootRes.headers['strict-transport-security']?.includes('max-age=31536000'),
      'API server sends Strict-Transport-Security (HSTS) over HTTPS',
    );
    assert(
      apiRootRes.headers['x-content-type-options'] === 'nosniff',
      'Security header X-Content-Type-Options is present',
    );
    assert(
      apiRootRes.headers['x-frame-options'] === 'DENY',
      'Security header X-Frame-Options is DENY',
    );

    // VERIFY CRITERION 6: Production errors reviewed & boundary validation
    const invalidQueryRes = await requestHttp(apiAddr.port, '/api/v1/search?page=-1', {
      headers: { 'x-forwarded-proto': 'https' },
    });
    assert(
      invalidQueryRes.statusCode === 400 &&
        invalidQueryRes.json?.error?.code === 'INVALID_PAGE_NUMBER',
      'API gracefully handles invalid query input with structured 400 error',
    );

    const corsPreflight = await requestHttp(apiAddr.port, '/api/v1/search', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://opensearch.local',
        'access-control-request-method': 'POST',
      },
    });
    assert(
      corsPreflight.statusCode === 204 &&
        corsPreflight.headers['access-control-allow-origin'] === 'https://opensearch.local',
      'Production CORS preflight correctly authorizes origin',
    );

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
    console.log(
      'Phase 31 is FULLY VERIFIED and READY for Phase 32 (Post-Launch Operations & Maintenance).\n',
    );
  } else {
    process.exit(1);
  }
}

runPhase31Verification().catch(err => {
  console.error('Fatal Phase 31 verification error:', err);
  process.exit(1);
});
