import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig } from '@opensearch/shared';
import { createStorageAdapter, StorageAdapter, INDEX_STATUS } from '@opensearch/storage';
import { CURATED_SEED_CORPUS, getCuratedSeedUrls, getAllCuratedSeeds } from '@opensearch/crawler';
import {
  computeContentHash,
  evaluateDocumentQuality,
  analyzeCorpusQuality,
} from '@opensearch/indexer';

describe('Phase 23 — Seed Corpus & Initial Public Index Suite', () => {
  let tempDir: string;
  let storage: StorageAdapter;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-p23-test-'));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, 'storage'),
      INDEX_DIR: path.join(tempDir, 'index'),
      CRAWLER_DATA_DIR: path.join(tempDir, 'crawler'),
    });
    storage = createStorageAdapter({ config });
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  describe('Curated Seed Corpus (Phase 23)', () => {
    it('contains categorized, prioritized seed list with valid URLs', () => {
      expect(CURATED_SEED_CORPUS.length).toBeGreaterThanOrEqual(3);
      const allUrls = getCuratedSeedUrls();
      expect(allUrls.length).toBeGreaterThanOrEqual(5);

      for (const url of allUrls) {
        expect(url.startsWith('https://') || url.startsWith('http://')).toBe(true);
      }

      const allSeeds = getAllCuratedSeeds();
      expect(allSeeds.every(s => s.title && s.description && s.priority >= 1)).toBe(true);
    });
  });

  describe('Corpus Quality & Duplicate Analysis (Phase 23)', () => {
    it('evaluates document quality scores based on title, description, headings, and body word count', () => {
      const doc1 = {
        id: 'doc-1',
        url: 'https://example.com/rich',
        urlHash: 'hash-1',
        title: 'Comprehensive Guide to Search Engines',
        description: 'An in-depth explanation of inverted indices and ranking.',
        headings: 'Introduction\nArchitecture\nBM25 Formula',
        bodyText:
          'Search engines are complex software systems designed to discover, crawl, store, index, and rank web pages for user queries. When a user submits a query, the search engine looks up matching terms in an inverted index, computes BM25 relevance scores across multiple fields, and returns formatted result snippets with pagination.',
        language: 'en',
        contentType: 'text/html',
        contentLength: 500,
        httpStatus: 200,
        outboundLinks: [],
        indexStatus: INDEX_STATUS.INDEXED,
        indexedAt: null,
        lastIndexedAt: null,
        indexVersion: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const report1 = evaluateDocumentQuality(doc1 as any);
      expect(report1.hasTitle).toBe(true);
      expect(report1.hasDescription).toBe(true);
      expect(report1.hasHeadings).toBe(true);
      expect(report1.hasBodyText).toBe(true);
      expect(report1.bodyWordCount).toBeGreaterThan(40);
      expect(report1.qualityScore).toBeGreaterThanOrEqual(0.8);
    });

    it('detects near-duplicate content across documents using content hashing', async () => {
      const docText =
        'Identical body text across multiple duplicated web pages for testing duplicate detection.';

      await storage.documents.create({
        url: 'https://example.com/original',
        urlHash: 'hash-orig',
        title: 'Original Document',
        description: 'Original description',
        headings: 'Heading',
        bodyText: docText,
        language: 'en',
        contentType: 'text/html',
        contentLength: 100,
        httpStatus: 200,
        outboundLinks: [],
        indexStatus: INDEX_STATUS.INDEXED,
      });

      await storage.documents.create({
        url: 'https://example.com/duplicate-copy',
        urlHash: 'hash-dup',
        title: 'Original Document Copy',
        description: 'Original description',
        headings: 'Heading',
        bodyText: docText, // duplicate body
        language: 'en',
        contentType: 'text/html',
        contentLength: 100,
        httpStatus: 200,
        outboundLinks: [],
        indexStatus: INDEX_STATUS.INDEXED,
      });

      const { summary, reports } = await analyzeCorpusQuality(storage);

      expect(summary.totalDocuments).toBe(2);
      expect(summary.duplicateDocuments).toBe(1);
      expect(
        reports.some(r => r.isDuplicate && r.duplicateOfUrl === 'https://example.com/original'),
      ).toBe(true);
    });

    it('computes deterministic content hashes ignoring extra whitespace and casing', () => {
      const h1 = computeContentHash('  Hello World!   This is a TEST.  ');
      const h2 = computeContentHash('hello world! this is a test.');
      expect(h1).toBe(h2);
    });
  });
});
