/**
 * @opensearch/api — Phase 118: Deployment Architecture Decision Test Suite
 *
 * Automated verification of:
 * 1. Supported deployment modes resolution (local-first, self-hosted, serverless, cluster)
 * 2. Runtime platform detection (AWS Lambda, Vercel, Netlify, Docker, Workstation)
 * 3. Storage durability evaluation and explicit ephemeral filesystem warnings
 * 4. Process-memory rate limit non-global scope disclosures
 * 5. Zero mandatory secrets & zero paid infrastructure invariants
 * 6. Local-first fully functional path preservation
 * 7. GET /api/v1/deployment and GET /api/v1/status runtime introspection endpoints
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  evaluateDeploymentArchitecture,
  detectRuntimePlatform,
  resolveDeploymentMode,
  isEphemeralStoragePath,
  SUPPORTED_DEPLOYMENT_MODES,
  PRODUCT_NAME,
  PROJECT_VERSION,
} from '@opensearch/shared';
import { ApiServer } from '../src/server.js';
import { createInvertedIndex } from '@opensearch/indexer';

describe('Phase 118 — Deployment Architecture Decision Suite', () => {
  let tempDir: string;
  let server: ApiServer;
  let apiBaseUrl: string;

  beforeAll(async () => {
    const index = createInvertedIndex();
    server = new ApiServer({
      deploymentModel: 'local-first',
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-deploy-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  // ============================================================================
  // 1. Supported Deployment Modes Resolution
  // ============================================================================
  describe('1. Supported Deployment Modes Resolution', () => {
    it('defaults to local-first mode in development environment', () => {
      const mode = resolveDeploymentMode({ NODE_ENV: 'development' });
      expect(mode).toBe(SUPPORTED_DEPLOYMENT_MODES.LOCAL_FIRST);
    });

    it('defaults to self-hosted mode in production environment when unspecified', () => {
      const mode = resolveDeploymentMode({ NODE_ENV: 'production' });
      expect(mode).toBe(SUPPORTED_DEPLOYMENT_MODES.SELF_HOSTED);
    });

    it('resolves explicit deployment mode aliases correctly', () => {
      expect(resolveDeploymentMode({ DEPLOYMENT_MODE: 'local-first' })).toBe('local-first');
      expect(resolveDeploymentMode({ DEPLOYMENT_MODE: 'desktop' })).toBe('local-first');
      expect(resolveDeploymentMode({ DEPLOYMENT_MODE: 'self-hosted' })).toBe('self-hosted');
      expect(resolveDeploymentMode({ DEPLOYMENT_MODE: 'standalone' })).toBe('self-hosted');
      expect(resolveDeploymentMode({ DEPLOYMENT_MODE: 'serverless' })).toBe('serverless');
      expect(resolveDeploymentMode({ DEPLOYMENT_MODE: 'cluster' })).toBe('cluster');
    });

    it('auto-resolves serverless mode on cloud function environments', () => {
      expect(resolveDeploymentMode({ AWS_LAMBDA_FUNCTION_NAME: 'opensearch-fn' })).toBe('serverless');
      expect(resolveDeploymentMode({ VERCEL: '1' })).toBe('serverless');
      expect(resolveDeploymentMode({ NETLIFY: 'true' })).toBe('serverless');
    });
  });

  // ============================================================================
  // 2. Runtime Platform Detection
  // ============================================================================
  describe('2. Runtime Platform Detection', () => {
    it('detects AWS Lambda environment', () => {
      const platform = detectRuntimePlatform({ AWS_LAMBDA_FUNCTION_NAME: 'search-api' });
      expect(platform).toBe('aws-lambda');
    });

    it('detects Vercel Serverless environment', () => {
      const platform = detectRuntimePlatform({ VERCEL: '1' });
      expect(platform).toBe('vercel');
    });

    it('detects Netlify Functions environment', () => {
      const platform = detectRuntimePlatform({ NETLIFY: 'true' });
      expect(platform).toBe('netlify');
    });

    it('detects Google Cloud Run environment', () => {
      const platform = detectRuntimePlatform({ K_SERVICE: 'opensearch-svc', PORT: '8080' });
      expect(platform).toBe('google-cloud-run');
    });

    it('detects Docker container environment', () => {
      const platform = detectRuntimePlatform({ DOCKER_CONTAINER: 'true' });
      expect(platform).toBe('docker-container');
    });

    it('detects local workstation by default', () => {
      const platform = detectRuntimePlatform({});
      expect(platform).toBe('workstation');
    });
  });

  // ============================================================================
  // 3. Storage Durability & Non-Assumptions on Serverless Filesystems
  // ============================================================================
  describe('3. Storage Durability & Non-Assumptions on Serverless Filesystems', () => {
    it('detects ephemeral directory prefixes across platforms', () => {
      expect(isEphemeralStoragePath(os.tmpdir())).toBe(true);
      expect(isEphemeralStoragePath('/tmp/opensearch')).toBe(true);
      expect(isEphemeralStoragePath('/var/tmp/index')).toBe(true);
      expect(isEphemeralStoragePath('/dev/shm/data')).toBe(true);
      expect(isEphemeralStoragePath('./data/storage')).toBe(false);
    });

    it('evaluates local-first storage as durable when on local persistent path', () => {
      const evaluation = evaluateDeploymentArchitecture({
        mode: 'local-first',
        storageDir: './data/storage',
        isProduction: false,
      });

      expect(evaluation.tier).toBe(1);
      expect(evaluation.isPrimarySupported).toBe(true);
      expect(evaluation.storage.durability).toBe('durable');
      expect(evaluation.storage.isEphemeral).toBe(false);
      expect(evaluation.capabilities.backgroundTasksSupported).toBe(true);
      expect(evaluation.capabilities.continuousCrawlingSupported).toBe(true);
    });

    it('generates explicit warnings when serverless deployment mode is active', () => {
      const evaluation = evaluateDeploymentArchitecture({
        mode: 'serverless',
        storageDir: '/tmp/search-index',
        isProduction: true,
      });

      expect(evaluation.tier).toBe(2);
      expect(evaluation.isPrimarySupported).toBe(false);
      expect(evaluation.storage.durability).toBe('ephemeral');
      expect(evaluation.capabilities.backgroundTasksSupported).toBe(false);
      expect(evaluation.capabilities.continuousCrawlingSupported).toBe(false);
      expect(evaluation.limitations.some(l => l.includes('Serverless filesystem writes (/tmp) are ephemeral'))).toBe(true);
      expect(evaluation.warnings.some(w => w.includes('Serverless Mode Notice'))).toBe(true);
    });

    it('flags critical warning if production runs on an ephemeral temporary path', () => {
      const evaluation = evaluateDeploymentArchitecture({
        mode: 'self-hosted',
        storageDir: path.join(os.tmpdir(), 'ephemeral-data'),
        isProduction: true,
      });

      expect(evaluation.storage.isEphemeral).toBe(true);
      expect(evaluation.warnings.some(w => w.includes('CRITICAL: Production deployment detected on an ephemeral filesystem'))).toBe(true);
    });
  });

  // ============================================================================
  // 4. Rate-Limiting Guarantees & Multi-Instance Non-Assumptions
  // ============================================================================
  describe('4. Rate-Limiting Guarantees & Multi-Instance Non-Assumptions', () => {
    it('guarantees global rate limits on single-instance local-first mode', () => {
      const evaluation = evaluateDeploymentArchitecture({ mode: 'local-first' });
      expect(evaluation.rateLimiting.scope).toBe('instance-local');
      expect(evaluation.rateLimiting.isGloballyGuaranteed).toBe(true);
    });

    it('discloses non-global rate limits on serverless functions', () => {
      const evaluation = evaluateDeploymentArchitecture({ mode: 'serverless' });
      expect(evaluation.rateLimiting.isGloballyGuaranteed).toBe(false);
      expect(evaluation.rateLimiting.note).toContain('apply only per warm container');
      expect(evaluation.limitations.some(l => l.includes('In-memory rate limits do not provide global guarantees'))).toBe(true);
      expect(evaluation.recommendations.some(r => r.includes('enforce global rate limits at the edge / API Gateway'))).toBe(true);
    });

    it('recommends reverse proxy rate limiting on clustered multi-instance mode', () => {
      const evaluation = evaluateDeploymentArchitecture({ mode: 'cluster' });
      expect(evaluation.rateLimiting.scope).toBe('gateway-delegated');
      expect(evaluation.rateLimiting.isGloballyGuaranteed).toBe(false);
      expect(evaluation.recommendations.some(r => r.includes('ingress rate limiting at the reverse proxy'))).toBe(true);
    });
  });

  // ============================================================================
  // 5. Zero-Secret & Zero-Paid Infrastructure Invariants
  // ============================================================================
  describe('5. Zero-Secret & Zero-Paid Infrastructure Invariants', () => {
    it('evaluates all invariants as strictly satisfied across all modes', () => {
      const modes: Array<'local-first' | 'self-hosted' | 'serverless' | 'cluster'> = [
        'local-first',
        'self-hosted',
        'serverless',
        'cluster',
      ];

      for (const mode of modes) {
        const evaluation = evaluateDeploymentArchitecture({ mode });
        expect(evaluation.invariants.zeroPaidServices).toBe(true);
        expect(evaluation.invariants.zeroSecretsRequired).toBe(true);
        expect(evaluation.invariants.zeroPaidDomainsRequired).toBe(true);
        expect(evaluation.invariants.localPathAvailable).toBe(true);
        expect(evaluation.capabilities.zeroPaidDependencies).toBe(true);
        expect(evaluation.capabilities.zeroSecretsRequired).toBe(true);
      }
    });

    it('initializes and starts ApiServer cleanly with an empty environment', () => {
      const bareServer = new ApiServer({
        deploymentModel: 'local-first',
        enableMetrics: false,
      });

      const evalResult = bareServer.getDeploymentEvaluation();
      expect(evalResult).toBeDefined();
      expect(evalResult.mode).toBe('local-first');
      expect(evalResult.invariants.zeroSecretsRequired).toBe(true);
      expect(evalResult.invariants.zeroPaidServices).toBe(true);
    });
  });

  // ============================================================================
  // 6. Runtime Introspection Endpoints (GET /api/v1/deployment & GET /api/v1/status)
  // ============================================================================
  describe('6. Runtime Introspection Endpoints', () => {
    it('GET /api/v1/deployment returns truthful deployment capabilities', async () => {
      const res = await fetch(`${apiBaseUrl}/api/v1/deployment`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.product).toBe(PRODUCT_NAME);
      expect(data.version).toBe(PROJECT_VERSION);
      expect(data.deployment.mode).toBe('local-first');
      expect(data.deployment.tier).toBe(1);
      expect(data.deployment.capabilities.storageDurability).toBe('durable');
      expect(data.deployment.invariants.zeroPaidServices).toBe(true);
      expect(data.deployment.invariants.zeroSecretsRequired).toBe(true);
      expect(data.deployment.limitations).toBeInstanceOf(Array);
      expect(data.deployment.recommendations).toBeInstanceOf(Array);
    });

    it('GET /api/v1/status includes deployment capability block', async () => {
      const res = await fetch(`${apiBaseUrl}/api/v1/status`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.deployment).toBeDefined();
      expect(data.deployment.mode).toBe('local-first');
      expect(data.deployment.tier).toBe(1);
      expect(data.deployment.durability).toBe('durable');
      expect(data.deployment.zeroPaidDependencies).toBe(true);
      expect(data.deployment.zeroSecretsRequired).toBe(true);
    });

    it('GET / lists deployment endpoint in discoverable endpoints dictionary', async () => {
      const res = await fetch(`${apiBaseUrl}/`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.endpoints.deployment).toBe('/api/v1/deployment');
    });
  });

  // ============================================================================
  // 7. Local-First Functional Path Out-Of-The-Box
  // ============================================================================
  describe('7. Local-First Functional Path Out-Of-The-Box', () => {
    it('serves queries seamlessly without requiring external providers or paid services', async () => {
      const res = await fetch(`${apiBaseUrl}/api/v1/search?q=weather&mode=demo`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.results.length).toBeGreaterThan(0);
      expect(data.results[0].isDemo).toBe(true);
      expect(data.privacyReceipt.mode).toBe('demo');
    });
  });
});
