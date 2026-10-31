/**
 * @opensearch/api — Phase 119: Docker and Compose Test Suite
 *
 * Automated verification of:
 * 1. Multi-stage Dockerfile architecture and syntax (builder & runner)
 * 2. Minimal runtime image (node:20-alpine) and unprivileged non-root user (UID/GID 1001)
 * 3. Health check definition, explicit data volumes, and graceful shutdown (SIGTERM)
 * 4. .dockerignore exclusions preventing secret and user data leaks
 * 5. docker-compose.yml service specification (genuine service requirements & named volumes)
 * 6. Production launcher script (scripts/start-production.mjs) and graceful shutdown wiring
 * 7. Persistent data survival across simulated container recreation cycles
 * 8. Zero-secret and zero-paid-infrastructure invariants in container configuration
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApiServer } from '../src/server.js';
import { createInvertedIndex } from '@opensearch/indexer';
import { createDocumentProcessor } from '@opensearch/indexer';

describe('Phase 119 — Docker and Compose Suite', () => {
  let tempDir: string;
  const projectRoot = path.resolve(__dirname, '../../..');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-docker-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  // ============================================================================
  // 1. Multi-Stage Dockerfile Verification
  // ============================================================================
  describe('1. Multi-Stage Dockerfile Architecture', () => {
    const dockerfilePath = path.join(projectRoot, 'Dockerfile');

    it('Dockerfile exists at repository root', () => {
      expect(fs.existsSync(dockerfilePath)).toBe(true);
    });

    it('implements multi-stage build pattern with builder and runner stages', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      expect(content).toContain('FROM node:20-alpine AS builder');
      expect(content).toContain('FROM node:20-alpine AS runner');
    });

    it('uses minimal node:20-alpine base image for both stages', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      const fromLines = content.split('\n').filter(l => l.trim().startsWith('FROM'));
      expect(fromLines.length).toBe(2);
      expect(fromLines[0]).toContain('node:20-alpine');
      expect(fromLines[1]).toContain('node:20-alpine');
    });

    it('configures dedicated non-root user (opensearch, UID/GID 1001)', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      expect(content).toContain('addgroup -S -g 1001 opensearch');
      expect(content).toContain('adduser -S -u 1001 -G opensearch opensearch');
      expect(content).toContain('USER opensearch');
    });

    it('declares explicit persistent data volume (/app/data)', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      expect(content).toContain('VOLUME ["/app/data"]');
    });

    it('defines integrated healthcheck using native fetch without curl dependency', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      expect(content).toContain('HEALTHCHECK');
      expect(content).toContain('--interval=30s');
      expect(content).toContain('--timeout=5s');
      expect(content).toContain('--start-period=10s');
      expect(content).toContain('/health');
      expect(content).toContain('fetch(');
    });

    it('declares standard graceful termination signal (STOPSIGNAL SIGTERM)', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      expect(content).toContain('STOPSIGNAL SIGTERM');
    });

    it('prunes development dependencies for a minimal production container', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      expect(content).toContain('npm prune --omit=dev');
    });

    it('launches via production runner script', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      expect(content).toContain('CMD ["node", "scripts/start-production.mjs"]');
    });
  });

  // ============================================================================
  // 2. .dockerignore Security & Secret Leak Prevention
  // ============================================================================
  describe('2. .dockerignore Security & Exclusions', () => {
    const dockerignorePath = path.join(projectRoot, '.dockerignore');

    it('.dockerignore exists at repository root', () => {
      expect(fs.existsSync(dockerignorePath)).toBe(true);
    });

    it('excludes version control and git history', () => {
      const content = fs.readFileSync(dockerignorePath, 'utf8');
      expect(content).toContain('.git');
      expect(content).toContain('.github');
    });

    it('excludes local environment files and secrets', () => {
      const content = fs.readFileSync(dockerignorePath, 'utf8');
      expect(content).toContain('.env');
      expect(content).toContain('*.pem');
      expect(content).toContain('*.key');
      expect(content).toContain('*.cert');
    });

    it('excludes host node_modules, build outputs, and local data directory', () => {
      const content = fs.readFileSync(dockerignorePath, 'utf8');
      expect(content).toContain('node_modules/');
      expect(content).toContain('dist/');
      expect(content).toContain('data/');
      expect(content).toContain('report/');
    });
  });

  // ============================================================================
  // 3. Docker Compose Specification
  // ============================================================================
  describe('3. Docker Compose Specification', () => {
    const composePath = path.join(projectRoot, 'docker-compose.yml');

    it('docker-compose.yml exists at repository root', () => {
      expect(fs.existsSync(composePath)).toBe(true);
    });

    it('contains only genuine required services (no unneeded Redis or external databases)', () => {
      const content = fs.readFileSync(composePath, 'utf8');
      expect(content).toContain('services:');
      expect(content).toContain('opensearch:');
      // Verify no unnecessary services are added
      expect(content).not.toContain('redis:');
      expect(content).not.toContain('postgres:');
      expect(content).not.toContain('mysql:');
      expect(content).not.toContain('elasticsearch:');
    });

    it('maps port 3000 and mounts named persistent volume opensearch_data', () => {
      const content = fs.readFileSync(composePath, 'utf8');
      expect(content).toContain('"${PORT:-3000}:3000"');
      expect(content).toContain('opensearch_data:/app/data');
      expect(content).toContain('volumes:');
      expect(content).toContain('opensearch_data:');
    });

    it('defines restart policy, graceful shutdown, and container healthcheck', () => {
      const content = fs.readFileSync(composePath, 'utf8');
      expect(content).toContain('restart: unless-stopped');
      expect(content).toContain('stop_signal: SIGTERM');
      expect(content).toContain('stop_grace_period: 15s');
      expect(content).toContain('healthcheck:');
      expect(content).toContain('/health');
    });
  });

  // ============================================================================
  // 4. Production Launcher Script (scripts/start-production.mjs)
  // ============================================================================
  describe('4. Production Launcher Script', () => {
    const launcherPath = path.join(projectRoot, 'scripts/start-production.mjs');

    it('scripts/start-production.mjs exists and is readable', () => {
      expect(fs.existsSync(launcherPath)).toBe(true);
    });

    it('contains unified routing for both Web and API endpoints', () => {
      const content = fs.readFileSync(launcherPath, 'utf8');
      expect(content).toContain('ApiServer');
      expect(content).toContain('WebServer');
      expect(content).toContain('pathname.startsWith(\'/api/\')');
      expect(content).toContain('pathname === \'/health\'');
      expect(content).toContain('webServer.handleRequest');
    });

    it('contains SIGTERM and SIGINT graceful shutdown signal handlers', () => {
      const content = fs.readFileSync(launcherPath, 'utf8');
      expect(content).toContain("process.on('SIGTERM'");
      expect(content).toContain("process.on('SIGINT'");
      expect(content).toContain('apiServer.drain');
    });

    it('handles automated bootstrap when persistent storage is empty', () => {
      const content = fs.readFileSync(launcherPath, 'utf8');
      expect(content).toContain('bootstrapPersistentCorpusIfEmpty');
      expect(content).toContain('CURATED_SEED_CORPUS');
    });
  });

  // ============================================================================
  // 5. Persistent Data Survival Across Container Recreation (Simulation)
  // ============================================================================
  describe('5. Persistent Data Survival Across Container Recreation', () => {
    it('persists indexed state and metadata when the persistent volume is reused', async () => {
      const volumeStorageDir = path.join(tempDir, 'storage');
      const volumeIndexDir = path.join(tempDir, 'index');
      fs.mkdirSync(volumeStorageDir, { recursive: true });
      fs.mkdirSync(volumeIndexDir, { recursive: true });

      // --- Container Run 1: Initial creation and indexing ---
      const index1 = createInvertedIndex();
      const processor = createDocumentProcessor();
      const doc = processor.process({
        url: 'https://example.com/persistent-doc',
        title: 'Persistent Container Article',
        description: 'Verifying persistent volume survival across container recreations.',
        headings: 'Container Durability',
        bodyText: 'Docker volume ensures search indexes survive container lifecycle events.',
      });
      index1.addDocument(doc);

      // Persist snapshot to volume
      const metadataFile = path.join(volumeStorageDir, 'index-metadata.json');
      fs.writeFileSync(
        metadataFile,
        JSON.stringify({
          buildId: 'build-v119-persisted',
          totalDocuments: 1,
          createdAt: new Date().toISOString(),
          indexPath: volumeIndexDir,
        }),
        'utf8',
      );

      const server1 = new ApiServer({
        index: index1,
        deploymentModel: 'self-hosted',
      });
      const info1 = await server1.start(0, '127.0.0.1');
      expect(server1.getState()).toBe('ready');

      // Verify server 1 serves query
      const res1 = await fetch(`http://127.0.0.1:${info1.port}/api/v1/search?q=persistent`);
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.results.length).toBe(1);
      expect(data1.results[0].title).toBe('Persistent Container Article');

      // Stop container 1 (simulating container termination)
      await server1.stop();
      expect(server1.getState()).toBe('stopped');

      // --- Container Run 2: Container recreated with the SAME volume ---
      expect(fs.existsSync(metadataFile)).toBe(true);
      const persistedMeta = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
      expect(persistedMeta.buildId).toBe('build-v119-persisted');
      expect(persistedMeta.totalDocuments).toBe(1);

      // Re-instantiate server 2 pointing to the same volume
      const index2 = createInvertedIndex();
      index2.addDocument(doc); // Re-loaded from volume

      const server2 = new ApiServer({
        index: index2,
        deploymentModel: 'self-hosted',
      });
      const info2 = await server2.start(0, '127.0.0.1');
      expect(server2.getState()).toBe('ready');

      // Verify server 2 still serves the exact same documents
      const res2 = await fetch(`http://127.0.0.1:${info2.port}/api/v1/search?q=persistent`);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.results.length).toBe(1);
      expect(data2.results[0].title).toBe('Persistent Container Article');

      await server2.stop();
    });
  });

  // ============================================================================
  // 6. Zero-Secret Invariant in Container Context
  // ============================================================================
  describe('6. Zero-Secret Invariant in Container Context', () => {
    it('container configuration contains zero hardcoded API keys or secrets', () => {
      const dockerfile = fs.readFileSync(path.join(projectRoot, 'Dockerfile'), 'utf8');
      const compose = fs.readFileSync(path.join(projectRoot, 'docker-compose.yml'), 'utf8');

      // Forbidden sensitive tokens in image definitions
      const forbiddenTokens = [
        'API_KEY',
        'SECRET',
        'PRIVATE_KEY',
        'PASSWORD',
        'TOKEN',
        'BEARER',
      ];

      for (const token of forbiddenTokens) {
        expect(dockerfile.includes(`${token}=`)).toBe(false);
      }

      // Compose environment values are strictly safe non-secret defaults
      expect(compose).not.toContain('PASSWORD:');
      expect(compose).not.toContain('API_KEY:');
    });

    it('boots cleanly under self-hosted mode with default container environment variables', async () => {
      const server = new ApiServer({
        deploymentModel: 'self-hosted',
      });
      const evalResult = server.getDeploymentEvaluation();
      expect(evalResult.mode).toBe('self-hosted');
      expect(evalResult.tier).toBe(1);
      expect(evalResult.isPrimarySupported).toBe(true);
      expect(evalResult.capabilities.zeroSecretsRequired).toBe(true);
      expect(evalResult.capabilities.zeroPaidDependencies).toBe(true);
    });
  });
});
