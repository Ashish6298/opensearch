/**
 * @opensearch/indexer — Phase 73: Index Lifecycle and Schema Audit Test Suite
 *
 * Verifies all tasks and acceptance criteria:
 * 1. Schema versioning on serialized payload (schemaVersion, format signature, checksum)
 * 2. Incompatible schema version rejection (IndexIncompatibleSchemaError with upgrade advice)
 * 3. Safe handling of corrupt and truncated index files (IndexCorruptError with actionable advice)
 * 4. Detection of zero-byte / empty index files
 * 5. Detection of dangling temporary build artifacts (*.tmp)
 * 6. Structural and referential consistency auditing (stats mismatch, orphaned postings)
 * 7. Preservation of previous valid active index on failed rebuilds
 * 8. Atomic publication and self-healing recovery on corrupt active index
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppConfig, loadConfig } from '@opensearch/shared';
import { createStorageAdapter, StorageAdapter, INDEX_STATUS } from '@opensearch/storage';
import {
  CURRENT_INDEX_SCHEMA_VERSION,
  INDEX_FILE_NAME,
  INDEX_FORMAT_IDENTIFIER,
  INDEX_TMP_FILE_NAME,
  IndexCorruptError,
  IndexIncompatibleSchemaError,
  InvertedIndex,
  createDocumentProcessor,
  createIndexBuilder,
  createInvertedIndex,
  validateIndexFile,
  validateIndexPayload,
} from '../src/index.js';

describe('Phase 73 — Index Lifecycle & Schema Audit Suite', () => {
  let testDir: string;
  let indexDir: string;
  let storageDir: string;
  let config: AppConfig;
  let storage: StorageAdapter;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'opensearch-lifecycle-test-'));
    indexDir = join(testDir, 'index');
    storageDir = join(testDir, 'storage');

    config = loadConfig({
      NODE_ENV: 'test',
      STORAGE_DIR: storageDir,
      INDEX_DIR: indexDir,
      CRAWLER_DATA_DIR: join(testDir, 'crawler'),
    });

    storage = createStorageAdapter({ config });
    await storage.initialize();
  });

  afterEach(async () => {
    try {
      await storage.close();
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Schema Versioning & Format Verification
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Explicit Schema Versioning', () => {
    it('persists serialized index with explicit schemaVersion, format identifier, and checksum', async () => {
      const idx = createInvertedIndex({ indexDir });
      const processor = createDocumentProcessor();

      idx.addDocument(
        processor.process({
          id: 'doc-schema-1',
          url: 'https://example.com/schema1',
          title: 'Schema Test Document',
          bodyText: 'Validating explicit index schema versioning.',
        }),
      );

      await idx.save(indexDir);

      const filePath = join(indexDir, INDEX_FILE_NAME);
      expect(fs.existsSync(filePath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(raw.schemaVersion).toBe(CURRENT_INDEX_SCHEMA_VERSION);
      expect(raw.version).toBe(CURRENT_INDEX_SCHEMA_VERSION);
      expect(raw.format).toBe(INDEX_FORMAT_IDENTIFIER);
      expect(typeof raw.checksum).toBe('string');
      expect(raw.checksum.length).toBe(64); // SHA-256 length
    });

    it('seamlessly loads legacy payloads using "version" for backward compatibility', async () => {
      fs.mkdirSync(indexDir, { recursive: true });
      const legacyPayload = {
        version: 1, // legacy field name without schemaVersion
        createdAt: new Date().toISOString(),
        stats: {
          totalDocuments: 1,
          totalTerms: 1,
          totalPostings: 1,
          avgDocumentLength: 5,
          avgFieldLengths: {},
          lastUpdatedAt: new Date().toISOString(),
        },
        documents: [
          {
            documentId: 'legacy-doc',
            url: 'https://example.com/legacy',
            urlHash: 'hash',
            title: 'Legacy Title',
            language: 'en',
            totalTerms: 5,
            fieldLengths: {},
            indexedAt: new Date().toISOString(),
          },
        ],
        dictionary: [
          {
            term: 'legacy',
            documentFrequency: 1,
            postings: [
              {
                documentId: 'legacy-doc',
                termFrequency: 1,
                fieldTermFrequencies: {},
                fieldPositions: {},
              },
            ],
          },
        ],
      };

      fs.writeFileSync(join(indexDir, INDEX_FILE_NAME), JSON.stringify(legacyPayload));

      const idx = createInvertedIndex({ indexDir });
      await idx.load(indexDir);

      expect(idx.hasDocument('legacy-doc')).toBe(true);
      expect(idx.getDocumentFrequency('legacy')).toBe(1);
    });

    it('rejects incompatible schema versions with IndexIncompatibleSchemaError and actionable advice', async () => {
      fs.mkdirSync(indexDir, { recursive: true });
      const futurePayload = {
        schemaVersion: 99, // Future unsupported version
        format: INDEX_FORMAT_IDENTIFIER,
        createdAt: new Date().toISOString(),
        stats: { totalDocuments: 0, totalTerms: 0, totalPostings: 0, avgDocumentLength: 0, avgFieldLengths: {}, lastUpdatedAt: '' },
        documents: [],
        dictionary: [],
      };

      fs.writeFileSync(join(indexDir, INDEX_FILE_NAME), JSON.stringify(futurePayload));

      const idx = createInvertedIndex({ indexDir });

      await expect(idx.load(indexDir)).rejects.toThrow(IndexIncompatibleSchemaError);
      await expect(idx.load(indexDir)).rejects.toThrow(/rebuild/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Corrupt, Truncated & Incomplete Index Detection
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Corruption & Incompleteness Auditing', () => {
    it('detects truncated / invalid JSON and throws IndexCorruptError with actionable advice', async () => {
      fs.mkdirSync(indexDir, { recursive: true });
      // Truncated JSON
      fs.writeFileSync(join(indexDir, INDEX_FILE_NAME), '{"schemaVersion": 1, "stats": { "totalDocuments":');

      const idx = createInvertedIndex({ indexDir });

      await expect(idx.load(indexDir)).rejects.toThrow(IndexCorruptError);
      await expect(idx.load(indexDir)).rejects.toThrow(/corrupted or invalid JSON/i);
      await expect(idx.load(indexDir)).rejects.toThrow(/opensearch index --rebuild/i);
    });

    it('detects zero-byte empty index files safely', async () => {
      fs.mkdirSync(indexDir, { recursive: true });
      fs.writeFileSync(join(indexDir, INDEX_FILE_NAME), ''); // 0-byte file

      const audit = validateIndexFile(indexDir);
      expect(audit.valid).toBe(false);
      expect(audit.errors[0]).toContain('0 bytes');
      expect(audit.recoverySuggestion).toContain('rebuild');

      const idx = createInvertedIndex({ indexDir });
      await expect(idx.load(indexDir)).rejects.toThrow(IndexCorruptError);
    });

    it('detects dangling temporary build files left by interrupted processes', async () => {
      fs.mkdirSync(indexDir, { recursive: true });
      // Only .tmp file exists, no index-data.json
      fs.writeFileSync(join(indexDir, INDEX_TMP_FILE_NAME), '{"temp": true}');

      const audit = validateIndexFile(indexDir);
      expect(audit.valid).toBe(false);
      expect(audit.diagnostics?.hasDanglingTmpFile).toBe(true);
      expect(audit.errors[0]).toContain('dangling temporary build file');
      expect(audit.recoverySuggestion).toContain('interrupted');
    });

    it('flags statistical discrepancies between stats and documents list', () => {
      const payload = {
        schemaVersion: 1,
        stats: { totalDocuments: 50, totalTerms: 0, totalPostings: 0, avgDocumentLength: 0, avgFieldLengths: {}, lastUpdatedAt: '' },
        documents: [], // 0 documents, but stats says 50!
        dictionary: [],
      };

      const audit = validateIndexPayload(payload);
      expect(audit.valid).toBe(false);
      expect(audit.errors[0]).toContain('Statistical inconsistency');
    });

    it('flags referential integrity violations from orphaned postings', () => {
      const payload = {
        schemaVersion: 1,
        stats: { totalDocuments: 1, totalTerms: 1, totalPostings: 1, avgDocumentLength: 5, avgFieldLengths: {}, lastUpdatedAt: '' },
        documents: [
          {
            documentId: 'valid-doc-1',
            url: 'https://example.com/1',
            urlHash: 'h1',
            title: 'Doc 1',
            language: 'en',
            totalTerms: 5,
            fieldLengths: {},
            indexedAt: '',
          },
        ],
        dictionary: [
          {
            term: 'search',
            documentFrequency: 1,
            postings: [
              {
                documentId: 'ghost-doc-99', // Non-existent document!
                termFrequency: 1,
                fieldTermFrequencies: {},
                fieldPositions: {},
              },
            ],
          },
        ],
      };

      const audit = validateIndexPayload(payload);
      expect(audit.valid).toBe(false);
      expect(audit.errors[0]).toContain('orphaned posting reference');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Failed Rebuild Preservation & Atomic Promotion
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Failed Rebuild Preservation & Atomic Promotion', () => {
    it('preserves previous valid active index when a rebuild encounters an error', async () => {
      // 1. Initial successful build with 2 documents
      await storage.documents.create({
        url: 'https://example.com/page1',
        urlHash: 'hash-p1',
        title: 'Original Document One',
        description: 'First page description',
        headings: 'Introduction',
        bodyText: 'Alpha searchable content in original index.',
        contentType: 'text/html',
        contentLength: 50,
        httpStatus: 200,
        outboundLinks: [],
        indexStatus: INDEX_STATUS.PENDING,
      });

      await storage.documents.create({
        url: 'https://example.com/page2',
        urlHash: 'hash-p2',
        title: 'Original Document Two',
        description: 'Second page description',
        headings: 'Architecture',
        bodyText: 'Beta searchable content in original index.',
        contentType: 'text/html',
        contentLength: 50,
        httpStatus: 200,
        outboundLinks: [],
        indexStatus: INDEX_STATUS.PENDING,
      });

      const processor = createDocumentProcessor();
      const builder = createIndexBuilder({
        config,
        storage,
        processor,
        indexDir,
      });

      const initialSummary = await builder.build({ mode: 'full' });
      expect(initialSummary.status).toBe('success');
      expect(initialSummary.stats.documentsIndexed).toBe(2);

      const activeIndexBefore = builder.getActiveIndex();
      expect(activeIndexBefore).not.toBeNull();
      expect(activeIndexBefore?.getStats().totalDocuments).toBe(2);
      expect(activeIndexBefore?.getDocumentFrequency('alpha')).toBe(1);

      const activeMetaBefore = await storage.indexMetadata.findActive();
      expect(activeMetaBefore?.status).toBe('ready');

      // 2. Add a third document but introduce a processor failure during rebuild
      await storage.documents.create({
        url: 'https://example.com/page3',
        urlHash: 'hash-p3',
        title: 'Poison Document',
        description: 'Poison doc description',
        headings: 'Poison Heading',
        bodyText: 'Trigger failure.',
        contentType: 'text/html',
        contentLength: 30,
        httpStatus: 200,
        outboundLinks: [],
        indexStatus: INDEX_STATUS.PENDING,
      });

      // Mock processor that throws on poison document
      let callCount = 0;
      const failingProcessor = {
        process: (doc: any) => {
          callCount++;
          if (callCount >= 2) {
            throw new Error('Simulated disk/parser failure during indexing pipeline');
          }
          return processor.process(doc);
        },
      };

      const failingBuilder = createIndexBuilder({
        config,
        storage,
        processor: failingProcessor as any,
        indexDir,
      });

      // Load active index first into this builder instance
      await failingBuilder.loadActiveIndex();
      expect(failingBuilder.getActiveIndex()?.getStats().totalDocuments).toBe(2);

      // Trigger rebuild which fails midway
      const failedSummary = await failingBuilder.build({ mode: 'full' });
      expect(failedSummary.status).toBe('failed');
      expect(failedSummary.errorMessage).toContain('Simulated disk/parser failure');

      // 3. Verify active index remains the previous valid index!
      const activeIndexAfter = failingBuilder.getActiveIndex();
      expect(activeIndexAfter).not.toBeNull();
      expect(activeIndexAfter?.getStats().totalDocuments).toBe(2);
      expect(activeIndexAfter?.getDocumentFrequency('alpha')).toBe(1);
      expect(activeIndexAfter?.getDocumentFrequency('beta')).toBe(1);

      // Verify active metadata record in storage is STILL the original build
      const activeMetaAfter = await storage.indexMetadata.findActive();
      expect(activeMetaAfter?.buildId).toBe(activeMetaBefore?.buildId);
      expect(activeMetaAfter?.status).toBe('ready');

      // Verify failed staging directory was wiped clean
      expect(fs.existsSync(failedSummary.indexPath)).toBe(false);
    });

    it('self-heals automatically when loading an active index whose disk file was corrupted', async () => {
      // 1. Initial successful build
      await storage.documents.create({
        url: 'https://example.com/healing',
        urlHash: 'hash-heal',
        title: 'Healing Document',
        description: 'Healing doc description',
        headings: 'Healing Heading',
        bodyText: 'Self healing full text indexing.',
        contentType: 'text/html',
        contentLength: 40,
        httpStatus: 200,
        outboundLinks: [],
        indexStatus: INDEX_STATUS.PENDING,
      });

      const builder1 = createIndexBuilder({
        config,
        storage,
        indexDir,
      });
      await builder1.build({ mode: 'full' });

      const activeMeta = await storage.indexMetadata.findActive();
      expect(activeMeta).not.toBeNull();

      // 2. Simulate external corruption of active index file
      const activeDataFile = join(activeMeta!.indexPath, INDEX_FILE_NAME);
      fs.writeFileSync(activeDataFile, 'CORRUPTED_BYTES_NOT_JSON');

      // 3. Create fresh builder and call loadActiveIndex()
      const healingBuilder = createIndexBuilder({
        config,
        storage,
        indexDir,
      });

      // loadActiveIndex should detect corruption and self-heal via clean full rebuild
      const healedIndex = await healingBuilder.loadActiveIndex();
      expect(healedIndex).toBeDefined();
      expect(healedIndex.getStats().totalDocuments).toBe(1);
      expect(healedIndex.getDocumentFrequency('healing')).toBe(1);

      // Storage now has a new active ready metadata record
      const newActiveMeta = await storage.indexMetadata.findActive();
      expect(newActiveMeta?.status).toBe('ready');
      expect(newActiveMeta?.buildId).not.toBe(activeMeta?.buildId);
    });
  });
});
