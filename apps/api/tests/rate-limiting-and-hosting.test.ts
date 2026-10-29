/**
 * @opensearch/api — Phase 111: Rate Limiting & Hosting Compatibility Test Suite
 *
 * Automated verification of:
 * 1. Storage persistence audit & ephemeral filesystem detection
 * 2. Pluggable rate limit stores (in-memory & file-backed restart survival)
 * 3. Route-specific limits and tier isolation
 * 4. Operation complexity weighting (wildcards, large limits, heavy admin routes)
 * 5. Provider-specific outbound rate limits
 * 6. Trusted proxy settings and IP spoofing prevention
 * 7. Standardized HTTP 429 responses and rate limit headers
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { IncomingMessage } from 'node:http';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  auditStoragePersistence,
  isEphemeralPath,
  verifyStorageWritable,
} from '@opensearch/storage';
import {
  ProviderRateLimiter,
  createProviderRateLimiter,
} from '@opensearch/ranking';
import {
  createApiServer,
  createRateLimiter,
  FileBackedRateLimitStore,
  MemoryRateLimitStore,
  resolveClientIp,
} from '../src/index.js';
import { calculateOperationCost } from '../src/middlewares.js';
import { ApiRequest } from '../src/types.js';

describe('Phase 111 — Rate Limiting and Hosting Compatibility Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-p111-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  // ============================================================================
  // 1. Storage Persistence & Ephemeral Filesystem Auditing
  // ============================================================================
  describe('1. Storage Persistence & Ephemeral Filesystem Auditing', () => {
    it('detects ephemeral paths in temporary directories', () => {
      expect(isEphemeralPath(os.tmpdir())).toBe(true);
      expect(isEphemeralPath('/tmp/opensearch')).toBe(true);
      expect(isEphemeralPath('/var/tmp/index')).toBe(true);
      expect(isEphemeralPath('/dev/shm/storage')).toBe(true);
      expect(isEphemeralPath(path.join(tempDir, 'data'))).toBe(true);
    });

    it('identifies durable paths on persistent mount locations', () => {
      expect(isEphemeralPath('/var/data/opensearch')).toBe(false);
      expect(isEphemeralPath('/srv/opensearch/index')).toBe(false);
      expect(isEphemeralPath('./data/storage')).toBe(false);
    });

    it('audits storage persistence and provides recommendations for ephemeral paths', () => {
      const audit = auditStoragePersistence(tempDir, 'standalone', false);
      expect(audit.isEphemeral).toBe(true);
      expect(audit.isDurable).toBe(false);
      expect(audit.warnings.length).toBeGreaterThan(0);
      expect(audit.recommendations.some(r => r.includes('persistent volume'))).toBe(true);
    });

    it('emits critical data loss warning for production deployments on ephemeral filesystems', () => {
      const prodAudit = auditStoragePersistence(tempDir, 'standalone', true);
      expect(prodAudit.warnings.some(w => w.includes('CRITICAL'))).toBe(true);
    });

    it('warns about cold-boot storage loss in serverless deployment models', () => {
      const serverlessAudit = auditStoragePersistence('/var/data', 'serverless', false);
      expect(serverlessAudit.warnings.some(w => w.includes('Serverless'))).toBe(true);
      expect(serverlessAudit.recommendations.some(r => r.includes('persistent container'))).toBe(true);
    });

    it('verifies that durable directories are writable via probe test', () => {
      const targetDir = path.join(tempDir, 'writable-check');
      expect(verifyStorageWritable(targetDir)).toBe(true);
      expect(fs.existsSync(targetDir)).toBe(true);
    });
  });

  // ============================================================================
  // 2. Pluggable Rate Limit Storage Backends
  // ============================================================================
  describe('2. Pluggable Rate Limit Storage Backends', () => {
    it('MemoryRateLimitStore tracks buckets and cleans up expired windows', () => {
      const store = new MemoryRateLimitStore();
      const now = Date.now();

      store.set('client-1', { tokens: 3, windowStartMs: now }, 60_000);
      expect(store.get('client-1')?.tokens).toBe(3);
      expect(store.size()).toBe(1);

      // Expire entry
      store.cleanup(now + 65_000, 60_000);
      expect(store.get('client-1')).toBeUndefined();
      expect(store.size()).toBe(0);
    });

    it('FileBackedRateLimitStore survives process restarts and reloads persisted state', () => {
      const filePath = path.join(tempDir, 'rate-limits.json');
      const storeA = new FileBackedRateLimitStore(filePath);
      const now = Date.now();

      storeA.set('worker-client', { tokens: 5, windowStartMs: now }, 60_000);
      expect(storeA.get('worker-client')?.tokens).toBe(5);

      // Verify file written to disk atomically
      expect(fs.existsSync(filePath)).toBe(true);

      // Simulate a server restart or second worker process opening the same file
      const storeB = new FileBackedRateLimitStore(filePath);
      const recovered = storeB.get('worker-client');
      expect(recovered).toBeDefined();
      expect(recovered?.tokens).toBe(5);
      expect(recovered?.windowStartMs).toBe(now);

      // Update in storeB and verify storeA reloads on modification
      storeB.set('worker-client', { tokens: 6, windowStartMs: now }, 60_000);
      // Touch mtime slightly to trigger reload in storeA
      const reloaded = storeA.get('worker-client');
      expect(reloaded?.tokens).toBe(6);
    });

    it('RateLimiter seamlessly operates with FileBackedRateLimitStore', () => {
      const filePath = path.join(tempDir, 'limiter-store.json');
      const store = new FileBackedRateLimitStore(filePath);
      const limiter = createRateLimiter({
        maxRequests: 3,
        windowMs: 60_000,
        store,
      });

      const r1 = limiter.consume('user-100');
      const r2 = limiter.consume('user-100');
      const r3 = limiter.consume('user-100');
      const r4 = limiter.consume('user-100');

      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
      expect(r4.allowed).toBe(false);
      expect(r4.retryAfterSeconds).toBeGreaterThan(0);

      limiter.destroy();
    });
  });

  // ============================================================================
  // 3. Route-Specific Rate Limits & Tier Isolation
  // ============================================================================
  describe('3. Route-Specific Rate Limits & Tier Isolation', () => {
    it('applies separate rate limits to different route tiers', () => {
      const limiter = createRateLimiter({
        maxRequests: 10,
        windowMs: 60_000,
        routeRules: [
          { pattern: '/api/v1/search', maxRequests: 2, windowMs: 60_000, label: 'search' },
          { pattern: '/health', maxRequests: 5, windowMs: 60_000, label: 'health' },
        ],
      });

      // Search tier has maxRequests = 2
      const s1 = limiter.consume('192.0.2.1', '/api/v1/search');
      const s2 = limiter.consume('192.0.2.1', '/api/v1/search');
      const s3 = limiter.consume('192.0.2.1', '/api/v1/search');

      expect(s1.allowed).toBe(true);
      expect(s1.tier).toBe('search');
      expect(s2.allowed).toBe(true);
      expect(s3.allowed).toBe(false);

      // Health tier is isolated and still allowed
      const h1 = limiter.consume('192.0.2.1', '/health');
      const h2 = limiter.consume('192.0.2.1', '/health');
      const h3 = limiter.consume('192.0.2.1', '/health');

      expect(h1.allowed).toBe(true);
      expect(h1.tier).toBe('health');
      expect(h2.allowed).toBe(true);
      expect(h3.allowed).toBe(true);

      // Default tier is unaffected
      const d1 = limiter.consume('192.0.2.1', '/api/v1/suggest');
      expect(d1.allowed).toBe(true);
      expect(d1.limit).toBe(10);

      limiter.destroy();
    });
  });

  // ============================================================================
  // 4. Operation Complexity Weighting (Resource Exhaustion Protection)
  // ============================================================================
  describe('4. Operation Complexity Weighting', () => {
    it('assigns base cost of 1 to standard lightweight search queries', () => {
      const mockReq = {
        pathname: '/api/v1/search',
        query: { q: 'simple search' },
        body: undefined,
      } as unknown as ApiRequest;

      expect(calculateOperationCost(mockReq)).toBe(1);
    });

    it('assigns elevated cost of 2 to wildcard or pattern-intensive search queries', () => {
      const mockReq = {
        pathname: '/api/v1/search',
        query: { q: 'privac*' },
        body: undefined,
      } as unknown as ApiRequest;

      expect(calculateOperationCost(mockReq)).toBe(2);
    });

    it('assigns elevated cost to search queries requesting large page size or candidate limit', () => {
      const mockReq = {
        pathname: '/api/v1/search',
        query: { q: 'term', limit: '100' },
        body: undefined,
      } as unknown as ApiRequest;

      expect(calculateOperationCost(mockReq)).toBe(2);
    });

    it('assigns higher cost of 2 to heavy review and crawl administrative operations', () => {
      const mockReqReview = {
        pathname: '/api/v1/feedback/review/import',
        query: {},
      } as unknown as ApiRequest;
      const mockReqCrawl = {
        pathname: '/api/v1/crawl/start',
        query: {},
      } as unknown as ApiRequest;

      expect(calculateOperationCost(mockReqReview)).toBe(2);
      expect(calculateOperationCost(mockReqCrawl)).toBe(2);
    });

    it('higher cost queries exhaust rate-limit quota more quickly', () => {
      const limiter = createRateLimiter({
        maxRequests: 3,
        windowMs: 60_000,
      });

      // Single expensive query with cost 2
      const r1 = limiter.consume('192.0.2.5', undefined, 2);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(1);

      // Second query with cost 2 exceeds limit of 3 (2 + 2 = 4 > 3)
      const r2 = limiter.consume('192.0.2.5', undefined, 2);
      expect(r2.allowed).toBe(false);

      limiter.destroy();
    });
  });

  // ============================================================================
  // 5. Provider-Specific Rate Limiting
  // ============================================================================
  describe('5. Provider-Specific Rate Limiting', () => {
    it('enforces request quotas per search provider domain', () => {
      const providerLimiter = createProviderRateLimiter({
        defaultMaxRequests: 2,
        windowMs: 60_000,
        providerLimits: {
          wikimedia: { maxRequests: 2, windowMs: 60_000 },
          hackernews: { maxRequests: 1, windowMs: 60_000 },
        },
      });

      const w1 = providerLimiter.acquire('wikimedia');
      const w2 = providerLimiter.acquire('wikimedia');
      const w3 = providerLimiter.acquire('wikimedia');

      expect(w1.allowed).toBe(true);
      expect(w1.remaining).toBe(1);
      expect(w2.allowed).toBe(true);
      expect(w2.remaining).toBe(0);
      expect(w3.allowed).toBe(false);
      expect(w3.retryAfterSeconds).toBeGreaterThan(0);

      // Separate provider has its own quota
      const hn1 = providerLimiter.acquire('hackernews');
      const hn2 = providerLimiter.acquire('hackernews');
      expect(hn1.allowed).toBe(true);
      expect(hn2.allowed).toBe(false);

      providerLimiter.destroy();
    });

    it('allows resetting rate tracking for individual providers', () => {
      const providerLimiter = new ProviderRateLimiter({
        defaultMaxRequests: 1,
      });

      expect(providerLimiter.acquire('provider-a').allowed).toBe(true);
      expect(providerLimiter.acquire('provider-a').allowed).toBe(false);

      providerLimiter.reset('provider-a');
      expect(providerLimiter.acquire('provider-a').allowed).toBe(true);

      providerLimiter.destroy();
    });
  });

  // ============================================================================
  // 6. Trusted Proxy Settings & IP Spoofing Prevention
  // ============================================================================
  describe('6. Trusted Proxy Settings & IP Spoofing Prevention', () => {
    it('ignores X-Forwarded-For by default when trustProxy is disabled', () => {
      const req = {
        socket: { remoteAddress: '198.51.100.10' },
        headers: { 'x-forwarded-for': '203.0.113.195' },
      } as unknown as IncomingMessage;

      // trustProxy = false (default)
      const ip = resolveClientIp(req, false);
      expect(ip).toBe('198.51.100.10');
    });

    it('accepts X-Forwarded-For when trustProxy is explicitly enabled', () => {
      const req = {
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'x-forwarded-for': '203.0.113.195, 10.0.0.1' },
      } as unknown as IncomingMessage;

      const ip = resolveClientIp(req, true);
      expect(ip).toBe('203.0.113.195');
    });

    it('only trusts X-Forwarded-For if socket IP matches the trusted proxy whitelist', () => {
      const trustedProxyList = ['10.0.0.1', '127.0.0.1'];

      const trustedReq = {
        socket: { remoteAddress: '10.0.0.1' },
        headers: { 'x-forwarded-for': '198.51.100.25' },
      } as unknown as IncomingMessage;
      expect(resolveClientIp(trustedReq, trustedProxyList)).toBe('198.51.100.25');

      const untrustedReq = {
        socket: { remoteAddress: '192.168.1.50' },
        headers: { 'x-forwarded-for': '198.51.100.25' },
      } as unknown as IncomingMessage;
      expect(resolveClientIp(untrustedReq, trustedProxyList)).toBe('192.168.1.50');
    });

    it('rejects malformed or injected IP strings in X-Forwarded-For', () => {
      const req = {
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'x-forwarded-for': '<script>alert(1)</script>, invalid-ip' },
      } as unknown as IncomingMessage;

      const ip = resolveClientIp(req, true);
      expect(ip).toBe('127.0.0.1');
    });
  });

  // ============================================================================
  // 7. HTTP Rate Limit Headers & Standard 429 Responses
  // ============================================================================
  describe('7. HTTP Rate Limit Headers & Standard 429 Responses', () => {
    it('returns standard headers on successful requests and emits HTTP 429 when exhausted', async () => {
      const server = createApiServer({
        rateLimitPerMinute: 2,
        trustProxy: false,
      });

      const { host, port } = await server.start(0, '127.0.0.1');
      const baseUrl = `http://${host}:${port}`;

      try {
        // Request 1: allowed
        const res1 = await fetch(`${baseUrl}/health`);
        expect(res1.status).toBe(200);
        expect(res1.headers.get('x-ratelimit-limit')).toBe('2');
        expect(res1.headers.get('x-ratelimit-remaining')).toBe('1');
        expect(res1.headers.get('x-ratelimit-reset')).toBeDefined();

        // Request 2: allowed
        const res2 = await fetch(`${baseUrl}/health`);
        expect(res2.status).toBe(200);
        expect(res2.headers.get('x-ratelimit-remaining')).toBe('0');

        // Request 3: rejected with HTTP 429
        const res3 = await fetch(`${baseUrl}/health`);
        expect(res3.status).toBe(429);
        expect(res3.headers.get('retry-after')).toBeDefined();
        const retryAfter = Number(res3.headers.get('retry-after'));
        expect(retryAfter).toBeGreaterThan(0);

        const body = (await res3.json()) as { error: { code: string; message: string; statusCode: number } };
        expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(body.error.statusCode).toBe(429);
        expect(body.error.message).toContain('Too many requests');
      } finally {
        await server.stop();
      }
    });
  });
});
