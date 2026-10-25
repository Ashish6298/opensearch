/**
 * @opensearch/api — Phase 70: Removed Scrapers Regression Test Suite
 *
 * Proves that:
 * 1. Google Suggest scraping (suggestqueries.google.com) is NO LONGER invoked.
 * 2. DuckDuckGo HTML scraping (html.duckduckgo.com) is NO LONGER invoked.
 * 3. DuckDuckGo Instant Answers (api.duckduckgo.com) is NO LONGER invoked.
 * 4. All external web search calls route strictly through the typed SearchProvider layer.
 * 5. Provider failures are fully isolated and return empty fallback without crashing.
 * 6. The core product operates with zero paid API keys or credentials.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchExternalWebResults,
  fetchGoogleLive,
} from '../src/external-search.js';
import {
  MockSearchProvider,
  ProviderRegistry,
} from '@opensearch/ranking';

describe('Phase 70 — Removed Scrapers & Permitted Providers Suite', () => {
  let interceptedUrls: string[] = [];
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    interceptedUrls = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      interceptedUrls.push(urlStr);

      // Return synthetic compliant response for permitted endpoints
      if (urlStr.includes('wikipedia.org')) {
        return new Response(
          JSON.stringify([
            'test',
            ['Test Article Title'],
            ['Test article description from Wikipedia.'],
            ['https://en.wikipedia.org/wiki/Test'],
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('hn.algolia.com')) {
        return new Response(
          JSON.stringify({
            hits: [
              {
                title: 'Hacker News Test Post',
                url: 'https://news.ycombinator.com/item?id=12345',
                points: 42,
                num_comments: 10,
                objectID: '12345',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('Not Found', { status: 404 });
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('1. Scraper Removal Verification', () => {
    it('proves Google Suggest (suggestqueries.google.com) is NEVER called', async () => {
      await fetchExternalWebResults('privacy-search', 5);

      const googleSuggestCalls = interceptedUrls.filter(u =>
        u.includes('suggestqueries.google.com'),
      );
      expect(googleSuggestCalls.length).toBe(0);
    });

    it('proves DuckDuckGo HTML scraping (html.duckduckgo.com) is NEVER called', async () => {
      await fetchExternalWebResults('open source software', 5);

      const ddgHtmlCalls = interceptedUrls.filter(u =>
        u.includes('html.duckduckgo.com'),
      );
      expect(ddgHtmlCalls.length).toBe(0);
    });

    it('proves DuckDuckGo API (api.duckduckgo.com) is NEVER called', async () => {
      await fetchExternalWebResults('distributed systems', 5);

      const ddgApiCalls = interceptedUrls.filter(u =>
        u.includes('api.duckduckgo.com'),
      );
      expect(ddgApiCalls.length).toBe(0);
    });

    it('proves legacy fetchGoogleLive alias also routes exclusively to permitted providers', async () => {
      const items = await fetchGoogleLive('typescript compiler', 5);

      // Verify no scraped domains
      expect(interceptedUrls.some(u => u.includes('google.com'))).toBe(false);
      expect(interceptedUrls.some(u => u.includes('duckduckgo.com'))).toBe(false);

      // Verify permitted endpoints were targeted
      const permittedCalls = interceptedUrls.filter(
        u => u.includes('wikipedia.org') || u.includes('hn.algolia.com'),
      );
      expect(permittedCalls.length).toBeGreaterThan(0);
      expect(items.length).toBeGreaterThan(0);
    });
  });

  describe('2. Provider Layer Routing & Provenance Retention', () => {
    it('returns normalized SearchResultItems with source and domain provenance', async () => {
      const items = await fetchExternalWebResults('test query', 5);

      expect(items.length).toBeGreaterThan(0);
      const first = items[0]!;
      expect(first.title).toBeDefined();
      expect(first.url).toBeDefined();
      expect(first.domain).toBeDefined();
      expect(first.displayUrl).toContain('›');
      expect(first.source).toBeDefined();
      expect(first.rank).toBe(1);
    });

    it('supports custom registry override and mock provider execution', async () => {
      const customRegistry = new ProviderRegistry();
      const mock = new MockSearchProvider({
        metadata: { id: 'custom-fixture-p' },
        fixtures: [
          {
            title: 'Mock Result 1',
            canonicalUrl: 'https://custom-mock.org/page1',
            snippet: 'Custom mock description',
            source: 'custom-fixture-p',
            contentType: 'article',
          },
        ],
      });
      customRegistry.registerProvider(mock);

      const results = await fetchExternalWebResults('anything', 5, customRegistry);

      expect(results.length).toBe(1);
      expect(results[0]?.title).toBe('Mock Result 1');
      expect(results[0]?.source).toBe('custom-fixture-p');
      expect(results[0]?.domain).toBe('custom-mock.org');
    });

    it('gracefully handles complete provider failure without throwing', async () => {
      const failingRegistry = new ProviderRegistry();
      const mockFail = new MockSearchProvider({
        metadata: { id: 'always-fail' },
        forcedError: 'Simulated 503 Service Unavailable',
      });
      failingRegistry.registerProvider(mockFail);

      const results = await fetchExternalWebResults('crash test', 5, failingRegistry);
      expect(results).toEqual([]);
    });
  });
});
