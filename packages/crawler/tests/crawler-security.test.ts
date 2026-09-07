import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'node:http';
import { createLogger, CRAWLER_LIMITS } from '@opensearch/shared';
import {
  NodeFetcher,
  FETCH_ERROR_CODE,
  CrawlerSecurityValidator,
  createCrawlerSecurityValidator,
  createHtmlParser,
} from '../src/index.js';

const silentLogger = createLogger('@opensearch/crawler:security-test', {
  level: 'silent',
  format: 'json',
});

describe('Phase 25 — Crawler Security Hardening Suite', () => {
  let mockServer: Server;
  let mockPort: number;

  beforeAll(async () => {
    mockServer = createServer((req, res) => {
      const url = req.url || '/';

      // 1. Endless redirect loop: /loop-a -> /loop-b -> /loop-a
      if (url === '/loop-a') {
        res.writeHead(302, { Location: `http://127.0.0.1:${mockPort}/loop-b` });
        res.end();
        return;
      }
      if (url === '/loop-b') {
        res.writeHead(302, { Location: `http://127.0.0.1:${mockPort}/loop-a` });
        res.end();
        return;
      }

      // 2. Oversized payload bomb (3MB of text)
      if (url === '/oversized') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        const chunk = 'A'.repeat(64 * 1024);
        for (let i = 0; i < 50; i++) {
          res.write(chunk);
        }
        res.end();
        return;
      }

      // 3. Unsupported Content-Type (binary PDF)
      if (url === '/binary.pdf') {
        res.writeHead(200, { 'Content-Type': 'application/pdf' });
        res.end('%PDF-1.5 binary content...');
        return;
      }

      // 4. Broken / Malformed HTML containing control chars and unclosed tags
      if (url === '/malformed') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<!DOCTYPE html><html><head><title>Broken\x00\x01\x02 Page</title><body><h1>Unclosed H1<p>Malformed text with \uFFFD replacement chars and broken <<<<<>>>>> markup.',
        );
        return;
      }

      // 5. Hang / Slow response for timeout testing
      if (url === '/slow') {
        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Too late</h1>');
          }
        }, 500);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><body><h1>Safe Page</h1></body></html>');
    });

    await new Promise<void>(resolve => {
      mockServer.listen(0, '127.0.0.1', () => {
        mockPort = (mockServer.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (mockServer) {
      await new Promise(resolve => mockServer.close(() => resolve(undefined)));
    }
  });

  describe('1. Scheme & Target Validation', () => {
    const validator = createCrawlerSecurityValidator();

    it('rejects disallowed non-HTTP schemes (ftp, file, gopher, javascript, data)', async () => {
      const schemes = [
        'ftp://example.com/file.txt',
        'file:///etc/passwd',
        'gopher://gopher.example.com',
        'javascript:alert(1)',
        'data:text/html,<h1>test</h1>',
      ];

      for (const uri of schemes) {
        const result = await validator.validateTargetUrl(uri);
        expect(result.allowed).toBe(false);
        expect(result.code).toMatch(/DISALLOWED_SCHEME|INVALID_URL|INVALID_TARGET/);
      }
    });

    it('permits valid http and https public schemes', async () => {
      const resultHttp = await validator.validateTargetUrl('http://example.com/page');
      expect(resultHttp.allowed).toBe(true);

      const resultHttps = await validator.validateTargetUrl('https://example.com/page');
      expect(resultHttps.allowed).toBe(true);
    });
  });

  describe('2. Private Network & SSRF Rejection', () => {
    const validator = createCrawlerSecurityValidator();

    it('rejects loopback, private RFC-1918, and link-local addresses', async () => {
      const privateTargets = [
        'http://127.0.0.1/status',
        'http://localhost:3000/',
        'http://10.1.2.3/admin',
        'http://192.168.1.1/router',
        'http://172.16.0.5/',
        'http://169.254.169.254/latest/meta-data/',
        'http://internal-db.corp/query',
      ];

      for (const target of privateTargets) {
        const result = await validator.validateTargetUrl(target);
        expect(result.allowed).toBe(false);
        expect(result.code).toBe('SSRF_REJECTED');
      }
    });
  });

  describe('3. Response-Size Limit Enforcement', () => {
    it('aborts response streaming and returns CONTENT_SIZE_EXCEEDED when maxPageBytes exceeded', async () => {
      const fetcher = new NodeFetcher({
        logger: silentLogger,
        maxPageBytes: 64 * 1024, // 64 KB limit
      });

      process.env.OPENSEARCH_ALLOW_PRIVATE_URLS = 'true';
      const result = await fetcher.fetch({ url: `http://127.0.0.1:${mockPort}/oversized` });
      delete process.env.OPENSEARCH_ALLOW_PRIVATE_URLS;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(FETCH_ERROR_CODE.CONTENT_SIZE_EXCEEDED);
        expect(result.retryable).toBe(false);
      }
    });
  });

  describe('4. Redirect Limits & Circular Loop Detection', () => {
    it('stops redirect loops and exhausts redirect limit cleanly', async () => {
      const fetcher = new NodeFetcher({
        logger: silentLogger,
        maxRedirects: 3,
      });

      process.env.OPENSEARCH_ALLOW_PRIVATE_URLS = 'true';
      const result = await fetcher.fetch({ url: `http://127.0.0.1:${mockPort}/loop-a` });
      delete process.env.OPENSEARCH_ALLOW_PRIVATE_URLS;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(FETCH_ERROR_CODE.REDIRECT_FAILURE);
        expect(result.redirectCount).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('5. Content-Type Restrictions', () => {
    it('rejects unsupported binary MIME types (application/pdf)', async () => {
      const fetcher = new NodeFetcher({
        logger: silentLogger,
      });

      process.env.OPENSEARCH_ALLOW_PRIVATE_URLS = 'true';
      const result = await fetcher.fetch({ url: `http://127.0.0.1:${mockPort}/binary.pdf` });
      delete process.env.OPENSEARCH_ALLOW_PRIVATE_URLS;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(FETCH_ERROR_CODE.UNSUPPORTED_CONTENT_TYPE);
        expect(result.retryable).toBe(false);
      }
    });
  });

  describe('6. Timeout Enforcement', () => {
    it('aborts slow requests after configured timeoutMs with TIMEOUT error code', async () => {
      const fetcher = new NodeFetcher({
        logger: silentLogger,
        timeoutMs: 100, // 100ms timeout
        maxRetries: 0,
      });

      process.env.OPENSEARCH_ALLOW_PRIVATE_URLS = 'true';
      const result = await fetcher.fetch({ url: `http://127.0.0.1:${mockPort}/slow` });
      delete process.env.OPENSEARCH_ALLOW_PRIVATE_URLS;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(FETCH_ERROR_CODE.TIMEOUT);
      }
    });
  });

  describe('7. Malformed Input Resilience', () => {
    it('sanitizes control characters and successfully extracts content from broken markup', () => {
      const parser = createHtmlParser();
      const validator = createCrawlerSecurityValidator();

      const rawMalformed = 'Broken\x00\x01\x02 Text \uFFFD Extra';
      const sanitized = validator.sanitizeMalformedText(rawMalformed);
      expect(sanitized).toBe('Broken Text   Extra');

      const parsedDoc = parser.parse(
        '<!DOCTYPE html><html><head><title>Malformed \x00 Title</title></head><body><h1>Unclosed H1<p>Valid text with <a href="/valid">link</a>',
        'https://example.com/page',
      );

      expect(parsedDoc.title).toContain('Malformed');
      expect(parsedDoc.bodyText).toContain('Valid text');
      expect(parsedDoc.discoveredUrls).toContain('https://example.com/valid');
    });
  });
});
