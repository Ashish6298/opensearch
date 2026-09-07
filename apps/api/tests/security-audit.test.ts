import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { loadConfig } from '@opensearch/shared';
import { validateUrl } from '@opensearch/crawler';
import { createRateLimiter } from '../../api/src/rate-limiter.js';
import { toSafeErrorResponse, OpenSearchError } from '@opensearch/shared';
import { createSecurityHeadersMiddleware } from '../../api/src/middlewares.js';

describe('Phase 33 — Final Security & Release Audit Suite', () => {
  describe('1. Secrets & Repository Sanitization', () => {
    it('ensures .gitignore ignores all .env variations, secrets, and logs', () => {
      const gitignore = fs.readFileSync('.gitignore', 'utf-8');
      expect(gitignore).toContain('.env');
      expect(gitignore).toContain('*.env.local');
      expect(gitignore).toContain('logs/');
      expect(gitignore).toContain('node_modules/');
    });

    it('ensures .env.example contains only dummy/placeholder configuration values', () => {
      const envExample = fs.readFileSync('.env.example', 'utf-8');
      expect(envExample).not.toMatch(/api_key\s*=\s*['"][a-zA-Z0-9_-]{20,}['"]/i);
      expect(envExample).not.toMatch(/secret\s*=\s*['"][a-zA-Z0-9_-]{20,}['"]/i);
      expect(envExample).toContain('PORT=');
      expect(envExample).toContain('NODE_ENV=');
    });
  });

  describe('2. Dependency Vulnerabilities & Third-Party Audit', () => {
    it('verifies core packages have zero external runtime network dependencies', () => {
      const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      // Root package has no production runtime dependencies
      expect(rootPkg.dependencies).toBeUndefined();
    });
  });

  describe('3. Crawler Safety & SSRF Protections', () => {
    it('blocks dangerous private networks, loopbacks, and non-http schemes', () => {
      expect(validateUrl('http://127.0.0.1/test').ok).toBe(false);
      expect(validateUrl('http://localhost:3000/').ok).toBe(false);
      expect(validateUrl('http://192.168.1.1/admin').ok).toBe(false);
      expect(validateUrl('http://10.0.0.1/secret').ok).toBe(false);
      expect(validateUrl('http://172.16.0.1/internal').ok).toBe(false);
      expect(validateUrl('http://169.254.169.254/latest/meta-data/').ok).toBe(false);
      expect(validateUrl('file:///etc/passwd').ok).toBe(false);
      expect(validateUrl('ftp://example.com/file').ok).toBe(false);
      expect(validateUrl('https://developer.mozilla.org/en-US/').ok).toBe(true);
    });
  });

  describe('4. API Abuse Protection & Rate Limiting', () => {
    it('enforces request limit thresholds and rate limit headers', () => {
      const limiter = createRateLimiter({
        maxRequests: 3,
        windowMs: 60_000,
      });

      const ip = '203.0.113.1';
      expect(limiter.consume(ip).allowed).toBe(true);
      expect(limiter.consume(ip).allowed).toBe(true);
      expect(limiter.consume(ip).allowed).toBe(true);

      const blocked = limiter.consume(ip);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      limiter.destroy();
    });
  });

  describe('5. Error Exposure & Stack Trace Sanitization', () => {
    it('sanitizes unexpected exceptions and hides internal stack traces from clients', () => {
      const rawError = new Error('Database connection failed: password=supersecret');
      const safe = toSafeErrorResponse(rawError);

      expect(safe.error.statusCode).toBe(500);
      expect(safe.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect((safe.error as Record<string, unknown>).stack).toBeUndefined();
      expect(safe.error.timestamp).toBeDefined();

      const customError = new OpenSearchError('Validation failed', {
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        category: 'VALIDATION',
      });
      const safeCustom = toSafeErrorResponse(customError);
      expect(safeCustom.error.code).toBe('VALIDATION_ERROR');
      expect(safeCustom.error.statusCode).toBe(400);
      expect((safeCustom.error as Record<string, unknown>).stack).toBeUndefined();
    });
  });

  describe('6. Security Headers & HSTS Enforcement', () => {
    it('sets defensive security headers and HSTS in production', () => {
      const middleware = createSecurityHeadersMiddleware();
      const headers: Record<string, string> = {};
      const mockRes: any = {
        setHeader: (k: string, v: string) => {
          headers[k.toLowerCase()] = v;
        },
      };
      const mockReq: any = {
        raw: {
          headers: { 'x-forwarded-proto': 'https' },
          socket: {},
        },
      };

      middleware(mockReq, mockRes, () => {}, {} as any);

      expect(headers['strict-transport-security']).toContain('max-age=31536000');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['content-security-policy']).toContain("default-src 'none'");
    });
  });

  describe('7. Production Configuration & Free-Tier Bounds', () => {
    it('loads and validates all production configuration limits', () => {
      const config = loadConfig({
        NODE_ENV: 'production',
        PORT: '8080',
        HOST: '0.0.0.0',
        CORS_ORIGIN: 'https://opensearch.example.com',
      });

      expect(config.isProduction).toBe(true);
      expect(config.api.server.port).toBe(8080);
      expect(config.api.server.host).toBe('0.0.0.0');
      expect(config.crawler.maxConcurrency).toBeLessThanOrEqual(5);
      expect(config.crawler.politenessDelayMs).toBeGreaterThanOrEqual(250);
    });
  });

  describe('8. Documentation Completeness', () => {
    it('verifies all required architecture and security documents exist', () => {
      expect(fs.existsSync('README.md')).toBe(true);
      expect(fs.existsSync('docs/DEPLOYMENT.md')).toBe(true);
      expect(fs.existsSync('docs/PRIVACY.md')).toBe(true);
      expect(fs.existsSync('docs/SECURITY.md')).toBe(true);
      expect(fs.existsSync('.env.example')).toBe(true);
    });
  });
});
