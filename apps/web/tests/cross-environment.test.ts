import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as http from 'node:http';
import { loadConfig } from '@opensearch/shared';
import { createStorageAdapter, StorageAdapter } from '@opensearch/storage';
import { createIndexBuilder } from '@opensearch/indexer';
import { createApiServer, ApiServer } from '../../api/src/server.js';
import { createWebServer, WebServer } from '../src/server.js';
import { generateHtmlShell } from '../src/html-template.js';

describe('Phase 32 — Cross-Environment & User-Facing Testing Suite', () => {
  let tempDir: string;
  let storageDir: string;
  let indexDir: string;
  let storage: StorageAdapter;
  let apiServer: ApiServer | null = null;
  let webServer: WebServer | null = null;
  let apiPort: number;
  let webPort: number;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'opensearch-p32-test-'));
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
      CORS_ORIGIN: 'http://127.0.0.1',
    });

    storage = createStorageAdapter({ config });
    await storage.initialize();

    // Populate a realistic corpus across multiple categories with multi-page hits
    const documents = [
      {
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        urlHash: 'hash-js-docs',
        title: 'JavaScript Reference — MDN Web Docs',
        description:
          'Standard documentation for modern ECMAScript and JavaScript programming language.',
        headings: 'JavaScript ECMAScript Functions Objects Arrays',
        bodyText:
          'JavaScript is a lightweight interpreted programming language with first-class functions.',
      },
      {
        url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP',
        urlHash: 'hash-http-docs',
        title: 'HTTP Protocol Guide — MDN',
        description:
          'Comprehensive guide covering HTTP requests, responses, status codes, and TLS headers.',
        headings: 'HTTP Protocol HTTPS Security Status Headers',
        bodyText:
          'The Hypertext Transfer Protocol is an application-layer protocol for transmitting web resources.',
      },
      {
        url: 'https://www.typescriptlang.org/docs/handbook/intro.html',
        urlHash: 'hash-ts-handbook',
        title: 'The TypeScript Handbook',
        description:
          'Comprehensive guide to TypeScript syntax, static typing, and compiler configuration.',
        headings: 'TypeScript Handbook Static Types Compiler JavaScript',
        bodyText: 'TypeScript extends JavaScript by adding static type definitions.',
      },
      {
        url: 'https://en.wikipedia.org/wiki/Search_engine',
        urlHash: 'hash-wiki-search',
        title: 'Search Engine — Wikipedia',
        description:
          'Information retrieval software system designed to search web pages and documents.',
        headings: 'Search Engine Web Crawlers Inverted Index Ranking Algorithm',
        bodyText:
          'Search engines crawl the web, construct inverted indices, and rank candidate documents.',
      },
      {
        url: 'https://en.wikipedia.org/wiki/Inverted_index',
        urlHash: 'hash-wiki-index',
        title: 'Inverted Index — Wikipedia',
        description:
          'An inverted index is a database index storing a mapping from words to their document locations.',
        headings: 'Inverted Index Postings Dictionary Search Engine',
        bodyText:
          'In computer science, an inverted index is the core data structure used in modern search engines.',
      },
      {
        url: 'https://en.wikipedia.org/wiki/Okapi_BM25',
        urlHash: 'hash-wiki-bm25',
        title: 'Okapi BM25 Ranking Algorithm — Wikipedia',
        description:
          'Probabilistic relevance ranking function widely used in information retrieval engines.',
        headings: 'Okapi BM25 Ranking Relevance Term Frequency Document Frequency',
        bodyText:
          'BM25 is a bag-of-words retrieval function that ranks a set of documents based on the query terms.',
      },
    ];

    for (const doc of documents) {
      await storage.documents.create({
        url: doc.url,
        urlHash: doc.urlHash,
        title: doc.title,
        description: doc.description,
        headings: doc.headings,
        bodyText: doc.bodyText,
        language: 'en',
        contentType: 'text/html',
        contentLength: doc.bodyText.length + 100,
        httpStatus: 200,
        outboundLinks: [],
      });
    }

    const builder = createIndexBuilder({ config, storage });
    const buildRes = await builder.build();
    expect(buildRes.status).toBe('success');

    const activeIndex = builder.getActiveIndex();
    expect(activeIndex).not.toBeNull();

    apiServer = createApiServer({
      config,
      index: activeIndex!,
      corsOrigin: '*',
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

  function requestHttp(
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

  it('verifies desktop browser shell rendering and interactive elements', async () => {
    const res = await requestHttp(webPort, '/', {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<!DOCTYPE html>');
    expect(res.body).toContain('id="search-input"');
    expect(res.body).toContain('id="search-submit-btn"');
    expect(res.body).toContain('id="search-clear-btn"');
    expect(res.body).toContain('id="results-area"');
    expect(res.body).toContain('id="pagination-area"');
    expect(res.body).toContain('id="loading-indicator"');
    expect(res.body).toContain('id="empty-state"');
    expect(res.body).toContain('id="error-state"');
  });

  it('verifies mobile browser viewport meta tag and responsive styling', async () => {
    const res = await requestHttp(webPort, '/', {
      headers: {
        'user-agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    );
    expect(res.body).toContain('@media (max-width: 640px)');
    expect(res.body).toContain('@media (max-width: 380px)');
  });

  it('verifies empty search queries return fast empty results structure without errors', async () => {
    const res = await requestHttp(apiPort, '/api/v1/search?q=');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.query.raw).toBe('');
    expect(body.results).toEqual([]);
    expect(body.meta.totalHits).toBe(0);
  });

  it('verifies long search queries within allowable bounds execute cleanly', async () => {
    const longQuery =
      'modern ECMAScript web specifications and comprehensive JavaScript standard libraries';
    const res = await requestHttp(apiPort, `/api/v1/search?q=${encodeURIComponent(longQuery)}`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.meta.totalHits).toBeGreaterThan(0);
  });

  it('verifies oversized search queries exceed limit gracefully with 400 error', async () => {
    const oversizedQuery = 'a'.repeat(250);
    const res = await requestHttp(
      apiPort,
      `/api/v1/search?q=${encodeURIComponent(oversizedQuery)}`,
    );
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('QUERY_TOO_LONG');
  });

  it('verifies no-result queries return 0 hits with valid search payload for UI empty state', async () => {
    const noResultQuery = 'xyznonexistenttermquantumflux12345';
    const res = await requestHttp(apiPort, `/api/v1/search?q=${encodeURIComponent(noResultQuery)}`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toEqual([]);
    expect(body.meta.totalHits).toBe(0);
  });

  it('verifies common searches retrieve accurate BM25 ranked documents', async () => {
    const res = await requestHttp(apiPort, '/api/v1/search?q=javascript+programming');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0].title).toContain('JavaScript');
  });

  it('verifies multi-page pagination navigation across results', async () => {
    // Request page 1 with pageSize 2
    const page1Res = await requestHttp(
      apiPort,
      '/api/v1/search?q=wikipedia+index+ranking&page=1&pageSize=2',
    );
    expect(page1Res.statusCode).toBe(200);
    const page1Data = JSON.parse(page1Res.body);
    expect(page1Data.pagination.page).toBe(1);
    expect(page1Data.pagination.pageSize).toBe(2);
    expect(page1Data.pagination.hasNextPage).toBe(true);
    expect(page1Data.results.length).toBe(2);

    // Request page 2 with pageSize 2
    const page2Res = await requestHttp(
      apiPort,
      '/api/v1/search?q=wikipedia+index+ranking&page=2&pageSize=2',
    );
    expect(page2Res.statusCode).toBe(200);
    const page2Data = JSON.parse(page2Res.body);
    expect(page2Data.pagination.page).toBe(2);
    expect(page2Data.pagination.hasPrevPage).toBe(true);
    expect(page2Data.results.length).toBeGreaterThan(0);

    // Ensure documents on page 1 and page 2 are distinct
    const page1Ids = page1Data.results.map((r: { documentId: string }) => r.documentId);
    const page2Ids = page2Data.results.map((r: { documentId: string }) => r.documentId);
    const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
    expect(overlap.length).toBe(0);
  });

  it('verifies external result links contain noopener noreferrer protection', () => {
    const htmlShell = generateHtmlShell({
      apiUrl: 'http://localhost:3000/api/v1/search',
    });
    expect(htmlShell).toContain('rel="noopener noreferrer"');
  });

  it('verifies API failure behavior and error handling boundaries', async () => {
    // Stop API server to simulate downstream service outage
    await apiServer!.stop();

    // Querying API port directly results in ECONNREFUSED
    await expect(requestHttp(apiPort, '/api/v1/search?q=test')).rejects.toThrow();

    // Web server remains healthy and serves UI with fallback capability
    const webRes = await requestHttp(webPort, '/');
    expect(webRes.statusCode).toBe(200);
    expect(webRes.body).toContain('OpenSearch');
  });
});
