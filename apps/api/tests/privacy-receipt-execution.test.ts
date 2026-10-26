/**
 * @opensearch/api — Privacy Receipt Execution Tests (Phase 84)
 *
 * Verifies that the Privacy Receipt:
 * 1. Accurately reflects real request events and execution telemetry (not assumed defaults).
 * 2. Accurately records standard hybrid search dispatches (endpoint, purpose, latency, status).
 * 3. Accurately records skipped providers (local-only-mode, sufficient-local-results, category-mismatch).
 * 4. Transparently handles failure, timeout (504), rate-limiting, and partial-result paths.
 * 5. Strictly protects user privacy: zero query leakage, zero client IP forwarding, no cookies, no database logging.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDocumentProcessor, createInvertedIndex } from '@opensearch/indexer';
import {
  createProviderRegistry,
  MockSearchProvider,
} from '@opensearch/ranking';
import { createApiServer, ApiServer } from '../src/index.js';
import { PrivacyReceipt } from '@opensearch/shared';

describe('Phase 84 — Privacy Receipt Schema & Execution Verification', () => {
  let server: ApiServer;
  let baseUrl: string;
  let primaryMock: MockSearchProvider;
  let secondMock: MockSearchProvider;
  let imageMock: MockSearchProvider;
  let registry: ReturnType<typeof createProviderRegistry>;

  beforeAll(async () => {
    const index = createInvertedIndex();
    const processor = createDocumentProcessor();

    // Index 1 document matching sparse terms so hybrid provider dispatch triggers
    index.addDocument(
      processor.process({
        id: 'doc-privacy-manifesto',
        url: 'https://opensearch.dev/manifesto',
        title: 'OpenSearch Privacy Manifesto',
        headings: 'Transparency and Zero-Tracking Search',
        description: 'Every query response includes a cryptographically verifiable privacy receipt.',
        bodyText: 'We do not log raw queries, create tracking cookies, or sell search telemetry.',
        language: 'en',
      }),
    );

    // Also index 12 documents for testing sufficient-local-results path
    for (let i = 1; i <= 12; i++) {
      index.addDocument(
        processor.process({
          id: `doc-abundant-${i}`,
          url: `https://opensearch.dev/docs/abundant-${i}`,
          title: `Abundant Indexed Documentation Part ${i}`,
          headings: 'Core Architecture',
          description: `Comprehensive reference documentation part ${i} for index retrieval.`,
          bodyText: `Abundant indexed content with common terms for sufficiency testing ${i}.`,
          language: 'en',
        }),
      );
    }

    primaryMock = new MockSearchProvider({
      metadata: {
        id: 'mock-web-provider',
        displayName: 'Mock Global Web Search',
        supportedCategories: ['general'],
        endpoint: 'https://mock-web.internal/v1/search',
        timeoutMs: 150,
      },
      fixtures: [
        {
          title: 'External Web Result for Privacy',
          canonicalUrl: 'https://external-source.org/privacy',
          snippet: 'External privacy details retrieved via upstream provider.',
          source: 'mock-web-provider',
          contentType: 'article',
        },
      ],
    });

    secondMock = new MockSearchProvider({
      metadata: {
        id: 'mock-news-provider',
        displayName: 'Mock News Feed API',
        supportedCategories: ['news'],
        endpoint: 'https://mock-news.internal/feed',
      },
      fixtures: [
        {
          title: 'Breaking Tech News Today',
          canonicalUrl: 'https://tech-news.org/today',
          snippet: 'Recent developments in search privacy technology.',
          source: 'mock-news-provider',
          contentType: 'article',
          timestamp: new Date().toISOString(),
        },
      ],
    });

    imageMock = new MockSearchProvider({
      metadata: {
        id: 'mock-image-provider',
        displayName: 'Mock Multimedia Index',
        supportedCategories: ['multimedia'],
        endpoint: 'https://mock-images.internal/search',
      },
      fixtures: [],
    });

    registry = createProviderRegistry();
    registry.registerProvider(primaryMock);
    registry.registerProvider(secondMock);
    registry.registerProvider(imageMock);

    server = createApiServer({
      index,
      providerRegistry: registry,
      searchTimeoutMs: 10000,
    });

    const info = await server.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    primaryMock.simulate5xx = false;
    primaryMock.forceTimeout = false;
    secondMock.simulate5xx = false;
    secondMock.forceTimeout = false;
  });

  it('generates a verified privacy receipt on standard hybrid web search', async () => {
    const res = await fetch(`${baseUrl}/api/v1/search?q=manifesto&t=standard_hybrid_test`);
    expect(res.status).toBe(200);

    const data = await res.json();
    const receipt: PrivacyReceipt = data.privacyReceipt;
    expect(receipt).toBeDefined();
    expect(data.meta.privacyReceipt).toEqual(receipt);

    // Schema and metadata
    expect(receipt.schemaVersion).toBe('1.0.0');
    expect(receipt.receiptId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(receipt.mode).toBe('standard');

    // Network dispatch telemetry
    expect(receipt.networkDispatch.totalOutboundRequests).toBeGreaterThanOrEqual(1);
    const contacted = receipt.networkDispatch.externalProvidersContacted.find(
      (p) => p.providerId === 'mock-web-provider',
    );
    expect(contacted).toBeDefined();
    expect(contacted?.endpoint).toBe('https://mock-web.internal/v1/search');
    expect(contacted?.statusCode).toBe(200);
    expect(contacted?.status).toBe('success');
    expect(contacted?.queryTransmitted).toBe(true);
    expect(contacted?.clientIpForwarded).toBe(false);
    expect(contacted?.latencyMs).toBeGreaterThanOrEqual(0);

    // Mismatched category provider (multimedia vs general query) recorded as skipped
    const skipped = receipt.networkDispatch.externalProvidersSkipped.find(
      (p) => p.providerId === 'mock-image-provider',
    );
    expect(skipped).toBeDefined();
    expect(skipped?.reason).toBe('category-mismatch');

    // Privacy invariants
    expect(receipt.hostTelemetry.dataPersistence.cookiesIssued).toBe(false);
    expect(receipt.hostTelemetry.dataPersistence.rawQueryStoredInDatabase).toBe(false);
    expect(receipt.hostTelemetry.dataPersistence.rawQueryLoggedToDisk).toBe(false);
    expect(receipt.hostTelemetry.dataPersistence.sessionIdentifiersCreated).toBe(false);
    expect(receipt.browserTelemetry.thirdPartyScriptsExecuted).toBe(false);
    expect(receipt.browserTelemetry.remoteSuggestionsRequested).toBe(false);
  });

  it('records providers as skipped when local index results are sufficient', async () => {
    // "abundant" matches 12 documents (>= pageSize 10)
    const res = await fetch(`${baseUrl}/api/v1/search?q=abundant&pageSize=10&t=sufficient_test`);
    expect(res.status).toBe(200);

    const data = await res.json();
    const receipt: PrivacyReceipt = data.privacyReceipt;
    expect(receipt).toBeDefined();

    expect(receipt.networkDispatch.totalOutboundRequests).toBe(0);
    expect(receipt.networkDispatch.externalProvidersContacted).toHaveLength(0);

    const webSkipped = receipt.networkDispatch.externalProvidersSkipped.find(
      (p) => p.providerId === 'mock-web-provider',
    );
    expect(webSkipped).toBeDefined();
    expect(webSkipped?.reason).toBe('sufficient-local-results');
    expect(receipt.summary).toContain('Local Index Match');
  });

  it('generates a pure Local-only receipt with zero outbound calls', async () => {
    const res = await fetch(`${baseUrl}/api/v1/search?q=obscure+quantum+topic&localOnly=true&t=local_only_test`);
    expect(res.status).toBe(200);

    const data = await res.json();
    const receipt: PrivacyReceipt = data.privacyReceipt;
    expect(receipt).toBeDefined();

    expect(receipt.mode).toBe('local-only');
    expect(receipt.networkDispatch.totalOutboundRequests).toBe(0);
    expect(receipt.networkDispatch.externalProvidersContacted).toHaveLength(0);

    // All registered providers explicitly marked as skipped for local-only-mode
    const webSkipped = receipt.networkDispatch.externalProvidersSkipped.find(
      (p) => p.providerId === 'mock-web-provider',
    );
    expect(webSkipped).toBeDefined();
    expect(webSkipped?.reason).toBe('local-only-mode');

    expect(receipt.summary).toContain('Local-Only Search');
    expect(receipt.summary).toContain('Zero external providers were contacted');
  });

  it('accurately captures upstream provider failure and partial results', async () => {
    primaryMock.simulate5xx = true;

    const res = await fetch(`${baseUrl}/api/v1/search?q=privacy&t=failure_test`);
    expect(res.status).toBe(200);

    const data = await res.json();
    const receipt: PrivacyReceipt = data.privacyReceipt;
    expect(receipt).toBeDefined();

    expect(receipt.networkDispatch.isPartialResult).toBe(true);
    const failedProvider = receipt.networkDispatch.externalProvidersContacted.find(
      (p) => p.providerId === 'mock-web-provider',
    );
    expect(failedProvider).toBeDefined();
    expect(failedProvider?.status).toBe('failed');
    expect(failedProvider?.statusCode).toBe(502);
    expect(receipt.summary).toContain('Hybrid Search (Partial)');
  });

  it('accurately captures upstream provider timeout (HTTP 504)', async () => {
    primaryMock.forceTimeout = true;

    // Use "telemetry" which matches 1 local doc and triggers provider with forceTimeout
    const res = await fetch(`${baseUrl}/api/v1/search?q=telemetry`);
    expect(res.status).toBe(200);

    const data = await res.json();
    const receipt: PrivacyReceipt = data.privacyReceipt;
    expect(receipt).toBeDefined();

    expect(receipt.networkDispatch.isPartialResult).toBe(true);
    const timeoutProvider = receipt.networkDispatch.externalProvidersContacted.find(
      (p) => p.providerId === 'mock-web-provider',
    );
    expect(timeoutProvider).toBeDefined();
    expect(timeoutProvider?.status).toBe('timeout');
    expect(timeoutProvider?.statusCode).toBe(504);
  });

  it('strictly validates that the receipt contains no raw query or user identifiers', async () => {
    const sensitiveQuery = 'user-sensitive-medical-query-12345';
    const res = await fetch(`${baseUrl}/api/v1/search?q=${encodeURIComponent(sensitiveQuery)}&t=leak_test`);
    expect(res.status).toBe(200);

    const data = await res.json();
    const receiptString = JSON.stringify(data.privacyReceipt);

    // Query text must never appear anywhere in the privacy receipt payload
    expect(receiptString).not.toContain(sensitiveQuery);

    // Cross-search identifiers must not exist
    expect(data.privacyReceipt.hostTelemetry.dataPersistence.sessionIdentifiersCreated).toBe(false);
    expect(data.privacyReceipt.hostTelemetry.dataPersistence.cookiesIssued).toBe(false);
  });
});
