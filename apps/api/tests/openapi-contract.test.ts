import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { ApiServer, createApiServer, generateOpenApiSpec } from '../src/index.js';
import { createDocumentProcessor, createInvertedIndex } from '@opensearch/indexer';
import { loadConfig } from '@opensearch/shared';

describe('Phase 107 — API Contract & OpenAPI Consistency Suite', () => {
  let server: ApiServer;
  let baseUrl: string;
  let capturedLogs: Array<{ level: string; msg: string; context?: Record<string, unknown> }> = [];

  beforeAll(async () => {
    const config = loadConfig();
    const index = createInvertedIndex();
    const processor = createDocumentProcessor();

    index.addDocument(
      processor.process({
        id: 'doc-contract-test',
        url: 'https://opensearch.org/docs/api',
        title: 'OpenSearch API Contract Documentation',
        headings: 'OpenAPI 3.1.0 Specification & Consistency Testing',
        description: 'Comprehensive contract verification for REST API endpoints and schemas.',
        bodyText:
          'OpenSearch provides consistent OpenAPI schemas, zero telemetry, and rigorous validation for search queries.',
        language: 'en',
      }),
    );

    capturedLogs = [];
    const mockLogger = {
      debug: (msg: string, ctx?: Record<string, unknown>) => capturedLogs.push({ level: 'debug', msg, context: ctx }),
      info: (msg: string, ctx?: Record<string, unknown>) => capturedLogs.push({ level: 'info', msg, context: ctx }),
      warn: (msg: string, ctx?: Record<string, unknown>) => capturedLogs.push({ level: 'warn', msg, context: ctx }),
      error: (msg: string, ctx?: Record<string, unknown>) => capturedLogs.push({ level: 'error', msg, context: ctx }),
    };

    server = createApiServer({
      config,
      index,
      logger: mockLogger as any,
      rateLimitPerMinute: 60,
    });

    const info = await server.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  function httpRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; data: T }> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const reqHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers,
      };

      const req = http.request(
        url,
        {
          method,
          headers: reqHeaders,
        },
        res => {
          let raw = '';
          res.on('data', chunk => (raw += chunk));
          res.on('end', () => {
            try {
              resolve({
                statusCode: res.statusCode || 500,
                headers: res.headers,
                data: raw ? JSON.parse(raw) : null,
              });
            } catch {
              resolve({
                statusCode: res.statusCode || 500,
                headers: res.headers,
                data: raw as unknown as T,
              });
            }
          });
          res.on('error', reject);
        },
      );

      if (body !== undefined) {
        if (typeof body === 'string') {
          req.write(body);
        } else {
          req.write(JSON.stringify(body));
        }
      }
      req.end();
    });
  }

  describe('OpenAPI 3.1.0 Specification Completeness & Path Audit', () => {
    it('specifies all endpoints from the API router in the OpenAPI specification paths', () => {
      const spec = generateOpenApiSpec() as any;
      expect(spec.openapi).toBe('3.1.0');
      expect(spec.paths).toBeDefined();

      const requiredPaths = [
        '/',
        '/health',
        '/api/v1/status',
        '/api/v1/search',
        '/api/v1/search/stream',
        '/api/v1/suggest',
        '/api/v1/lenses',
        '/api/v1/lenses/{id}',
        '/api/v1/lenses/validate',
        '/api/v1/lenses/preview',
        '/api/v1/feedback',
        '/api/v1/feedback/privacy',
        '/api/v1/feedback/review',
        '/api/v1/feedback/review/import',
        '/api/v1/feedback/review/stats',
        '/api/v1/feedback/review/{id}',
        '/api/v1/feedback/review/{id}/approve-case',
        '/api/v1/feedback/review/ranking-check',
        '/api/v1/openapi.json',
      ];

      for (const expectedPath of requiredPaths) {
        expect(spec.paths[expectedPath], `Missing OpenAPI path: ${expectedPath}`).toBeDefined();
      }
    });

    it('contains all core schemas in components.schemas matching domain contracts', () => {
      const spec = generateOpenApiSpec() as any;
      const schemas = spec.components?.schemas;
      expect(schemas).toBeDefined();

      expect(schemas.SearchApiResponse).toBeDefined();
      expect(schemas.SearchResultItem).toBeDefined();
      expect(schemas.PaginationMeta).toBeDefined();
      expect(schemas.PrivacyReceipt).toBeDefined();
      expect(schemas.FocusLensProfile).toBeDefined();
      expect(schemas.ErrorResponse).toBeDefined();
      expect(schemas.InstantAnswerResult).toBeDefined();
      expect(schemas.QuickAnswerPayload).toBeDefined();
      expect(schemas.BangShortcutResult).toBeDefined();
      expect(schemas.TypoSuggestion).toBeDefined();
      expect(schemas.SuggestApiResponse).toBeDefined();
      expect(schemas.HealthCheckResponse).toBeDefined();
    });
  });

  describe('Search API Response Contract & Provenance Verification', () => {
    it('returns a SearchApiResponse matching schema contracts with result provenance and privacy mode', async () => {
      const res = await httpRequest<any>('GET', '/api/v1/search?q=contract+verification&mode=local-only');
      expect(res.statusCode).toBe(200);

      const body = res.data;
      // 1. Query metadata
      expect(body.query).toBeDefined();
      expect(body.query.raw).toBe('contract verification');
      expect(body.query.normalized).toBeDefined();
      expect(body.query.terms).toBeInstanceOf(Array);

      // 2. Results array & provenance
      expect(body.results).toBeInstanceOf(Array);
      expect(body.results.length).toBeGreaterThan(0);
      const item = body.results[0];
      expect(item.id || item.documentId).toBeDefined();
      expect(item.url).toBeDefined();
      expect(item.title).toBeDefined();
      expect(item.snippet).toBeDefined();
      expect(item.score).toBeGreaterThan(0);
      expect(item.source).toBeDefined(); // Provenance field: 'local_index'
      expect(['local-index', 'local_index', 'google_fallback', 'duckduckgo_fallback', 'external']).toContain(item.source);

      // 3. Pagination structure
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.pageSize).toBeDefined();
      expect(body.pagination.totalHits).toBeGreaterThan(0);
      expect(body.pagination.totalPages).toBeGreaterThanOrEqual(1);

      // 4. Privacy Receipt telemetry
      expect(body.privacyReceipt).toBeDefined();
      expect(body.privacyReceipt.schemaVersion).toBe('1.0.0');
      expect(body.privacyReceipt.mode).toBe('local-only');
      expect(body.privacyReceipt.receiptId).toBeDefined();
      expect(body.privacyReceipt.networkDispatch).toBeDefined();
      expect(body.privacyReceipt.hostTelemetry).toBeDefined();
      expect(body.privacyReceipt.summary).toBeDefined();

      // 5. Meta tags
      expect(body.meta).toBeDefined();
      expect(body.meta.localOnly).toBe(true);
      expect(body.meta.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns ranking explanation factor breakdown when explain=true', async () => {
      const res = await httpRequest<any>('GET', '/api/v1/search?q=contract&explain=true');
      expect(res.statusCode).toBe(200);
      expect(res.data.meta.explainPlan).toBe(true);

      const firstItem = res.data.results[0];
      expect(firstItem).toBeDefined();
      expect(firstItem.explanation).toBeDefined();
    });
  });

  describe('Input Validation & Error Responses (400, 413, 429, 404)', () => {
    it('predictably rejects invalid pagination page < 1 with 400 Bad Request and standardized ErrorResponse', async () => {
      const res = await httpRequest<any>('GET', '/api/v1/search?q=test&page=0');
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBeDefined();
      expect(res.data.error.code).toBe('INVALID_PAGE_NUMBER');
      expect(res.data.error.statusCode).toBe(400);
    });

    it('predictably rejects invalid pageSize out of bounds with 400 Bad Request', async () => {
      const res = await httpRequest<any>('GET', '/api/v1/search?q=test&pageSize=9999');
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBeDefined();
      expect(res.data.error.code).toBe('INVALID_PAGE_SIZE');
    });

    it('predictably rejects search queries exceeding maximum allowed character length with 400 Bad Request', async () => {
      const oversizedQuery = 'a'.repeat(501);
      const res = await httpRequest<any>('GET', `/api/v1/search?q=${oversizedQuery}`);
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBeDefined();
      expect(res.data.error.code).toBe('QUERY_TOO_LONG');
    });

    it('predictably rejects malformed JSON payloads with 400 Bad Request and INVALID_JSON code', async () => {
      const res = await httpRequest<any>('POST', '/api/v1/search', '{"q": malformed JSON here');
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBeDefined();
      expect(res.data.error.code).toBe('INVALID_JSON');
    });

    it('predictably rejects oversized payloads exceeding body limit with 413 Payload Too Large', async () => {
      // Create a payload exceeding the 1MB default bodyLimitBytes
      const largeContent = 'x'.repeat(1024 * 1024 + 100);
      const res = await httpRequest<any>('POST', '/api/v1/search', JSON.stringify({ q: 'test', junk: largeContent }));
      expect(res.statusCode).toBe(413);
      expect(res.data.error).toBeDefined();
      expect(res.data.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('predictably rejects unmatched routes with 404 Not Found and NOT_FOUND_ERROR code', async () => {
      const res = await httpRequest<any>('GET', '/api/v1/unknown-endpoint');
      expect(res.statusCode).toBe(404);
      expect(res.data.error).toBeDefined();
      expect(res.data.error.code).toBe('NOT_FOUND_ERROR');
    });
  });

  describe('Privacy & Security: No Logging of Queries or Credentials', () => {
    it('does not log raw query parameters or authorization credentials in structured access logs', async () => {
      capturedLogs.length = 0; // Clear existing logs

      await httpRequest<any>(
        'GET',
        '/api/v1/search?q=confidential+medical+condition',
        undefined,
        {
          Authorization: 'Bearer sensitive-token-xyz-12345',
          Cookie: 'session=secret-user-cookie',
        },
      );

      // Find HTTP access logs
      const accessLogs = capturedLogs.filter(l => l.msg === 'HTTP Request handled');
      expect(accessLogs.length).toBeGreaterThanOrEqual(1);

      for (const log of accessLogs) {
        const logStr = JSON.stringify(log);
        // Ensure credentials are never logged
        expect(logStr).not.toContain('sensitive-token-xyz-12345');
        expect(logStr).not.toContain('secret-user-cookie');
        // Ensure path in access log is pathname only without query params
        expect(log.context?.path).toBe('/api/v1/search');
        expect(log.context?.path).not.toContain('confidential+medical+condition');
      }
    });
  });

  describe('Server-Sent Events (SSE) Streaming Contract (/api/v1/search/stream)', () => {
    it('opens an SSE stream with text/event-stream content type and emits typed events', async () => {
      const events: Array<{ event: string; data: string }> = await new Promise((resolve, reject) => {
        const url = new URL('/api/v1/search/stream?q=contract', baseUrl);
        const req = http.request(url, { method: 'GET' }, res => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toContain('text/event-stream');

          const collectedEvents: Array<{ event: string; data: string }> = [];
          let buffer = '';

          res.on('data', chunk => {
            buffer += chunk.toString('utf-8');
            const parts = buffer.split('\n\n');
            buffer = parts.pop() || '';

            for (const part of parts) {
              if (!part.trim()) continue;
              const lines = part.split('\n');
              let eventName = '';
              let data = '';
              for (const line of lines) {
                if (line.startsWith('event:')) {
                  eventName = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                  data = line.slice(5).trim();
                }
              }
              if (eventName || data) {
                collectedEvents.push({ event: eventName, data });
              }
            }
          });

          res.on('end', () => resolve(collectedEvents));
          res.on('error', reject);
        });
        req.end();
      });

      expect(events.length).toBeGreaterThanOrEqual(1);
      // At least the completion event 'done' or 'results' must have arrived
      const eventNames = events.map(e => e.event);
      expect(eventNames).toContain('done');

      const doneEvent = events.find(e => e.event === 'done');
      expect(doneEvent).toBeDefined();
      const doneData = JSON.parse(doneEvent!.data);
      expect(doneData.durationMs).toBeGreaterThanOrEqual(0);
      expect(doneData.totalHits).toBeGreaterThanOrEqual(1);
    });
  });
});
