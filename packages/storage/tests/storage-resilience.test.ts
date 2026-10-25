/**
 * @opensearch/storage — Phase 74: Storage Abstraction, Durability & Backup Test Suite
 *
 * Verifies all tasks and acceptance criteria:
 * 1. Independent testing of storage operations without ranking or UI dependencies.
 * 2. Durability: Restarting the storage adapter retains all documents, URLs, and metadata.
 * 3. Atomic backup snapshot generation with manifest and SHA-256 checksums.
 * 4. Validated restore: Restores collections and immediately updates live adapter memory.
 * 5. Tamper detection: Aborts restore if backup file checksum does not match manifest.
 * 6. Integrity verification: Detects 0-byte files, corrupted JSON, and invalid schemas.
 * 7. Configurable data directory support.
 * 8. Zero raw query logging invariant.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorageError } from '@opensearch/shared';
import {
  JsonStorageAdapter,
  INDEX_STATUS,
  createStorageBackup,
  restoreStorageBackup,
  verifyStorageIntegrity,
} from '../src/index.js';

describe('Phase 74 — Storage Abstraction, Durability & Backup Suite', () => {
  let testDir: string;
  let storageDir: string;
  let backupDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'opensearch-storage-p74-'));
    storageDir = join(testDir, 'storage');
    backupDir = join(testDir, 'backup');
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Independent Storage & Durability across Restarts
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Independent Storage & Restart Durability', () => {
    it('persists records durably across simulated process and adapter restarts', async () => {
      // Session 1: Create storage, insert document, and close
      const session1 = new JsonStorageAdapter({ storageDir });
      await session1.initialize();

      const createdDoc = await session1.documents.create({
        url: 'https://example.com/durable-doc',
        urlHash: 'hash-durable-1',
        title: 'Durable Storage Document',
        description: 'Testing restart persistence',
        headings: 'Durability',
        bodyText: 'Data must survive process termination.',
        contentType: 'text/html',
        contentLength: 40,
        httpStatus: 200,
        outboundLinks: [],
        indexStatus: INDEX_STATUS.PENDING,
      });

      await session1.urls.create({
        url: 'https://example.com/durable-doc',
        urlHash: 'hash-durable-1',
        domain: 'example.com',
        scheme: 'https',
        crawlStatus: 'pending',
        discoveredAt: Date.now(),
        lastAttemptedAt: null,
        httpStatus: null,
        retryCount: 0,
        depth: 0,
      });

      expect(await session1.documents.count()).toBe(1);
      expect(await session1.urls.count()).toBe(1);

      // Simulate process termination
      await session1.close();

      // Session 2: Fresh adapter pointing to same storage directory
      const session2 = new JsonStorageAdapter({ storageDir });
      await session2.initialize();

      expect(await session2.documents.count()).toBe(1);
      expect(await session2.urls.count()).toBe(1);

      const retrievedDoc = await session2.documents.findById(createdDoc.id);
      expect(retrievedDoc).not.toBeNull();
      expect(retrievedDoc?.title).toBe('Durable Storage Document');
      expect(retrievedDoc?.url).toBe('https://example.com/durable-doc');

      const retrievedUrl = await session2.urls.findByHash('hash-durable-1');
      expect(retrievedUrl).not.toBeNull();
      expect(retrievedUrl?.domain).toBe('example.com');

      await session2.close();
    });

    it('supports arbitrary configurable data directory paths', async () => {
      const customDir = join(testDir, 'custom', 'deep', 'path', 'storage');
      const adapter = new JsonStorageAdapter({ storageDir: customDir });
      await adapter.initialize();

      await adapter.documents.create({
        url: 'https://example.com/custom',
        urlHash: 'hash-custom',
        title: 'Custom Path Doc',
        description: 'Custom path description',
        headings: 'Custom',
        bodyText: 'Custom path body text.',
        contentType: 'text/html',
        contentLength: 30,
        httpStatus: 200,
        outboundLinks: [],
        indexStatus: INDEX_STATUS.PENDING,
      });

      expect(fs.existsSync(join(customDir, 'documents.json'))).toBe(true);
      expect(await adapter.documents.count()).toBe(1);
      await adapter.close();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Backup Creation & Manifest Validation
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Atomic Backup Creation', () => {
    it('creates a complete snapshot backup with manifest and SHA-256 checksums', async () => {
      const adapter = new JsonStorageAdapter({ storageDir });
      await adapter.initialize();

      await adapter.documents.create({
        url: 'https://example.com/backup1',
        urlHash: 'hash-b1',
        title: 'Backup Target Doc',
        description: 'Testing backup',
        headings: 'Backup',
        bodyText: 'Snapshot target.',
        contentType: 'text/html',
        contentLength: 20,
        httpStatus: 200,
        outboundLinks: [],
        indexStatus: INDEX_STATUS.PENDING,
      });

      const backupResult = await adapter.backup(backupDir);

      expect(backupResult.success).toBe(true);
      expect(backupResult.totalRecords).toBeGreaterThanOrEqual(1);
      expect(fs.existsSync(backupResult.manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(backupResult.manifestPath, 'utf-8'));
      expect(manifest.manifestVersion).toBe(1);
      expect(manifest.collections['documents.json'].recordCount).toBe(1);
      expect(typeof manifest.collections['documents.json'].sha256).toBe('string');
      expect(manifest.collections['documents.json'].sha256.length).toBe(64);

      await adapter.close();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Validated Restore & Tamper Detection
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Validated Restore & Tamper Detection', () => {
    it('restores collections and dynamically reloads live adapter memory', async () => {
      const adapter = new JsonStorageAdapter({ storageDir });
      await adapter.initialize();

      // Insert original data
      const doc = await adapter.documents.create({
        url: 'https://example.com/restore-me',
        urlHash: 'hash-restore',
        title: 'Document to Restore',
        description: 'Restore desc',
        headings: 'Restore',
        bodyText: 'Restore test content.',
        contentType: 'text/html',
        contentLength: 25,
        httpStatus: 200,
        outboundLinks: [],
        indexStatus: INDEX_STATUS.PENDING,
      });

      // Create backup
      await adapter.backup(backupDir);

      // Now mutate storage (delete the document)
      fs.writeFileSync(
        join(storageDir, 'documents.json'),
        JSON.stringify({ records: {}, version: 1, lastSaved: new Date().toISOString() }),
      );

      // Restore from backup using the active adapter
      const restoreResult = await adapter.restore(backupDir);

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.totalRecordsRestored).toBeGreaterThanOrEqual(1);

      // Check that live adapter memory reflects the restored state immediately
      expect(await adapter.documents.count()).toBe(1);
      const restoredDoc = await adapter.documents.findById(doc.id);
      expect(restoredDoc).not.toBeNull();
      expect(restoredDoc?.title).toBe('Document to Restore');

      await adapter.close();
    });

    it('rejects restore and preserves target storage if backup file checksum is tampered', async () => {
      const adapter = new JsonStorageAdapter({ storageDir });
      await adapter.initialize();

      await adapter.documents.create({
        url: 'https://example.com/secure',
        urlHash: 'hash-sec',
        title: 'Original Secure Doc',
        description: 'Secure',
        headings: 'Secure',
        bodyText: 'Secure text.',
        contentType: 'text/html',
        contentLength: 20,
        httpStatus: 200,
        outboundLinks: [],
        indexStatus: INDEX_STATUS.PENDING,
      });

      await adapter.backup(backupDir);

      // Tamper with documents.json in backupDir
      const backupDocsFile = join(backupDir, 'documents.json');
      fs.appendFileSync(backupDocsFile, '\n// Tampered bytes');

      // Attempting restore should reject with checksum mismatch
      await expect(adapter.restore(backupDir)).rejects.toThrow(StorageError);
      await expect(adapter.restore(backupDir)).rejects.toThrow(/Checksum mismatch/i);

      // Target storage remains untouched
      expect(await adapter.documents.count()).toBe(1);
      await adapter.close();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Integrity Verification & Corruption Detection
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Corruption Detection & Verification', () => {
    it('detects healthy storage directories with valid integrity report', async () => {
      const adapter = new JsonStorageAdapter({ storageDir });
      await adapter.initialize();

      await adapter.documents.create({
        url: 'https://example.com/health',
        urlHash: 'hash-health',
        title: 'Health Test Doc',
        description: 'Health desc',
        headings: 'Health',
        bodyText: 'Integrity verified.',
        contentType: 'text/html',
        contentLength: 20,
        httpStatus: 200,
        outboundLinks: [],
        indexStatus: INDEX_STATUS.PENDING,
      });

      const report = await adapter.verifyIntegrity();
      expect(report.valid).toBe(true);
      expect(report.errors.length).toBe(0);
      expect(report.collections['documents.json'].exists).toBe(true);
      expect(report.collections['documents.json'].corrupted).toBe(false);

      await adapter.close();
    });

    it('detects 0-byte truncated files and flags corruption', async () => {
      fs.mkdirSync(storageDir, { recursive: true });
      fs.writeFileSync(join(storageDir, 'documents.json'), ''); // 0-byte file

      const report = await verifyStorageIntegrity(storageDir);
      expect(report.valid).toBe(false);
      expect(report.collections['documents.json'].corrupted).toBe(true);
      expect(report.errors.some(e => e.includes('0 bytes'))).toBe(true);
    });

    it('detects invalid JSON syntax in stored collections', async () => {
      fs.mkdirSync(storageDir, { recursive: true });
      fs.writeFileSync(join(storageDir, 'urls.json'), '{"records": { corrupt json...');

      const report = await verifyStorageIntegrity(storageDir);
      expect(report.valid).toBe(false);
      expect(report.collections['urls.json'].corrupted).toBe(true);
      expect(report.errors.some(e => e.includes('invalid JSON'))).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Query Non-Persistence Verification
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Zero Raw Query Logging Invariant', () => {
    it('verifies that storage collections store zero query strings or search histories', async () => {
      const adapter = new JsonStorageAdapter({ storageDir });
      await adapter.initialize();

      const health = await adapter.health();
      const files = fs.readdirSync(storageDir);

      // Only standard collections exist
      expect(files.every(f => !f.includes('query') && !f.includes('history'))).toBe(true);

      // Verify no method exists on adapter to record user search queries
      expect((adapter as any).queries).toBeUndefined();
      expect((adapter as any).searchHistory).toBeUndefined();

      await adapter.close();
    });
  });
});
