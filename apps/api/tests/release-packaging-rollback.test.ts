/**
 * @opensearch/api — Phase 120: Release Packaging, Migration & Rollback Test Suite
 *
 * Automated verification of:
 * 1. Schema migration runner and automatic pre-migration backup creation
 * 2. Pre-flight integrity validation before destructive changes
 * 3. Invariant: Failed upgrades do not silently destroy existing persistent storage
 * 4. Manual schema rollback to previous snapshot versions
 * 5. Traceable release metadata (GET /api/v1/release) and build repeatability
 * 6. Registry publication safety guards (monorepo private: true & publish-guard.mjs)
 * 7. Environment variables safe defaults invariant
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  runSchemaMigrations,
  rollbackSchemaMigration,
  loadSchemaMigrationState,
  SCHEMA_VERSION_FILENAME,
  StorageMigration,
  createStorageAdapter,
} from '@opensearch/storage';
import {
  getReleaseMetadata,
  loadConfig,
  PROJECT_VERSION,
  PRODUCT_NAME,
} from '@opensearch/shared';
import { ApiServer } from '../src/server.js';
import { createInvertedIndex } from '@opensearch/indexer';

describe('Phase 120 — Release Packaging and Rollback Suite', () => {
  let tempDir: string;
  let server: ApiServer;
  let apiBaseUrl: string;
  const projectRoot = path.resolve(__dirname, '../../..');

  beforeAll(async () => {
    const index = createInvertedIndex();
    server = new ApiServer({
      deploymentModel: 'self-hosted',
      index,
      rateLimitPerMinute: 200,
      enableMcp: false,
    });
    const info = await server.start(0, '127.0.0.1');
    apiBaseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-migration-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  // ============================================================================
  // 1. Schema Migration & Pre-Migration Automated Backup
  // ============================================================================
  describe('1. Schema Migration & Pre-Migration Automated Backup', () => {
    it('creates an automated pre-migration backup before applying schema changes', async () => {
      // Setup initial storage with sample documents
      const config = loadConfig({ STORAGE_DIR: tempDir });
      const storage = createStorageAdapter({ config });
      await storage.initialize();
      await storage.documents.create({
        url: 'https://example.com/item1',
        urlHash: 'hash-item-1',
        title: 'Initial Document Before Migration',
        description: 'Testing pre-migration snapshot.',
        headings: 'Test Heading',
        bodyText: 'Persistent text before migration.',
        language: 'en',
        contentType: 'text/html',
        contentLength: 100,
        httpStatus: 200,
        outboundLinks: [],
      });
      await storage.close();

      // Define migration to version 2
      const migrations: StorageMigration[] = [
        {
          version: 2,
          description: 'Add audit metadata field to documents',
          up: (storagePath) => {
            const docsPath = path.join(storagePath, 'documents.json');
            const data = JSON.parse(fs.readFileSync(docsPath, 'utf8'));
            for (const key of Object.keys(data.records || {})) {
              data.records[key].migratedV2 = true;
            }
            fs.writeFileSync(docsPath, JSON.stringify(data, null, 2), 'utf8');
          },
          validate: (storagePath) => {
            const docsPath = path.join(storagePath, 'documents.json');
            const data = JSON.parse(fs.readFileSync(docsPath, 'utf8'));
            const list = Object.values(data.records || {}) as any[];
            return list.length > 0 && list.every((d: any) => d.migratedV2 === true);
          },
        },
      ];

      // Execute migration
      const result = await runSchemaMigrations({
        storageDir: tempDir,
        migrations,
        autoBackup: true,
      });

      expect(result.success).toBe(true);
      expect(result.previousVersion).toBe(1);
      expect(result.currentVersion).toBe(2);
      expect(result.appliedCount).toBe(1);
      expect(result.rolledBack).toBe(false);
      expect(result.backupSnapshotPath).toBeDefined();
      expect(fs.existsSync(result.backupSnapshotPath!)).toBe(true);

      // Verify backup manifest exists in the snapshot
      const manifestPath = path.join(result.backupSnapshotPath!, 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      // Verify state was saved to schema-version.json
      const state = loadSchemaMigrationState(tempDir);
      expect(state.schemaVersion).toBe(2);
      expect(state.appliedMigrations.length).toBe(1);
    });
  });

  // ============================================================================
  // 2. Invariant: Failed Upgrades Do Not Silently Destroy the Previous Index
  // ============================================================================
  describe('2. Invariant: Failed Upgrades Do Not Destroy Existing Index', () => {
    it('automatically rolls back and preserves previous index when a migration fails', async () => {
      // Setup initial storage with critical data
      const config = loadConfig({ STORAGE_DIR: tempDir });
      const storage = createStorageAdapter({ config });
      await storage.initialize();
      await storage.documents.create({
        url: 'https://example.com/vital-doc',
        urlHash: 'vital-hash-1',
        title: 'Vital Production Document',
        description: 'Must never be corrupted by a failed migration.',
        headings: 'Vital Data',
        bodyText: 'Critical content surviving failed upgrade.',
        language: 'en',
        contentType: 'text/html',
        contentLength: 200,
        httpStatus: 200,
        outboundLinks: [],
      });
      await storage.close();

      // Read initial state
      const docsPath = path.join(tempDir, 'documents.json');
      const originalContent = fs.readFileSync(docsPath, 'utf8');
      expect(originalContent).toContain('Vital Production Document');

      // Define a faulty migration that mutates data then throws an error during post-validation
      const faultyMigrations: StorageMigration[] = [
        {
          version: 2,
          description: 'Faulty migration that fails post-validation',
          up: (storagePath) => {
            // Intentionally corrupt documents file
            const file = path.join(storagePath, 'documents.json');
            fs.writeFileSync(file, 'CORRUPTED PARTIAL STATE', 'utf8');
          },
          validate: () => {
            // Explicitly fail validation
            return false;
          },
        },
      ];

      // Run migration — expected to fail and automatically roll back
      const result = await runSchemaMigrations({
        storageDir: tempDir,
        migrations: faultyMigrations,
        autoBackup: true,
      });

      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);
      expect(result.currentVersion).toBe(1); // Version reverted to 1
      expect(result.error).toContain('failed');

      // Invariant Check: Verify original content was restored and was not destroyed
      const restoredContent = fs.readFileSync(docsPath, 'utf8');
      expect(restoredContent).toBe(originalContent);
      expect(restoredContent).toContain('Vital Production Document');
      expect(restoredContent).not.toContain('CORRUPTED PARTIAL STATE');
    });
  });

  // ============================================================================
  // 3. Manual Rollback to a Previous Schema Version
  // ============================================================================
  describe('3. Manual Rollback Procedures', () => {
    it('rolls back to an earlier schema version using pre-migration snapshot', async () => {
      // Setup initial storage
      const config = loadConfig({ STORAGE_DIR: tempDir });
      const storage = createStorageAdapter({ config });
      await storage.initialize();
      await storage.documents.create({
        url: 'https://example.com/v1-doc',
        urlHash: 'v1-hash',
        title: 'Original V1 Document',
        description: 'V1 content.',
        headings: 'V1',
        bodyText: 'V1 text.',
        language: 'en',
        contentType: 'text/html',
        contentLength: 50,
        httpStatus: 200,
        outboundLinks: [],
      });
      await storage.close();

      // Apply successful migration to V2
      const migrations: StorageMigration[] = [
        {
          version: 2,
          description: 'Migrate to v2',
          up: (dir) => {
            fs.writeFileSync(path.join(dir, 'v2-marker.txt'), 'version-2-marker', 'utf8');
          },
        },
      ];

      const migResult = await runSchemaMigrations({
        storageDir: tempDir,
        migrations,
        autoBackup: true,
      });
      expect(migResult.success).toBe(true);
      expect(loadSchemaMigrationState(tempDir).schemaVersion).toBe(2);
      expect(fs.existsSync(path.join(tempDir, 'v2-marker.txt'))).toBe(true);

      // Rollback to version 1
      const rollbackResult = await rollbackSchemaMigration({
        storageDir: tempDir,
        targetVersion: 1,
      });

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.currentVersion).toBe(1);
      expect(rollbackResult.rolledBack).toBe(true);

      // Verify schema state reverted to version 1
      const state = loadSchemaMigrationState(tempDir);
      expect(state.schemaVersion).toBe(1);

      // Verify original documents are present
      const docsStore = JSON.parse(fs.readFileSync(path.join(tempDir, 'documents.json'), 'utf8'));
      const docsList = Object.values(docsStore.records || {}) as any[];
      expect(docsList[0].title).toBe('Original V1 Document');
    });

    it('rejects rollback if target version is greater than or equal to current version', async () => {
      await expect(
        rollbackSchemaMigration({
          storageDir: tempDir,
          targetVersion: 2,
        }),
      ).rejects.toThrow(/Cannot rollback/i);
    });
  });

  // ============================================================================
  // 4. Traceable Release Metadata & API Endpoints
  // ============================================================================
  describe('4. Traceable Release Metadata & API Endpoints', () => {
    it('getReleaseMetadata returns complete traceable release record', () => {
      const release = getReleaseMetadata();
      expect(release.version).toBe(PROJECT_VERSION);
      expect(release.productName).toBe(PRODUCT_NAME);
      expect(release.isRepeatableBuild).toBe(true);
      expect(release.isPublishProtected).toBe(true);
      expect(release.defaultSchemaVersion).toBe(1);
      expect(release.supportedDeploymentModes).toContain('local-first');
      expect(release.supportedDeploymentModes).toContain('self-hosted');
      expect(release.guarantees.zeroPaidServices).toBe(true);
      expect(release.guarantees.zeroSecretsRequired).toBe(true);
    });

    it('GET /api/v1/release exposes traceable release metadata', async () => {
      const res = await fetch(`${apiBaseUrl}/api/v1/release`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.release).toBeDefined();
      expect(data.release.version).toBe(PROJECT_VERSION);
      expect(data.release.productName).toBe(PRODUCT_NAME);
      expect(data.release.nodeRuntime).toBe(process.version);
      expect(data.release.guarantees.zeroPaidServices).toBe(true);
    });

    it('GET / lists release endpoint in discoverable endpoints dictionary', async () => {
      const res = await fetch(`${apiBaseUrl}/`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.endpoints.release).toBe('/api/v1/release');
    });
  });

  // ============================================================================
  // 5. Registry Publication Protection & Monorepo Hygiene
  // ============================================================================
  describe('5. Registry Publication Protection & Monorepo Hygiene', () => {
    it('enforces private: true on all workspace packages', () => {
      const workspacePackagePaths = [
        path.join(projectRoot, 'package.json'),
        path.join(projectRoot, 'apps/api/package.json'),
        path.join(projectRoot, 'apps/web/package.json'),
        path.join(projectRoot, 'packages/cli/package.json'),
        path.join(projectRoot, 'packages/crawler/package.json'),
        path.join(projectRoot, 'packages/indexer/package.json'),
        path.join(projectRoot, 'packages/ranking/package.json'),
        path.join(projectRoot, 'packages/shared/package.json'),
        path.join(projectRoot, 'packages/storage/package.json'),
      ];

      for (const pkgPath of workspacePackagePaths) {
        expect(fs.existsSync(pkgPath)).toBe(true);
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        expect(pkg.private).toBe(true);
      }
    });

    it('publish-guard.mjs exists and blocks unauthorized publication', () => {
      const guardPath = path.join(projectRoot, 'scripts/publish-guard.mjs');
      expect(fs.existsSync(guardPath)).toBe(true);
      const content = fs.readFileSync(guardPath, 'utf8');
      expect(content).toContain("process.env.ALLOW_PUBLISH !== 'true'");
      expect(content).toContain('PUBLICATION GUARD BLOCKED');
    });
  });

  // ============================================================================
  // 6. Environment Variables Safe Defaults Invariant
  // ============================================================================
  describe('6. Environment Variables Safe Defaults Invariant', () => {
    it('loads configuration safely with an empty environment without crashes or missing keys', () => {
      const config = loadConfig({});
      expect(config.env).toBe('development');
      expect(config.api.server.port).toBe(3000);
      expect(config.web.server.port).toBe(5173);
      expect(config.storage.storageDir).toBeDefined();
      expect(config.crawler.maxConcurrency).toBeGreaterThanOrEqual(1);
      expect(config.search.maxQueryLength).toBeGreaterThan(0);
    });
  });
});
