import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as http from 'node:http';
import { loadConfig } from '@opensearch/shared';
import { createStorageAdapter, StorageAdapter } from '@opensearch/storage';
import { createIndexBuilder } from '@opensearch/indexer';
import { createApiServer, ApiServer } from '../src/server.js';
import { createWebServer, WebServer } from '../../web/src/server.js';

describe('Phase 31 — Production Deployment Integration Suite', () => {
  let tempDir: string;
  let storageDir: string;
  let indexDir: string;
  let storage: StorageAdapter;
  let apiServer: ApiServer | null = null;
  let webServer: WebServer | null = null;
  let apiPort: number;
  let webPort: number;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'opensearch-p31-test-'));
    storageDir = join(tempDir, 'storage');
    indexDir = join(tempDir, 'index');

    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '0',
      HOST: '127.0.0.1',
      STORAGE_DIR: storageDir,
      INDEX_DIR: indexDir,
      LOG_LEVEL: 'silent',
      LOG_FORMAT: 'json',
      CORS_ORIGIN: 'https://search.example.com',
    });

    storage = createStorageAdapter({ config });
    await storage.initialize();

    // Populate realistic seed corpus
    await storage.documents.create({
      url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP',
      urlHash: 'hash-mdn-http',
      title: 'MDN Web Docs: HTTP Overview',
      description: 'Hypertext Transfer Protocol overview and HTTPS security headers guide.',
      headings: 'HTTP Protocol HTTPS Security HSTS Strict Transport',
      bodyText: 'HTTP is an extensible protocol providing web capabilities and TLS security.',
      language: 'en',
      contentType: 'text/html',
      contentLength: 500,
      httpStatus: 200,
      outboundLinks: [],
    });

    await storage.documents.create({
      url: 'https://en.wikipedia.org/wiki/Search_engine',
      urlHash: 'hash-wiki-search',
      title: 'Search Engine — Wikipedia',
      description:
        'A search engine is an information retrieval software system designed to search web pages.',
      headings: 'Search Engine Web Crawlers Inverted Index Ranking',
      bodyText: 'Web search engines crawl the public internet and build inverted index structures.',
      language: 'en',
      contentType: 'text/html',
      contentLength: 600,
      httpStatus: 200,
      outboundLinks: [],
    });

    const builder = createIndexBuilder({ config, storage });
    const buildRes = await builder.build();
    expect(buildRes.status).toBe('success');

    const activeIndex = builder.getActiveIndex();
    expect(activeIndex).not.toBeNull();

    apiServer = createApiServer({
      config,
      index: activeIndex!,
      corsOrigin: 'https://search.example.com',
    });
    const apiAddress = await apiServer.start(0, '127.0.0.1');
    apiPort = apiAddress.port;

    webServer = createWebServer({
      config,
      apiUrl: `http://127.0.0.1:${apiPort}/api/v1/search`,
    });
    const webAddress = await webServer.start(0, '127.0.0.1');
    webPort = webAddress.port;
  });

  afterEach(async () => {
    if (apiServer) {
      await apiServer.stop();
      apiServer = null;
    }
    if (webServer) {
      await webServer.stop();
      webServer = null;
    }
    await storage.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeRequest(
    port: number,
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {},
  ): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path,
          method: options.method || 'GET',
          headers: options.headers || {},
        },
        res => {
          let data = '';
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode || 500,
              headers: res.headers,
              body: data,
            });
          });
        },
      );
      req.on('error', reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  it('verifies public web frontend responds with semantic HTML shell and HTTPS security headers', async () => {
    const res = await makeRequest(webPort, '/', {
      headers: {
        'x-forwarded-proto': 'https',
        host: 'search.example.com',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).toContain('OpenSearch');
    expect(res.body).toContain('<!DOCTYPE html>');
  });

  it('verifies public API responds to health check with component readiness', async () => {
    const res = await makeRequest(apiPort, '/health', {
      headers: {
        'x-forwarded-proto': 'https',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.components.index.status).toBe('ok');
    expect(body.totalDocumentsIndexed).toBe(2);
    expect(body.components.memory.status).toBe('ok');
    expect(res.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
  });

  it('verifies search execution works over public API with ranking and pagination', async () => {
    const res = await makeRequest(apiPort, '/api/v1/search?q=http+protocol', {
      headers: {
        'x-forwarded-proto': 'https',
        origin: 'https://search.example.com',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://search.example.com');
    const body = JSON.parse(res.body);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0].title).toContain('MDN');
    expect(body.meta.totalHits).toBeGreaterThan(0);
  });

  it('verifies production CORS protection and preflight handling', async () => {
    const preflight = await makeRequest(apiPort, '/api/v1/search', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://search.example.com',
        'access-control-request-method': 'POST',
      },
    });

    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('https://search.example.com');
  });

  it('verifies production error boundary and graceful degradation on invalid parameters', async () => {
    const res = await makeRequest(apiPort, '/api/v1/search?page=-5', {
      headers: {
        'x-forwarded-proto': 'https',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('INVALID_PAGE_NUMBER');
  });

  it('verifies privacy policy route is accessible on public web server', async () => {
    const res = await makeRequest(webPort, '/privacy', {
      headers: {
        'x-forwarded-proto': 'https',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Zero-Tracking, Zero-Profiling, and Data-Minimization Policy');
  });
});
