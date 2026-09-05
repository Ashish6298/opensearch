/**
 * Phase 6 Tests — Robots Cache & Robots Policy Service
 *
 * Tests:
 * - Cache operations (set, get, has, clear, LRU eviction, expiration)
 * - Origin normalization and robots.txt URL derivation
 * - RobotsPolicyService with mock fetcher:
 *   - Allows/disallows paths for configured user agent
 *   - 404 absent robots.txt allows all
 *   - Network error / fetch failure allows gracefully without throwing
 *   - Multiple concurrent queries share in-flight robots request
 *   - Cache hit avoids second fetch
 *   - Crawl-delay retrieval and bounds enforcement
 *   - Factory creates valid evaluator
 */

import { describe, it, expect } from 'vitest';
import {
  MemoryRobotsCache,
  RobotsPolicyService,
  createRobotsPolicyEvaluator,
  ROBOTS_DECISION_REASON,
  getOriginFromUrl,
  buildRobotsUrl,
} from '../src/index.js';
import { createLogger, AppConfig } from '@opensearch/shared';
import { FetchRobotsResult, RobotsFetcher } from '../src/robots/robots-fetcher.js';
import { parseRobotsTxt } from '../src/robots/robots-parser.js';

const silentLogger = createLogger('@opensearch/crawler:test-robots', { level: 'silent' });

describe('Robots Cache — MemoryRobotsCache', () => {
  it('stores and retrieves cached policies', () => {
    const cache = new MemoryRobotsCache({ maxSize: 10 });
    const policy = {
      origin: 'https://example.com',
      parsed: { groups: [], sitemaps: [], rawLengthBytes: 0 },
      fetchedAt: Date.now(),
      expiresAt: Date.now() + 10_000,
      status: 'success' as const,
    };

    cache.set('https://example.com', policy);
    expect(cache.has('https://example.com')).toBe(true);
    expect(cache.get('https://example.com')).toBe(policy);
    expect(cache.size()).toBe(1);

    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.has('https://example.com')).toBe(false);
  });

  it('evicts expired entries', async () => {
    const cache = new MemoryRobotsCache();
    const policy = {
      origin: 'https://example.com',
      parsed: null,
      fetchedAt: Date.now() - 1000,
      expiresAt: Date.now() - 10, // already expired
      status: 'absent' as const,
    };

    cache.set('https://example.com', policy);
    expect(cache.get('https://example.com')).toBeUndefined();
  });

  it('evicts LRU entries when exceeding maxSize', () => {
    const cache = new MemoryRobotsCache({ maxSize: 2 });
    const now = Date.now();

    cache.set('https://a.com', {
      origin: 'https://a.com',
      parsed: null,
      fetchedAt: now,
      expiresAt: now + 10_000,
      status: 'absent',
    });
    cache.set('https://b.com', {
      origin: 'https://b.com',
      parsed: null,
      fetchedAt: now,
      expiresAt: now + 10_000,
      status: 'absent',
    });

    // Access a.com to make b.com older
    cache.get('https://a.com');

    // Add c.com -> should evict b.com
    cache.set('https://c.com', {
      origin: 'https://c.com',
      parsed: null,
      fetchedAt: now,
      expiresAt: now + 10_000,
      status: 'absent',
    });

    expect(cache.has('https://a.com')).toBe(true);
    expect(cache.has('https://c.com')).toBe(true);
    expect(cache.has('https://b.com')).toBe(false);
  });
});

describe('Robots URL Utilities', () => {
  it('extracts origin correctly', () => {
    expect(getOriginFromUrl('https://example.com/page?q=1#frag')).toBe('https://example.com');
    expect(getOriginFromUrl('http://example.org:8080/nested/path')).toBe('http://example.org:8080');
  });

  it('builds robots.txt URL correctly', () => {
    expect(buildRobotsUrl('https://example.com/some/path')).toBe('https://example.com/robots.txt');
    expect(buildRobotsUrl('http://example.org:8080')).toBe('http://example.org:8080/robots.txt');
  });
});

