import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDocumentProcessor, createInvertedIndex } from '@opensearch/indexer';
import { createApiServer, ApiServer, generateOpenApiSpec, generateDocsHtml } from '../src/index.js';
import { createWebServer, WebServer } from '../../web/src/server.js';

describe('Phase 43 — OpenAPI 3.1.0 Specification & Interactive Sandbox (/docs)', () => {
  let apiServer: ApiServer;
  let webServer: WebServer;
  let apiBaseUrl: string;
  let webBaseUrl: string;

  beforeAll(async () => {
    const index = createInvertedIndex();
    const processor = createDocumentProcessor();

    index.addDocument(
      processor.process({
        id: 'doc-api',
        url: 'https://opensearch.dev/docs/api',
        title: 'OpenSearch REST API & Developer Docs',
        headings: 'OpenAPI 3.1.0 Specification and Interactive Sandbox',
        description: 'Complete zero-dependency developer documentation and OpenAPI specification.',
        bodyText:
          'OpenSearch exposes an interactive developer portal and OpenAPI 3.1 schema for lexical BM25 search.',
        language: 'en',
      }),
    );

    apiServer = createApiServer({
      index,
      rateLimitPerMinute: 100,
    });
    const apiInfo = await apiServer.start(0, '127.0.0.1');
    apiBaseUrl = `http://127.0.0.1:${apiInfo.port}`;

    webServer = createWebServer({
      apiUrl: `${apiBaseUrl}/api/v1/search`,
    });
    const webInfo = await webServer.start(0, '127.0.0.1');
    webBaseUrl = `http://127.0.0.1:${webInfo.port}`;
  });

  afterAll(async () => {
    await apiServer.stop();
    await webServer.stop();
  });

  it('generateOpenApiSpec returns valid OpenAPI 3.1.0 document structure', () => {
    const spec = generateOpenApiSpec() as any;
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info).toBeDefined();
    expect(spec.info.title).toContain('REST API');
    expect(spec.info.version).toBeDefined();
    expect(spec.paths).toBeDefined();
    expect(spec.paths['/api/v1/search']).toBeDefined();
    expect(spec.paths['/api/v1/search'].get).toBeDefined();
    expect(spec.paths['/api/v1/search'].post).toBeDefined();
    expect(spec.paths['/api/v1/suggest']).toBeDefined();
    expect(spec.paths['/health']).toBeDefined();
    expect(spec.paths['/api/v1/status']).toBeDefined();
    expect(spec.paths['/api/v1/openapi.json']).toBeDefined();
    expect(spec.components?.schemas?.SearchApiResponse).toBeDefined();
    expect(spec.components?.schemas?.SearchResultItem).toBeDefined();
    expect(spec.components?.schemas?.HealthCheckResponse).toBeDefined();
  });

  it('GET /api/v1/openapi.json returns 200 with OpenAPI 3.1.0 JSON payload', async () => {
    const res = await fetch(`${apiBaseUrl}/api/v1/openapi.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const json = (await res.json()) as any;
    expect(json.openapi).toBe('3.1.0');
    expect(json.paths['/api/v1/search'].get.parameters.length).toBeGreaterThanOrEqual(5);
  });

  it('GET /openapi.json alias returns 200 with OpenAPI JSON', async () => {
    const res = await fetch(`${apiBaseUrl}/openapi.json`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.openapi).toBe('3.1.0');
  });

  it('GET /docs on API server renders interactive documentation shell', async () => {
    const res = await fetch(`${apiBaseUrl}/docs`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const html = await res.text();
    expect(html).toContain('Developer API Reference & Sandbox');
    expect(html).toContain('input-search-q');
    expect(html).toContain('btn-run-search');
    expect(html).toContain('search-response-body');
    expect(html).toContain('search-code-snippet');
    expect(html).toContain('data-lang="curl"');
    expect(html).toContain('data-lang="js"');
    expect(html).toContain('data-lang="python"');
    expect(html).toContain('data-lang="go"');
    expect(html).toContain('data-lang="rust"');
  });

  it('GET /docs on Web server renders documentation shell with correct API url', async () => {
    const res = await fetch(`${webBaseUrl}/docs`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const html = await res.text();
    expect(html).toContain('OpenAPI 3.1.0');
    expect(html).toContain('/api/v1/openapi.json');
  });

  it('GET /api/v1/openapi.json on Web server returns OpenAPI spec', async () => {
    const res = await fetch(`${webBaseUrl}/api/v1/openapi.json`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.openapi).toBe('3.1.0');
  });

  it('GET / discovery root links to documentation and openapi specification', async () => {
    const res = await fetch(`${apiBaseUrl}/`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.documentation).toBe('/docs');
    expect(json.openapi).toBe('/api/v1/openapi.json');
    expect(json.endpoints.docs).toBe('/docs');
    expect(json.endpoints.openapi).toBe('/api/v1/openapi.json');
  });

  it('GET /health lists /docs and /api/v1/openapi.json in routesAvailable', async () => {
    const res = await fetch(`${apiBaseUrl}/health`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.routesAvailable).toContain('GET /docs');
    expect(json.routesAvailable).toContain('GET /api/v1/openapi.json');
    expect(json.phase).toContain('Milestone 14');
  });

  it('Search endpoint responds successfully to live queries tested via sandbox format', async () => {
    const res = await fetch(`${apiBaseUrl}/api/v1/search?q=developer+docs&limit=5`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.results).toBeDefined();
    expect(json.results.length).toBeGreaterThan(0);
    expect(json.results[0].title).toContain('OpenSearch REST API');
  });
});
