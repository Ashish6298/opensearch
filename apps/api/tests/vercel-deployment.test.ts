import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

describe('Vercel Serverless Function Deployment Suite', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const handlerPath = path.resolve(process.cwd(), 'api', 'index.js');
    const { default: handler } = await import(pathToFileURL(handlerPath).href);

    server = http.createServer((req, res) => {
      handler(req, res).catch((err: Error) => {
        res.statusCode = 500;
        res.end(err.message);
      });
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>(resolve => {
      server.close(() => resolve());
    });
  });

  it('serves the Terminal UI HTML shell at root GET / with security headers', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');

    const html = await res.text();
    expect(html).toContain('OpenSearch');
    expect(html).toContain('id="search-form"');
    expect(html).toContain('var(--bg-terminal)');
    expect(html).toContain('window.__OPENSEARCH_API_URL__');
  });

  it('serves static assets /style.css and /app.js', async () => {
    const cssRes = await fetch(`${baseUrl}/style.css`);
    expect(cssRes.status).toBe(200);
    expect(cssRes.headers.get('content-type')).toContain('text/css');
    const css = await cssRes.text();
    expect(css).toContain('--bg-terminal');

    const jsRes = await fetch(`${baseUrl}/app.js`);
    expect(jsRes.status).toBe(200);
    expect(jsRes.headers.get('content-type')).toContain('javascript');
    const js = await jsRes.text();
    expect(js).toContain('performSearch');
  });

  it('serves static pages /about and /privacy', async () => {
    const aboutRes = await fetch(`${baseUrl}/about`);
    expect(aboutRes.status).toBe(200);
    const aboutHtml = await aboutRes.text();
    expect(aboutHtml).toContain('About OpenSearch');

    const privacyRes = await fetch(`${baseUrl}/privacy`);
    expect(privacyRes.status).toBe(200);
    const privacyHtml = await privacyRes.text();
    expect(privacyHtml).toContain('Zero-Tracking, Zero-Profiling');
  });

  it('serves healthy API status at /health with warm in-memory index', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const data = (await res.json()) as {
      status: string;
      totalDocumentsIndexed: number;
      components: { index: { status: string } };
    };
    expect(data.status).toBe('ok');
    expect(data.totalDocumentsIndexed).toBeGreaterThan(100);
    expect(data.components.index.status).toBe('ok');
  });

  it('serves /api/v1/search queries matching seed corpus documents', async () => {
    const res = await fetch(`${baseUrl}/api/v1/search?q=typescript`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      query: { raw: string };
      results: Array<{ title: string; url: string }>;
      meta: { totalHits: number };
    };
    expect(data.query.raw).toBe('typescript');
    expect(data.meta.totalHits).toBeGreaterThan(0);
    expect(data.results.length).toBeGreaterThan(0);

    const tsResult = data.results.find(
      r => r.title.toLowerCase().includes('typescript') || r.url.includes('typescriptlang.org'),
    );
    expect(tsResult).toBeDefined();
  });
});
