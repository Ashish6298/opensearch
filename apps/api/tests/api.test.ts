import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDocumentProcessor, createInvertedIndex } from '@opensearch/indexer';
import {
  createApiServer,
  ApiServer,
  getApiStatus,
  createRateLimiter,
  anonymizeIp,
} from '../src/index.js';

describe('Phase 16, 17 & 18 — Search API Server, Endpoints & Security Suite', () => {
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
    server = createApiServer({
      index,
      rateLimitPerMinute: 100,
      searchTimeoutMs: 5000,
      corsOrigin: 'http://localhost:5173',
    });
    const info = await server.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('Server Lifecycle & Status', () => {
    it('returns system status matching Phase 18', () => {
      const status = getApiStatus();
      expect(status.name).toBe('OpenSearch');
      expect(status.version).toBe('1.0.0');
      expect(status.phase).toContain('Phase 18');
      expect(status.status).toBe('ok');
    });
  });

  describe('Security Headers & CORS Policies', () => {
    it('sets standard defensive security headers on all responses', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);

      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('x-xss-protection')).toBe('1; mode=block');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('content-security-policy')).toBe(
        "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      );
    });

    it('handles CORS OPTIONS preflight requests correctly with 204 No Content', async () => {
      const res = await fetch(`${baseUrl}/api/v1/search`, {
        method: 'OPTIONS',
      });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
      expect(res.headers.get('access-control-allow-methods')).toContain('GET');
      expect(res.headers.get('access-control-allow-methods')).toContain('POST');
      expect(res.headers.get('access-control-allow-headers')).toContain('Content-Type');
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
      expect(res.headers.get('x-ratelimit-limit')).toBeDefined();
      expect(res.headers.get('x-ratelimit-remaining')).toBeDefined();

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

    it('rejects oversized search query with 400 Bad Request', async () => {
      const longQuery = 'a'.repeat(250);
      const res = await fetch(`${baseUrl}/api/v1/search?q=${longQuery}`);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error.code).toBe('QUERY_TOO_LONG');
      expect(data.error.category).toBe('VALIDATION');
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

    it('rejects oversized request body with 413 Payload Too Large', async () => {
      const largePayload = JSON.stringify({
        q: 'test',
        extra: 'x'.repeat(70 * 1024), // > 64KB
      });

      const res = await fetch(`${baseUrl}/api/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: largePayload,
      });

      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('Rate Limiting & Abuse Prevention', () => {
    it('limits excessive requests with 429 Too Many Requests and Retry-After header', async () => {
      const rateLimitedServer = createApiServer({
        rateLimitPerMinute: 3,
      });
      const info = await rateLimitedServer.start(0, '127.0.0.1');
      const limitedBaseUrl = `http://127.0.0.1:${info.port}`;

      try {
        // Request 1: OK (remaining: 2)
        const res1 = await fetch(`${limitedBaseUrl}/health`);
        expect(res1.status).toBe(200);
        expect(res1.headers.get('x-ratelimit-remaining')).toBe('2');

        // Request 2: OK (remaining: 1)
        const res2 = await fetch(`${limitedBaseUrl}/health`);
        expect(res2.status).toBe(200);
        expect(res2.headers.get('x-ratelimit-remaining')).toBe('1');

        // Request 3: OK (remaining: 0)
        const res3 = await fetch(`${limitedBaseUrl}/health`);
        expect(res3.status).toBe(200);
        expect(res3.headers.get('x-ratelimit-remaining')).toBe('0');

        // Request 4: Exceeded -> 429
        const res4 = await fetch(`${limitedBaseUrl}/health`);
        expect(res4.status).toBe(429);
        expect(res4.headers.get('retry-after')).toBeDefined();
        const data4 = await res4.json();
        expect(data4.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(data4.error.category).toBe('SECURITY');
      } finally {
        await rateLimitedServer.stop();
      }
    });

    it('MemoryRateLimiter works stand-alone and manages tokens correctly', () => {
      const limiter = createRateLimiter({
        maxRequests: 2,
        windowMs: 5000,
      });

      const r1 = limiter.consume('1.2.3.4');
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(1);

      const r2 = limiter.consume('1.2.3.4');
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(0);

      const r3 = limiter.consume('1.2.3.4');
      expect(r3.allowed).toBe(false);
      expect(r3.remaining).toBe(0);
      expect(r3.retryAfterSeconds).toBeGreaterThan(0);

      limiter.destroy();
    });
  });

  describe('Timeout Controls', () => {
    it('enforces request timeout for slow operations with 504 Gateway Timeout', async () => {
      const timeoutServer = createApiServer({
        searchTimeoutMs: 50,
      });

      // Add a slow route
      timeoutServer.getRouter().get('/slow', async (_req, _res) => {
        await new Promise(r => setTimeout(r, 150));
      });

      const info = await timeoutServer.start(0, '127.0.0.1');
      const timeoutBaseUrl = `http://127.0.0.1:${info.port}`;

      try {
        const res = await fetch(`${timeoutBaseUrl}/slow`);
        expect(res.status).toBe(504);
        const data = await res.json();
        expect(data.error.code).toBe('REQUEST_TIMEOUT');
        expect(data.error.category).toBe('TIMEOUT');
      } finally {
        await timeoutServer.stop();
      }
    });
  });

  describe('Privacy & Information Security', () => {
    it('anonymizes IPv4 and IPv6 client addresses for logging', () => {
      expect(anonymizeIp('192.168.1.42')).toBe('192.168.1.0');
      expect(anonymizeIp('10.0.0.254')).toBe('10.0.0.0');
      expect(anonymizeIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:0db8:85a3::');
      expect(anonymizeIp('')).toBe('0.0.0.0');
    });

    it('ensures safe error responses never expose internal stack traces or secrets', async () => {
      const res = await fetch(`${baseUrl}/nonexistent-path-abc`);
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.error.message).toBeDefined();
      expect(data.error.code).toBe('NOT_FOUND_ERROR');
      expect(data.error.stack).toBeUndefined();
      expect(data.stack).toBeUndefined();
    });
  });
});
