#!/usr/bin/env node
/**
 * OpenSearch — Phase 4: URL Model, Normalization & Queue Verification
 *
 * Exercises the complete Phase 4 implementation end-to-end:
 *   1. URL validation (accepted, rejected schemes, malformed, private hosts, length)
 *   2. URL normalization (casing, ports, paths, fragments, query sorting)
 *   3. Equivalent URL detection (semantically same → same normalized form)
 *   4. URL fingerprinting (hash properties and stability)
 *   5. CrawlQueue — FIFO, dedup, capacity, empty-queue safety
 *   6. CrawlQueue — persistence and seen-set restoration across restart
 *   7. CrawlQueue — entry field correctness
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { validateUrl } from '../packages/crawler/dist/url/url-validator.js';
import { normalizeUrl } from '../packages/crawler/dist/url/url-normalizer.js';
import { computeUrlHash } from '../packages/crawler/dist/url/url-fingerprint.js';
import { PersistentCrawlQueue } from '../packages/crawler/dist/queue/persistent-queue.js';
import { ENQUEUE_RESULT } from '../packages/crawler/dist/url/url-model.js';

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


function norm(url) {
  const r = normalizeUrl(url);
  if (!r.ok) return null;
  return r.normalized;
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'os-verify-p4-'));
}

// ── Suite 1: URL Validation ─────────────────────────────────────────────────

function verifyValidation() {
  console.log(`\n${HEAD} URL Validation`);

  // Accepted
  check('accepts http URL', validateUrl('http://example.com/page').ok === true);
  check('accepts https URL', validateUrl('https://example.com/').ok === true);
  check('accepts URL with query', validateUrl('https://example.com/search?q=test').ok === true);
  check(
    'accepts URL with non-default port',
    validateUrl('http://example.com:8080/api').ok === true,
  );
  check('accepts URL with uppercase (normalized)', validateUrl('HTTPS://EXAMPLE.COM/').ok === true);
  check(
    'accepts URL with fragment (fragment stripped in result)',
    (() => {
      const r = validateUrl('https://example.com/page#section');
      return r.ok && !r.parsed.href.includes('#');
    })(),
  );

  // Rejected schemes
  const badSchemes = [
    'javascript:alert(1)',
    'data:text/html,<h1>hi</h1>',
    'file:///etc/passwd',
    'ftp://files.example.com/data.zip',
    'blob:https://example.com/uuid',
    'mailto:user@example.com',
  ];
  for (const url of badSchemes) {
    check(`rejects scheme: ${url.split(':')[0]}:`, validateUrl(url).ok === false);
  }

  // Malformed
  check('rejects empty string', validateUrl('').ok === false);
  check('rejects whitespace string', validateUrl('   ').ok === false);
  check('rejects null', validateUrl(null).ok === false);
  check('rejects bare text', validateUrl('not a url').ok === false);
  check(
    'rejects URL exceeding 2048 chars',
    validateUrl('https://example.com/' + 'a'.repeat(2048)).ok === false,
  );
  check(
    'provides reason string on rejection',
    (() => {
      const r = validateUrl('ftp://example.com');
      return !r.ok && typeof r.reason === 'string' && r.reason.length > 0;
    })(),
  );

  // Private/loopback hosts
  const privateHosts = [
    'http://127.0.0.1/',
    'http://10.0.0.1/',
    'http://192.168.1.1/',
    'http://172.16.0.1/',
    'http://169.254.1.1/',
    'http://localhost/',
  ];
  for (const url of privateHosts) {
    check(`rejects private host: ${new URL(url).hostname}`, validateUrl(url).ok === false);
  }
}

// ── Suite 2: URL Normalization ──────────────────────────────────────────────

function verifyNormalization() {
  console.log(`\n${HEAD} URL Normalization`);

  // Casing
  check('lowercases scheme', norm('HTTP://example.com/') === 'http://example.com/');
  check('lowercases hostname', norm('https://WWW.EXAMPLE.COM/') === 'https://www.example.com/');

  // Default port removal
  check('removes default http port 80', norm('http://example.com:80/') === 'http://example.com/');
  check(
    'removes default https port 443',
    norm('https://example.com:443/') === 'https://example.com/',
  );
  check(
    'preserves non-default port 8080',
    norm('http://example.com:8080/') === 'http://example.com:8080/',
  );

  // Fragment removal
  check(
    'removes fragment from path',
    norm('https://example.com/page#section') === 'https://example.com/page',
  );
  check('removes fragment from root', norm('https://example.com/#top') === 'https://example.com/');
  check(
    'removes fragment from query URL',
    norm('https://example.com/page?q=1#anchor') === 'https://example.com/page?q=1',
  );

  // Path normalization
  check(
    'adds root slash when path missing',
    norm('https://example.com') === 'https://example.com/',
  );
  check(
    'removes trailing slash on non-root',
    norm('https://example.com/path/') === 'https://example.com/path',
  );
  check('preserves root slash', norm('https://example.com/') === 'https://example.com/');
  check(
    'resolves dot segments (./)',
    norm('https://example.com/a/./b') === 'https://example.com/a/b',
  );
  check(
    'resolves dot-dot segments (../)',
    norm('https://example.com/a/b/../c') === 'https://example.com/a/c',
  );
  check(
    'collapses double slashes',
    norm('https://example.com//a//b') === 'https://example.com/a/b',
  );

  // Query string
  check(
    'preserves query string',
    norm('https://example.com/search?q=hello') === 'https://example.com/search?q=hello',
  );
  check(
    'sorts query params alphabetically',
    norm('https://example.com/?b=2&a=1') === 'https://example.com/?a=1&b=2',
  );
  check(
    'removes bare ? with empty value',
    norm('https://example.com/page?') === 'https://example.com/page',
  );
  check(
    'preserves different query values as different URLs',
    norm('https://example.com/?id=1') !== norm('https://example.com/?id=2'),
  );

  // Semantic correctness
  check(
    'different pages remain different after normalization',
    norm('https://example.com/p1') !== norm('https://example.com/p2'),
  );
  check(
    'different pagination pages remain distinct',
    norm('https://example.com/articles?page=1') !== norm('https://example.com/articles?page=2'),
  );
}

// ── Suite 3: Equivalent URL Detection ──────────────────────────────────────

function verifyEquivalence() {
  console.log(`\n${HEAD} Equivalent URL Detection`);

  check(
    'http uppercase == http lowercase',
    norm('HTTP://EXAMPLE.COM/page') === norm('http://example.com/page'),
  );
  check(
    'port 80 == no port (http)',
    norm('http://example.com:80/page') === norm('http://example.com/page'),
  );
  check(
    'port 443 == no port (https)',
    norm('https://example.com:443/page') === norm('https://example.com/page'),
  );
  check(
    'trailing slash on non-root == no trailing slash',
    norm('https://example.com/path/') === norm('https://example.com/path'),
  );
  check(
    'URL with fragment == URL without fragment',
    norm('https://example.com/page#s1') === norm('https://example.com/page'),
  );
  check(
    'two different fragments both → same normalized form',
    norm('https://example.com/page#sec1') === norm('https://example.com/page#sec2'),
  );
  check(
    'query-sorted == query-unsorted',
    norm('https://example.com/?a=1&b=2') === norm('https://example.com/?b=2&a=1'),
  );
}

// ── Suite 4: URL Fingerprinting ─────────────────────────────────────────────

function verifyFingerprint() {
  console.log(`\n${HEAD} URL Fingerprinting`);

  const h1 = computeUrlHash('https://example.com/page');
  check('hash is 64-character hex string', h1.length === 64 && /^[0-9a-f]{64}$/.test(h1));
  check('hash is lowercase', h1 === h1.toLowerCase());
  check(
    'deterministic — same input → same hash',
    computeUrlHash('https://example.com/page') === h1,
  );
  check(
    'different URLs produce different hashes',
    computeUrlHash('https://example.com/page1') !== computeUrlHash('https://example.com/page2'),
  );
  check(
    'equivalent normalized URLs produce same hash',
    (() => {
      const n1 = norm('https://example.com:443/');
      const n2 = norm('https://example.com/');
      return computeUrlHash(n1) === computeUrlHash(n2);
    })(),
  );
}

// ── Suite 5: CrawlQueue — FIFO & Core Operations ────────────────────────────

async function verifyQueue() {
  console.log(`\n${HEAD} CrawlQueue — FIFO & Core Operations`);
  const dir = tempDir();
  const q = new PersistentCrawlQueue({ persistenceDir: dir });
  await q.initialize();

  check('initial size is 0', (await q.size()) === 0);
  check('isEmpty is true initially', (await q.isEmpty()) === true);
  check('dequeue on empty returns null', (await q.dequeue()) === null);
  check('peek on empty returns null', (await q.peek()) === null);

  const r1 = await q.enqueue('https://example.com/a', 0, null);
  const r2 = await q.enqueue('https://example.com/b', 1, 'https://example.com/');
  const r3 = await q.enqueue('https://example.com/c', 1, 'https://example.com/');
  check('first enqueue returns QUEUED', r1.code === ENQUEUE_RESULT.QUEUED);
  check('second enqueue returns QUEUED', r2.code === ENQUEUE_RESULT.QUEUED);
  check('third enqueue returns QUEUED', r3.code === ENQUEUE_RESULT.QUEUED);
  check('size is 3 after 3 enqueues', (await q.size()) === 3);

  const peeked = await q.peek();
  check('peek returns first element', peeked?.normalizedUrl === 'https://example.com/a');
  check('peek does not remove (size still 3)', (await q.size()) === 3);

  const d1 = await q.dequeue();
  const d2 = await q.dequeue();
  const d3 = await q.dequeue();
  check('FIFO: first dequeued is /a', d1?.normalizedUrl === 'https://example.com/a');
  check('FIFO: second dequeued is /b', d2?.normalizedUrl === 'https://example.com/b');
  check('FIFO: third dequeued is /c', d3?.normalizedUrl === 'https://example.com/c');
  check('queue is empty after all dequeued', (await q.isEmpty()) === true);

  await q.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── Suite 6: CrawlQueue — Deduplication ─────────────────────────────────────

async function verifyDedup() {
  console.log(`\n${HEAD} CrawlQueue — Deduplication`);
  const dir = tempDir();
  const q = new PersistentCrawlQueue({ persistenceDir: dir });
  await q.initialize();

  await q.enqueue('http://example.com/', 0, null);
  const dup1 = await q.enqueue('http://example.com/', 0, null);
  check('same URL → DUPLICATE_SKIPPED', dup1.code === ENQUEUE_RESULT.DUPLICATE_SKIPPED);
  check('size remains 1 after duplicate', (await q.size()) === 1);

  // Semantic equivalents (same scheme!)
  const dup2 = await q.enqueue('HTTP://EXAMPLE.COM:80/', 0, null);
  check(
    'semantically equivalent URL (uppercase+port80) → DUPLICATE_SKIPPED',
    dup2.code === ENQUEUE_RESULT.DUPLICATE_SKIPPED,
  );

  const dupFrag = await q.enqueue('http://example.com/#sec1', 0, null);
  check(
    'same URL with different fragment → DUPLICATE_SKIPPED',
    dupFrag.code === ENQUEUE_RESULT.DUPLICATE_SKIPPED,
  );

  // Dequeued URL stays in seen-set
  await q.dequeue();
  const reEnq = await q.enqueue('http://example.com/', 0, null);
  check(
    'dequeued URL re-enqueue → DUPLICATE_SKIPPED',
    reEnq.code === ENQUEUE_RESULT.DUPLICATE_SKIPPED,
  );

  // Different query values → different resources
  const p1 = await q.enqueue('https://example.com/?page=1', 0, null);
  const p2 = await q.enqueue('https://example.com/?page=2', 0, null);
  check(
    'different page values → both QUEUED (distinct resources)',
    p1.code === ENQUEUE_RESULT.QUEUED && p2.code === ENQUEUE_RESULT.QUEUED,
  );

  // contains() check
  const hashRoot = computeUrlHash(norm('http://example.com/'));
  check('contains() returns true for seen URL', (await q.contains(hashRoot)) === true);
  check('contains() returns false for unknown hash', (await q.contains('a'.repeat(64))) === false);

  // clear() preserves seen-set
  await q.clear();
  check('clear() resets size to 0', (await q.size()) === 0);
  const afterClear = await q.enqueue('http://example.com/', 0, null);
  check(
    're-enqueue after clear → still DUPLICATE_SKIPPED (seen-set preserved)',
    afterClear.code === ENQUEUE_RESULT.DUPLICATE_SKIPPED,
  );

  await q.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── Suite 7: CrawlQueue — Invalid URLs ──────────────────────────────────────

async function verifyInvalidUrls() {
  console.log(`\n${HEAD} CrawlQueue — Invalid URL Handling`);
  const dir = tempDir();
  const q = new PersistentCrawlQueue({ persistenceDir: dir });
  await q.initialize();

  const cases = [
    ['javascript:alert(1)', 'javascript: scheme'],
    ['ftp://files.example.com/', 'ftp: scheme'],
    ['http://192.168.1.1/', 'private IP'],
    ['http://localhost/', 'localhost'],
    ['not-a-url', 'malformed URL'],
  ];

  for (const [url, desc] of cases) {
    const r = await q.enqueue(url, 0, null);
    check(`rejects ${desc} → INVALID_URL`, r.code === ENQUEUE_RESULT.INVALID_URL);
  }
  check('size remains 0 after all invalid enqueues', (await q.size()) === 0);

  await q.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── Suite 8: CrawlQueue — Capacity Limit ────────────────────────────────────

async function verifyCapacity() {
  console.log(`\n${HEAD} CrawlQueue — Capacity Limit`);
  const dir = tempDir();
  const q = new PersistentCrawlQueue({ persistenceDir: dir, maxQueueSize: 3 });
  await q.initialize();

  await q.enqueue('https://example.com/a', 0, null);
  await q.enqueue('https://example.com/b', 0, null);
  await q.enqueue('https://example.com/c', 0, null);
  const full = await q.enqueue('https://example.com/d', 0, null);

  check('4th enqueue with maxQueueSize=3 → QUEUE_FULL', full.code === ENQUEUE_RESULT.QUEUE_FULL);
  check('size does not exceed maxQueueSize', (await q.size()) === 3);

  await q.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── Suite 9: CrawlQueue — Entry Fields ──────────────────────────────────────

async function verifyEntryFields() {
  console.log(`\n${HEAD} CrawlQueue — Entry Field Correctness`);
  const dir = tempDir();
  const q = new PersistentCrawlQueue({ persistenceDir: dir });
  await q.initialize();

  const r = await q.enqueue('HTTP://EXAMPLE.COM:80/path/', 2, 'https://example.com/parent');
  check('enqueue returns QUEUED', r.code === ENQUEUE_RESULT.QUEUED);

  const entry = r.entry;
  check(
    'normalizedUrl is canonical (lowercase, no default port, no trailing slash)',
    entry?.normalizedUrl === 'http://example.com/path',
  );
  check('urlHash is 64-char hex', entry?.urlHash?.length === 64);
  check(
    'urlHash matches computeUrlHash(normalizedUrl)',
    entry?.urlHash === computeUrlHash(entry?.normalizedUrl ?? ''),
  );
  check('depth is preserved', entry?.depth === 2);
  check('discoveredFrom is preserved', entry?.discoveredFrom === 'https://example.com/parent');
  check(
    'enqueuedAt is valid ISO timestamp',
    (() => {
      const ts = new Date(entry?.enqueuedAt ?? '').getTime();
      return !isNaN(ts) && ts > 0;
    })(),
  );

  await q.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── Suite 10: CrawlQueue — Persistence Across Restart ───────────────────────

async function verifyPersistence() {
  console.log(`\n${HEAD} CrawlQueue — Persistence Across Restart`);
  const dir = tempDir();

  // Session 1: write
  const q1 = new PersistentCrawlQueue({ persistenceDir: dir });
  await q1.initialize();
  await q1.enqueue('https://example.com/p1', 0, null);
  await q1.enqueue('https://example.com/p2', 1, null);
  await q1.dequeue(); // p1 dequeued
  await q1.close();

  check('queue.json created on disk', fs.existsSync(path.join(dir, 'queue.json')));
  check('seen.json created on disk', fs.existsSync(path.join(dir, 'seen.json')));

  // Session 2: read
  const q2 = new PersistentCrawlQueue({ persistenceDir: dir });
  await q2.initialize();

  check('pending entry (p2) survives restart', (await q2.size()) === 1);
  const next = await q2.dequeue();
  check(
    'next dequeue returns p2 (FIFO preserved)',
    next?.normalizedUrl === 'https://example.com/p2',
  );

  const hashP1 = computeUrlHash(norm('https://example.com/p1'));
  check('seen-set restored — p1 still considered seen', (await q2.contains(hashP1)) === true);

  const reEnq = await q2.enqueue('https://example.com/p1', 0, null);
  check(
    're-enqueue of dequeued p1 → DUPLICATE_SKIPPED (cross-restart dedup)',
    reEnq.code === ENQUEUE_RESULT.DUPLICATE_SKIPPED,
  );

  await q2.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── Suite 11: Initialization Guard ──────────────────────────────────────────

async function verifyInitGuard() {
  console.log(`\n${HEAD} CrawlQueue — Initialization Guard`);
  const dir = tempDir();
  const q = new PersistentCrawlQueue({ persistenceDir: dir });

  let threw = false;
  try {
    await q.size();
  } catch {
    threw = true;
  }
  check('size() throws if called before initialize()', threw === true);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    '\n\u001b[1mOpenSearch — Phase 4: URL Model, Normalization & Queue Verification\u001b[0m',
  );
  console.log('═══════════════════════════════════════════════════════════════════\n');

  try {
    verifyValidation();
    verifyNormalization();
    verifyEquivalence();
    verifyFingerprint();
    await verifyQueue();
    await verifyDedup();
    await verifyInvalidUrls();
    await verifyCapacity();
    await verifyEntryFields();
    await verifyPersistence();
    await verifyInitGuard();
  } catch (err) {
    console.error('\n\u001b[31mUnhandled error during verification:\u001b[0m', err);
    failed++;
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  if (failed === 0) {
    console.log(`\u001b[32m\u001b[1m  PASSED ${passed}/${passed + failed} checks\u001b[0m`);
  } else {
    console.log(`\u001b[31m\u001b[1m  FAILED: ${failed} checks failed (${passed} passed)\u001b[0m`);
  }
  console.log('═══════════════════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

main();
