/**
 * @opensearch/api — Local-Only Mode Integration Tests (Phase 83)
 *
 * Verifies that Local-only search mode:
 * 1. Strictly enforces local-only retrieval in the backend/query planner.
 * 2. Guarantees zero external provider dispatches (even when index is empty).
 * 3. Cannot silently fall back to external providers.
 * 4. Returns an honest limited-results message when local coverage is insufficient.
 * 5. Accurately handles categories (Images, News) without external calls.
 * 6. Evaluates local-only instant answers (math, conversions) without network egress.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDocumentProcessor, createInvertedIndex } from '@opensearch/indexer';
import {
  createProviderRegistry,
  MockSearchProvider,
  createInstantAnswerEngine,
} from '@opensearch/ranking';
import { createApiServer, ApiServer } from '../src/index.js';

describe('Phase 83 — Enforce Local-Only Mode Integration Suite', () => {
  let server: ApiServer;
  let baseUrl: string;
  let mockProvider: MockSearchProvider;
  let providerSearchCalls = 0;

  beforeAll(async () => {
    const index = createInvertedIndex();
    const processor = createDocumentProcessor();

    // Populate a small local index
    index.addDocument(
      processor.process({
        id: 'doc-local-privacy',
        url: 'https://opensearch.dev/privacy-guide',
        title: 'Local Privacy Architecture Guide',
        headings: 'Air-Gapped Search and Data Isolation',
        description: 'Complete guide to running air-gapped private search engines locally.',
        bodyText: 'OpenSearch local index mode eliminates all third-party external network dependencies.',
        language: 'en',
      }),
    );

    // Set up a mock provider to track outbound provider dispatches
    mockProvider = new MockSearchProvider({
      id: 'mock-external-provider',
      name: 'Mock Web Search API',
      category: 'general',
      priority: 10,
      mockResults: [
        {
          id: 'ext-1',
          url: 'https://external-web.example.com/article',
          title: 'External Web Article',
          snippet: 'Information retrieved from external web search provider.',
          source: 'mock-external-provider',
        },
      ],
    });

    // Intercept/spy on mockProvider.search
    const originalSearch = mockProvider.search.bind(mockProvider);
    mockProvider.search = async (query, options) => {
      providerSearchCalls++;
      return originalSearch(query, options);
    };

    const registry = createProviderRegistry();
    registry.registerProvider(mockProvider);

    const instantAnswerEngine = createInstantAnswerEngine();

    server = createApiServer({
      index,
      providerRegistry: registry,
    });

    const info = await server.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  it('asserts zero provider dispatches in Local-only mode when local hits exist', async () => {
    providerSearchCalls = 0;

    const res = await fetch(`${baseUrl}/api/v1/search?q=privacy&localOnly=true`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(providerSearchCalls).toBe(0);
    expect(data.meta.localOnly).toBe(true);
    expect(data.results.length).toBeGreaterThanOrEqual(1);
    expect(data.results[0].title).toContain('Local Privacy Architecture Guide');
  });

  it('asserts zero provider dispatches in Local-only mode when local index is empty / zero hits', async () => {
    providerSearchCalls = 0;

    // "nonexistenttermxyz" does not exist in local index
    const res = await fetch(`${baseUrl}/api/v1/search?q=nonexistenttermxyz&localOnly=true`);
    expect(res.status).toBe(200);

    const data = await res.json();
    // Zero external provider calls guaranteed:
    expect(providerSearchCalls).toBe(0);
    expect(data.results).toHaveLength(0);
    expect(data.meta.totalHits).toBe(0);
    expect(data.meta.localOnly).toBe(true);
    expect(data.meta.limitedResultsNotice).toBeDefined();
    expect(data.meta.limitedResultsNotice).toContain('Local-only mode active: No matching documents found');
  });

  it('guarantees that Local-only mode cannot silently fall back to external providers', async () => {
    providerSearchCalls = 0;

    // Both mode=local and localOnly=true are supported
    const res = await fetch(`${baseUrl}/api/v1/search?q=quantum+physics&mode=local`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(providerSearchCalls).toBe(0);
    expect(data.meta.localOnly).toBe(true);
    // Even though mock provider has external results, they are NOT included
    const externalHits = data.results.filter(
      (r: any) => r.source === 'mock-external-provider',
    );
    expect(externalHits).toHaveLength(0);
  });

  it('allows external provider dispatch when Local-only mode is false and local results are insufficient', async () => {
    providerSearchCalls = 0;

    const res = await fetch(`${baseUrl}/api/v1/search?q=external+query&localOnly=false`);
    expect(res.status).toBe(200);

    const data = await res.json();
    // In standard hybrid mode, external provider was dispatched
    expect(providerSearchCalls).toBeGreaterThan(0);
    expect(data.meta.localOnly).toBe(false);
    expect(data.meta.limitedResultsNotice).toBeUndefined();
  });

  it('returns an honest limited-results message when local coverage is insufficient', async () => {
    const res = await fetch(`${baseUrl}/api/v1/search?q=privacy&localOnly=true`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.meta.localOnly).toBe(true);
    expect(data.meta.limitedResultsNotice).toBeDefined();
    expect(data.meta.limitedResultsNotice).toContain('Local-only mode active');
  });

  it('evaluates local mathematical and conversion instant answers without network egress', async () => {
    providerSearchCalls = 0;

    const res = await fetch(`${baseUrl}/api/v1/search?q=25*4&localOnly=true`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(providerSearchCalls).toBe(0);
    expect(data.instantAnswer).toBeDefined();
    expect(data.instantAnswer.primaryResult).toBe('100');
  });

  it('handles Images category in Local-only mode without contacting external APIs', async () => {
    providerSearchCalls = 0;

    const res = await fetch(`${baseUrl}/api/v1/search?q=landscape&category=images&localOnly=true`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(providerSearchCalls).toBe(0);
    expect(data.results).toHaveLength(0);
    expect(data.meta.categoryAvailable).toBe(false);
  });
});
