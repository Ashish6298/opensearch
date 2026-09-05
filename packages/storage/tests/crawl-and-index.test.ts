/**
 * Phase 3 Storage Tests — Crawl & Index Metadata Repositories + Health
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { NotFoundError, ValidationError } from '@opensearch/shared';
import { JsonStorageAdapter } from '../src/adapters/json-adapter.js';
import { CRAWL_STATUS, CreateCrawlRecordInput, CreateIndexMetadataInput } from '../src/models.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-crawl-test-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function hashOf(url: string): string {
  return Buffer.from(url).toString('hex').slice(0, 64);
}

const TEST_URL = 'https://example.com/news';
const TEST_HASH = hashOf(TEST_URL);

const BASE_CRAWL: CreateCrawlRecordInput = {
  url: TEST_URL,
  urlHash: TEST_HASH,
  status: CRAWL_STATUS.SUCCESS,
  httpStatus: 200,
  contentType: 'text/html; charset=utf-8',
  responseBytes: 4096,
  durationMs: 312,
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  errorMessage: null,
  redirectChain: [],
  finalUrl: TEST_URL,
  documentId: null,
};

const BASE_INDEX_META: CreateIndexMetadataInput = {
  version: '1.0.0-dev',
  completedAt: null,
  isActive: false,
  documentCount: 0,
  termCount: 0,
  indexPath: './data/index/v1',
  status: 'building',
  errorMessage: null,
  lastRebuildAt: null,
};

describe('Crawl Repository', () => {
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

  it('should create a crawl record and find it by id', async () => {
    const record = await adapter.crawls.create(BASE_CRAWL);
    expect(record.crawlId).toBeTruthy();
    expect(record.status).toBe(CRAWL_STATUS.SUCCESS);
    expect(record.httpStatus).toBe(200);

    const found = await adapter.crawls.findById(record.crawlId);
    expect(found?.crawlId).toBe(record.crawlId);
    expect(found?.url).toBe(TEST_URL);
  });

  it('should find crawl records by URL and by URL hash', async () => {
    const r1 = await adapter.crawls.create(BASE_CRAWL);
    const r2 = await adapter.crawls.create({
      ...BASE_CRAWL,
      status: CRAWL_STATUS.FAILED,
      errorMessage: 'Connection refused',
    });

    const byUrl = await adapter.crawls.findByUrl(TEST_URL);
    expect(byUrl.length).toBe(2);
    expect(byUrl.map(r => r.crawlId)).toContain(r1.crawlId);
    expect(byUrl.map(r => r.crawlId)).toContain(r2.crawlId);

    const byHash = await adapter.crawls.findByUrlHash(TEST_HASH);
    expect(byHash.length).toBe(2);
  });

  it('should return null for unknown crawl id', async () => {
    expect(await adapter.crawls.findById('nonexistent')).toBeNull();
  });

  it('should count crawl records', async () => {
    expect(await adapter.crawls.count()).toBe(0);
    await adapter.crawls.create(BASE_CRAWL);
    await adapter.crawls.create(BASE_CRAWL);
    expect(await adapter.crawls.count()).toBe(2);
  });

  it('should reject crawl with invalid status', async () => {
    await expect(
      adapter.crawls.create({
        ...BASE_CRAWL,
        status: 'invalid-status' as typeof CRAWL_STATUS.SUCCESS,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should persist crawls across restart', async () => {
    const rec = await adapter.crawls.create(BASE_CRAWL);
    await adapter.close();

    const adapter2 = new JsonStorageAdapter({ storageDir: tmpDir });
    await adapter2.initialize();
    const found = await adapter2.crawls.findById(rec.crawlId);
    expect(found?.url).toBe(TEST_URL);
    await adapter2.close();
  });
});

describe('Index Metadata Repository', () => {
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

  it('should create and find index metadata by id', async () => {
    const meta = await adapter.indexMetadata.create(BASE_INDEX_META);
    expect(meta.buildId).toBeTruthy();
    expect(meta.version).toBe('1.0.0-dev');
    expect(meta.startedAt).toBeTruthy();

    const found = await adapter.indexMetadata.findById(meta.buildId);
    expect(found?.buildId).toBe(meta.buildId);
  });

  it('should return null for no active index initially', async () => {
    expect(await adapter.indexMetadata.findActive()).toBeNull();
  });

  it('should find active index after marking one ready', async () => {
    const meta = await adapter.indexMetadata.create(BASE_INDEX_META);
    await adapter.indexMetadata.update(meta.buildId, {
      status: 'ready',
      isActive: true,
      completedAt: new Date().toISOString(),
      documentCount: 500,
    });

    const active = await adapter.indexMetadata.findActive();
    expect(active?.buildId).toBe(meta.buildId);
    expect(active?.documentCount).toBe(500);
  });

  it('should throw NotFoundError when updating unknown build', async () => {
    await expect(
      adapter.indexMetadata.update('unknown-build', { status: 'ready' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('should list metadata sorted by startedAt descending', async () => {
    const m1 = await adapter.indexMetadata.create(BASE_INDEX_META);
    await new Promise(r => setTimeout(r, 10));
    const m2 = await adapter.indexMetadata.create({ ...BASE_INDEX_META, version: '1.0.1-dev' });

    const list = await adapter.indexMetadata.list();
    expect(list.length).toBe(2);
    // m2 has a later startedAt, should be first
    expect(list[0].buildId).toBe(m2.buildId);
    expect(list[1].buildId).toBe(m1.buildId);
  });
});

describe('Storage Adapter Health', () => {
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

  it('should report correct health after initialization', async () => {
    const h = await adapter.health();
    expect(h.initialized).toBe(true);
    expect(h.documentCount).toBe(0);
    expect(h.urlCount).toBe(0);
    expect(h.crawlCount).toBe(0);
    expect(h.indexMetadataCount).toBe(0);
    expect(h.storageDir).toBe(tmpDir);
  });

  it('should create the storageDir on initialize if it does not exist', async () => {
    const newDir = path.join(tmpDir, 'nested', 'dir');
    const a2 = new JsonStorageAdapter({ storageDir: newDir });
    await a2.initialize();
    expect(fs.existsSync(newDir)).toBe(true);
    await a2.close();
  });

  it('should throw StorageError when used before initialize()', async () => {
    const uninit = new JsonStorageAdapter({ storageDir: tmpDir });
    expect(() => uninit.documents).toThrow();
  });
});