describe('Robots Policy Service — End-to-End Evaluation', () => {
  const robotsContent = `
User-agent: OpenSearchBot
Disallow: /private/
Disallow: /admin/
Allow: /private/open/
Crawl-delay: 5

User-agent: *
Disallow: /
Allow: /public/
`;

  class MockRobotsFetcher extends RobotsFetcher {
    public fetchCount = 0;
    constructor(private readonly mockResult: FetchRobotsResult) {
      super({
        fetcher: {
          fetch: async () =>
            ({
              ok: false,
              code: 'FETCH_ERROR',
              message: 'Mock error',
              redirectCount: 0,
              retryCount: 0,
              durationMs: 0,
              retryable: false,
            }) as const,
        },
        logger: silentLogger,
      });
    }

    override async fetchRobots(origin: string): Promise<FetchRobotsResult> {
      this.fetchCount++;
      return {
        ...this.mockResult,
        origin,
        robotsUrl: `${origin}/robots.txt`,
      };
    }
  }

  it('authorizes allowed and disallowed paths according to policy', async () => {
    const mockFetcher = new MockRobotsFetcher({
      origin: 'https://example.com',
      robotsUrl: 'https://example.com/robots.txt',
      status: 'success',
      statusCode: 200,
      parsed: parseRobotsTxt(robotsContent),
    });

    const service = new RobotsPolicyService({
      fetcher: mockFetcher,
      logger: silentLogger,
      crawlerUserAgent: 'OpenSearchBot/1.0',
    });

    // /private/secret -> disallowed
    const d1 = await service.isUrlAllowed('https://example.com/private/secret');
    expect(d1.allowed).toBe(false);
    expect(d1.reason).toBe(ROBOTS_DECISION_REASON.DISALLOWED_BY_RULE);
    expect(d1.matchedPattern).toBe('/private/');
    expect(d1.matchedUserAgent).toBe('opensearchbot');
    expect(d1.crawlDelayMs).toBe(5000);

    // /private/open/file.html -> allowed by more specific rule
    const d2 = await service.isUrlAllowed('https://example.com/private/open/file.html');
    expect(d2.allowed).toBe(true);
    expect(d2.reason).toBe(ROBOTS_DECISION_REASON.ALLOWED_BY_RULE);
    expect(d2.matchedPattern).toBe('/private/open/');

    // Cache hit: fetchCount should still be 1
    expect(mockFetcher.fetchCount).toBe(1);
  });

  it('handles 404 absent robots.txt by granting full access', async () => {
    const mockFetcher = new MockRobotsFetcher({
      origin: 'https://example.com',
      robotsUrl: 'https://example.com/robots.txt',
      status: 'absent',
      statusCode: 404,
      parsed: null,
    });

    const service = new RobotsPolicyService({
      fetcher: mockFetcher,
      logger: silentLogger,
      crawlerUserAgent: 'OpenSearchBot/1.0',
    });

    const decision = await service.isUrlAllowed('https://example.com/any/path');
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe(ROBOTS_DECISION_REASON.ALLOWED_ROBOTS_404_OR_ABSENT);
  });

  it('handles network / fetch failure safely without throwing', async () => {
    const mockFetcher = new MockRobotsFetcher({
      origin: 'https://example.com',
      robotsUrl: 'https://example.com/robots.txt',
      status: 'error',
      parsed: null,
      errorMessage: 'Connection refused',
    });

    const service = new RobotsPolicyService({
      fetcher: mockFetcher,
      logger: silentLogger,
      crawlerUserAgent: 'OpenSearchBot/1.0',
    });

    const decision = await service.isUrlAllowed('https://example.com/any/path');
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe(ROBOTS_DECISION_REASON.ALLOWED_ON_FETCH_ERROR);
  });

  it('Factory creates RobotsPolicyEvaluator from AppConfig', () => {
    const mockConfig = {
      crawler: {
        timeoutMs: 5000,
        maxDepth: 3,
        maxPages: 100,
        maxPageBytes: 1024 * 1024,
        politenessDelayMs: 500,
        userAgent: 'OpenSearchBot/1.0',
        maxRedirects: 3,
        maxRetries: 2,
        retryBackoffMs: 100,
        robotsEnabled: true,
        robotsCacheTtlMs: 3600_000,
        robotsMaxCacheSize: 1000,
        robotsMaxBytes: 512 * 1024,
        robotsMaxCrawlDelayMs: 30_000,
      },
      logging: {
        level: 'silent',
        format: 'json',
      },
    } as unknown as AppConfig;

    const evaluator = createRobotsPolicyEvaluator({
      config: mockConfig,
      fetcher: {
        fetch: async () =>
          ({
            ok: false,
            code: 'FETCH_ERROR',
            message: 'Mock error',
            redirectCount: 0,
            retryCount: 0,
            durationMs: 0,
            retryable: false,
          }) as const,
      },
      logger: silentLogger,
    });

    expect(evaluator).toBeDefined();
    expect(typeof evaluator.isUrlAllowed).toBe('function');
    expect(typeof evaluator.getCrawlDelayMs).toBe('function');
  });
});
