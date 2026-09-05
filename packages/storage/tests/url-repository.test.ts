/**
 * Phase 3 Storage Tests — URL Repository
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { ConflictError, NotFoundError, ValidationError } from '@opensearch/shared';
import { JsonStorageAdapter } from '../src/adapters/json-adapter.js';
import { CRAWL_STATUS } from '../src/models.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-url-test-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function hashOf(url: string): string {
  return Buffer.from(url).toString('hex').slice(0, 64);
}

const BASE_URL: import('../src/models.js').CreateUrlRecordInput = {
  url: 'https://example.com/',
  urlHash: hashOf('https://example.com/'),
  domain: 'example.com',
  scheme: 'https',
  crawlStatus: CRAWL_STATUS.PENDING,
  lastHttpStatus: null,
  referrerUrl: null,
  depth: 0,
};

describe('URL Repository', () => {
  let tmpDir: string;
  let adapter: JsonStorageAdapter;

  beforeEach(async () => {
    tmpDir = makeTempDir();
    adapter = new JsonStorageAdapter({ storageDir: tmpDir });
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
    cleanup(tmpDir);
  });

  it('should create a URL record and read it back', async () => {
    const rec = await adapter.urls.create(BASE_URL);
    expect(rec.urlHash).toBe(BASE_URL.urlHash);
    expect(rec.url).toBe(BASE_URL.url);
    expect(rec.discoveredAt).toBeGreaterThan(0);
    expect(rec.attemptCount).toBe(0);
    expect(rec.lastAttemptedAt).toBeNull();
  });

  it('should find a URL by hash and by url', async () => {
    const rec = await adapter.urls.create(BASE_URL);
    const byHash = await adapter.urls.findByHash(rec.urlHash);
    expect(byHash?.url).toBe(rec.url);

    const byUrl = await adapter.urls.findByUrl(rec.url);
    expect(byUrl?.urlHash).toBe(rec.urlHash);
  });

  it('should return null for non-existent lookups', async () => {
    expect(await adapter.urls.findByHash('00000000')).toBeNull();
    expect(await adapter.urls.findByUrl('https://not-here.com')).toBeNull();
  });

  it('should prevent duplicate URL hash registration', async () => {
    await adapter.urls.create(BASE_URL);
    await expect(adapter.urls.create(BASE_URL)).rejects.toThrow(ConflictError);
  });

  it('should prevent duplicate URL registration', async () => {
    await adapter.urls.create(BASE_URL);
    await expect(
      adapter.urls.create({ ...BASE_URL, urlHash: hashOf('different') }),
    ).rejects.toThrow(ConflictError);
  });

  it('should update URL record (e.g., after crawl attempt)', async () => {
    const rec = await adapter.urls.create(BASE_URL);
    const now = Date.now();
    const updated = await adapter.urls.update(rec.urlHash, {
      crawlStatus: CRAWL_STATUS.SUCCESS,
      lastAttemptedAt: now,
      lastSucceededAt: now,
      attemptCount: 1,
      lastHttpStatus: 200,
    });
    expect(updated.crawlStatus).toBe(CRAWL_STATUS.SUCCESS);
    expect(updated.attemptCount).toBe(1);
    expect(updated.lastHttpStatus).toBe(200);
  });

  it('should throw NotFoundError on update of non-existent record', async () => {
    await expect(
      adapter.urls.update('unknown-hash', { crawlStatus: CRAWL_STATUS.FAILED }),
    ).rejects.toThrow(NotFoundError);
  });

  it('should find URLs by crawl status', async () => {
    await adapter.urls.create(BASE_URL);
    const u2 = {
      ...BASE_URL,
      url: 'https://example.com/about',
      urlHash: hashOf('https://example.com/about'),
      depth: 1,
    };
    const u2rec = await adapter.urls.create(u2);
    await adapter.urls.update(u2rec.urlHash, { crawlStatus: CRAWL_STATUS.SUCCESS });

    const pending = await adapter.urls.findByCrawlStatus(CRAWL_STATUS.PENDING);
    expect(pending.some(r => r.url === BASE_URL.url)).toBe(true);

    const success = await adapter.urls.findByCrawlStatus(CRAWL_STATUS.SUCCESS);
    expect(success.some(r => r.url === u2.url)).toBe(true);
  });

  it('should reject invalid scheme', async () => {
    await expect(
      adapter.urls.create({ ...BASE_URL, url: 'ftp://example.com', scheme: 'ftp' as 'http' }),
    ).rejects.toThrow(ValidationError);
  });

  it('should persist across a simulated restart', async () => {
    await adapter.urls.create(BASE_URL);
    await adapter.close();

    const adapter2 = new JsonStorageAdapter({ storageDir: tmpDir });
    await adapter2.initialize();

    const found = await adapter2.urls.findByUrl(BASE_URL.url);
    expect(found?.urlHash).toBe(BASE_URL.urlHash);
    await adapter2.close();
  });
});
