import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  generateOpenSearchDescriptor,
  OPENSEARCH_DESCRIPTOR_MIME_TYPE,
  DEFAULT_DESCRIPTOR_CONFIG,
  createApiServer,
  ApiServer,
} from '../src/index.js';

describe('Phase 108 — Browser Search Descriptor (OpenSearch Description Document)', () => {
  let server: ApiServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = createApiServer({
      port: 0,
      host: '127.0.0.1',
    });
    const info = await server.start();
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('Descriptor XML Generation unit tests', () => {
    it('generates compliant XML with default options', () => {
      const xml = generateOpenSearchDescriptor('http://localhost:3000');
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"');
      expect(xml).toContain('<ShortName>OpenSearch Web</ShortName>');
      expect(xml).toContain('<Description>');
      expect(xml).toContain('template="http://localhost:3000/?q={searchTerms}"');
      expect(xml).toContain('type="text/html"');
      expect(xml).toContain('type="application/x-suggestions+json"');
      expect(xml).toContain('template="http://localhost:3000/api/v1/suggest?q={searchTerms}&amp;format=opensearch"');
    });

    it('enforces ShortName constraint (<= 16 characters)', () => {
      expect(DEFAULT_DESCRIPTOR_CONFIG.shortName.length).toBeLessThanOrEqual(16);
      const xml = generateOpenSearchDescriptor('https://search.example.com', {
        shortName: 'A Very Long Name Exceeding Sixteen Chars',
      });
      // Should truncate to 16 characters
      expect(xml).toContain('<ShortName>A Very Long Name</ShortName>');
    });

    it('handles custom base URLs and path prefixes safely', () => {
      const xml = generateOpenSearchDescriptor('https://sub.domain.org:8443/custom-path/');
      expect(xml).toContain('template="https://sub.domain.org:8443/custom-path/?q={searchTerms}"');
      expect(xml).toContain('template="https://sub.domain.org:8443/custom-path/api/v1/suggest?q={searchTerms}&amp;format=opensearch"');
    });

    it('escapes XML special characters in custom properties', () => {
      const xml = generateOpenSearchDescriptor('http://localhost:3000', {
        shortName: 'Search & Find',
        description: 'Fast <safe> & private "search"',
        tags: 'web & privacy <engine>',
      });
      expect(xml).toContain('<ShortName>Search &amp; Find</ShortName>');
      expect(xml).toContain('<Description>Fast &lt;safe&gt; &amp; private &quot;search&quot;</Description>');
      expect(xml).toContain('<Tags>web &amp; privacy &lt;engine&gt;</Tags>');
    });

    it('maintains distinct product identity from Amazon OpenSearch', () => {
      const xml = generateOpenSearchDescriptor('https://example.com');
      expect(xml).toContain('Not affiliated with Amazon Web Services or Amazon OpenSearch Service');
    });
  });

  describe('API Server HTTP Endpoint GET /opensearch.xml', () => {
    it('serves descriptor at /opensearch.xml with proper MIME type and cache header', async () => {
      const res = await fetch(`${baseUrl}/opensearch.xml`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain(OPENSEARCH_DESCRIPTOR_MIME_TYPE);
      expect(res.headers.get('cache-control')).toContain('public');
      
      const text = await res.text();
      expect(text).toContain('<OpenSearchDescription');
      expect(text).toContain(`<Url type="text/html" method="get" template="${baseUrl}/?q={searchTerms}"/>`);
    });

    it('serves descriptor at alias /opensearchdescription.xml', async () => {
      const res = await fetch(`${baseUrl}/opensearchdescription.xml`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain(OPENSEARCH_DESCRIPTOR_MIME_TYPE);
      const text = await res.text();
      expect(text).toContain('<OpenSearchDescription');
    });

    it('reflects request Host and Forwarded Proto for dynamic base path resolution', async () => {
      const res = await fetch(`${baseUrl}/opensearch.xml`, {
        headers: {
          'x-forwarded-host': 'custom-search.internal:9000',
          'x-forwarded-proto': 'https',
        },
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('template="https://custom-search.internal:9000/?q={searchTerms}"');
      expect(text).toContain('template="https://custom-search.internal:9000/api/v1/suggest?q={searchTerms}&amp;format=opensearch"');
    });
  });

  describe('OpenSearch Suggestions Endpoint integration', () => {
    it('returns OpenSearch 1.1 JSON format [query, [suggestions]] when format=opensearch is requested', async () => {
      const res = await fetch(`${baseUrl}/api/v1/suggest?q=test&format=opensearch`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/x-suggestions+json');
      
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(2);
      expect(data[0]).toBe('test');
      expect(Array.isArray(data[1])).toBe(true);
    });

    it('returns standard JSON object when format is omitted', async () => {
      const res = await fetch(`${baseUrl}/api/v1/suggest?q=test`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      
      const data = await res.json();
      expect(typeof data).toBe('object');
      expect(Array.isArray(data)).toBe(false);
      expect(data.query).toBe('test');
      expect(Array.isArray(data.suggestions)).toBe(true);
    });
  });

  describe('API Documentation autodiscovery link', () => {
    it('includes autodiscovery link in /docs HTML', async () => {
      const res = await fetch(`${baseUrl}/docs`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('rel="search"');
      expect(html).toContain('type="application/opensearchdescription+xml"');
      expect(html).toContain('href="/opensearch.xml"');
      expect(html).toContain('title="OpenSearch Web"');
    });
  });
});
