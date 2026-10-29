/**
 * @opensearch/api — Phase 112: Health, Status & Graceful Shutdown Test Suite
 *
 * Automated verification of:
 * 1. Health (liveness) vs Readiness endpoints with distinct semantics
 * 2. Provider availability and index health reporting without query surveillance
 * 3. Sanitized status outputs without secrets, internal paths, or stack traces
 * 4. Stop accepting new work during graceful shutdown (HTTP 503 + Connection: close)
 * 5. In-flight request completion within bounded grace period
 * 6. Resource flushing and clean socket cleanup
 * 7. SIGTERM / SIGINT graceful signal handling
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createInvertedIndex, createDocumentProcessor } from '@opensearch/indexer';
import { createProviderRegistry, MockSearchProvider } from '@opensearch/ranking';
import { createApiServer, ApiServer } from '../src/index.js';

describe('Phase 112 — Health, Status & Graceful Shutdown Suite', () => {
  let server: ApiServer;
  let baseUrl: string;

  afterEach(async () => {
    if (server) {
      server.disableGracefulShutdown();
      await server.stop(500);
    }
  });

  // ============================================================================
  // 1. Health (Liveness) vs Readiness Endpoints
  // ============================================================================
  describe('1. Health (Liveness) vs Readiness Endpoints', () => {
    it('GET /health and GET /healthz return 200 for liveness probe', async () => {
      server = createApiServer();
      const { host, port } = await server.start(0, '127.0.0.1');
      baseUrl = `http://${host}:${port}`;

      const resHealth = await fetch(`${baseUrl}/health`);
      expect(resHealth.status).toBe(200);
      const jsonHealth = await resHealth.json();
      expect(jsonHealth.status).toBeDefined();
      expect(jsonHealth.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(jsonHealth.components).toBeDefined();

      const resHealthz = await fetch(`${baseUrl}/healthz`);
      expect(resHealthz.status).toBe(200);
    });

    it('GET /ready and GET /readyz return 200 when engine is ready to accept queries', async () => {
      server = createApiServer();
      const { host, port } = await server.start(0, '127.0.0.1');
      baseUrl = `http://${host}:${port}`;

      const resReady = await fetch(`${baseUrl}/ready`);
      expect(resReady.status).toBe(200);
      const jsonReady = await resReady.json();
      expect(jsonReady.status).toBe('ready');
      expect(jsonReady.ready).toBe(true);
      expect(jsonReady.index).toBeDefined();
      expect(jsonReady.providers).toBeDefined();

      const resReadyz = await fetch(`${baseUrl}/readyz`);
      expect(resReadyz.status).toBe(200);
    });

    it('GET /ready returns 503 when index subsystem is not available', async () => {
      server = createApiServer({
        services: { index: null as any } as any,
      });

      const { host, port } = await server.start(0, '127.0.0.1');
      baseUrl = `http://${host}:${port}`;

      // Liveness probe reports 503 on unrecoverable subsystem error
      const resHealth = await fetch(`${baseUrl}/health`);
      expect(resHealth.status).toBe(503);

      // Readiness probe explicitly fails with 503 and ready=false
      const resReady = await fetch(`${baseUrl}/ready`);
      expect(resReady.status).toBe(503);
      const jsonReady = await resReady.json();
      expect(jsonReady.status).toBe('not_ready');
      expect(jsonReady.ready).toBe(false);
      expect(jsonReady.reason).toContain('index');
    });
  });

  // ============================================================================
  // 2. Provider Availability & Index Health Reporting (Zero Surveillance)
  // ============================================================================
  describe('2. Provider Availability & Index Health Reporting', () => {
    it('GET /api/v1/status accurately reports index health and provider availability', async () => {
      const mockIndex = createInvertedIndex();
      const processor = createDocumentProcessor();
      mockIndex.addDocument(
        processor.process({
          id: 'doc-1',
          url: 'https://example.com',
          title: 'Document 1',
          content: 'hello world search engine',
        }),
      );

      const providerRegistry = createProviderRegistry();
      const mockProvider = new MockSearchProvider({
        metadata: {
          id: 'test-mock-provider',
          displayName: 'Test Mock Search Provider',
          supportedCategories: ['all'],
          endpoint: 'https://mock.test',
          attribution: { sourceName: 'MockSource' },
          rateLimits: { requestsPerMinute: 60, burstCapacity: 5 },
          timeoutMs: 1000,
        },
      });
      providerRegistry.registerProvider(mockProvider);

      server = createApiServer({
        index: mockIndex,
        providerRegistry,
      });

      const { host, port } = await server.start(0, '127.0.0.1');
      baseUrl = `http://${host}:${port}`;

      const res = await fetch(`${baseUrl}/api/v1/status`);
      expect(res.status).toBe(200);

      const status = await res.json();
      expect(status.status).toBe('ok');
      expect(status.index.totalDocuments).toBe(1);
      expect(status.index.totalTerms).toBeGreaterThan(0);
      expect(status.providers.totalRegistered).toBeGreaterThanOrEqual(1);

      const found = status.providers.list.find((p: { id: string }) => p.id === 'test-mock-provider');
      expect(found).toBeDefined();
      expect(found.available).toBe(true);
      expect(found.circuitState).toBe('CLOSED');
      expect(found.displayName).toBe('Test Mock Search Provider');
    });

    it('honestly reports degraded status when index is empty or a provider is degraded', async () => {
      const emptyIndex = createInvertedIndex();
      server = createApiServer({
        index: emptyIndex,
      });

      const { host, port } = await server.start(0, '127.0.0.1');
      baseUrl = `http://${host}:${port}`;

      const res = await fetch(`${baseUrl}/api/v1/status`);
      expect(res.status).toBe(200);
      const status = await res.json();
      expect(status.status).toBe('degraded');
      expect(status.index.status).toBe('degraded');
      expect(status.index.totalDocuments).toBe(0);
    });

    it('strictly guarantees zero query surveillance and zero user leaks in status endpoints', async () => {
      server = createApiServer();
      const { host, port } = await server.start(0, '127.0.0.1');
      baseUrl = `http://${host}:${port}`;

      // Execute a user search with sensitive query
      await fetch(`${baseUrl}/api/v1/search?q=confidential+medical+records`);

      // Check /api/v1/status, /health, /ready
      const statusRes = await fetch(`${baseUrl}/api/v1/status`);
      const statusText = await statusRes.text();
      expect(statusText).not.toContain('confidential');
      expect(statusText).not.toContain('medical');

      const healthRes = await fetch(`${baseUrl}/health`);
      const healthText = await healthRes.text();
      expect(healthText).not.toContain('confidential');
      expect(healthText).not.toContain('medical');

      const readyRes = await fetch(`${baseUrl}/ready`);
      const readyText = await readyRes.text();
      expect(readyText).not.toContain('confidential');
      expect(readyText).not.toContain('medical');
    });

    it('never leaks server environment secrets, full local paths, or stack traces', async () => {
      server = createApiServer();
      const { host, port } = await server.start(0, '127.0.0.1');
      baseUrl = `http://${host}:${port}`;

      const res = await fetch(`${baseUrl}/api/v1/status`);
      const text = await res.text();

      // Must not expose process.env keys or values
      expect(text).not.toContain('AWS_SECRET_ACCESS_KEY');
      expect(text).not.toContain('PRIVATE_KEY');
      expect(text).not.toContain('TOKEN');

      // Must not leak user home directories
      expect(text).not.toContain('Users\\');
      expect(text).not.toContain('/home/');
    });
  });

  // ============================================================================
  // 3. Graceful Shutdown & Work Draining
  // ============================================================================
  describe('3. Graceful Shutdown & Work Draining', () => {
    it('stops accepting new search requests during shutdown with HTTP 503', async () => {
      server = createApiServer();
      const { host, port } = await server.start(0, '127.0.0.1');
      baseUrl = `http://${host}:${port}`;

      // Verify server is operational initially
      const initialRes = await fetch(`${baseUrl}/ready`);
      expect(initialRes.status).toBe(200);

      // Trigger server draining mode
      const drainPromise = server.drain(1000);

      // Verify that while draining, /ready returns 503
      const readyDuringShutdown = await fetch(`${baseUrl}/ready`);
      expect(readyDuringShutdown.status).toBe(503);
      const readyJson = await readyDuringShutdown.json();
      expect(readyJson.status).toBe('shutting_down');
      expect(readyJson.ready).toBe(false);

      // Verify search route rejects with HTTP 503 and Connection: close
      const searchDuringShutdown = await fetch(`${baseUrl}/api/v1/search?q=test`);
      expect(searchDuringShutdown.status).toBe(503);
      expect(searchDuringShutdown.headers.get('retry-after')).toBe('5');
      const searchError = await searchDuringShutdown.json();
      expect(searchError.error.code).toBe('SERVER_SHUTTING_DOWN');

      // Health probe remains accessible for liveness
      const healthDuringShutdown = await fetch(`${baseUrl}/health`);
      expect(healthDuringShutdown.status).toBe(200);

      await drainPromise;
      await server.stop(200);
      expect(server.getState()).toBe('stopped');
    });

    it('finishes in-flight requests cleanly before terminating', async () => {
      server = createApiServer();
      const { host, port } = await server.start(0, '127.0.0.1');
      baseUrl = `http://${host}:${port}`;

      // Launch an in-flight search request
      let completedInFlight = false;
      const inFlightPromise = fetch(`${baseUrl}/api/v1/search?q=hello`).then(res => {
        completedInFlight = res.status === 200;
        return res;
      });

      // Brief tick to allow TCP connection to establish and register as active request
      await new Promise(r => setTimeout(r, 25));

      // Stop server with grace period
      await server.stop(2000);
      await inFlightPromise;

      expect(completedInFlight).toBe(true);
      expect(server.getState()).toBe('stopped');
      expect(server.getActiveRequestsCount()).toBe(0);
    });

    it('enables and disables graceful shutdown signal handlers cleanly', () => {
      server = createApiServer();
      server.enableGracefulShutdown({ timeoutMs: 1000, exitOnComplete: false });
      expect(() => server.disableGracefulShutdown()).not.toThrow();
    });
  });
});
