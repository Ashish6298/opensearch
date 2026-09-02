#!/usr/bin/env node
/**
 * OpenSearch — Phase 3: Storage Foundation Verification
 *
 * Exercises the full storage layer end-to-end:
 *   1. Initializes a JsonStorageAdapter in a temporary directory
 *   2. Creates records in all four repositories
 *   3. Verifies lookups, updates, status filtering, and persistence across simulated restarts
 *   4. Confirms health reporting
 *   5. Cleans up
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { JsonStorageAdapter } from '../packages/storage/dist/adapters/json-adapter.js';
import { CRAWL_STATUS, INDEX_STATUS } from '../packages/storage/dist/models.js';

// ── Helpers ────────────────────────────────────────────────────────────────

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

async function checkThrows(label, fn, errorClass) {
  try {
    await fn();
    console.log(`  ${FAIL} ${label}: expected an error but none was thrown`);
    failed++;
  } catch (err) {
    if (errorClass && !(err instanceof errorClass)) {
      console.log(`  ${FAIL} ${label}: wrong error type — got ${err.constructor.name}`);
      failed++;
    } else {
      console.log(`  ${PASS} ${label}`);
      passed++;
    }
  }
}

function urlHash(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'os-verify-p3-'));
}

// ── Test Suites ────────────────────────────────────────────────────────────

async function verifyDocumentRepository(storageDir) {
  console.log(`\n${HEAD} Document Repository`);
  const adapter = new JsonStorageAdapter({ storageDir });
  await adapter.initialize();

  const url = 'https://verify.example.com/article-1';
  const hash = urlHash(url);

  const doc = await adapter.documents.create({
    url,
    urlHash: hash,
    title: 'Verification Article',
    description: 'Test description',
    headings: 'Main Heading',
    bodyText: 'Body text content for verification purposes.',
    language: 'en',
    contentType: 'text/html',
    contentLength: 1024,
    httpStatus: 200,
    outboundLinks: ['https://verify.example.com/article-2'],
  });

  check('Document created with stable ID', typeof doc.id === 'string' && doc.id.length > 0);
  check('crawledAt is set', typeof doc.crawledAt === 'string');
  check('updatedAt is set', typeof doc.updatedAt === 'string');
  check('indexStatus defaults to not_indexed', doc.indexStatus === INDEX_STATUS.NOT_INDEXED);

  const byId = await adapter.documents.findById(doc.id);
  check('findById returns document', byId !== null && byId.id === doc.id);

  const byHash = await adapter.documents.findByUrlHash(hash);
  check('findByUrlHash returns document', byHash !== null && byHash.id === doc.id);

  const byUrl = await adapter.documents.findByUrl(url);
  check('findByUrl returns document', byUrl !== null && byUrl.id === doc.id);

  check('findById returns null for unknown id', await adapter.documents.findById('nope') === null);

  const updated = await adapter.documents.update(doc.id, {
    indexStatus: INDEX_STATUS.INDEXED,
    indexVersion: 'v1.0',
    lastIndexedAt: new Date().toISOString(),
  });
  check('update changes indexStatus', updated.indexStatus === INDEX_STATUS.INDEXED);
  check('update preserves URL', updated.url === url);

  const indexed = await adapter.documents.findByIndexStatus(INDEX_STATUS.INDEXED);
  check('findByIndexStatus returns indexed doc', indexed.some(d => d.id === doc.id));

  check('count is 1', await adapter.documents.count() === 1);

  await adapter.close();
}

async function verifyUrlRepository(storageDir) {
  console.log(`\n${HEAD} URL Repository`);
  const adapter = new JsonStorageAdapter({ storageDir });
  await adapter.initialize();

  const url = 'https://verify.example.com/';
  const hash = urlHash(url);

  const rec = await adapter.urls.create({
    url,
    urlHash: hash,
    domain: 'verify.example.com',
    scheme: 'https',
    crawlStatus: CRAWL_STATUS.PENDING,
    lastHttpStatus: null,
    referrerUrl: null,
    depth: 0,
  });

  check('UrlRecord created', rec.urlHash === hash);
  check('discoveredAt is set (ms timestamp)', typeof rec.discoveredAt === 'number' && rec.discoveredAt > 0);
  check('attemptCount starts at 0', rec.attemptCount === 0);

  const byHash = await adapter.urls.findByHash(hash);
  check('findByHash works', byHash !== null && byHash.url === url);

  const byUrl = await adapter.urls.findByUrl(url);
  check('findByUrl works', byUrl !== null && byUrl.urlHash === hash);

  const updated = await adapter.urls.update(hash, {
    crawlStatus: CRAWL_STATUS.SUCCESS,
    attemptCount: 1,
    lastAttemptedAt: Date.now(),
    lastSucceededAt: Date.now(),
    lastHttpStatus: 200,
  });
  check('update changes crawlStatus', updated.crawlStatus === CRAWL_STATUS.SUCCESS);
  check('update increments attemptCount', updated.attemptCount === 1);

  const pending = await adapter.urls.findByCrawlStatus(CRAWL_STATUS.PENDING);
  check('findByCrawlStatus PENDING returns empty after update', pending.length === 0);

  check('count is 1', await adapter.urls.count() === 1);

  await adapter.close();
}

async function verifyCrawlRepository(storageDir) {
  console.log(`\n${HEAD} Crawl Repository`);
  const adapter = new JsonStorageAdapter({ storageDir });
  await adapter.initialize();

  const url = 'https://verify.example.com/news';
  const hash = urlHash(url);

  const rec = await adapter.crawls.create({
    url,
    urlHash: hash,
    status: CRAWL_STATUS.SUCCESS,
    httpStatus: 200,
    contentType: 'text/html',
    responseBytes: 5120,
    durationMs: 280,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    errorMessage: null,
    redirectChain: [],
    finalUrl: url,
    documentId: null,
  });

  check('CrawlRecord created with ID', typeof rec.crawlId === 'string' && rec.crawlId.length > 0);
  check('status is SUCCESS', rec.status === CRAWL_STATUS.SUCCESS);

  const byId = await adapter.crawls.findById(rec.crawlId);
  check('findById works', byId !== null && byId.crawlId === rec.crawlId);

  const byUrl = await adapter.crawls.findByUrl(url);
  check('findByUrl returns all crawls for URL', byUrl.length === 1);

  const byHash = await adapter.crawls.findByUrlHash(hash);
  check('findByUrlHash works', byHash.length === 1);

  check('count is 1', await adapter.crawls.count() === 1);

  await adapter.close();
}

async function verifyIndexMetadata(storageDir) {
  console.log(`\n${HEAD} Index Metadata Repository`);
  const adapter = new JsonStorageAdapter({ storageDir });
  await adapter.initialize();

  check('findActive returns null initially', await adapter.indexMetadata.findActive() === null);

  const meta = await adapter.indexMetadata.create({
    version: '1.0.0-dev',
    completedAt: null,
    isActive: false,
    documentCount: 0,
    termCount: 0,
    indexPath: './data/index/v1',
    status: 'building',
    errorMessage: null,
    lastRebuildAt: null,
  });

  check('IndexMetadata created with buildId', typeof meta.buildId === 'string' && meta.buildId.length > 0);
  check('startedAt is set', typeof meta.startedAt === 'string');

  const updated = await adapter.indexMetadata.update(meta.buildId, {
    status: 'ready',
    isActive: true,
    completedAt: new Date().toISOString(),
    documentCount: 150,
    termCount: 8420,
  });
  check('update changes status to ready', updated.status === 'ready');
  check('update sets documentCount', updated.documentCount === 150);

  const active = await adapter.indexMetadata.findActive();
  check('findActive returns the ready+active record', active !== null && active.buildId === meta.buildId);

  const list = await adapter.indexMetadata.list();
  check('list returns all records', list.length === 1);

  await adapter.close();
}

async function verifyPersistence(storageDir) {
  console.log(`\n${HEAD} Persistence (simulated restart)`);
  const url = 'https://persist.example.com/page';
  const hash = urlHash(url);

  // Write
  const w = new JsonStorageAdapter({ storageDir });
  await w.initialize();
  const doc = await w.documents.create({
    url, urlHash: hash,
    title: 'Persistence Test',
    description: '',
    headings: '',
    bodyText: 'This should survive a restart.',
    language: 'en',
    contentType: 'text/html',
    contentLength: 512,
    httpStatus: 200,
    outboundLinks: [],
  });
  await w.close();

  // Check files on disk
  check('documents.json exists on disk',
    fs.existsSync(path.join(storageDir, 'documents.json')));

  // Read (fresh adapter, same dir)
  const r = new JsonStorageAdapter({ storageDir });
  await r.initialize();
  const found = await r.documents.findById(doc.id);
  check('Document survives process restart', found !== null && found.title === 'Persistence Test');
  check('Persistent URL index works', (await r.documents.findByUrl(url)) !== null);
  await r.close();
}

async function verifyHealth(storageDir) {
  console.log(`\n${HEAD} Storage Health`);
  const adapter = new JsonStorageAdapter({ storageDir });
  await adapter.initialize();

  const url = 'https://health.example.com/';
  const hash = urlHash(url);
  await adapter.documents.create({
    url, urlHash: hash, title: 'H', description: '', headings: '',
    bodyText: 'x', language: null, contentType: 'text/html',
    contentLength: 1, httpStatus: 200, outboundLinks: [],
  });

  const h = await adapter.health();
  check('health.initialized is true', h.initialized === true);
  check('health.documentCount is 1', h.documentCount === 1);
  check('health.urlCount is 0', h.urlCount === 0); // not registered in url repo for this test
  check('health.storageDir matches', h.storageDir === storageDir);

  await adapter.close();
}

async function verifyValidation() {
  console.log(`\n${HEAD} Input Validation`);
  const dir = tempDir();
  const adapter = new JsonStorageAdapter({ storageDir: dir });
  await adapter.initialize();

  const base = {
    url: 'https://val.example.com/', urlHash: urlHash('https://val.example.com/'),
    title: 'V', description: '', headings: '', bodyText: 'body',
    language: null, contentType: 'text/html', contentLength: 1,
    httpStatus: 200, outboundLinks: [],
  };

  await checkThrows('Rejects javascript: URL scheme',
    () => adapter.documents.create({ ...base, url: 'javascript:alert(1)', urlHash: urlHash('javascript:alert(1)') }));

  await checkThrows('Rejects invalid httpStatus (999)',
    () => adapter.documents.create({ ...base, url: 'https://v2.com', urlHash: urlHash('https://v2.com'), httpStatus: 999 }));

  await checkThrows('Rejects non-array outboundLinks',
    () => adapter.documents.create({ ...base, url: 'https://v3.com', urlHash: urlHash('https://v3.com'), outboundLinks: 'bad' }));

  await checkThrows('Rejects UrlRecord with ftp: scheme',
    () => adapter.urls.create({
      url: 'ftp://bad.example.com', urlHash: urlHash('ftp://bad.example.com'),
      domain: 'bad.example.com', scheme: 'ftp',
      crawlStatus: CRAWL_STATUS.PENDING, lastHttpStatus: null,
      referrerUrl: null, depth: 0,
    }));

  await checkThrows('Rejects CrawlRecord with invalid status',
    () => adapter.crawls.create({
      url: 'https://val.example.com/', urlHash: urlHash('https://val.example.com/'),
      status: 'invalid', httpStatus: 200, contentType: null, responseBytes: null,
      durationMs: null, startedAt: new Date().toISOString(), completedAt: null,
      errorMessage: null, redirectChain: [], finalUrl: null, documentId: null,
    }));

  await adapter.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n\u001b[1mOpenSearch — Phase 3: Storage Foundation Verification\u001b[0m');
  console.log('══════════════════════════════════════════════════════\n');

  // Each suite gets its own isolated temp directory
  const dirs = {};
  for (const key of ['docs', 'urls', 'crawls', 'idx', 'persist', 'health']) {
    dirs[key] = tempDir();
  }

  try {
    await verifyDocumentRepository(dirs.docs);
    await verifyUrlRepository(dirs.urls);
    await verifyCrawlRepository(dirs.crawls);
    await verifyIndexMetadata(dirs.idx);
    await verifyPersistence(dirs.persist);
    await verifyHealth(dirs.health);
    await verifyValidation();
  } catch (err) {
    console.error('\n\u001b[31mUnhandled error during verification:\u001b[0m', err);
    failed++;
  } finally {
    // Cleanup all temp directories
    for (const dir of Object.values(dirs)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log('\n══════════════════════════════════════════════════════');
  if (failed === 0) {
    console.log(`\u001b[32m\u001b[1m  PASSED ${passed}/${passed + failed} checks\u001b[0m`);
  } else {
    console.log(`\u001b[31m\u001b[1m  FAILED: ${failed} checks failed (${passed} passed)\u001b[0m`);
  }
  console.log('══════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main();
