import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createWebServer, WebServer } from '../src/index.js';

describe('Phase 108 — Web App Browser Search Descriptor and Guide', () => {
  let server: WebServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = createWebServer({
      apiUrl: 'http://localhost:3000/api/v1/search',
    });
    const info = await server.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('HTML Autodiscovery Header', () => {
    it('serves <link rel="search"> in the HTML head', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('rel="search"');
      expect(html).toContain('type="application/opensearchdescription+xml"');
      expect(html).toContain('title="OpenSearch Web"');
      expect(html).toContain('href="/opensearch.xml"');
    });

    it('contains link to /browser-search guide in the page footer', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('href="/browser-search"');
      expect(html).toContain('browser search');
    });
  });

  describe('Web Server /opensearch.xml endpoint', () => {
    it('serves descriptor at /opensearch.xml with application/opensearchdescription+xml', async () => {
      const res = await fetch(`${baseUrl}/opensearch.xml`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/opensearchdescription+xml');
      expect(res.headers.get('cache-control')).toContain('public');
      const text = await res.text();
      expect(text).toContain('<OpenSearchDescription');
      expect(text).toContain('<ShortName>OpenSearch Web</ShortName>');
      expect(text).toContain(`template="${baseUrl}/?q={searchTerms}"`);
    });

    it('serves descriptor at alias /opensearchdescription.xml', async () => {
      const res = await fetch(`${baseUrl}/opensearchdescription.xml`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/opensearchdescription+xml');
      const text = await res.text();
      expect(text).toContain('<OpenSearchDescription');
    });

    it('resolves dynamic host when X-Forwarded-Proto and X-Forwarded-Host headers are provided', async () => {
      const res = await fetch(`${baseUrl}/opensearch.xml`, {
        headers: {
          'x-forwarded-host': 'mysearch.org',
          'x-forwarded-proto': 'https',
        },
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('template="https://mysearch.org/?q={searchTerms}"');
    });
  });

  describe('Browser Search Setup Guide /browser-search', () => {
    it('serves comprehensive instructions for major browsers', async () => {
      const res = await fetch(`${baseUrl}/browser-search`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      
      const html = await res.text();
      expect(html).toContain('Add OpenSearch Web to Your Browser');
      expect(html).toContain('Mozilla Firefox');
      expect(html).toContain('Google Chrome');
      expect(html).toContain('Brave Browser');
      expect(html).toContain('Microsoft Edge');
      expect(html).toContain('Apple Safari');
      expect(html).toContain('Vivaldi');
      expect(html).toContain('Distinct Product Identity');
      expect(html).toContain('Not affiliated with Amazon Web Services or Amazon OpenSearch Service');
    });
  });
});
