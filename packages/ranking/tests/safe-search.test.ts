/**
 * @opensearch/ranking — Phase 81: Safe Search & Content Controls Test Suite
 *
 * Verifies:
 * 1. Enabled (strict & moderate), disabled (off), and unsupported provider cases
 * 2. Explicit keyword and domain detection across titles, URLs, and snippets
 * 3. Provider safe search capability metadata and honest limitation disclosures
 * 4. Transparent explanations of what Safe Search does and does not cover
 * 5. Mock provider safe search parameter forwarding and upstream filtering
 */

import { describe, it, expect } from 'vitest';
import {
  SafeSearchLevel,
  filterSafeSearchResults,
  isContentExplicit,
  getSafeSearchDisclosure,
  PROVIDER_SAFE_SEARCH_CAPABILITIES,
  MockSearchProvider,
  ProviderRegistry,
  NormalizedSearchResult,
} from '../src/index.js';

describe('Phase 81 — Safe Search & Content Controls Suite', () => {
  const sampleResults: Array<{ title: string; snippet: string; url: string }> = [
    {
      title: 'Decentralized Search Engine Architecture',
      snippet: 'An overview of distributed indexing and BM25 ranking protocols.',
      url: 'https://opensearch.local/docs/arch',
    },
    {
      title: 'Free Hardcore Porn Videos and XXX Clips',
      snippet: 'Adult explicit adult content collection.',
      url: 'https://pornhub.com/view?id=123',
    },
    {
      title: 'Anatomy and Medical Biology Textbook',
      snippet: 'Scientific study of human organs and clinical physiology.',
      url: 'https://med.example.org/anatomy',
    },
    {
      title: 'Explicit NSFW Photos Gallery',
      snippet: 'Adult gallery of photos.',
      url: 'https://gallery.example.com/nsfw',
    },
    {
      title: 'Open Source Distributed Computing Paper',
      snippet: 'This research discusses adult education and continuous learning in computer science.',
      url: 'https://arxiv.org/abs/2601.0001',
    },
  ];

  describe('1. Safe Search Filtering Modes (Enabled vs Disabled)', () => {
    it('Off Mode (Disabled): returns all items unfiltered with zero exclusions', () => {
      const res = filterSafeSearchResults(sampleResults, 'off');
      expect(res.filtered.length).toBe(sampleResults.length);
      expect(res.excludedCount).toBe(0);
      expect(res.level).toBe('off');
    });

    it('Moderate Mode (Enabled): filters explicit titles and adult domains', () => {
      const res = filterSafeSearchResults(sampleResults, 'moderate');
      expect(res.level).toBe('moderate');

      const titles = res.filtered.map(r => r.title);
      expect(titles).not.toContain('Free Hardcore Porn Videos and XXX Clips');
      expect(titles).not.toContain('Explicit NSFW Photos Gallery');

      // General technical results and educational terms are preserved
      expect(titles).toContain('Decentralized Search Engine Architecture');
      expect(titles).toContain('Anatomy and Medical Biology Textbook');
      expect(titles).toContain('Open Source Distributed Computing Paper');

      expect(res.excludedCount).toBe(2);
    });

    it('Strict Mode (Enabled): filters items with explicit keywords in titles, URLs, or snippets', () => {
      const res = filterSafeSearchResults(sampleResults, 'strict');
      expect(res.level).toBe('strict');

      const titles = res.filtered.map(r => r.title);
      expect(titles).not.toContain('Free Hardcore Porn Videos and XXX Clips');
      expect(titles).not.toContain('Explicit NSFW Photos Gallery');
      // The paper mentioning 'adult education' in snippet is filtered in strict mode
      expect(titles).not.toContain('Open Source Distributed Computing Paper');

      expect(titles).toContain('Decentralized Search Engine Architecture');
      expect(titles).toContain('Anatomy and Medical Biology Textbook');
      expect(res.excludedCount).toBe(3);
    });
  });

  describe('2. Explicit Detection & Domain Moderation', () => {
    it('identifies explicit adult domains', () => {
      expect(isContentExplicit('harmless text', 'Harmless Title', 'https://pornhub.com/video')).toBe(true);
      expect(isContentExplicit('harmless text', 'Harmless Title', 'https://xvideos.com/clip')).toBe(true);
      expect(isContentExplicit('harmless text', 'Harmless Title', 'https://wikipedia.org/wiki/Search')).toBe(false);
    });

    it('identifies explicit keywords in title or text', () => {
      expect(isContentExplicit('just regular content', 'xxx movie')).toBe(true);
      expect(isContentExplicit('nsfw content inside', 'Normal Title')).toBe(true);
      expect(isContentExplicit('clean documentation on algorithms', 'Algorithm Guide')).toBe(false);
    });
  });

  describe('3. Honest Provider Safe-Search Capabilities & Boundaries', () => {
    it('documents native support for local index and mock provider', () => {
      expect(PROVIDER_SAFE_SEARCH_CAPABILITIES['local-index']?.supported).toBe(true);
      expect(PROVIDER_SAFE_SEARCH_CAPABILITIES['local-index']?.parameterName).toBe('safeSearch');

      expect(PROVIDER_SAFE_SEARCH_CAPABILITIES['mock-provider']?.supported).toBe(true);
      expect(PROVIDER_SAFE_SEARCH_CAPABILITIES['mock-provider']?.parameterName).toBe('safe');
    });

    it('honestly documents unsupported upstream safe-search for external community providers', () => {
      const wiki = PROVIDER_SAFE_SEARCH_CAPABILITIES['wikimedia'];
      expect(wiki?.supported).toBe(false);
      expect(wiki?.explanation).toContain('does not offer native upstream adult content parameters');

      const hn = PROVIDER_SAFE_SEARCH_CAPABILITIES['hackernews'];
      expect(hn?.supported).toBe(false);
      expect(hn?.explanation).toContain('does not support upstream adult content parameters');

      const wikiImg = PROVIDER_SAFE_SEARCH_CAPABILITIES['wikimedia-images'];
      expect(wikiImg?.supported).toBe(false);
      expect(wikiImg?.explanation).toContain('does not offer automated upstream safe-search flags');
    });

    it('generates transparent disclosures explaining what Safe Search covers and does not cover', () => {
      const disclosure = getSafeSearchDisclosure('strict');

      expect(disclosure.level).toBe('strict');
      expect(disclosure.localFilteringApplied).toBe(true);
      expect(disclosure.whatItCovers).toContain('Local keyword and domain filtering');
      expect(disclosure.whatItDoesNotCover).toContain('External community providers (Wikipedia, Hacker News, Wikimedia Commons) do not support upstream server-side safe search parameters');
      expect(disclosure.summaryExplanation).toContain('Strict');
    });

    it('generates appropriate explanation when Safe Search is off', () => {
      const disclosure = getSafeSearchDisclosure('off');
      expect(disclosure.level).toBe('off');
      expect(disclosure.localFilteringApplied).toBe(false);
      expect(disclosure.summaryExplanation).toContain('turned off');
    });
  });

  describe('4. Mock Provider Parameter Passing & Execution', () => {
    it('passes safeSearch option and applies upstream filtering in mock provider', async () => {
      const fixtures: NormalizedSearchResult[] = [
        {
          title: 'Safe Technical Article',
          canonicalUrl: 'https://example.com/safe',
          snippet: 'Clean software article.',
          source: 'mock-provider',
          contentType: 'article',
        },
        {
          title: 'NSFW Adult Content Item',
          canonicalUrl: 'https://example.com/nsfw',
          snippet: 'Adult explicit item.',
          source: 'mock-provider',
          contentType: 'article',
        },
      ];

      const provider = new MockSearchProvider({ fixtures });
      const strictRes = await provider.search('test', { safeSearch: 'strict' });
      expect(strictRes.results.length).toBe(1);
      expect(strictRes.results[0]?.title).toBe('Safe Technical Article');

      const offRes = await provider.search('test', { safeSearch: 'off' });
      expect(offRes.results.length).toBe(2);
    });
  });
});
