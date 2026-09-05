/**
 * Phase 4 Tests — Persistent Crawl Queue
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { PersistentCrawlQueue } from '../src/queue/persistent-queue.js';
import { ENQUEUE_RESULT } from '../src/url/url-model.js';
import { computeUrlHash } from '../src/url/url-fingerprint.js';
import { normalizeUrl } from '../src/url/url-normalizer.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-queue-test-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Get the normalized URL hash for a given raw URL */
function hashFor(rawUrl: string): string {
  const r = normalizeUrl(rawUrl);
  if (!r.ok) throw new Error(`Cannot normalize: ${rawUrl}`);
  return computeUrlHash(r.normalized);
}

describe('PersistentCrawlQueue — FIFO ordering', () => {
  let tmpDir: string;
  let queue: PersistentCrawlQueue;

  beforeEach(async () => {
    tmpDir = makeTempDir();
    queue = new PersistentCrawlQueue({ persistenceDir: tmpDir });
    await queue.initialize();
  });

  afterEach(async () => {
    await queue.close();
    cleanup(tmpDir);
  });

  it('dequeues in FIFO order', async () => {
    await queue.enqueue('https://example.com/page1', 0, null);
    await queue.enqueue('https://example.com/page2', 1, 'https://example.com/');
    await queue.enqueue('https://example.com/page3', 1, 'https://example.com/');

    const d1 = await queue.dequeue();
    const d2 = await queue.dequeue();
    const d3 = await queue.dequeue();

    expect(d1?.normalizedUrl).toBe('https://example.com/page1');
    expect(d2?.normalizedUrl).toBe('https://example.com/page2');
    expect(d3?.normalizedUrl).toBe('https://example.com/page3');
  });

  it('peek does not remove entry', async () => {
    await queue.enqueue('https://example.com/peek-test', 0, null);

    const peeked = await queue.peek();
    expect(peeked?.normalizedUrl).toContain('peek-test');

    expect(await queue.size()).toBe(1);

    const dequeued = await queue.dequeue();
    expect(dequeued?.normalizedUrl).toBe(peeked?.normalizedUrl);
  });
});

describe('PersistentCrawlQueue — deduplication', () => {
  let tmpDir: string;
  let queue: PersistentCrawlQueue;

  beforeEach(async () => {
    tmpDir = makeTempDir();
    queue = new PersistentCrawlQueue({ persistenceDir: tmpDir });
    await queue.initialize();
  });

  afterEach(async () => {
    await queue.close();
    cleanup(tmpDir);
  });

  it('returns QUEUED on first enqueue', async () => {
    const result = await queue.enqueue('https://example.com/', 0, null);
    expect(result.code).toBe(ENQUEUE_RESULT.QUEUED);
    expect(result.entry).toBeDefined();
  });

  it('returns DUPLICATE_SKIPPED on second enqueue of same URL', async () => {
    await queue.enqueue('https://example.com/', 0, null);
    const second = await queue.enqueue('https://example.com/', 0, null);
    expect(second.code).toBe(ENQUEUE_RESULT.DUPLICATE_SKIPPED);
    expect(await queue.size()).toBe(1);
  });

  it('deduplicates semantically equivalent URLs (case insensitive, port strip)', async () => {
    await queue.enqueue('HTTP://EXAMPLE.COM:80/', 0, null);
    const dup = await queue.enqueue('http://example.com/', 0, null);
    expect(dup.code).toBe(ENQUEUE_RESULT.DUPLICATE_SKIPPED);
    expect(await queue.size()).toBe(1);
  });

  it('deduplicates URLs with different fragments (same resource)', async () => {
    await queue.enqueue('https://example.com/page#sec1', 0, null);
    const dup = await queue.enqueue('https://example.com/page#sec2', 0, null);
    expect(dup.code).toBe(ENQUEUE_RESULT.DUPLICATE_SKIPPED);
  });

  it('deduplicates URL that was already dequeued', async () => {
    await queue.enqueue('https://example.com/news', 0, null);
    await queue.dequeue(); // removes from queue, stays in seen-set

    const reEnqueue = await queue.enqueue('https://example.com/news', 0, null);
    expect(reEnqueue.code).toBe(ENQUEUE_RESULT.DUPLICATE_SKIPPED);
  });

  it('does NOT deduplicate URLs with different query values (different resources)', async () => {
    const r1 = await queue.enqueue('https://example.com/?page=1', 0, null);
    const r2 = await queue.enqueue('https://example.com/?page=2', 0, null);
    expect(r1.code).toBe(ENQUEUE_RESULT.QUEUED);
    expect(r2.code).toBe(ENQUEUE_RESULT.QUEUED);
    expect(await queue.size()).toBe(2);
  });

  it('contains() returns true for seen URLs (even if dequeued)', async () => {
    await queue.enqueue('https://example.com/seen', 0, null);
    const hash = hashFor('https://example.com/seen');
    expect(await queue.contains(hash)).toBe(true);

    await queue.dequeue();
    // Still in seen-set after dequeue
    expect(await queue.contains(hash)).toBe(true);
  });

  it('contains() returns false for never-seen URL hash', async () => {
    const hash = computeUrlHash('https://never-seen.example.com/');
    expect(await queue.contains(hash)).toBe(false);
  });
});

