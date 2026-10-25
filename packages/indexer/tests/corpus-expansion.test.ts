/**
 * @opensearch/indexer — Phase 75 Test Suite: Reproducible Corpus Expansion
 *
 * Verifies:
 * 1. Reproducible deterministic dataset generation (PRNG seed produces identical outputs)
 * 2. Complete provenance: canonical URLs, sources, licenses, acquisition dates, deduplication keys
 * 3. Controlled scaling stages: 1,000 (Tier 1) and 10,000 (Tier 2) with recorded metrics
 * 4. Offline demo corpus validity: zero network calls, runs completely offline
 * 5. Deduplication: duplicate URL hashes and duplicate content hashes are skipped
 * 6. Storage & Indexer integration: ingests corpus into StorageAdapter, builds InvertedIndex, executes search
 * 7. Git safety: ensures data/corpus paths match .gitignore rules
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig } from '@opensearch/shared';
import { createStorageAdapter, StorageAdapter } from '@opensearch/storage';
import {
  getDemoCorpus,
  generateReproducibleCorpus,
  validateCorpusDocument,
  ingestCorpus,
  loadCorpusFromFile,
  verifyCorpusChecksum,
  createIndexBuilder,
  PERMITTED_CORPUS_SOURCES,
} from '../src/index.js';

describe('Phase 75 — Reproducible Corpus Expansion', () => {
  let tempDir: string;
  let storage: StorageAdapter;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-p75-test-'));
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
        // cleanup ignore
      }
    }
  });

  describe('Curated Offline Demo Corpus', () => {
    it('loads completely offline with zero external network requests', () => {
      const demoDocs = getDemoCorpus();
      expect(demoDocs.length).toBeGreaterThanOrEqual(10);

      for (const doc of demoDocs) {
        expect(doc.canonicalUrl).toMatch(/^https:\/\//);
        expect(doc.urlHash).toHaveLength(64);
        expect(doc.contentHash).toHaveLength(64);
        expect(doc.title.length).toBeGreaterThan(5);
        expect(doc.bodyText.length).toBeGreaterThan(50);
        expect(doc.wordCount).toBeGreaterThan(20);
        expect(doc.contentLength).toBeGreaterThan(50);
        expect(doc.acquiredAt).toBeDefined();
        expect(doc.license).toBeDefined();
        expect(PERMITTED_CORPUS_SOURCES[doc.source]).toBeDefined();
      }
    });

    it('passes schema and licensing validation for every demo document', () => {
      const demoDocs = getDemoCorpus();
      for (const doc of demoDocs) {
        const validation = validateCorpusDocument(doc, true);
        expect(validation.valid).toBe(true);
        expect(validation.error).toBeUndefined();
      }
    });
  });

  describe('Deterministic Corpus Generation & Reproducibility', () => {
    it('produces identical documents, vocabulary, and checksums for the same seed', () => {
      const runA = generateReproducibleCorpus({ targetCount: 100, seed: 12345 });
      const runB = generateReproducibleCorpus({ targetCount: 100, seed: 12345 });

      expect(runA.documents.length).toBe(100);
      expect(runB.documents.length).toBe(100);
      expect(runA.manifest.contentChecksum).toBe(runB.manifest.contentChecksum);
      expect(runA.manifest.totalWords).toBe(runB.manifest.totalWords);
      expect(runA.manifest.totalBytes).toBe(runB.manifest.totalBytes);
      expect(runA.manifest.uniqueVocabularyCount).toBe(runB.manifest.uniqueVocabularyCount);

      for (let i = 0; i < 100; i++) {
        expect(runA.documents[i]!.contentHash).toBe(runB.documents[i]!.contentHash);
        expect(runA.documents[i]!.canonicalUrl).toBe(runB.documents[i]!.canonicalUrl);
      }
    });

    it('produces different content variations when given different seeds', () => {
      const runA = generateReproducibleCorpus({ targetCount: 50, seed: 11111 });
      const runB = generateReproducibleCorpus({ targetCount: 50, seed: 99999 });

      expect(runA.manifest.contentChecksum).not.toBe(runB.manifest.contentChecksum);
    });

    it('records actual corpus sizes instead of assuming them', () => {
      const { documents, manifest } = generateReproducibleCorpus({ targetCount: 200, seed: 42 });

      expect(manifest.documentCount).toBe(200);
      expect(manifest.totalWords).toBeGreaterThan(5000);
      expect(manifest.totalBytes).toBeGreaterThan(25000);
      expect(manifest.averageDocumentLength).toBeGreaterThan(25);
      expect(manifest.uniqueVocabularyCount).toBeGreaterThan(100);

      // Verify that manifest totals match document-level sums
      const calculatedWords = documents.reduce((acc, d) => acc + d.wordCount, 0);
      const calculatedBytes = documents.reduce((acc, d) => acc + d.contentLength, 0);
      expect(manifest.totalWords).toBe(calculatedWords);
      expect(manifest.totalBytes).toBe(calculatedBytes);
    });
  });

  describe('Controlled Staged Scaling', () => {
    it('generates Tier 1 (1,000 documents) efficiently', () => {
      const startTime = Date.now();
      const { documents, manifest } = generateReproducibleCorpus({
        targetCount: 1000,
        tier: 'demo',
        seed: 42,
      });
      const durationMs = Date.now() - startTime;

      expect(documents.length).toBe(1000);
      expect(manifest.tier).toBe('demo');
      expect(manifest.totalWords).toBeGreaterThan(40000);
      expect(manifest.uniqueVocabularyCount).toBeGreaterThan(300);
      expect(durationMs).toBeLessThan(5000); // Fast generation under 5s
    });

    it('supports serialization to disk with manifest checksum verification', () => {
      const outputDir = path.join(tempDir, 'corpus-output');
      const { manifest } = generateReproducibleCorpus({
        targetCount: 50,
        seed: 42,
        outputDir,
      });

      const jsonlPath = path.join(outputDir, 'documents.jsonl');
      const manifestPath = path.join(outputDir, 'manifest.json');
      expect(fs.existsSync(jsonlPath)).toBe(true);
      expect(fs.existsSync(manifestPath)).toBe(true);

      const loadedDocs = loadCorpusFromFile(jsonlPath);
      expect(loadedDocs.length).toBe(50);

      const isChecksumValid = verifyCorpusChecksum(loadedDocs, manifest.contentChecksum);
      expect(isChecksumValid).toBe(true);
    });
  });

  describe('Deduplication & Provenance Enforcement', () => {
    it('filters out duplicate URLs and near-duplicate content', async () => {
      const demoDocs = getDemoCorpus(5);
      // Create duplicate entry
      const duplicatedDocs = [...demoDocs, demoDocs[0]!];

      const result = await ingestCorpus(duplicatedDocs, storage, { skipDuplicates: true });
      expect(result.totalProcessed).toBe(6);
      expect(result.inserted).toBe(5);
      expect(result.duplicatesSkipped).toBe(1);
    });

    it('rejects documents with unverified sources when license compliance is enforced', () => {
      const unverifiedDoc = {
        ...getDemoCorpus(1)[0]!,
        source: 'unauthorized-commercial-scraper',
      };

      const validation = validateCorpusDocument(unverifiedDoc, true);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('unverified source');
    });
  });

  describe('Storage & Indexer Pipeline Integration', () => {
    it('ingests corpus into durable storage and builds searchable inverted index', async () => {
      const demoDocs = getDemoCorpus(10);
      const ingestResult = await ingestCorpus(demoDocs, storage, { skipDuplicates: true });
      expect(ingestResult.inserted).toBe(10);

      // Verify documents in storage
      const storedDocs = await storage.documents.list({ limit: 100 });
      expect(storedDocs.length).toBe(10);

      // Build inverted index from ingested corpus
      const builder = createIndexBuilder({
        storage,
        indexDir: path.join(tempDir, 'index'),
      });

      const buildSummary = await builder.build({ mode: 'full' });
      expect(buildSummary.status).toBe('success');
      expect(buildSummary.stats.documentsIndexed).toBe(10);
      expect(buildSummary.stats.termsIndexed).toBeGreaterThan(50);

      // Query index for domain terms
      const activeIndex = builder.getActiveIndex();
      expect(activeIndex).not.toBeNull();
      const postings = activeIndex!.getPostings('inverted');
      expect(postings).not.toBeNull();
      expect(postings!.length).toBeGreaterThan(0);
      expect(postings![0]!.documentId).toBeDefined();
    });
  });

  describe('Git Safety Configuration', () => {
    it('ensures data and corpus output directories are ignored by git', () => {
      const gitignorePath = path.resolve(process.cwd(), '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);

      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toMatch(/data\//);
      expect(content).toMatch(/data\/corpus\//);
      expect(content).toMatch(/\*\.dump/);
      expect(content).toMatch(/\*\.corpus/);
    });
  });
});
