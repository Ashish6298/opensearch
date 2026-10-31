/**
 * @opensearch/indexer — Phase 76 Test Suite: Incremental Indexing & Safe Recovery
 *
 * Verifies:
 * 1. Idempotent document add, update, and delete operations
 * 2. Document fingerprint tracking to avoid unnecessary processing
 * 3. Atomic publication and crash safety (failed builds do not corrupt active index)
 * 4. Obsolete generation pruning and retention rules (active generation is never pruned)
 * 5. Index health reporting with zero query or private content leakage
 * 6. Automatic recovery and rebuild mechanics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig } from '@opensearch/shared';
import { createStorageAdapter, StorageAdapter, INDEX_STATUS, DocumentRecord } from '@opensearch/storage';
import {
  createIndexBuilder,
  IndexBuilder,
  computeDocumentFingerprint,
} from '../src/index.js';

describe('Phase 76 — Incremental Indexing & Safe Recovery', () => {
  let tempDir: string;
  let storage: StorageAdapter;
  let indexDir: string;
  let builder: IndexBuilder;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-p76-test-'));
    const storageDir = path.join(tempDir, 'storage');
    indexDir = path.join(tempDir, 'index');

    const config = loadConfig({
      STORAGE_DIR: storageDir,
      INDEX_DIR: indexDir,
      CRAWLER_DATA_DIR: path.join(tempDir, 'crawler'),
    });

    storage = createStorageAdapter({ config });
    await storage.initialize();

    builder = createIndexBuilder({
      storage,
      indexDir,
    });
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

  async function createSampleDoc(id: string, title: string, bodyText: string): Promise<DocumentRecord> {
    return await storage.documents.create({
      url: `https://example.com/docs/${id}`,
      urlHash: `hash-${id}-${Date.now()}`,
      title,
      description: `Summary of ${title}`,
      headings: 'Overview\nDetails',
      bodyText,
      language: 'en',
      contentType: 'text/html; charset=UTF-8',
      contentLength: Buffer.byteLength(bodyText, 'utf-8'),
      httpStatus: 200,
      outboundLinks: [],
      indexStatus: INDEX_STATUS.NOT_INDEXED,
    });
  }

  describe('Idempotent Document Add, Update, and Delete', () => {
    it('indexes a new document and makes its terms searchable', async () => {
      // Establish baseline active index
      await builder.loadActiveIndex();

      const doc = await createSampleDoc('doc-1', 'Distributed Systems Consensus', 'Raft and Paxos ensure cluster safety.');

      const result = await builder.indexDocument(doc);
      expect(result.action).toBe('indexed');
      expect(result.documentId).toBe(doc.id);
      expect(result.fingerprint).toHaveLength(64);

      const activeIndex = builder.getActiveIndex();
      expect(activeIndex).not.toBeNull();
      expect(activeIndex!.hasDocument(doc.id)).toBe(true);

      const postings = activeIndex!.getPostings('paxos');
      expect(postings).not.toBeNull();
      expect(postings!.some(p => p.documentId === doc.id)).toBe(true);
    });

    it('skips re-processing when document fingerprint is identical (idempotent no-op)', async () => {
      // Establish baseline active index
      await builder.loadActiveIndex();

      const doc = await createSampleDoc('doc-2', 'Inverted Index Data Structure', 'Posting lists map terms to document IDs.');

      // First indexing
      const res1 = await builder.indexDocument(doc);
      expect(res1.action).toBe('indexed');

      // Second indexing with identical content
      const res2 = await builder.indexDocument(doc);
      expect(res2.action).toBe('skipped');
      expect(res2.fingerprint).toBe(res1.fingerprint);

      // Verify stats have not doubled
      const activeIndex = builder.getActiveIndex();
      expect(activeIndex!.getStats().totalDocuments).toBe(1);
    });

    it('updates document and re-indexes cleanly when content fingerprint changes', async () => {
      await builder.loadActiveIndex();
      const doc = await createSampleDoc('doc-3', 'Cryptography Basics', 'Symmetric encryption uses identical keys.');
      await builder.indexDocument(doc);

      const initialIndex = builder.getActiveIndex();
      expect(initialIndex!.getPostings('symmetric')).not.toBeNull();
      expect(initialIndex!.getPostings('asymmetric')).toBeNull();

      // Update document content in storage
      const updatedDoc = await storage.documents.update(doc.id, {
        title: 'Asymmetric Cryptography',
        bodyText: 'Asymmetric encryption uses public and private key pairs.',
      });

      const updateResult = await builder.indexDocument(updatedDoc);
      expect(updateResult.action).toBe('updated');

      const updatedIndex = builder.getActiveIndex();
      // Old term should be cleaned up, new term present
      expect(updatedIndex!.getPostings('symmetric')).toBeNull();
      expect(updatedIndex!.getPostings('asymmetric')).not.toBeNull();
      expect(updatedIndex!.getStats().totalDocuments).toBe(1);
    });

    it('idempotently deletes a document and cleans up dictionary terms', async () => {
      await builder.loadActiveIndex();
      const doc = await createSampleDoc('doc-4', 'Ephemeral Epoll Socket', 'Epoll enables scalable network events.');
      await builder.indexDocument(doc);

      expect(builder.getActiveIndex()!.hasDocument(doc.id)).toBe(true);

      // Delete document
      const deleted = await builder.deleteDocument(doc.id);
      expect(deleted).toBe(true);
      expect(builder.getActiveIndex()!.hasDocument(doc.id)).toBe(false);
      expect(builder.getActiveIndex()!.getPostings('epoll')).toBeNull();

      // Second delete is safe no-op
      const secondDelete = await builder.deleteDocument(doc.id);
      expect(secondDelete).toBe(false);

      // Document status in storage reflects unindexed
      const stored = await storage.documents.findById(doc.id);
      expect(stored!.indexStatus).toBe(INDEX_STATUS.NOT_INDEXED);
    });
  });

  describe('Fingerprint Tracking & Incremental Builds', () => {
    it('computes deterministic content fingerprints for documents', () => {
      const fp1 = computeDocumentFingerprint({
        title: 'HTTP/3 Protocol',
        headings: 'Framing',
        description: 'QUIC transport',
        bodyText: 'HTTP/3 operates over UDP.',
      });

      const fp2 = computeDocumentFingerprint({
        title: 'http/3 protocol',
        headings: 'framing',
        description: 'quic transport',
        bodyText: 'http/3 operates over udp.',
      });

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
    });

    it('skips unchanged documents during incremental builds', async () => {
      const doc1 = await createSampleDoc('doc-inc-1', 'TypeScript Handbook', 'Type checking provides compile-time guarantees.');
      const doc2 = await createSampleDoc('doc-inc-2', 'Rust Ownership', 'The borrow checker prevents data races.');

      // Full build indexes both
      await builder.build({ mode: 'full' });

      // Mark doc1 as STALE (e.g. crawler visited but content unchanged)
      await storage.documents.update(doc1.id, {
        indexStatus: INDEX_STATUS.STALE,
      });

      // Run incremental build
      const incSummary = await builder.build({ mode: 'incremental' });
      expect(incSummary.status).toBe('success');
      expect(incSummary.stats.documentsExamined).toBe(1);
      expect(incSummary.stats.documentsSkipped).toBe(1); // Fingerprint matched, skipped re-tokenization
      expect(incSummary.stats.documentsIndexed).toBe(0);
    });
  });

  describe('Atomic Publication & Crash Invariants', () => {
    it('preserves the active index intact if a rebuild encounters failure', async () => {
      const doc = await createSampleDoc('doc-crash', 'Initial Safe State', 'Valid initial searchable content.');
      const initialBuild = await builder.build({ mode: 'full' });
      expect(initialBuild.status).toBe('success');

      const activeBefore = await builder.getActiveMetadata();
      expect(activeBefore).not.toBeNull();

      const collisionFile = path.join(tempDir, 'collision.txt');
      fs.writeFileSync(collisionFile, 'data', 'utf8');
      const failingSummary = await builder.build({
        mode: 'full',
        targetDir: path.join(collisionFile, 'invalid_sub'),
      });

      expect(failingSummary.status).toBe('failed');

      // Verify active metadata still points to the initial successful build
      const activeAfter = await storage.indexMetadata.findActive();
      expect(activeAfter).not.toBeNull();
      expect(activeAfter!.buildId).toBe(activeBefore!.buildId);
      expect(activeAfter!.status).toBe('ready');

      // Searchable index still serves queries
      const activeIndex = builder.getActiveIndex();
      expect(activeIndex).not.toBeNull();
      expect(activeIndex!.getPostings('searchable')).not.toBeNull();
    });
  });

  describe('Generation Retention & Obsolete Cleanup', () => {
    it('cleans up obsolete generations while strictly preserving the active generation', async () => {
      await createSampleDoc('doc-ret', 'Retention Policy Title', 'Testing generation lifecycle.');

      // Create 4 distinct builds
      const b1 = await builder.build({ mode: 'full', versionLabel: '1.0.1' });
      const b2 = await builder.build({ mode: 'full', versionLabel: '1.0.2' });
      const b3 = await builder.build({ mode: 'full', versionLabel: '1.0.3' });
      const b4 = await builder.build({ mode: 'full', versionLabel: '1.0.4' });

      expect(b4.status).toBe('success');
      const activeMeta = await builder.getActiveMetadata();
      expect(activeMeta!.buildId).toBe(b4.buildId);

      // Clean with maxRetained: 2 (retains active b4 + 1 previous b3, prunes b1 and b2)
      const cleanupResult = await builder.cleanObsoleteGenerations({ maxRetained: 2 });
      expect(cleanupResult.activeBuildId).toBe(b4.buildId);
      expect(cleanupResult.retainedBuildIds).toContain(b4.buildId);
      expect(cleanupResult.retainedBuildIds.length).toBeLessThanOrEqual(2);
      expect(cleanupResult.prunedBuildIds.length).toBeGreaterThanOrEqual(1);

      // Verify active build files still exist on disk
      expect(fs.existsSync(b4.indexPath)).toBe(true);

      // Pruned builds directories removed from disk
      for (const prunedId of cleanupResult.prunedBuildIds) {
        const prunedDir = path.join(indexDir, 'builds', prunedId);
        expect(fs.existsSync(prunedDir)).toBe(false);
      }
    });
  });

  describe('Index Health Monitoring (Zero Content Leakage)', () => {
    it('returns comprehensive index health metrics without leaking queries or content', async () => {
      await createSampleDoc('doc-health', 'Health Check Topic', 'Telemetry must remain strictly private.');
      await builder.build({ mode: 'full' });

      const health = await builder.getIndexHealth();
      expect(health.status).toBe('healthy');
      expect(health.schemaVersion).toBe(1);
      expect(health.activeGeneration).not.toBeNull();
      expect(health.activeGeneration!.documentCount).toBe(1);
      expect(health.activeGeneration!.termCount).toBeGreaterThan(0);
      expect(health.activeGeneration!.integrityValid).toBe(true);
      expect(health.activeGeneration!.fileSizeBytes).toBeGreaterThan(0);
      expect(health.generations.totalGenerations).toBeGreaterThanOrEqual(1);
      expect(health.pendingDocuments.needsReindex).toBe(false);

      // Privacy audit: serialize health to string and verify absence of sensitive fields
      const serialized = JSON.stringify(health);
      expect(serialized).not.toContain('Health Check Topic');
      expect(serialized).not.toContain('Telemetry must remain strictly private');
      expect(serialized).not.toContain('query');
      expect(serialized).not.toContain('search_term');
    });

    it('reports degraded status when unindexed pending documents exist', async () => {
      await createSampleDoc('doc-h1', 'Initial Doc', 'Initial indexed content.');
      await builder.build({ mode: 'full' });

      // Add a pending unindexed document
      await storage.documents.create({
        url: 'https://example.com/pending',
        urlHash: 'pending-hash',
        title: 'Pending Article',
        description: 'Not yet in index',
        headings: 'Pending',
        bodyText: 'Waiting for incremental indexing.',
        language: 'en',
        contentType: 'text/html',
        contentLength: 100,
        httpStatus: 200,
        outboundLinks: [],
        indexStatus: INDEX_STATUS.PENDING,
      });

      const health = await builder.getIndexHealth();
      expect(health.status).toBe('degraded');
      expect(health.pendingDocuments.pendingCount).toBe(1);
      expect(health.pendingDocuments.needsReindex).toBe(true);
    });
  });
});
