/**
 * @opensearch/ranking — Phase 69: Standard Provider Interface Test Suite
 *
 * Verifies:
 * 1. Typed search provider metadata and privacy behaviors
 * 2. Shared result normalization and provenance retention
 * 3. Provider registration, unregistration, and dynamic enable/disable toggling
 * 4. Resilient parallel execution and absolute failure isolation (timeouts, 5xx errors)
 * 5. Category-based query routing
 * 6. Non-disruptive integration with core ranking and SearchResultItem structures
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockSearchProvider,
  NormalizedSearchResult,
  ProviderRegistry,
  convertToSearchResultItem,
  createProviderRegistry,
  normalizeProviderResult,
} from '../src/index.js';

describe('Phase 69 — Standard Search Provider Interface Suite', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = createProviderRegistry();
  });

  describe('1. Provider Metadata & Contract', () => {
    it('defines complete typed metadata conforming to Phase 69 specifications', () => {
      const provider = new MockSearchProvider({
        metadata: {
          id: 'test-wiki',
          displayName: 'Test Wikipedia Provider',
          supportedCategories: ['encyclopedia', 'general'],
          endpoint: 'https://en.wikipedia.org/w/api.php',
          attribution: {
            name: 'Wikipedia',
            license: 'CC BY-SA 4.0',
            url: 'https://wikipedia.org',
          },
          rateLimits: {
            maxRequestsPerMinute: 120,
            minDelayMs: 200,
          },
          timeoutMs: 2500,
          cachePolicy: {
            enabled: true,
            ttlSeconds: 3600,
          },
          privacy: {
            querySentToOrigin: true,
            forwardClientIp: false,
            forwardCookies: false,
            logsRetentionPolicy: '90-days-anonymized',
            requiresAuth: false,
          },
        },
      });

      expect(provider.metadata.id).toBe('test-wiki');
      expect(provider.metadata.displayName).toBe('Test Wikipedia Provider');
      expect(provider.metadata.supportedCategories).toEqual(['encyclopedia', 'general']);
      expect(provider.metadata.endpoint).toBe('https://en.wikipedia.org/w/api.php');
      expect(provider.metadata.attribution.name).toBe('Wikipedia');
      expect(provider.metadata.attribution.license).toBe('CC BY-SA 4.0');
      expect(provider.metadata.rateLimits.maxRequestsPerMinute).toBe(120);
      expect(provider.metadata.timeoutMs).toBe(2500);
      expect(provider.metadata.cachePolicy.enabled).toBe(true);
      expect(provider.metadata.cachePolicy.ttlSeconds).toBe(3600);
      expect(provider.metadata.privacy.forwardClientIp).toBe(false);
      expect(provider.metadata.privacy.forwardCookies).toBe(false);
      expect(provider.isEnabled()).toBe(true);
    });

    it('supports dynamic enabling and disabling of providers', () => {
      const provider = new MockSearchProvider({ initialEnabled: true });
      expect(provider.isEnabled()).toBe(true);

      provider.setEnabled(false);
      expect(provider.isEnabled()).toBe(false);

      provider.setEnabled(true);
      expect(provider.isEnabled()).toBe(true);
    });
  });

  describe('2. Result Normalization & Provenance Retention', () => {
    it('normalizes arbitrary provider outputs into the shared NormalizedSearchResult schema', () => {
      const provider = new MockSearchProvider({
        metadata: {
          id: 'academic-lib',
          displayName: 'Academic Library',
          attribution: { name: 'Open Academic Registry', license: 'CC0' },
        },
      });

      const rawItem = {
        title: 'Deep Learning for Information Retrieval',
        link: 'https://arxiv.org/abs/2101.00001',
        description: 'Comprehensive survey on modern neural ranking architectures.',
        date: '2026-01-15T00:00:00Z',
        contentType: 'paper',
        thumbnailUrl: 'https://arxiv.org/thumb/2101.00001.jpg',
        score: 0.95,
        customExtraField: 'preserved in metadata',
      };

      const normalized = normalizeProviderResult(rawItem, provider.metadata);

      expect(normalized.title).toBe('Deep Learning for Information Retrieval');
      expect(normalized.canonicalUrl).toBe('https://arxiv.org/abs/2101.00001');
      expect(normalized.snippet).toBe('Comprehensive survey on modern neural ranking architectures.');
      expect(normalized.source).toBe('academic-lib');
      expect(normalized.contentType).toBe('paper');
      expect(normalized.timestamp).toBe('2026-01-15T00:00:00Z');
      expect(normalized.attribution).toContain('Open Academic Registry');
      expect(normalized.thumbnail?.url).toBe('https://arxiv.org/thumb/2101.00001.jpg');
      expect(normalized.score).toBe(0.95);
      expect(normalized.metadata?.['customExtraField']).toBe('preserved in metadata');
    });

    it('converts NormalizedSearchResult to SearchResultItem preserving provenance metadata', () => {
      const normalized: NormalizedSearchResult = {
        title: 'Rust Programming Language',
        canonicalUrl: 'https://www.rust-lang.org/learn',
        snippet: 'A language empowering everyone to build reliable and efficient software.',
        source: 'crates-io',
        contentType: 'documentation',
        timestamp: '2026-02-01T12:00:00Z',
        attribution: 'Source: Official Rust Docs',
        thumbnail: { url: 'https://www.rust-lang.org/static/images/rust-logo.png' },
      };

      const item = convertToSearchResultItem(normalized, 1, 0.95);

      expect(item.documentId).toBe('crates-io-1');
      expect(item.rank).toBe(1);
      expect(item.title).toBe('Rust Programming Language');
      expect(item.url).toBe('https://www.rust-lang.org/learn');
      expect(item.domain).toBe('rust-lang.org');
      expect(item.displayUrl).toBe('rust-lang.org › ...');
      expect(item.source).toBe('crates-io');
      expect(item.contentType).toBe('documentation');
      expect(item.attribution).toBe('Source: Official Rust Docs');
      expect(item.thumbnailUrl).toBe('https://www.rust-lang.org/static/images/rust-logo.png');
      expect(item.indexedAt).toBe('2026-02-01T12:00:00Z');
    });
  });

  describe('3. Provider Registration & Lifecycle', () => {
    it('registers, retrieves, and unregisters providers cleanly', () => {
      const p1 = new MockSearchProvider({ metadata: { id: 'p1', displayName: 'P1' } });
      const p2 = new MockSearchProvider({ metadata: { id: 'p2', displayName: 'P2' } });

      registry.registerProvider(p1);
      registry.registerProvider(p2);

      expect(registry.getAllProviders().length).toBe(2);
      expect(registry.getProvider('p1')?.metadata.displayName).toBe('P1');
      expect(registry.getProvider('P2')?.metadata.displayName).toBe('P2'); // Case-insensitive

      // Disallow duplicate ID registration
      expect(() => registry.registerProvider(p1)).toThrow('already registered');

      // Unregister
      expect(registry.unregisterProvider('p1')).toBe(true);
      expect(registry.getProvider('p1')).toBeUndefined();
      expect(registry.getAllProviders().length).toBe(1);
    });

    it('manages independent enable/disable toggling across registered providers', () => {
      const p1 = new MockSearchProvider({ metadata: { id: 'p1' }, initialEnabled: true });
      const p2 = new MockSearchProvider({ metadata: { id: 'p2' }, initialEnabled: false });

      registry.registerProvider(p1);
      registry.registerProvider(p2);

      expect(registry.getEnabledProviders().map(p => p.metadata.id)).toEqual(['p1']);

      registry.setProviderEnabled('p2', true);
      expect(registry.getEnabledProviders().map(p => p.metadata.id)).toEqual(['p1', 'p2']);

      registry.setProviderEnabled('p1', false);
      expect(registry.getEnabledProviders().map(p => p.metadata.id)).toEqual(['p2']);
    });

    it('filters providers by supported query categories', () => {
      const generalProvider = new MockSearchProvider({
        metadata: { id: 'general-p', supportedCategories: ['general'] },
      });
      const academicProvider = new MockSearchProvider({
        metadata: { id: 'academic-p', supportedCategories: ['academic'] },
      });

      registry.registerProvider(generalProvider);
      registry.registerProvider(academicProvider);

      const academicMatches = registry.getProvidersForCategories(['academic']);
      expect(academicMatches.length).toBe(1);
      expect(academicMatches[0]?.metadata.id).toBe('academic-p');

      const generalMatches = registry.getProvidersForCategories(['general']);
      expect(generalMatches.length).toBe(1);
      expect(generalMatches[0]?.metadata.id).toBe('general-p');
    });
  });

  describe('4. Resilient Parallel Execution & Failure Isolation', () => {
    it('isolates single provider failure without crashing overall search', async () => {
      const reliableProvider = new MockSearchProvider({
        metadata: { id: 'reliable-provider' },
        fixtures: [
          {
            title: 'Reliable Result A',
            canonicalUrl: 'https://example.com/a',
            snippet: 'Snippet A from reliable provider',
            source: 'reliable-provider',
            contentType: 'article',
          },
        ],
      });

      const failingProvider = new MockSearchProvider({
        metadata: { id: 'failing-provider' },
        forcedError: 'HTTP 500 Internal Server Error from upstream source',
      });

      registry.registerProvider(reliableProvider);
      registry.registerProvider(failingProvider);

      const summary = await registry.executeSearch('test query');

      expect(summary.successfulProviders).toBe(1);
      expect(summary.failedProviders).toBe(1);
      expect(summary.results.length).toBe(1);
      expect(summary.results[0]?.title).toBe('Reliable Result A');

      // Failure is recorded without crashing
      const failedResult = summary.providerResults.find(r => r.providerId === 'failing-provider');
      expect(failedResult?.error).toContain('HTTP 500');
    });

    it('isolates slow / timed out providers cleanly', async () => {
      const fastProvider = new MockSearchProvider({
        metadata: { id: 'fast-p' },
        fixtures: [
          {
            title: 'Fast Hit',
            canonicalUrl: 'https://fast.org',
            snippet: 'Fast response',
            source: 'fast-p',
            contentType: 'webpage',
          },
        ],
      });

      const slowProvider = new MockSearchProvider({
        metadata: { id: 'slow-p', timeoutMs: 50 },
        simulatedDelayMs: 200, // Exceeds timeout
        fixtures: [
          {
            title: 'Slow Hit',
            canonicalUrl: 'https://slow.org',
            snippet: 'Slow response',
            source: 'slow-p',
            contentType: 'webpage',
          },
        ],
      });

      registry.registerProvider(fastProvider);
      registry.registerProvider(slowProvider);

      const summary = await registry.executeSearch('query', { timeoutMs: 50 });

      expect(summary.successfulProviders).toBe(1);
      expect(summary.failedProviders).toBe(1);
      expect(summary.results.length).toBe(1);
      expect(summary.results[0]?.title).toBe('Fast Hit');

      const slowResult = summary.providerResults.find(r => r.providerId === 'slow-p');
      expect(slowResult?.error).toContain('Timeout');
    });

    it('skips disabled providers during search execution', async () => {
      const enabledP = new MockSearchProvider({
        metadata: { id: 'enabled-p' },
        fixtures: [
          {
            title: 'Enabled Result',
            canonicalUrl: 'https://enabled.com',
            snippet: 'Content',
            source: 'enabled-p',
            contentType: 'webpage',
          },
        ],
      });

      const disabledP = new MockSearchProvider({
        metadata: { id: 'disabled-p' },
        initialEnabled: false,
        fixtures: [
          {
            title: 'Disabled Result',
            canonicalUrl: 'https://disabled.com',
            snippet: 'Content',
            source: 'disabled-p',
            contentType: 'webpage',
          },
        ],
      });

      registry.registerProvider(enabledP);
      registry.registerProvider(disabledP);

      const summary = await registry.executeSearch('query');

      expect(summary.results.length).toBe(1);
      expect(summary.results[0]?.title).toBe('Enabled Result');
      expect(disabledP.queryCount).toBe(0);
      expect(enabledP.queryCount).toBe(1);
    });

    it('returns empty result summary cleanly when zero providers match or are enabled', async () => {
      const summary = await registry.executeSearch('anything');
      expect(summary.results).toEqual([]);
      expect(summary.providerResults).toEqual([]);
      expect(summary.successfulProviders).toBe(0);
      expect(summary.failedProviders).toBe(0);
    });
  });
});
