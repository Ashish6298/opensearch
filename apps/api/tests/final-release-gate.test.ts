/**
 * Phase 124 — Final End-to-End Release Gate Verification Suite
 * Milestone 41 — Final Quality Gates and GitHub Actions CI/CD
 *
 * Validates the complete release readiness criteria across:
 * 1. CI/CD workflow configuration (Phases 121–123)
 * 2. Reproducible builds, typechecks, and package protection
 * 3. Privacy, security, and local-only mode enforcement
 * 4. Graceful provider degradation and error handling
 * 5. Storage durability, migration backup, and rollback safety
 * 6. User documentation and operational readiness
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, getReleaseMetadata } from '@opensearch/shared';
import { ApiServer } from '../src/server.js';
import { createInvertedIndex } from '@opensearch/indexer';
import {
  createStorageAdapter,
  runSchemaMigrations,
  loadSchemaMigrationState,
  type StorageMigration,
} from '@opensearch/storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('Milestone 41 / Phase 124 — Final End-to-End Release Gate Suite', () => {
  let server: ApiServer;
  let port: number;
  let baseUrl: string;
  let tempStorageDir: string;

  beforeAll(async () => {
    tempStorageDir = path.join(
      REPO_ROOT,
      'data',
      `test-release-gate-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    );
    fs.mkdirSync(tempStorageDir, { recursive: true });

    const index = createInvertedIndex({ indexDir: tempStorageDir });
    server = new ApiServer({
      deploymentModel: 'self-hosted',
      index,
      rateLimitPerMinute: 200,
      enableMcp: false,
    });
    const info = await server.start(0, '127.0.0.1');
    port = info.port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
    if (fs.existsSync(tempStorageDir)) {
      try {
        fs.rmSync(tempStorageDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  });

  // ============================================================================
  // 1. CI/CD Workflow Architecture & Integrity (Phases 121, 122, 123)
  // ============================================================================
  describe('1. CI/CD Workflow Architecture & Integrity', () => {
    const ciPath = path.join(REPO_ROOT, '.github/workflows/ci.yml');
    const releasePath = path.join(REPO_ROOT, '.github/workflows/release.yml');

    it('defines PR and main CI workflow with least-privilege permissions', () => {
      expect(fs.existsSync(ciPath)).toBe(true);
      const ciContent = fs.readFileSync(ciPath, 'utf8');

      // Least-privilege permissions check
      expect(ciContent).toContain('permissions:');
      expect(ciContent).toContain('contents: read');

      // Reproducible frozen dependency install
      expect(ciContent).toContain('npm ci');

      // Node runtime alignment (>=20)
      expect(ciContent).toContain('node-version: 20.x');

      // Comprehensive gate commands
      expect(ciContent).toContain('npm run typecheck');
      expect(ciContent).toContain('npm run lint');
      expect(ciContent).toContain('npm run build');
      expect(ciContent).toContain('npm test');

      // Security and privacy audit inclusion
      expect(ciContent).toContain('network-data-flow-audit.test.ts');
      expect(ciContent).toContain('security-audit.test.ts');
      expect(ciContent).toContain('local-only-mode.test.ts');
    });

    it('defines release packaging workflow with provenance and publication safeguards', () => {
      expect(fs.existsSync(releasePath)).toBe(true);
      const releaseContent = fs.readFileSync(releasePath, 'utf8');

      // Tag trigger and manual dispatch
      expect(releaseContent).toContain('refs/tags/v');
      expect(releaseContent).toContain('workflow_dispatch:');

      // Provenance recording
      expect(releaseContent).toContain('git rev-parse');
      expect(releaseContent).toContain('sha256sum');

      // Artifact packaging & upload
      expect(releaseContent).toContain('actions/upload-artifact@v4');

      // Release publication guard verification
      expect(releaseContent).toContain('publish-guard.mjs');
    });

    it('verifies CI workflows do not hardcode or expose secrets', () => {
      const ciContent = fs.readFileSync(ciPath, 'utf8');
      const releaseContent = fs.readFileSync(releasePath, 'utf8');

      // Must not reference secret tokens or API keys
      expect(ciContent).not.toMatch(/API_KEY|SECRET_KEY|PASSWORD|TOKEN\s*:\s*\w+/i);
      expect(releaseContent).not.toMatch(/API_KEY|SECRET_KEY|PASSWORD|NPM_TOKEN/i);
    });
  });

  // ============================================================================
  // 2. Package Registry Protection & Build Reproducibility
  // ============================================================================
  describe('2. Package Registry Protection & Build Reproducibility', () => {
    it('enforces private: true on all workspaces to prevent accidental publishing', () => {
      const packagePaths = [
        path.join(REPO_ROOT, 'package.json'),
        path.join(REPO_ROOT, 'apps/api/package.json'),
        path.join(REPO_ROOT, 'apps/web/package.json'),
        path.join(REPO_ROOT, 'packages/cli/package.json'),
        path.join(REPO_ROOT, 'packages/crawler/package.json'),
        path.join(REPO_ROOT, 'packages/indexer/package.json'),
        path.join(REPO_ROOT, 'packages/ranking/package.json'),
        path.join(REPO_ROOT, 'packages/shared/package.json'),
        path.join(REPO_ROOT, 'packages/storage/package.json'),
      ];

      for (const p of packagePaths) {
        expect(fs.existsSync(p), `Missing manifest at ${p}`).toBe(true);
        const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
        expect(pkg.private, `Package ${pkg.name || p} must be private`).toBe(true);
      }
    });

    it('verifies publish-guard script actively blocks npm publish', () => {
      const guardPath = path.join(REPO_ROOT, 'scripts/publish-guard.mjs');
      expect(fs.existsSync(guardPath)).toBe(true);
      const content = fs.readFileSync(guardPath, 'utf8');
      expect(content).toContain('ALLOW_PUBLISH');
      expect(content).toContain('process.exit(1)');
    });

    it('verifies release metadata reports complete provenance without secrets', () => {
      const meta = getReleaseMetadata();
      expect(meta.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(meta.nodeRuntime).toBe(process.version);
      expect(meta.timestamp).toBeDefined();
      expect(meta.guarantees.zeroSecretsRequired).toBe(true);
    });
  });

  // ============================================================================
  // 3. Privacy Boundaries & Local-Only Mode Enforcement
  // ============================================================================
  describe('3. Privacy Boundaries & Local-Only Mode Enforcement', () => {
    it('serves search in local-only mode without invoking external providers', async () => {
      const res = await fetch(`${baseUrl}/api/v1/search?q=test&localOnly=true`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;

      expect(data.meta.localOnly).toBe(true);
      expect(data.privacyReceipt).toBeDefined();
      expect(data.privacyReceipt.networkDispatch.totalOutboundRequests).toBe(0);
      expect(data.privacyReceipt.networkDispatch.externalProvidersContacted).toEqual([]);
    });

    it('preserves Privacy Receipt contract structure in standard mode', async () => {
      const res = await fetch(`${baseUrl}/api/v1/search?q=open+source+privacy`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;

      expect(data.privacyReceipt).toBeDefined();
      expect(data.privacyReceipt.timestamp).toBeDefined();
      expect(typeof data.privacyReceipt.networkDispatch.totalOutboundRequests).toBe('number');
      expect(Array.isArray(data.privacyReceipt.networkDispatch.externalProvidersContacted)).toBe(true);
    });
  });

  // ============================================================================
  // 4. Resilience & Graceful Error Handling
  // ============================================================================
  describe('4. Resilience & Graceful Error Handling', () => {
    it('returns empty results safely for empty query string and 400 for invalid pagination', async () => {
      const emptyRes = await fetch(`${baseUrl}/api/v1/search?q=`);
      expect(emptyRes.status).toBe(200);
      const emptyData = (await emptyRes.json()) as any;
      expect(emptyData.results).toEqual([]);
      expect(emptyData.meta.totalHits).toBe(0);

      const invalidRes = await fetch(`${baseUrl}/api/v1/search?q=test&page=0`);
      expect(invalidRes.status).toBe(400);
    });

    it('serves health probe with 200 OK', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(['ok', 'degraded']).toContain(body.status);
    });

    it('exposes deployment matrix at GET /api/v1/deployment', async () => {
      const res = await fetch(`${baseUrl}/api/v1/deployment`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.deployment).toBeDefined();
      expect(body.deployment.mode).toBeDefined();
      expect(body.deployment.capabilities.storageDurability).toBe('durable');
      expect(body.deployment.invariants.zeroPaidServices).toBe(true);
    });

    it('exposes release metadata at GET /api/v1/release', async () => {
      const res = await fetch(`${baseUrl}/api/v1/release`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.release).toBeDefined();
      expect(body.release.version).toBeDefined();
      expect(body.release.guarantees.zeroSecretsRequired).toBe(true);
    });
  });

  // ============================================================================
  // 5. Storage Durability, Pre-Migration Backup, and Rollback
  // ============================================================================
  describe('5. Storage Durability & Migration Rollback Safety', () => {
    it('verifies non-destructive rollback restores previous state on migration failure', async () => {
      const testDir = path.join(tempStorageDir, 'migration-test');
      fs.mkdirSync(testDir, { recursive: true });

      const config = loadConfig({ STORAGE_DIR: testDir });
      const storage = createStorageAdapter({ config });
      await storage.initialize();

      await storage.documents.create({
        url: 'https://example.com/gate-doc',
        urlHash: 'gate-hash',
        title: 'Release Gate Verification Doc',
        description: 'Testing migration durability.',
        headings: 'Test',
        bodyText: 'Body text.',
        language: 'en',
        contentType: 'text/html',
        contentLength: 100,
        httpStatus: 200,
        outboundLinks: [],
      });
      await storage.close();

      const faultyMigration: StorageMigration[] = [
        {
          version: 2,
          description: 'Faulty migration failing validation',
          up: (dir) => {
            fs.writeFileSync(path.join(dir, 'marker.txt'), 'failed', 'utf8');
          },
          validate: () => false,
        },
      ];

      const migResult = await runSchemaMigrations({
        storageDir: testDir,
        migrations: faultyMigration,
        autoBackup: true,
      });

      expect(migResult.success).toBe(false);
      expect(migResult.rolledBack).toBe(true);
      expect(loadSchemaMigrationState(testDir).schemaVersion).toBe(1);

      // Verify original documents intact
      const storage2 = createStorageAdapter({ config });
      await storage2.initialize();
      const count = await storage2.documents.count();
      expect(count).toBe(1);
      await storage2.close();
    });
  });

  // ============================================================================
  // 6. User Documentation & Quickstart Verifiability
  // ============================================================================
  describe('6. User Documentation & Quickstart Verifiability', () => {
    it('verifies README.md documents clean quickstart commands and privacy invariants', () => {
      const readmePath = path.join(REPO_ROOT, 'README.md');
      expect(fs.existsSync(readmePath)).toBe(true);
      const readme = fs.readFileSync(readmePath, 'utf8');

      // Quickstart commands
      expect(readme).toContain('npm run start:api');
      expect(readme).toContain('npm run start:web');
      expect(readme).toContain('npm run build');

      // Docker quickstart
      expect(readme).toContain('docker compose up -d');

      // Privacy modes and receipts
      expect(readme).toContain('Privacy Receipt');
      expect(readme).toContain('Local-Only Mode');

      // Zero secrets requirement
      expect(readme).toContain('Zero Mandatory Secrets');
    });

    it('verifies all operational documentation files exist', () => {
      const requiredDocs = [
        'docs/deployment-architecture.md',
        'docs/docker-and-compose.md',
        'docs/environment-variables.md',
        'docs/release-and-rollback.md',
        'docs/product-identity-and-naming.md',
      ];

      for (const doc of requiredDocs) {
        const fullPath = path.join(REPO_ROOT, doc);
        expect(fs.existsSync(fullPath), `Missing documentation file: ${doc}`).toBe(true);
      }
    });
  });
});
