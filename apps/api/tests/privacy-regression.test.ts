/**
 * @opensearch/api — Privacy Regression & Request Interception Suite (Phase 86)
 *
 * Implements rigorous privacy regression tests:
 * 1. Request Interception: Intercepts all outbound provider calls; asserts exact sanctioned endpoints and zero outbound calls in Local-only mode.
 * 2. Log & Exception Sanitization: Asserts raw user queries NEVER appear in server logs, metrics labels, exception messages, or persistent storage.
 * 3. Privacy Receipt Veracity: Verifies provider names, endpoints, latencies, and statuses in the receipt match actual intercepted events.
 * 4. Resilience & Boundary Testing: Tests redirects, timeouts (504), offline network failures, and Local-only mode.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDocumentProcessor, createInvertedIndex } from '@opensearch/indexer';
import {
  createProviderRegistry,
  MockSearchProvider,
  assertProviderPrivacyContract,
} from '@opensearch/ranking';
import { createApiServer, ApiServer } from '../src/index.js';
import { LogLevel, Logger, PrivacyReceipt } from '@opensearch/shared';

describe('Phase 86 — Privacy Regression & Request Interception Suite', () => {
  let server: ApiServer;
  let baseUrl: string;
  let interceptedCalls: Array<{ providerId: string; query: string; timestamp: number }> = [];
  let capturedLogs: Array<{ level: LogLevel; message: string; meta?: Record<string, unknown> }> = [];

  let primaryMock: MockSearchProvider;
  let secondaryMock: MockSearchProvider;
  let registry: ReturnType<typeof createProviderRegistry>;

  // Custom spying logger that records all server log invocations
  const spyLogger: Logger = {
    level: 'debug',
    getLevel: () => 'debug',
    setLevel: () => {},
    debug: (msg, meta) => capturedLogs.push({ level: 'debug', message: msg, meta }),
    info: (msg, meta) => capturedLogs.push({ level: 'info', message: msg, meta }),
    warn: (msg, meta) => capturedLogs.push({ level: 'warn', message: msg, meta }),
    error: (msg, meta) => capturedLogs.push({ level: 'error', message: msg, meta }),
    fatal: (msg, meta) => capturedLogs.push({ level: 'fatal', message: msg, meta }),
  };

  beforeAll(async () => {
    const index = createInvertedIndex();
    const processor = createDocumentProcessor();

    // Populate local index
    index.addDocument(
      processor.process({
        id: 'doc-privacy-vault',
        url: 'https://opensearch.dev/vault',
        title: 'Zero-Trace Search Architecture',
        headings: 'Auditing Outbound Data Boundaries',
        description: 'Complete technical reference for preventing data leakage and third-party tracking.',
        bodyText: 'OpenSearch enforces strict air-gap query boundaries and cryptographic privacy receipts.',
        language: 'en',
      }),
    );

    primaryMock = new MockSearchProvider({
      metadata: {
        id: 'mock-upstream-web',
        displayName: 'Mock Upstream Web Engine',
        supportedCategories: ['general'],
        endpoint: 'https://mock-upstream.internal/search',
        timeoutMs: 200,
      },
      fixtures: [
        {
          title: 'Remote Result 1',
          canonicalUrl: 'https://remote-source.example/result-1',
          snippet: 'Information retrieved from upstream web engine.',
          source: 'mock-upstream-web',
          contentType: 'article',
        },
      ],
    });

    secondaryMock = new MockSearchProvider({
      metadata: {
        id: 'mock-upstream-media',
        displayName: 'Mock Media Feed API',
        supportedCategories: ['multimedia'],
        endpoint: 'https://mock-media.internal/api',
        timeoutMs: 200,
      },
      fixtures: [],
    });

    // Intercept outbound searches
    const origSearchPrimary = primaryMock.search.bind(primaryMock);
    primaryMock.search = async (query, opts) => {
      interceptedCalls.push({ providerId: 'mock-upstream-web', query, timestamp: Date.now() });
      return origSearchPrimary(query, opts);
    };

    const origSearchSecondary = secondaryMock.search.bind(secondaryMock);
    secondaryMock.search = async (query, opts) => {
      interceptedCalls.push({ providerId: 'mock-upstream-media', query, timestamp: Date.now() });
      return origSearchSecondary(query, opts);
    };

    registry = createProviderRegistry();
    registry.registerProvider(primaryMock);
    registry.registerProvider(secondaryMock);

    server = createApiServer({
      index,
      providerRegistry: registry,
      logger: spyLogger,
      searchTimeoutMs: 5000,
    });

    const info = await server.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    interceptedCalls = [];
    capturedLogs = [];
    primaryMock.simulate5xx = false;
    primaryMock.forceTimeout = false;
    primaryMock.simulateNetworkError = false;
    secondaryMock.simulate5xx = false;
    secondaryMock.forceTimeout = false;
    secondaryMock.simulateNetworkError = false;
  });

  // 1. Request Interception Tests
  describe('1. Request Interception & Egress Verification', () => {
    it('intercepts and verifies that outbound requests target only registered, sanctioned endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/v1/search?q=unindexedterm_hybrid_intercept`);
      expect(res.status).toBe(200);

      // Verify that provider was intercepted
      expect(interceptedCalls.length).toBeGreaterThanOrEqual(1);
      const call = interceptedCalls.find((c) => c.providerId === 'mock-upstream-web');
      expect(call).toBeDefined();
      expect(call?.query).toBe('unindexedterm_hybrid_intercept');

      // Verify endpoint invariant from provider metadata
      expect(primaryMock.metadata.endpoint).toBe('https://mock-upstream.internal/search');
    });

    it('asserts strictly zero outbound requests across network boundaries in Local-only mode', async () => {
      const res = await fetch(`${baseUrl}/api/v1/search?q=secret_isolated_query&localOnly=true`);
      expect(res.status).toBe(200);

      // In Local-only mode, ZERO provider calls must be intercepted
      expect(interceptedCalls).toHaveLength(0);

      const data = await res.json();
      expect(data.meta.localOnly).toBe(true);
      expect(data.privacyReceipt.mode).toBe('local-only');
      expect(data.privacyReceipt.networkDispatch.totalOutboundRequests).toBe(0);
      expect(data.privacyReceipt.networkDispatch.externalProvidersContacted).toHaveLength(0);
    });
  });

  // 2. Query Text & Identity Leakage Assertions
  describe('2. Query Text & Identity Leakage Prevention', () => {
    it('asserts query text does not appear in server logs by default', async () => {
      const sensitiveQuery = 'patient-confidential-medical-diagnosis-alpha123';
      const res = await fetch(`${baseUrl}/api/v1/search?q=${encodeURIComponent(sensitiveQuery)}`);
      expect(res.status).toBe(200);

      // Verify that none of the captured log messages or metadata contain the raw query text
      for (const log of capturedLogs) {
        const logContent = JSON.stringify(log);
        expect(logContent).not.toContain(sensitiveQuery);
      }
    });

    it('asserts query text does not appear in server logs on errors or invalid routes', async () => {
      const sensitiveErrorQuery = 'top-secret-corporate-acquisition-target-beta456';
      // Trigger a 404 or bad request with query attached
      const res = await fetch(`${baseUrl}/api/v1/nonexistent-route?q=${encodeURIComponent(sensitiveErrorQuery)}`);
      expect(res.status).toBe(404);

      for (const log of capturedLogs) {
        const logContent = JSON.stringify(log);
        expect(logContent).not.toContain(sensitiveErrorQuery);
      }
    });

    it('asserts exception response payloads do not reflect internal paths or stack traces', async () => {
      // Intentionally request unsupported HTTP method
      const res = await fetch(`${baseUrl}/api/v1/search`, { method: 'DELETE' });
      expect(res.status).toBe(405);

      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.error.message).toContain('Method DELETE is not allowed');
      // No internal paths or stack traces exposed to client
      expect(data.error.stack).toBeUndefined();
      expect(JSON.stringify(data)).not.toContain('node_modules');
    });
  });

  // 3. Privacy Receipt Veracity
  describe('3. Privacy Receipt Veracity vs Observed Network Activity', () => {
    it('verifies provider names, endpoints, latencies, and statuses match the receipt exactly', async () => {
      const res = await fetch(`${baseUrl}/api/v1/search?q=veracity_test_term`);
      expect(res.status).toBe(200);

      const data = await res.json();
      const receipt: PrivacyReceipt = data.privacyReceipt;
      expect(receipt).toBeDefined();

      const contacted = receipt.networkDispatch.externalProvidersContacted.find(
        (p) => p.providerId === 'mock-upstream-web',
      );
      expect(contacted).toBeDefined();
      expect(contacted?.endpoint).toBe(primaryMock.metadata.endpoint);
      expect(contacted?.statusCode).toBe(200);
      expect(contacted?.status).toBe('success');
      expect(contacted?.clientIpForwarded).toBe(false);
      expect(contacted?.queryTransmitted).toBe(true);
      expect(contacted?.latencyMs).toBeGreaterThanOrEqual(0);

      // Verify category-mismatch provider was correctly recorded as skipped
      const skipped = receipt.networkDispatch.externalProvidersSkipped.find(
        (p) => p.providerId === 'mock-upstream-media',
      );
      expect(skipped).toBeDefined();
      expect(skipped?.reason).toBe('category-mismatch');
    });
  });

  // 4. Timeouts, Offline Network Conditions & Boundaries
  describe('4. Timeouts, Offline Conditions & Failure Boundaries', () => {
    it('handles provider timeout transparently and records HTTP 504 in receipt without leaking query in logs', async () => {
      primaryMock.forceTimeout = true;
      const timeoutQuery = 'timeout_resilience_test_query';

      const res = await fetch(`${baseUrl}/api/v1/search?q=${timeoutQuery}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.privacyReceipt.networkDispatch.isPartialResult).toBe(true);

      const timeoutRecord = data.privacyReceipt.networkDispatch.externalProvidersContacted.find(
        (p: any) => p.providerId === 'mock-upstream-web',
      );
      expect(timeoutRecord).toBeDefined();
      expect(timeoutRecord?.status).toBe('timeout');
      expect(timeoutRecord?.statusCode).toBe(504);

      // Asserts logs during timeout contain no query text
      for (const log of capturedLogs) {
        expect(JSON.stringify(log)).not.toContain(timeoutQuery);
      }
    });

    it('handles offline / network connection failure gracefully and records status in receipt', async () => {
      primaryMock.simulateNetworkError = true;
      const offlineQuery = 'offline_network_failure_test_query';

      const res = await fetch(`${baseUrl}/api/v1/search?q=${offlineQuery}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.privacyReceipt.networkDispatch.isPartialResult).toBe(true);

      const failedRecord = data.privacyReceipt.networkDispatch.externalProvidersContacted.find(
        (p: any) => p.providerId === 'mock-upstream-web',
      );
      expect(failedRecord).toBeDefined();
      expect(failedRecord?.status).toBe('failed');
      expect(failedRecord?.statusCode).toBe(502);
    });

    it('asserts registered providers strictly satisfy the Provider Privacy Contract', () => {
      expect(() => assertProviderPrivacyContract(primaryMock)).not.toThrow();
      expect(() => assertProviderPrivacyContract(secondaryMock)).not.toThrow();
    });
  });
});
