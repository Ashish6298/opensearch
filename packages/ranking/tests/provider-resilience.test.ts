/**
 * @opensearch/ranking — Phase 71: Resilience, Timeouts, Retries, Caching & Partial Results Test Suite
 *
 * Verifies all 8 required tests and acceptance criteria from PHASEv1.5.0:
 * 1. Timeout (per-provider timeout and overall search deadline)
 * 2. Offline mode (network errors / connection refused / DNS drops)
 * 3. HTTP 429 and 5xx (rate limiting, Retry-After cooldown, backoff and retries)
 * 4. Invalid JSON (corrupted payload formatting)
 * 5. Oversized response (payload exceeding max safety limits)
 * 6. Provider unavailable (circuit breaker trip & retry storm prevention)
 * 7. Cancellation (abort signal propagation)
 * 8. Partial-result response (graceful degradation with isPartial flag)
 * + Privacy-preserving in-memory response caching
 * + Bounded concurrency execution
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockSearchProvider,
  NormalizedSearchResult,
  ProviderRegistry,
  ProviderResponseCache,
  ResilienceManager,
  createProviderRegistry,
} from '../src/index.js';

describe('Phase 71 — Search Provider Resilience & Partial Results Suite', () => {
  let registry: ProviderRegistry;

  const sampleFixturesA: NormalizedSearchResult[] = [
    {
      title: 'Decentralized Search Systems',
      canonicalUrl: 'https://docs.opensearch.local/decentralized-search',
      snippet: 'Architectural overview of federated, privacy-first distributed search engines.',
      source: 'provider-a',
      contentType: 'documentation',
    },
    {
      title: 'Information Retrieval Fundamentals',
      canonicalUrl: 'https://docs.opensearch.local/ir-fundamentals',
      snippet: 'Key concepts in search indexing, inverted indices, TF-IDF, and BM25 scoring.',
      source: 'provider-a',
      contentType: 'documentation',
    },
  ];

  const sampleFixturesB: NormalizedSearchResult[] = [
    {
      title: 'Federated Search Resilience',
      canonicalUrl: 'https://wiki.opensearch.local/resilience',
      snippet: 'Handling timeouts, rate limits, and partial failures gracefully.',
      source: 'provider-b',
      contentType: 'article',
    },
  ];

  beforeEach(() => {
    // Fresh registry with fast test timings (low backoff and cooldown)
    const resilienceManager = new ResilienceManager({
      circuitFailureThreshold: 3,
      circuitCooldownMs: 1000,
      baseBackoffMs: 10,
      maxBackoffMs: 50,
      jitterMs: 5,
    });
    registry = createProviderRegistry({ resilienceManager });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Timeout Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Timeout Handling', () => {
    it('isolates per-provider timeout and marks provider result as TIMEOUT', async () => {
      const slowProvider = new MockSearchProvider({
        metadata: { id: 'slow-provider', timeoutMs: 50 },
        simulatedDelayMs: 200,
      });
      const fastProvider = new MockSearchProvider({
        metadata: { id: 'fast-provider', timeoutMs: 500 },
        fixtures: sampleFixturesA,
      });

      registry.registerProvider(slowProvider);
      registry.registerProvider(fastProvider);

      const summary = await registry.executeSearch('search');

      expect(summary.successfulProviders).toBe(1);
      expect(summary.failedProviders).toBe(1);
      expect(summary.results.length).toBe(2);
      expect(summary.isPartial).toBe(true);

      const slowResult = summary.providerResults.find(p => p.providerId === 'slow-provider');
      expect(slowResult).toBeDefined();
      expect(slowResult?.errorCode).toBe('TIMEOUT');
      expect(slowResult?.sanitizedMessage).toContain('allocated time limit');
    });

    it('enforces overall search deadline across all dispatched providers', async () => {
      const slow1 = new MockSearchProvider({
        metadata: { id: 'slow-1', timeoutMs: 2000 },
        simulatedDelayMs: 500,
      });
      const slow2 = new MockSearchProvider({
        metadata: { id: 'slow-2', timeoutMs: 2000 },
        simulatedDelayMs: 500,
      });

      registry.registerProvider(slow1);
      registry.registerProvider(slow2);

      const summary = await registry.executeSearch('test', { searchDeadlineMs: 100 });

      expect(summary.searchDeadlineExceeded).toBe(true);
      expect(summary.failedProviders).toBe(2);
      expect(summary.successfulProviders).toBe(0);
      expect(summary.results.length).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Offline Mode & Network Error Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Offline Mode & Network Failures', () => {
    it('handles offline network errors gracefully with sanitized user messages', async () => {
      const offlineProvider = new MockSearchProvider({
        metadata: { id: 'offline-provider' },
        simulateNetworkError: true,
      });

      registry.registerProvider(offlineProvider);

      const summary = await registry.executeSearch('quantum computing', { maxRetries: 1 });

      expect(summary.failedProviders).toBe(1);
      expect(summary.successfulProviders).toBe(0);

      const result = summary.providerResults[0];
      expect(result.errorCode).toBe('NETWORK_ERROR');
      expect(result.sanitizedMessage).toBe(
        'Unable to reach the search provider due to an offline or network error.',
      );
      // Ensure no raw internal paths or node traces leaked into user message
      expect(result.sanitizedMessage).not.toContain('ENOTFOUND');
      expect(result.sanitizedMessage).not.toContain('mock.opensearch.local');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. HTTP 429 and 5xx Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. HTTP 429 & 5xx Handling', () => {
    it('handles HTTP 429, extracts Retry-After, and initiates cooldown', async () => {
      const rateLimitedProvider = new MockSearchProvider({
        metadata: { id: 'rate-limited-provider' },
        simulate429: true,
        retryAfterSeconds: 2,
      });

      registry.registerProvider(rateLimitedProvider);

      // First query triggers 429
      const summary1 = await registry.executeSearch('high frequency query');
      expect(summary1.failedProviders).toBe(1);
      const res1 = summary1.providerResults[0];
      expect(res1.errorCode).toBe('RATE_LIMITED');
      expect(res1.retryAfterSeconds).toBe(2);

      // Second query immediately afterwards is rejected without hitting the provider
      const summary2 = await registry.executeSearch('high frequency query');
      expect(summary2.failedProviders).toBe(1);
      const res2 = summary2.providerResults[0];
      expect(res2.errorCode).toBe('RATE_LIMITED');
      expect(res2.sanitizedMessage).toContain('rate limit was reached');
    });

    it('retries transient HTTP 5xx errors with backoff and succeeds on subsequent attempt', async () => {
      const recoveringProvider = new MockSearchProvider({
        metadata: { id: 'recovering-provider' },
        fixtures: sampleFixturesA,
        failCountBeforeSuccess: 1, // fails once with 500, succeeds on attempt 2
      });

      registry.registerProvider(recoveringProvider);

      const summary = await registry.executeSearch('resilient query', { maxRetries: 2 });

      expect(summary.successfulProviders).toBe(1);
      expect(summary.failedProviders).toBe(0);
      expect(summary.results.length).toBe(2);
      expect(summary.providerResults[0].retriesAttempted).toBe(1);
    });

    it('records UPSTREAM_ERROR when HTTP 5xx persists beyond maxRetries', async () => {
      const broken5xx = new MockSearchProvider({
        metadata: { id: 'broken-5xx' },
        simulate5xx: true,
      });

      registry.registerProvider(broken5xx);

      const summary = await registry.executeSearch('failing query', { maxRetries: 1 });

      expect(summary.failedProviders).toBe(1);
      expect(summary.successfulProviders).toBe(0);
      expect(summary.providerResults[0].errorCode).toBe('UPSTREAM_ERROR');
      expect(summary.providerResults[0].sanitizedMessage).toContain('temporary service disruption');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Invalid JSON Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Invalid JSON Parsing', () => {
    it('captures malformed JSON and reports INVALID_RESPONSE without crashing', async () => {
      const corruptProvider = new MockSearchProvider({
        metadata: { id: 'corrupt-json-provider' },
        simulateInvalidJson: true,
      });

      registry.registerProvider(corruptProvider);

      const summary = await registry.executeSearch('syntax query');

      expect(summary.failedProviders).toBe(1);
      expect(summary.providerResults[0].errorCode).toBe('INVALID_RESPONSE');
      expect(summary.providerResults[0].sanitizedMessage).toBe(
        'The provider returned an unrecognized or corrupted data format.',
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Oversized Response Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Oversized Response Bodies', () => {
    it('safely rejects payloads exceeding size threshold with OVERSIZED_RESPONSE', async () => {
      const oversizedProvider = new MockSearchProvider({
        metadata: { id: 'giant-payload-provider' },
        simulateOversized: true,
      });

      registry.registerProvider(oversizedProvider);

      const summary = await registry.executeSearch('dump all data');

      expect(summary.failedProviders).toBe(1);
      expect(summary.providerResults[0].errorCode).toBe('OVERSIZED_RESPONSE');
      expect(summary.providerResults[0].sanitizedMessage).toContain('exceeded the maximum permitted size');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Provider Unavailable & Circuit Breaker Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('6. Provider Unavailable & Circuit Breaker (Storm Prevention)', () => {
    it('trips circuit breaker after consecutive failures and fails fast with CIRCUIT_OPEN', async () => {
      const flappyProvider = new MockSearchProvider({
        metadata: { id: 'flappy-provider' },
        simulate5xx: true,
      });

      registry.registerProvider(flappyProvider);

      // Trigger 3 consecutive failures (threshold = 3)
      await registry.executeSearch('q1', { maxRetries: 0 });
      await registry.executeSearch('q2', { maxRetries: 0 });
      await registry.executeSearch('q3', { maxRetries: 0 });

      // 4th execution should immediately be rejected with CIRCUIT_OPEN without calling provider
      const summary4 = await registry.executeSearch('q4', { maxRetries: 0 });

      expect(summary4.failedProviders).toBe(1);
      const res = summary4.providerResults[0];
      expect(res.errorCode).toBe('CIRCUIT_OPEN');
      expect(res.sanitizedMessage).toContain('protect against upstream failure storms');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Cancellation Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('7. Request Cancellation', () => {
    it('terminates pending execution immediately when AbortSignal is aborted', async () => {
      const slowProvider = new MockSearchProvider({
        metadata: { id: 'hanging-provider' },
        simulatedDelayMs: 2000,
      });

      registry.registerProvider(slowProvider);

      const controller = new AbortController();
      const searchPromise = registry.executeSearch('cancel me', { signal: controller.signal });

      // Abort after 50ms
      setTimeout(() => controller.abort(), 50);

      const summary = await searchPromise;

      expect(summary.failedProviders).toBe(1);
      expect(summary.providerResults[0].errorCode).toBe('CANCELLED');
      expect(summary.providerResults[0].sanitizedMessage).toBe('The search request was cancelled.');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Partial-Result Response Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('8. Partial Results Aggregation', () => {
    it('returns available results with isPartial=true when some providers fail', async () => {
      const healthyProvider = new MockSearchProvider({
        metadata: { id: 'healthy-provider' },
        fixtures: sampleFixturesA,
      });
      const deadProvider = new MockSearchProvider({
        metadata: { id: 'dead-provider' },
        simulate5xx: true,
      });

      registry.registerProvider(healthyProvider);
      registry.registerProvider(deadProvider);

      const summary = await registry.executeSearch('distributed systems', { maxRetries: 0 });

      expect(summary.successfulProviders).toBe(1);
      expect(summary.failedProviders).toBe(1);
      expect(summary.isPartial).toBe(true);
      expect(summary.results.length).toBe(2);
      expect(summary.results[0].title).toBe('Decentralized Search Systems');
    });

    it('sets isPartial=false when all enabled providers succeed', async () => {
      const provider1 = new MockSearchProvider({
        metadata: { id: 'p1' },
        fixtures: sampleFixturesA,
      });
      const provider2 = new MockSearchProvider({
        metadata: { id: 'p2' },
        fixtures: sampleFixturesB,
      });

      registry.registerProvider(provider1);
      registry.registerProvider(provider2);

      const summary = await registry.executeSearch('search');

      expect(summary.successfulProviders).toBe(2);
      expect(summary.failedProviders).toBe(0);
      expect(summary.isPartial).toBe(false);
      expect(summary.results.length).toBe(3);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Privacy-Preserving In-Memory Cache Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('9. Privacy-Preserving Response Cache', () => {
    it('caches successful provider responses and serves subsequent calls from cache', async () => {
      const provider = new MockSearchProvider({
        metadata: {
          id: 'cacheable-provider',
          cachePolicy: { enabled: true, ttlSeconds: 300 },
        },
        fixtures: sampleFixturesA,
      });

      registry.registerProvider(provider);

      // First call (cache miss)
      const summary1 = await registry.executeSearch('caching test');
      expect(summary1.cachedProviders).toBe(0);
      expect(provider.queryCount).toBe(1);

      // Second call (cache hit)
      const summary2 = await registry.executeSearch('caching test');
      expect(summary2.cachedProviders).toBe(1);
      expect(summary2.providerResults[0].cached).toBe(true);
      expect(provider.queryCount).toBe(1); // Provider was not invoked again
    });

    it('generates deterministic query-only keys without IP or user session data', () => {
      const key1 = ProviderResponseCache.makeKey('test-prov', 'Privacy Search', 10, ['general']);
      const key2 = ProviderResponseCache.makeKey('TEST-PROV', 'privacy search', 10, ['general']);

      expect(key1).toBe(key2);
      expect(key1).toBe('test-prov::privacy search::lim=10::cat=general');
      expect(key1).not.toContain('ip');
      expect(key1).not.toContain('cookie');
      expect(key1).not.toContain('user');
    });

    it('evicts least recently used items when max capacity is reached', () => {
      const cache = new ProviderResponseCache(2); // Max 2 entries
      cache.set('key1', 'prov', sampleFixturesA, 300);
      cache.set('key2', 'prov', sampleFixturesB, 300);

      // Access key1 so key2 becomes least recently used
      cache.get('key1');

      // Add key3, should evict key2
      cache.set('key3', 'prov', sampleFixturesA, 300);

      expect(cache.get('key1')).toBeDefined();
      expect(cache.get('key2')).toBeUndefined(); // Evicted
      expect(cache.get('key3')).toBeDefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. Bounded Concurrency Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('10. Bounded Concurrency', () => {
    it('executes providers within bounded concurrency pool without deadlocks', async () => {
      for (let i = 1; i <= 6; i++) {
        registry.registerProvider(
          new MockSearchProvider({
            metadata: { id: `pool-provider-${i}` },
            fixtures: [{
              title: `Item from ${i}`,
              canonicalUrl: `https://example.local/${i}`,
              snippet: `Snippet ${i}`,
              source: `pool-provider-${i}`,
              contentType: 'webpage',
            }],
            simulatedDelayMs: 20,
          }),
        );
      }

      const summary = await registry.executeSearch('test pool', { maxConcurrency: 2 });

      expect(summary.successfulProviders).toBe(6);
      expect(summary.results.length).toBe(6);
      expect(summary.failedProviders).toBe(0);
    });
  });
});