describe('PersistentCrawlQueue — invalid URL handling', () => {
  let tmpDir: string;
  let queue: PersistentCrawlQueue;

  beforeEach(async () => {
    tmpDir = makeTempDir();
    queue = new PersistentCrawlQueue({ persistenceDir: tmpDir });
    await queue.initialize();
  });

  afterEach(async () => {
    await queue.close();
    cleanup(tmpDir);
  });

  it('returns INVALID_URL for javascript: scheme', async () => {
    const r = await queue.enqueue('javascript:alert(1)', 0, null);
    expect(r.code).toBe(ENQUEUE_RESULT.INVALID_URL);
    expect(r.reason).toBeTruthy();
    expect(await queue.size()).toBe(0);
  });

  it('returns INVALID_URL for ftp: scheme', async () => {
    const r = await queue.enqueue('ftp://files.example.com/data.zip', 0, null);
    expect(r.code).toBe(ENQUEUE_RESULT.INVALID_URL);
  });

  it('returns INVALID_URL for malformed URL', async () => {
    const r = await queue.enqueue('not-a-url', 0, null);
    expect(r.code).toBe(ENQUEUE_RESULT.INVALID_URL);
  });

  it('returns INVALID_URL for private IP', async () => {
    const r = await queue.enqueue('http://192.168.1.1/', 0, null);
    expect(r.code).toBe(ENQUEUE_RESULT.INVALID_URL);
  });

  it('returns INVALID_URL for localhost', async () => {
    const r = await queue.enqueue('http://localhost/admin', 0, null);
    expect(r.code).toBe(ENQUEUE_RESULT.INVALID_URL);
  });

  it('invalid URL does not get added to seen-set', async () => {
    await queue.enqueue('javascript:void(0)', 0, null);
    // A valid version of a similar URL should not be blocked
    const r = await queue.enqueue('https://example.com/js', 0, null);
    expect(r.code).toBe(ENQUEUE_RESULT.QUEUED);
  });
});

describe('PersistentCrawlQueue — size and empty state', () => {
  let tmpDir: string;
  let queue: PersistentCrawlQueue;

  beforeEach(async () => {
    tmpDir = makeTempDir();
    queue = new PersistentCrawlQueue({ persistenceDir: tmpDir });
    await queue.initialize();
  });

  afterEach(async () => {
    await queue.close();
    cleanup(tmpDir);
  });

  it('size is 0 on fresh queue', async () => {
    expect(await queue.size()).toBe(0);
  });

  it('isEmpty is true on fresh queue', async () => {
    expect(await queue.isEmpty()).toBe(true);
  });

  it('dequeue on empty queue returns null (no throw)', async () => {
    expect(await queue.dequeue()).toBeNull();
  });

  it('peek on empty queue returns null (no throw)', async () => {
    expect(await queue.peek()).toBeNull();
  });

  it('size increments on enqueue, decrements on dequeue', async () => {
    await queue.enqueue('https://example.com/a', 0, null);
    await queue.enqueue('https://example.com/b', 0, null);
    expect(await queue.size()).toBe(2);

    await queue.dequeue();
    expect(await queue.size()).toBe(1);

    await queue.dequeue();
    expect(await queue.size()).toBe(0);
    expect(await queue.isEmpty()).toBe(true);
  });

  it('clear() empties the queue but preserves seen-set', async () => {
    await queue.enqueue('https://example.com/p1', 0, null);
    await queue.enqueue('https://example.com/p2', 0, null);
    await queue.clear();

    expect(await queue.size()).toBe(0);

    // Re-enqueue should still be rejected (seen-set preserved)
    const r = await queue.enqueue('https://example.com/p1', 0, null);
    expect(r.code).toBe(ENQUEUE_RESULT.DUPLICATE_SKIPPED);
  });
});

