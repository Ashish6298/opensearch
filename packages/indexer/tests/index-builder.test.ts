import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppConfig, loadConfig } from '@opensearch/shared';
import { createStorageAdapter, StorageAdapter, INDEX_STATUS } from '@opensearch/storage';
import { createDocumentProcessor, createIndexBuilder, IndexBuilder } from '../src/index.js';

describe('Index Builder & Rebuild Pipeline (Phase 11)', () => {
  let testDir: string;
  let config: AppConfig;
  let storage: StorageAdapter;
  let builder: IndexBuilder;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'opensearch-builder-test-'));
    config = loadConfig({
      NODE_ENV: 'test',
      STORAGE_DIR: join(testDir, 'storage'),
      INDEX_DIR: join(testDir, 'index'),
      CRAWLER_DATA_DIR: join(testDir, 'crawler'),
    });

    storage = createStorageAdapter({ config });
    await storage.initialize();

    builder = createIndexBuilder({
      config,
      storage,
      processor: createDocumentProcessor(),
      indexDir: join(testDir, 'index'),
    });
  });

  afterEach(async () => {
    try {
      await storage.close();
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('should build a full index from stored documents in DocumentRepository', async () => {
    // Populate storage with documents
    await storage.documents.create({
      url: 'https://example.com/page1',
      urlHash: 'hash-page-1',
      title: 'First Page Title',
      headings: 'Introduction Guide',
      description: 'First page description',
      bodyText: 'OpenSearch is an open source search engine built from scratch.',
      language: 'en',
      contentType: 'text/html',
      contentLength: 100,
      httpStatus: 200,
      outboundLinks: [],
      indexStatus: INDEX_STATUS.PENDING,
    });

    await storage.documents.create({
      url: 'https://example.com/page2',
      urlHash: 'hash-page-2',
      title: 'Second Page Database',
      headings: 'Storage Architecture',
      description: 'Second page description',
      bodyText: 'Fast inverted index data structures for text retrieval.',
      language: 'en',
      contentType: 'text/html',
      contentLength: 120,
      httpStatus: 200,
      outboundLinks: [],
      indexStatus: INDEX_STATUS.PENDING,
    });

    const summary = await builder.build({ mode: 'full' });

    expect(summary.status).toBe('success');
    expect(summary.stats.documentsIndexed).toBe(2);
    expect(summary.stats.termsIndexed).toBeGreaterThan(5);

    const activeIndex = builder.getActiveIndex();
    expect(activeIndex).not.toBeNull();
    expect(activeIndex?.getDocumentFrequency('opensearch')).toBe(1);
    expect(activeIndex?.getDocumentFrequency('search')).toBe(1);
    expect(activeIndex?.getDocumentFrequency('index')).toBe(1);

    // Verify storage metadata record
    const activeMeta = await storage.indexMetadata.findActive();
    expect(activeMeta).not.toBeNull();
    expect(activeMeta?.documentCount).toBe(2);
    expect(activeMeta?.status).toBe('ready');

    // Verify documents marked as INDEXED
    const indexedDocs = await storage.documents.findByIndexStatus(INDEX_STATUS.INDEXED);
    expect(indexedDocs).toHaveLength(2);
  });

  it('should perform incremental builds updating new pending documents', async () => {
    // Initial build with 1 doc
    await storage.documents.create({
      url: 'https://example.com/initial',
      urlHash: 'hash-initial',
      title: 'Initial Document',
      description: 'Initial doc description',
      headings: 'Initial Heading',
      bodyText: 'Initial text content alpha.',
      contentType: 'text/html',
      contentLength: 50,
      httpStatus: 200,
      outboundLinks: [],
      indexStatus: INDEX_STATUS.PENDING,
    });

    const initialSummary = await builder.build({ mode: 'full' });
    expect(initialSummary.stats.documentsIndexed).toBe(1);

    // Add a second document as PENDING
    await storage.documents.create({
      url: 'https://example.com/second',
      urlHash: 'hash-second',
      title: 'Second Document',
      description: 'Second doc description',
      headings: 'Second Heading',
      bodyText: 'Second text content beta.',
      contentType: 'text/html',
      contentLength: 60,
      httpStatus: 200,
      outboundLinks: [],
      indexStatus: INDEX_STATUS.PENDING,
    });

    // Run incremental build
    const incrementalSummary = await builder.build({ mode: 'incremental' });
    expect(incrementalSummary.status).toBe('success');
    expect(incrementalSummary.stats.documentsIndexed).toBe(1); // only the new doc

    const activeIndex = builder.getActiveIndex();
    expect(activeIndex?.getDocumentFrequency('alpha')).toBe(1);
    expect(activeIndex?.getDocumentFrequency('beta')).toBe(1);
    expect(activeIndex?.getStats().totalDocuments).toBe(2);
  });

  it('should guarantee deterministic rebuilds for identical corpora', async () => {
    await storage.documents.create({
      url: 'https://example.com/doc',
      urlHash: 'hash-doc',
      title: 'Deterministic Title',
      description: 'Deterministic description',
      headings: 'Deterministic Heading',
      bodyText: 'Deterministic body text.',
      contentType: 'text/html',
      contentLength: 40,
      httpStatus: 200,
      outboundLinks: [],
      indexStatus: INDEX_STATUS.PENDING,
    });

    const build1 = await builder.build({ mode: 'full' });
    const terms1 = builder.getActiveIndex()?.getTerms().sort();

    const build2 = await builder.build({ mode: 'full' });
    const terms2 = builder.getActiveIndex()?.getTerms().sort();

    expect(build1.stats.termsIndexed).toBe(build2.stats.termsIndexed);
    expect(terms1).toEqual(terms2);
  });

  it('should load active index on startup via loadActiveIndex', async () => {
    await storage.documents.create({
      url: 'https://example.com/startup',
      urlHash: 'hash-startup',
      title: 'Startup Test',
      description: 'Startup description',
      headings: 'Startup Heading',
      bodyText: 'Startup indexing text.',
      contentType: 'text/html',
      contentLength: 30,
      httpStatus: 200,
      outboundLinks: [],
      indexStatus: INDEX_STATUS.PENDING,
    });

    await builder.build({ mode: 'full' });

    // Create a new builder instance pointing to same storage
    const newBuilder = createIndexBuilder({
      config,
      storage,
      indexDir: join(testDir, 'index'),
    });

    const loadedIndex = await newBuilder.loadActiveIndex();
    expect(loadedIndex).toBeDefined();
    expect(loadedIndex.getDocumentFrequency('startup')).toBe(1);
  });
});
