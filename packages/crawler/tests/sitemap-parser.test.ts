import { describe, it, expect } from 'vitest';
import * as zlib from 'node:zlib';
import {
  SitemapParser,
  createSitemapParser,
  SitemapService,
  createSitemapService,
  HttpFetcher,
  FetchResult,
  RobotsPolicyEvaluator,
} from '../src/index.js';

describe('Phase 41 — Automated Sitemap.xml Discovery & Ingestion Suite', () => {
  const parser = createSitemapParser();

  describe('XML <urlset> Parsing', () => {
    it('parses standard XML sitemaps with loc, lastmod, changefreq, priority', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2026-09-01T12:00:00Z</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://example.com/docs/guide</loc>
    <lastmod>2026-08-15</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;

      const result = parser.parse(xml, 'https://example.com/sitemap.xml');
      expect(result.type).toBe('urlset');
      expect(result.urls.length).toBe(2);
      expect(result.totalCount).toBe(2);

      expect(result.urls[0].loc).toBe('https://example.com/');
      expect(result.urls[0].lastmod).toBe('2026-09-01T12:00:00Z');
      expect(result.urls[0].changefreq).toBe('daily');
      expect(result.urls[0].priority).toBe(1.0);

      expect(result.urls[1].loc).toBe('https://example.com/docs/guide');
      expect(result.urls[1].lastmod).toBe('2026-08-15');
      expect(result.urls[1].changefreq).toBe('weekly');
      expect(result.urls[1].priority).toBe(0.8);
    });

    it('handles CDATA blocks and XML entities cleanly', () => {
      const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc><![CDATA[https://example.com/search?q=foo&bar=1]]></loc>
    <lastmod><![CDATA[2026-09-10]]></lastmod>
  </url>
  <url>
    <loc>https://example.com/view?item=a&amp;section=b</loc>
  </url>
</urlset>`;

      const result = parser.parse(xml);
      expect(result.urls.length).toBe(2);
      expect(result.urls[0].loc).toBe('https://example.com/search?bar=1&q=foo');
      expect(result.urls[0].lastmod).toBe('2026-09-10');
      expect(result.urls[1].loc).toBe('https://example.com/view?item=a&section=b');
    });

    it('gracefully handles missing tags and invalid URLs', () => {
      const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>not-a-valid-url</loc>
  </url>
  <url>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://example.com/valid-page</loc>
  </url>
</urlset>`;

      const result = parser.parse(xml);
      expect(result.urls.length).toBe(1);
      expect(result.urls[0].loc).toBe('https://example.com/valid-page');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('XML <sitemapindex> Parsing', () => {
    it('parses sitemap indexes into child sitemap lists', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap-main.xml</loc>
    <lastmod>2026-09-01T00:00:00Z</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemap-articles.xml.gz</loc>
    <lastmod>2026-09-02T00:00:00Z</lastmod>
  </sitemap>
</sitemapindex>`;

      const result = parser.parse(xml);
      expect(result.type).toBe('sitemapindex');
      expect(result.sitemaps.length).toBe(2);
      expect(result.totalCount).toBe(2);
      expect(result.sitemaps[0].loc).toBe('https://example.com/sitemap-main.xml');
      expect(result.sitemaps[0].lastmod).toBe('2026-09-01T00:00:00Z');
      expect(result.sitemaps[1].loc).toBe('https://example.com/sitemap-articles.xml.gz');
    });
  });

  describe('Text Sitemaps (.txt)', () => {
    it('parses line-delimited plain text sitemaps', () => {
      const text = `# Comment line
https://example.com/home
https://example.com/pricing
# Another comment
https://example.com/contact
`;

      const result = parser.parse(text);
      expect(result.type).toBe('text');
      expect(result.urls.length).toBe(3);
      expect(result.urls[0].loc).toBe('https://example.com/home');
      expect(result.urls[1].loc).toBe('https://example.com/pricing');
      expect(result.urls[2].loc).toBe('https://example.com/contact');
    });
  });

  describe('Gzip-Compressed Sitemaps (.xml.gz)', () => {
    it('decompresses and parses gzipped XML sitemaps', () => {
      const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/compressed-page</loc>
    <priority>0.9</priority>
  </url>
</urlset>`;

      const gzippedBuffer = zlib.gzipSync(Buffer.from(xml, 'utf-8'));
      const result = parser.parse(gzippedBuffer);
      expect(result.type).toBe('urlset');
      expect(result.urls.length).toBe(1);
      expect(result.urls[0].loc).toBe('https://example.com/compressed-page');
      expect(result.urls[0].priority).toBe(0.9);
    });
  });

  describe('SitemapService Auto-Discovery & Ingestion', () => {
    it('fetches sitemap and recurses through sitemapindex with robots.txt evaluation', async () => {
      const sitemapIndexXml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sub-sitemap.xml</loc>
  </sitemap>
</sitemapindex>`;

      const subSitemapXml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/allowed-page</loc></url>
  <url><loc>https://example.com/disallowed-page</loc></url>
</urlset>`;

      const mockFetcher: HttpFetcher = {
        fetch: async target => {
          if (target.url === 'https://example.com/sitemap.xml') {
            return {
              ok: true,
              statusCode: 200,
              finalUrl: target.url,
              contentType: 'application/xml',
              contentLength: sitemapIndexXml.length,
              body: sitemapIndexXml,
              headers: { 'content-type': 'application/xml' },
              redirectChain: [],
              redirectCount: 0,
              durationMs: 5,
            };
          } else if (target.url === 'https://example.com/sub-sitemap.xml') {
            return {
              ok: true,
              statusCode: 200,
              finalUrl: target.url,
              contentType: 'application/xml',
              contentLength: subSitemapXml.length,
              body: subSitemapXml,
              headers: { 'content-type': 'application/xml' },
              redirectChain: [],
              redirectCount: 0,
              durationMs: 5,
            };
          }
          return {
            ok: false,
            code: 'HTTP_404',
            statusCode: 404,
            message: 'Not found',
            redirectChain: [],
            redirectCount: 0,
            durationMs: 5,
          };
        },
      };

      const mockRobots: RobotsPolicyEvaluator = {
        isUrlAllowed: async url => {
          if (url.includes('disallowed-page')) {
            return {
              allowed: false,
              reason: 'DISALLOWED_BY_RULE',
              origin: 'https://example.com',
              cached: true,
            };
          }
          return {
            allowed: true,
            reason: 'ALLOWED_BY_RULE',
            origin: 'https://example.com',
            cached: true,
          };
        },
        getCrawlDelayMs: async () => undefined,
        clearCache: () => {},
      };

      const service = createSitemapService({
        fetcher: mockFetcher,
        robotsEvaluator: mockRobots,
      });

      const summary = await service.ingestDomainSitemaps('https://example.com');
      expect(summary.domain).toBe('example.com');
      expect(summary.sitemapsParsed).toBe(2);
      expect(summary.urlsExtracted).toBe(2);
      expect(summary.disallowedCount).toBe(1);
      expect(summary.sitemapsDiscovered).toContain('https://example.com/sub-sitemap.xml');
    });
  });
});
