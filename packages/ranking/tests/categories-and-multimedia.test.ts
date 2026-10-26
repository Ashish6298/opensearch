/**
 * @opensearch/ranking — Phase 80: All, Images, and News Categories Test Suite
 *
 * Verifies:
 * 1. Category routing across ProviderRegistry (All, Images/multimedia, News)
 * 2. WikimediaImageProvider contract, safe execution, and failure isolation
 * 3. Image URL safety validation and dangerous protocol rejection (javascript:, file:, etc.)
 * 4. Image attribution and license preservation (CC BY-SA, Public Domain, artist, dimensions)
 * 5. News source integrity and authentic publication timestamps (zero fabrication)
 * 6. News recency vs. staleness temporal evaluation
 * 7. Non-relabeling invariants: general results are never misclassified as images or news
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProviderRegistry,
  createDefaultProviderRegistry,
  MockSearchProvider,
  validateSafeImageUrl,
  validateImageAttribution,
  isImageResult,
  isNewsResult,
  evaluateNewsRecency,
  WikimediaImageProvider,
  WIKIMEDIA_IMAGE_PROVIDER_METADATA,
  convertToSearchResultItem,
  NormalizedSearchResult,
} from '../src/index.js';

describe('Phase 80 — All, Images, and News Categories Suite', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = createDefaultProviderRegistry();
  });

  describe('1. Category Routing & Provider Selection', () => {
    it('registers default providers covering general, news, and multimedia categories', () => {
      const allProviders = registry.getAllProviders();
      expect(allProviders.length).toBeGreaterThanOrEqual(3);

      const providerIds = allProviders.map(p => p.metadata.id);
      expect(providerIds).toContain('wikimedia');
      expect(providerIds).toContain('hackernews');
      expect(providerIds).toContain('wikimedia-images');
    });

    it('routes "multimedia" (Images) category strictly to image providers', () => {
      const imageProviders = registry.getProvidersForCategories(['multimedia']);
      expect(imageProviders.length).toBeGreaterThanOrEqual(1);
      imageProviders.forEach(p => {
        expect(p.metadata.supportedCategories).toContain('multimedia');
      });
    });

    it('routes "news" category strictly to news-capable providers', () => {
      const newsProviders = registry.getProvidersForCategories(['news']);
      expect(newsProviders.length).toBeGreaterThanOrEqual(1);
      newsProviders.forEach(p => {
        expect(p.metadata.supportedCategories).toContain('news');
      });
    });

    it('routes general "all" search to combined general providers', () => {
      const generalProviders = registry.getProvidersForCategories(['general']);
      expect(generalProviders.length).toBeGreaterThanOrEqual(2);
      const ids = generalProviders.map(p => p.metadata.id);
      expect(ids).toContain('wikimedia');
      expect(ids).toContain('hackernews');
    });
  });

  describe('2. Image URL Safety & Protocol Validation', () => {
    it('accepts valid HTTPS and HTTP image URLs', () => {
      expect(validateSafeImageUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Logo.png/320px-Logo.png'))
        .toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Logo.png/320px-Logo.png');
      expect(validateSafeImageUrl('http://example.com/images/photo.jpg'))
        .toBe('http://example.com/images/photo.jpg');
    });

    it('strictly rejects javascript: and script execution vectors', () => {
      expect(validateSafeImageUrl('javascript:alert(1)')).toBeNull();
      expect(validateSafeImageUrl('JAVASCRIPT:/*injection*/alert(document.cookie)')).toBeNull();
      expect(validateSafeImageUrl('javascript:window.location="https://attacker.com"')).toBeNull();
    });

    it('rejects dangerous and local filesystem protocols (file:, vbscript:, ftp:, blob:)', () => {
      expect(validateSafeImageUrl('file:///C:/Windows/System32/cmd.exe')).toBeNull();
      expect(validateSafeImageUrl('file:///etc/passwd')).toBeNull();
      expect(validateSafeImageUrl('vbscript:msgbox("pwnd")')).toBeNull();
      expect(validateSafeImageUrl('ftp://ftp.example.com/image.png')).toBeNull();
      expect(validateSafeImageUrl('blob:http://example.com/uuid')).toBeNull();
      expect(validateSafeImageUrl('about:blank')).toBeNull();
    });

    it('rejects control characters, empty inputs, and malformed strings', () => {
      expect(validateSafeImageUrl('')).toBeNull();
      expect(validateSafeImageUrl('   ')).toBeNull();
      expect(validateSafeImageUrl(null)).toBeNull();
      expect(validateSafeImageUrl(undefined)).toBeNull();
      expect(validateSafeImageUrl('https://example.com/image\x00.jpg')).toBeNull();
      expect(validateSafeImageUrl('not a url')).toBeNull();
    });
  });

  describe('3. Image Attribution & License Enforcement', () => {
    it('validates and preserves image attribution and license metadata', () => {
      const rawAttribution = 'Jane Doe · Wikimedia Commons (CC BY-SA 4.0)';
      expect(validateImageAttribution(rawAttribution)).toBe('Jane Doe · Wikimedia Commons (CC BY-SA 4.0)');

      expect(validateImageAttribution(null, 'Wikimedia Commons')).toBe('Source: Wikimedia Commons');
      expect(validateImageAttribution('', '')).toBeNull();
    });

    it('converts normalized image results with safe thumbnail, dimensions, and license', () => {
      const normImage: NormalizedSearchResult = {
        title: 'OpenSearch Architecture Diagram',
        canonicalUrl: 'https://commons.wikimedia.org/wiki/File:Opensearch_arch.svg',
        snippet: 'Vector architecture diagram of distributed search engine components.',
        source: 'wikimedia-images',
        contentType: 'multimedia',
        attribution: 'OpenSearch Authors · Wikimedia Commons (CC BY-SA 4.0)',
        thumbnail: {
          url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/arch.png',
          width: 800,
          height: 600,
        },
        metadata: {
          license: 'CC BY-SA 4.0',
          artist: 'OpenSearch Authors',
          width: 800,
          height: 600,
        },
      };

      const item = convertToSearchResultItem(normImage, 1);
      expect(item.thumbnailUrl).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/arch.png');
      expect(item.imageWidth).toBe(800);
      expect(item.imageHeight).toBe(600);
      expect(item.attribution).toContain('CC BY-SA 4.0');
      expect(item.license).toBe('CC BY-SA 4.0');
      expect(item.contentType).toBe('multimedia');
    });

    it('strips unsafe thumbnails during result item conversion', () => {
      const unsafeNormImage: NormalizedSearchResult = {
        title: 'Malicious Image Item',
        canonicalUrl: 'https://example.com/bad',
        snippet: 'Bad item',
        source: 'test',
        contentType: 'multimedia',
        thumbnail: {
          url: 'javascript:alert(document.cookie)',
        },
      };

      const item = convertToSearchResultItem(unsafeNormImage, 1);
      expect(item.thumbnailUrl).toBeUndefined();
    });
  });

  describe('4. News Recency & Publication Timestamp Authenticity', () => {
    it('accurately evaluates recent news (< 24 hours)', () => {
      const now = new Date('2026-10-26T12:00:00Z').getTime();
      const twoHoursAgo = new Date('2026-10-26T10:00:00Z').toISOString();

      const recency = evaluateNewsRecency(twoHoursAgo, now);
      expect(recency).not.toBeNull();
      expect(recency?.isRecent).toBe(true);
      expect(recency?.isStale).toBe(false);
      expect(recency?.label).toBe('2h ago');
      expect(recency?.formattedDate).toBe('2026-10-26');
    });

    it('accurately evaluates recent news within one week (1 - 7 days)', () => {
      const now = new Date('2026-10-26T12:00:00Z').getTime();
      const fourDaysAgo = new Date('2026-10-22T12:00:00Z').toISOString();

      const recency = evaluateNewsRecency(fourDaysAgo, now);
      expect(recency).not.toBeNull();
      expect(recency?.isRecent).toBe(true);
      expect(recency?.isStale).toBe(false);
      expect(recency?.label).toBe('4d ago');
    });

    it('distinguishes stale news from recent information (> 30 days and > 1 year)', () => {
      const now = new Date('2026-10-26T12:00:00Z').getTime();
      const twoMonthsAgo = new Date('2026-08-20T12:00:00Z').toISOString();
      const twoYearsAgo = new Date('2024-05-15T12:00:00Z').toISOString();

      const staleMid = evaluateNewsRecency(twoMonthsAgo, now);
      expect(staleMid).not.toBeNull();
      expect(staleMid?.isRecent).toBe(false);
      expect(staleMid?.isStale).toBe(true);
      expect(staleMid?.label).toBe('2mo ago');

      const staleOld = evaluateNewsRecency(twoYearsAgo, now);
      expect(staleOld).not.toBeNull();
      expect(staleOld?.isRecent).toBe(false);
      expect(staleOld?.isStale).toBe(true);
      expect(staleOld?.label).toBe('2y ago');
    });

    it('never fabricates publication timestamps when date is missing or invalid', () => {
      expect(evaluateNewsRecency(undefined)).toBeNull();
      expect(evaluateNewsRecency('')).toBeNull();
      expect(evaluateNewsRecency('invalid-date')).toBeNull();

      const noDateResult: NormalizedSearchResult = {
        title: 'Undated Generic Document',
        canonicalUrl: 'https://example.com/doc',
        snippet: 'No date provided by source.',
        source: 'local-index',
        contentType: 'documentation',
      };

      const item = convertToSearchResultItem(noDateResult, 1);
      expect(item.publishedAt).toBeUndefined();
      expect(item.recencyLabel).toBeUndefined();
      expect(item.isStale).toBeUndefined();
    });
  });

  describe('5. Non-Relabeling Classification Invariants', () => {
    it('does NOT relabel general text documents as images', () => {
      const textDoc = {
        title: 'General Technical RFC Specification',
        url: 'https://example.com/rfc',
        contentType: 'documentation',
      };
      expect(isImageResult(textDoc)).toBe(false);

      const encyclopediaEntry = {
        title: 'Wikipedia Article',
        url: 'https://en.wikipedia.org/wiki/Algorithm',
        contentType: 'encyclopedia',
      };
      expect(isImageResult(encyclopediaEntry)).toBe(false);
    });

    it('legitimately identifies genuine image results', () => {
      const validImage = {
        title: 'Portrait photo',
        thumbnailUrl: 'https://upload.wikimedia.org/thumb.jpg',
        contentType: 'multimedia',
        source: 'wikimedia-images',
      };
      expect(isImageResult(validImage)).toBe(true);
    });

    it('does NOT relabel general documentation or encyclopedias as news', () => {
      const generalDoc = {
        source: 'local-index',
        contentType: 'documentation',
        url: 'https://docs.example.com/guide',
      };
      expect(isNewsResult(generalDoc)).toBe(false);

      const wikiPage = {
        source: 'wikimedia',
        contentType: 'encyclopedia',
        url: 'https://en.wikipedia.org/wiki/Search_engine',
      };
      expect(isNewsResult(wikiPage)).toBe(false);
    });

    it('legitimately identifies genuine news articles', () => {
      const hnStory = {
        source: 'hackernews',
        contentType: 'article',
        url: 'https://news.ycombinator.com/item?id=40001',
      };
      expect(isNewsResult(hnStory)).toBe(true);

      const newsArticle = {
        source: 'external',
        contentType: 'article',
        url: 'https://techcrunch.com/2026/10/26/open-search-release',
      };
      expect(isNewsResult(newsArticle)).toBe(true);
    });
  });

  describe('6. WikimediaImageProvider Metadata & Failure Isolation', () => {
    it('conforms to Phase 80 specification with strict privacy controls', () => {
      const provider = new WikimediaImageProvider();
      expect(provider.metadata.id).toBe('wikimedia-images');
      expect(provider.metadata.displayName).toBe('Wikimedia Commons (Images)');
      expect(provider.metadata.supportedCategories).toEqual(['multimedia']);
      expect(provider.metadata.attribution.license).toContain('CC BY-SA');
      expect(provider.metadata.privacy.forwardClientIp).toBe(false);
      expect(provider.metadata.privacy.forwardCookies).toBe(false);
    });

    it('handles empty query gracefully with zero network overhead', async () => {
      const provider = new WikimediaImageProvider();
      const res = await provider.search('');
      expect(res.results).toEqual([]);
      expect(res.totalHits).toBe(0);
    });

    it('isolates upstream network failures without throwing unhandled exceptions', async () => {
      const provider = new WikimediaImageProvider({
        endpoint: 'http://127.0.0.1:59999/non-existent-api',
        timeoutMs: 100,
      });

      const res = await provider.search('test query', { timeoutMs: 100 });
      expect(res.results).toEqual([]);
      expect(res.error).toBeDefined();
    });
  });
});
