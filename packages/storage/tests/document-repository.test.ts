/**
 * Phase 3 Storage Tests — Document Repository
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { ConflictError, NotFoundError, ValidationError, StorageError } from '@opensearch/shared';
import { JsonStorageAdapter } from '../src/adapters/json-adapter.js';
import { CRAWL_STATUS, INDEX_STATUS } from '../src/models.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-test-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function urlHash(url: string): string {
  return Buffer.from(url).toString('hex').slice(0, 64);
}

const BASE_DOCUMENT = {
  url: 'https://example.com/page1',
  urlHash: urlHash('https://example.com/page1'),
  title: 'Test Page',
  description: 'A test description',
  headings: 'Main Heading',
  bodyText: 'Some visible body text here',
  language: 'en',
  contentType: 'text/html',
  contentLength: 1024,
  httpStatus: 200,
  outboundLinks: ['https://example.com/page2'],
};

describe('Document Repository', () => {
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

  it('should create a document and read it back by id', async () => {
    const doc = await adapter.documents.create(BASE_DOCUMENT);

    expect(doc.id).toBeTruthy();
    expect(doc.url).toBe(BASE_DOCUMENT.url);
    expect(doc.title).toBe('Test Page');
    expect(doc.indexStatus).toBe(INDEX_STATUS.NOT_INDEXED);
    expect(doc.crawledAt).toBeTruthy();
    expect(doc.updatedAt).toBeTruthy();

    const found = await adapter.documents.findById(doc.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(doc.id);
    expect(found?.title).toBe('Test Page');
  });

  it('should find a document by URL', async () => {
    const created = await adapter.documents.create(BASE_DOCUMENT);
    const found = await adapter.documents.findByUrl(BASE_DOCUMENT.url);
    expect(found?.id).toBe(created.id);
  });

  it('should find a document by URL hash', async () => {
    const created = await adapter.documents.create(BASE_DOCUMENT);
    const found = await adapter.documents.findByUrlHash(BASE_DOCUMENT.urlHash);
    expect(found?.id).toBe(created.id);
  });

  it('should return null for missing documents', async () => {
    expect(await adapter.documents.findById('nonexistent-id')).toBeNull();
    expect(await adapter.documents.findByUrl('https://missing.example.com')).toBeNull();
    expect(await adapter.documents.findByUrlHash('deadbeef0000')).toBeNull();
  });

  it('should throw ConflictError for duplicate URL', async () => {
    await adapter.documents.create(BASE_DOCUMENT);
    await expect(adapter.documents.create(BASE_DOCUMENT)).rejects.toThrow(ConflictError);
  });

  it('should throw ConflictError for duplicate urlHash', async () => {
    await adapter.documents.create(BASE_DOCUMENT);
    await expect(
      adapter.documents.create({
        ...BASE_DOCUMENT,
        url: 'https://different-url.com',
        // same urlHash
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('should update a document and reflect changes', async () => {
    const doc = await adapter.documents.create(BASE_DOCUMENT);
    const updated = await adapter.documents.update(doc.id, {
      indexStatus: INDEX_STATUS.INDEXED,
      lastIndexedAt: new Date().toISOString(),
      indexVersion: 'v1.0',
    });

    expect(updated.indexStatus).toBe(INDEX_STATUS.INDEXED);
    expect(updated.indexVersion).toBe('v1.0');
    expect(updated.id).toBe(doc.id);
    expect(updated.url).toBe(doc.url); // unchanged

    // Re-read to confirm persistence
    const reread = await adapter.documents.findById(doc.id);
    expect(reread?.indexStatus).toBe(INDEX_STATUS.INDEXED);
  });

  it('should throw NotFoundError when updating a non-existent document', async () => {
    await expect(
      adapter.documents.update('no-such-id', { title: 'new title' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('should return correct count', async () => {
    expect(await adapter.documents.count()).toBe(0);
    await adapter.documents.create(BASE_DOCUMENT);
    await adapter.documents.create({ ...BASE_DOCUMENT, url: 'https://example.com/p2', urlHash: urlHash('https://example.com/p2') });
    expect(await adapter.documents.count()).toBe(2);
  });

  it('should list documents with pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await adapter.documents.create({
        ...BASE_DOCUMENT,
        url: `https://example.com/page-${i}`,
        urlHash: urlHash(`https://example.com/page-${i}`),
      });
    }
    const first3 = await adapter.documents.list({ limit: 3, offset: 0 });
    expect(first3.length).toBe(3);
    const all = await adapter.documents.list();
    expect(all.length).toBe(5);
  });

  it('should filter documents by index status', async () => {
    const doc = await adapter.documents.create(BASE_DOCUMENT);
    await adapter.documents.update(doc.id, { indexStatus: INDEX_STATUS.INDEXED });
    const d2 = await adapter.documents.create({
      ...BASE_DOCUMENT,
      url: 'https://example.com/p2',
      urlHash: urlHash('https://example.com/p2'),
    });

    const notIndexed = await adapter.documents.findByIndexStatus(INDEX_STATUS.NOT_INDEXED);
    const indexed = await adapter.documents.findByIndexStatus(INDEX_STATUS.INDEXED);
    expect(notIndexed.some(d => d.id === d2.id)).toBe(true);
    expect(indexed.some(d => d.id === doc.id)).toBe(true);
  });

  it('should validate required fields and reject invalid inputs', async () => {
    // Invalid URL
    await expect(
      adapter.documents.create({ ...BASE_DOCUMENT, url: 'javascript:evil()' }),
    ).rejects.toThrow(ValidationError);

    // Missing/empty title (allowed as empty string but must be string)
    await expect(
      adapter.documents.create({ ...BASE_DOCUMENT, url: 'https://a.com', urlHash: urlHash('https://a.com'), title: 123 as unknown as string }),
    ).rejects.toThrow(ValidationError);

    // Invalid httpStatus
    await expect(
      adapter.documents.create({ ...BASE_DOCUMENT, url: 'https://b.com', urlHash: urlHash('https://b.com'), httpStatus: 999 }),
    ).rejects.toThrow(ValidationError);

    // outboundLinks not an array
    await expect(
      adapter.documents.create({ ...BASE_DOCUMENT, url: 'https://c.com', urlHash: urlHash('https://c.com'), outboundLinks: 'not-array' as unknown as string[] }),
    ).rejects.toThrow(ValidationError);
  });

  it('should persist data across a simulated storage restart', async () => {
    const doc = await adapter.documents.create(BASE_DOCUMENT);
    await adapter.close();

    // Restart: create new adapter pointing to same directory
    const adapter2 = new JsonStorageAdapter({ storageDir: tmpDir });
    await adapter2.initialize();

    const found = await adapter2.documents.findById(doc.id);
    expect(found).not.toBeNull();
    expect(found?.url).toBe(doc.url);
    expect(found?.title).toBe(doc.title);
    await adapter2.close();
  });
});