describe('PersistentCrawlQueue — capacity limit', () => {
  it('returns QUEUE_FULL when at capacity', async () => {
    const tmpDir = makeTempDir();
    const smallQueue = new PersistentCrawlQueue({ persistenceDir: tmpDir, maxQueueSize: 2 });
    await smallQueue.initialize();

    await smallQueue.enqueue('https://example.com/a', 0, null);
    await smallQueue.enqueue('https://example.com/b', 0, null);
    const full = await smallQueue.enqueue('https://example.com/c', 0, null);

    expect(full.code).toBe(ENQUEUE_RESULT.QUEUE_FULL);
    expect(await smallQueue.size()).toBe(2);

    await smallQueue.close();
    cleanup(tmpDir);
  });
});

describe('PersistentCrawlQueue — persistence across restart', () => {
  it('queue and seen-set survive process restart', async () => {
    const tmpDir = makeTempDir();

    // --- Session 1: write ---
    const q1 = new PersistentCrawlQueue({ persistenceDir: tmpDir });
    await q1.initialize();
    await q1.enqueue('https://example.com/persist1', 0, null);
    await q1.enqueue('https://example.com/persist2', 0, null);
    await q1.dequeue(); // persist1 dequeued
    await q1.close();

    // Check files exist on disk
    expect(fs.existsSync(path.join(tmpDir, 'queue.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'seen.json'))).toBe(true);

    // --- Session 2: read ---
    const q2 = new PersistentCrawlQueue({ persistenceDir: tmpDir });
    await q2.initialize();

    // persist2 is still pending
    expect(await q2.size()).toBe(1);
    const next = await q2.dequeue();
    expect(next?.normalizedUrl).toBe('https://example.com/persist2');

    // persist1 was dequeued in session 1 — still in seen-set
    const hash1 = hashFor('https://example.com/persist1');
    expect(await q2.contains(hash1)).toBe(true);

    // Re-enqueuing persist1 should be rejected
    const re = await q2.enqueue('https://example.com/persist1', 0, null);
    expect(re.code).toBe(ENQUEUE_RESULT.DUPLICATE_SKIPPED);

    await q2.close();
    cleanup(tmpDir);
  });

  it('creates persistence directory if it does not exist', async () => {
    const tmpDir = makeTempDir();
    const nestedDir = path.join(tmpDir, 'nested', 'queue');
    const q = new PersistentCrawlQueue({ persistenceDir: nestedDir });
    await q.initialize();
    expect(fs.existsSync(nestedDir)).toBe(true);
    await q.close();
    cleanup(tmpDir);
  });
});

describe('PersistentCrawlQueue — entry fields', () => {
  let tmpDir: string;
  let queue: PersistentCrawlQueue;

  beforeEach(async () => {
    tmpDir = makeTempDir();
    queue = new PersistentCrawlQueue({ persistenceDir: tmpDir });
    await queue.initialize();
  });

  afterEach(async () => {
    await queue.close();
    cleanup(tmpDir);
  });

  it('enqueued entry has correct normalized URL', async () => {
    const result = await queue.enqueue('HTTP://EXAMPLE.COM:80/path/', 0, null);
    expect(result.code).toBe(ENQUEUE_RESULT.QUEUED);
    // Normalized: lowercase, no port 80, no trailing slash
    expect(result.entry?.normalizedUrl).toBe('http://example.com/path');
  });

  it('enqueued entry has urlHash matching computeUrlHash(normalizedUrl)', async () => {
    const result = await queue.enqueue('https://example.com/hash-test', 0, null);
    if (result.code === ENQUEUE_RESULT.QUEUED && result.entry) {
      const expected = computeUrlHash(result.entry.normalizedUrl);
      expect(result.entry.urlHash).toBe(expected);
    }
  });

  it('enqueued entry has correct depth and discoveredFrom', async () => {
    const result = await queue.enqueue(
      'https://example.com/child',
      2,
      'https://example.com/parent',
    );
    expect(result.entry?.depth).toBe(2);
    expect(result.entry?.discoveredFrom).toBe('https://example.com/parent');
  });

  it('enqueued entry has ISO enqueuedAt timestamp', async () => {
    const result = await queue.enqueue('https://example.com/ts', 0, null);
    if (result.entry) {
      expect(() => new Date(result.entry!.enqueuedAt)).not.toThrow();
      const ts = new Date(result.entry.enqueuedAt).getTime();
      expect(ts).toBeGreaterThan(0);
    }
  });
});
