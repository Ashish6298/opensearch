import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDocumentProcessor,
  createInvertedIndex,
  InvertedIndex,
  ProcessedDocument,
} from '../src/index.js';

describe('Inverted Index (Phase 10)', () => {
  let index: InvertedIndex;
  let testDir: string;
  const processor = createDocumentProcessor();

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'opensearch-index-test-'));
    index = createInvertedIndex({ indexDir: testDir });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('should add documents and build accurate posting lists with field info', () => {
    const doc1: ProcessedDocument = processor.process({
      id: 'doc-1',
      url: 'https://example.com/doc1',
      title: 'Fast Search Engine',
      headings: 'Overview Architecture',
      bodyText: 'OpenSearch is a fast full-text search engine built with TypeScript.',
    });

    const doc2: ProcessedDocument = processor.process({
      id: 'doc-2',
      url: 'https://example.com/doc2',
      title: 'Distributed Database',
      headings: 'Storage Layer',
      bodyText: 'Fast storage engine using json and sqlite for fast retrieval.',
    });

    index.addDocument(doc1);
    index.addDocument(doc2);

    expect(index.hasDocument('doc-1')).toBe(true);
    expect(index.hasDocument('doc-2')).toBe(true);
    expect(index.hasDocument('doc-999')).toBe(false);

    // Document frequency check
    expect(index.getDocumentFrequency('fast')).toBe(2);
    expect(index.getDocumentFrequency('search')).toBe(1);
    expect(index.getDocumentFrequency('nonexistent')).toBe(0);

    // Term frequency check
    expect(index.getTermFrequency('fast', 'doc-1')).toBe(2); // in title and body
    expect(index.getTermFrequency('fast', 'doc-2')).toBe(2); // in body twice
    expect(index.getTermFrequency('search', 'doc-1')).toBe(2); // in title and body

    // Postings inspection
    const fastPostings = index.getPostings('fast');
    expect(fastPostings).toHaveLength(2);

    const doc1Posting = fastPostings?.find(p => p.documentId === 'doc-1');
    expect(doc1Posting).toBeDefined();
    expect(doc1Posting?.fieldTermFrequencies.title).toBe(1);
    expect(doc1Posting?.fieldTermFrequencies.body).toBe(1);
    expect(doc1Posting?.fieldPositions.title).toContain(0);

    const stats = index.getStats();
    expect(stats.totalDocuments).toBe(2);
    expect(stats.totalTerms).toBeGreaterThan(0);
    expect(stats.avgDocumentLength).toBeGreaterThan(0);
  });

  it('should update existing documents without duplicating postings', () => {
    const docOriginal = processor.process({
      id: 'doc-update',
      url: 'https://example.com/update',
      title: 'Original Title',
      bodyText: 'Original body text with uniquealpha keyword.',
    });

    index.addDocument(docOriginal);
    expect(index.getDocumentFrequency('uniquealpha')).toBe(1);
    expect(index.getDocumentFrequency('uniquebeta')).toBe(0);

    const docUpdated = processor.process({
      id: 'doc-update',
      url: 'https://example.com/update',
      title: 'Updated Title',
      bodyText: 'Updated body text with uniquebeta keyword.',
    });

    index.updateDocument(docUpdated);

    // Old keyword should be purged
    expect(index.getDocumentFrequency('uniquealpha')).toBe(0);
    expect(index.getPostings('uniquealpha')).toBeNull();

    // New keyword should be indexed
    expect(index.getDocumentFrequency('uniquebeta')).toBe(1);
    expect(index.getPostings('uniquebeta')).toHaveLength(1);

    expect(index.getStats().totalDocuments).toBe(1);
  });

  it('should remove documents and prune empty posting lists', () => {
    const doc1 = processor.process({
      id: 'doc-del-1',
      url: 'https://example.com/del1',
      title: 'Solitary Word Uniquekeyword',
      bodyText: 'Body content.',
    });

    const doc2 = processor.process({
      id: 'doc-del-2',
      url: 'https://example.com/del2',
      title: 'Shared Word',
      bodyText: 'Another body content.',
    });

    index.addDocument(doc1);
    index.addDocument(doc2);

    expect(index.hasDocument('doc-del-1')).toBe(true);
    expect(index.getDocumentFrequency('uniquekeyword')).toBe(1);
    expect(index.getDocumentFrequency('content')).toBe(2);

    const removed = index.removeDocument('doc-del-1');
    expect(removed).toBe(true);
    expect(index.hasDocument('doc-del-1')).toBe(false);

    // Pruned term
    expect(index.getDocumentFrequency('uniquekeyword')).toBe(0);
    expect(index.getPostings('uniquekeyword')).toBeNull();

    // Shared term still has doc2
    expect(index.getDocumentFrequency('content')).toBe(1);
    expect(index.getPostings('content')).toHaveLength(1);
    expect(index.getStats().totalDocuments).toBe(1);
  });

  it('should save index to disk and reload accurately', async () => {
    const doc1 = processor.process({
      id: 'doc-save-1',
      url: 'https://example.com/save1',
      title: 'Persistent Index Test',
      headings: 'Disk Serialization',
      bodyText: 'We test serialization and deserialization of postings and metadata.',
    });

    const doc2 = processor.process({
      id: 'doc-save-2',
      url: 'https://example.com/save2',
      title: 'Second Saved Document',
      bodyText: 'More searchable text for persistent storage verification.',
    });

    index.addDocument(doc1);
    index.addDocument(doc2);

    await index.save(testDir);

    // Create fresh index instance and load
    const reloadedIndex = createInvertedIndex({ indexDir: testDir });
    await reloadedIndex.load(testDir);

    expect(reloadedIndex.getStats().totalDocuments).toBe(2);
    expect(reloadedIndex.hasDocument('doc-save-1')).toBe(true);
    expect(reloadedIndex.hasDocument('doc-save-2')).toBe(true);

    expect(reloadedIndex.getDocumentFrequency('persistent')).toBe(2); // in doc1 title & doc2 body
    expect(reloadedIndex.getDocumentFrequency('serialization')).toBe(1);

    const postings = reloadedIndex.getPostings('persistent');
    expect(postings).toHaveLength(2);

    const meta1 = reloadedIndex.getDocumentMeta('doc-save-1');
    expect(meta1).not.toBeNull();
    expect(meta1?.title).toBe('Persistent Index Test');
    expect(meta1?.fieldLengths.title).toBeGreaterThan(0);
  });

  it('should clear all in-memory entries cleanly', () => {
    const doc = processor.process({
      id: 'doc-clear',
      url: 'https://example.com/clear',
      title: 'Clear Test',
      bodyText: 'Some body text.',
    });

    index.addDocument(doc);
    expect(index.getStats().totalDocuments).toBe(1);

    index.clear();
    expect(index.getStats().totalDocuments).toBe(0);
    expect(index.getStats().totalTerms).toBe(0);
    expect(index.getTerms()).toHaveLength(0);
  });
});
