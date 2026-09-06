import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDocumentProcessor, createInvertedIndex } from '@opensearch/indexer';
import { createApiServer, ApiServer, getApiStatus } from '../src/index.js';

describe('Phase 16 & 17 — Search API Server & Endpoint Suite', () => {
  let server: ApiServer;
  let baseUrl: string;

  beforeAll(async () => {
    const index = createInvertedIndex();
    const processor = createDocumentProcessor();

    // Populate test corpus
    index.addDocument(
      processor.process({
        id: 'doc-search',
        url: 'https://opensearch.dev/docs/search',
        title: 'OpenSearch Search Engine Pipeline',
        headings: 'BM25 Ranking and Candidate Retrieval',
        description: 'Core retrieval and ranking algorithms for high throughput web search.',
        bodyText:
          'OpenSearch provides lexical ranking with BM25, exact phrase matching, and document storage persistence.',
        language: 'en',
      }),
    );

    index.addDocument(
      processor.process({
        id: 'doc-crawler',
        url: 'https://opensearch.dev/docs/crawler',
        title: 'Web Crawler Subsystem',
        headings: 'Robots.txt Policy and Rate Limiting',
        description: 'Polite autonomous crawler for web pages and sitemaps.',
        bodyText:
          'The crawler queues URLs, obeys robots.txt directives, and fetches HTML content safely with SSRF protection.',
        language: 'en',
      }),
    );

    index.addDocument(
      processor.process({
        id: 'doc-storage',
        url: 'https://opensearch.dev/docs/storage',
        title: 'Storage and Persistence Subsystem',
        headings: 'Document and URL Repositories',
        description: 'Embedded JSON storage with atomic updates and file locking.',
        bodyText:
          'Storage repository persists crawled documents, metadata, and index versions with ACID safety.',
        language: 'en',
      }),
    );

    // Start server with populated index on an ephemeral port
    server = createApiServer({ index });
    const info = await server.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('Server Lifecycle & Status', () => {
    it('returns system status matching Phase 17', () => {
      const status = getApiStatus();
      expect(status.name).toBe('OpenSearch');
      expect(status.version).toBe('1.0.0');
      expect(status.phase).toContain('Phase 17');
      expect(status.status).toBe('ok');
    });
  });

  describe('Health Check Endpoint (GET /health)', () => {
    it('returns 200 OK with system metrics and indexed document count', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.name).toBe('OpenSearch');
      expect(data.status).toBe('ok');
      expect(data.totalDocumentsIndexed).toBe(3);
      expect(data.routesAvailable).toContain('GET /api/v1/search');
      expect(data.routesAvailable).toContain('POST /api/v1/search');
    });
  });

  describe('Search Endpoint (GET /api/v1/search)', () => {
    it('returns relevant search results for valid query', async () => {
      const res = await fetch(`${baseUrl}/api/v1/search?q=search+pipeline`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const data = await res.json();
      expect(data.query.raw).toBe('search pipeline');
      expect(data.results.length).toBeGreaterThanOrEqual(1);
      expect(data.results[0].documentId).toBe('doc-search');
      expect(data.results[0].title).toBe('OpenSearch Search Engine Pipeline');
      expect(data.results[0].highlightedTitle).toContain('<mark>Search</mark>');
      expect(data.results[0].highlightedTitle).toContain('<mark>Pipeline</mark>');
      expect(data.results[0].highlightedSnippet).toBeDefined();
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.totalHits).toBeGreaterThanOrEqual(1);
      expect(data.meta.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns empty results safely for empty query string', async () => {
      const res = await fetch(`${baseUrl}/api/v1/search?q=`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.results).toEqual([]);
      expect(data.meta.totalHits).toBe(0);
      expect(data.pagination.totalPages).toBe(1);
    });

    it('returns empty results safely when no terms match', async () => {
      const res = await fetch(`${baseUrl}/api/v1/search?q=nonexistenttermxyz`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.results).toEqual([]);
      expect(data.meta.totalHits).toBe(0);
    });

    it('handles multi-page pagination correctly', async () => {
      const res = await fetch(`${baseUrl}/api/v1/search?q=subsystem&page=1&pageSize=1`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.results.length).toBe(1);
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.pageSize).toBe(1);
      expect(data.pagination.totalHits).toBe(2);
      expect(data.pagination.totalPages).toBe(2);
      expect(data.pagination.hasNextPage).toBe(true);
      expect(data.pagination.hasPrevPage).toBe(false);
    });

    it('validates page number constraints and returns 400 Bad Request on invalid page', async () => {
      const res = await fetch(`${baseUrl}/api/v1/search?q=search&page=0`);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('INVALID_PAGE_NUMBER');
    });

    it('validates pageSize constraints and returns 400 Bad Request on excessive pageSize', async () => {
      const res = await fetch(`${baseUrl}/api/v1/search?q=search&pageSize=500`);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('INVALID_PAGE_SIZE');
    });
  });

  describe('Search Endpoint (POST /api/v1/search)', () => {
    it('executes search queries provided via JSON request body', async () => {
      const res = await fetch(`${baseUrl}/api/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: 'crawler robots.txt',
          page: 1,
          pageSize: 5,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.results.length).toBeGreaterThanOrEqual(1);
      expect(data.results[0].documentId).toBe('doc-crawler');
      expect(data.results[0].domain).toBe('opensearch.dev');
    });

    it('returns 400 Bad Request on malformed JSON payload in POST', async () => {
      const res = await fetch(`${baseUrl}/api/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ malformed json: true ',
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('INVALID_JSON');
    });
  });
});
