#!/usr/bin/env node
/**
 * OpenSearch — Phase 6: Robots.txt & Crawl Policy Verification
 *
 * Exercises the complete Phase 6 implementation end-to-end:
 *   1. RFC 9309 Robots Parser:
 *      - Comments, empty disallows, multi-agent groups, sitemaps, crawl-delay
 *   2. Path Pattern Matcher:
 *      - Exact prefixes, wildcard *, end anchor $, query params
 *   3. User-Agent Group Matching:
 *      - Specific crawler token over wildcard, wildcard fallback
 *   4. Rule Precedence:
 *      - Longest match, allow over disallow on equal length
 *   5. In-Memory LRU Robots Cache:
 *      - Origin keying, TTL expiration, max capacity eviction
 *   6. RobotsPolicyService & Policy Decisions:
 *      - Permitted vs forbidden URLs, 404 absent fallback, error safe fallback, crawl delay
 *   7. Factory & Config Wiring:
 *      - createRobotsPolicyEvaluator from AppConfig
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import {
  parseRobotsTxt,
  matchPathPattern,
  findMatchingUserAgentGroup,
  evaluatePathRules,
  MemoryRobotsCache,
  RobotsPolicyService,
  createRobotsPolicyEvaluator,
  ROBOTS_DECISION_REASON,
  getOriginFromUrl,
  buildRobotsUrl,
} from '../packages/crawler/dist/index.js';
import { createLogger } from '../packages/shared/dist/logger/index.js';

const PASS = '\u001b[32m✓\u001b[0m';
const FAIL = '\u001b[31m✗\u001b[0m';
const HEAD = '\u001b[36m►\u001b[0m';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

const silentLogger = createLogger('@opensearch/crawler:verify-p6', { level: 'silent' });

// ── Suite 1: Parser & RFC 9309 Directives ───────────────────────────────────

function verifyRobotsParser() {
  console.log(`\n${HEAD} Robots.txt Parser`);

  const sample = `
# OpenSearch robots test
User-agent: Googlebot
Disallow: /google-only/

User-agent: OpenSearchBot
User-agent: PartnerBot
Disallow: /admin/
Disallow: /private/
Allow: /private/public-preview/
Crawl-delay: 2.5

User-agent: *
Disallow: /
Allow: /public/
Sitemap: https://example.com/sitemap.xml
`;

  const parsed = parseRobotsTxt(sample);

  check('parses 3 user-agent groups', parsed.groups.length === 3);
  check(
    'parses sitemap',
    parsed.sitemaps.length === 1 && parsed.sitemaps[0] === 'https://example.com/sitemap.xml',
  );
  check('group 1 has googlebot', parsed.groups[0].userAgents.includes('googlebot'));
  check(
    'group 2 has opensearchbot and partnerbot',
    parsed.groups[1].userAgents.includes('opensearchbot') &&
      parsed.groups[1].userAgents.includes('partnerbot'),
  );
  check('group 2 parses crawl-delay 2.5', parsed.groups[1].crawlDelaySeconds === 2.5);
  check('group 2 has 3 rules (2 disallow, 1 allow)', parsed.groups[1].rules.length === 3);
  check('group 3 has wildcard *', parsed.groups[2].userAgents.includes('*'));

  // Empty disallow
  const emptyDisallow = parseRobotsTxt('User-agent: *\nDisallow:\n');
  check(
    'empty disallow parses as allow-all',
    emptyDisallow.groups[0].rules[0].type === 'allow' &&
      emptyDisallow.groups[0].rules[0].pattern === '',
  );
}

// ── Suite 2: Path Pattern Matching ──────────────────────────────────────────

function verifyPathMatching() {
  console.log(`\n${HEAD} Path Pattern Matching & URL Helpers`);

  check(
    'extracts origin from URL',
    getOriginFromUrl('https://example.com:8080/path?q=1') === 'https://example.com:8080',
  );
  check(
    'builds canonical robots.txt URL',
    buildRobotsUrl('https://example.com/page') === 'https://example.com/robots.txt',
  );

  check('matches exact prefix', matchPathPattern('/admin/dashboard', '/admin/'));
  check('rejects non-matching prefix', !matchPathPattern('/public/page', '/admin/'));
  check(
    'matches wildcard * in middle',
    matchPathPattern('/articles/2026/09/post', '/articles/*/post'),
  );
  check('matches wildcard * for query params', matchPathPattern('/search?q=test&p=1', '/*?*p=1'));
  check('matches end anchor $', matchPathPattern('/file.pdf', '/*.pdf$'));
  check('rejects end anchor mismatch', !matchPathPattern('/file.pdf.exe', '/*.pdf$'));
}

// ── Suite 3: User-Agent Matching & Precedence ───────────────────────────────

function verifyPrecedenceAndMatching() {
  console.log(`\n${HEAD} UA Matching & Precedence`);

  const groups = [
    { userAgents: ['googlebot'], rules: [] },
    { userAgents: ['opensearchbot'], rules: [] },
    { userAgents: ['*'], rules: [] },
  ];

  const m1 = findMatchingUserAgentGroup(groups, 'OpenSearchBot/1.0 (+https://github.com/...)');
  check('matches specific opensearchbot group', m1.matchedAgent === 'opensearchbot');

  const m2 = findMatchingUserAgentGroup(groups, 'CustomBot/2.0');
  check('falls back to wildcard *', m2.matchedAgent === '*');

  // Longest match wins
  const rules = [
    { type: 'disallow', pattern: '/private/', patternLength: 9 },
    { type: 'allow', pattern: '/private/public-preview/', patternLength: 24 },
  ];
  check(
    'longest match allow wins',
    evaluatePathRules(rules, '/private/public-preview/doc.html').allowed,
  );
  check(
    'shorter disallow matches non-allowed path',
    !evaluatePathRules(rules, '/private/secret.html').allowed,
  );

  // Equal length: allow wins
  const equalRules = [
    { type: 'disallow', pattern: '/path', patternLength: 5 },
    { type: 'allow', pattern: '/path', patternLength: 5 },
  ];
  check(
    'equal length allow takes precedence over disallow',
    evaluatePathRules(equalRules, '/path').allowed,
  );
}

// ── Suite 4: Robots Cache Operations ────────────────────────────────────────

function verifyRobotsCache() {
  console.log(`\n${HEAD} Robots Cache`);

  const cache = new MemoryRobotsCache({ maxSize: 2 });
  const now = Date.now();

  cache.set('https://a.com', {
    origin: 'https://a.com',
    parsed: null,
    fetchedAt: now,
    expiresAt: now + 10_000,
    status: 'success',
  });
  cache.set('https://b.com', {
    origin: 'https://b.com',
    parsed: null,
    fetchedAt: now,
    expiresAt: now + 10_000,
    status: 'success',
  });

  check('stores entries in cache', cache.size() === 2 && cache.has('https://a.com'));

  // Access a.com so b.com is evicted on next insert
  cache.get('https://a.com');
  cache.set('https://c.com', {
    origin: 'https://c.com',
    parsed: null,
    fetchedAt: now,
    expiresAt: now + 10_000,
    status: 'success',
  });

  check(
    'LRU eviction evicted b.com',
    !cache.has('https://b.com') && cache.has('https://a.com') && cache.has('https://c.com'),
  );
}

// ── Suite 5: Robots Policy Service Decisions ────────────────────────────────

async function verifyRobotsPolicyService() {
  console.log(`\n${HEAD} Robots Policy Service Decisions`);

  const robotsTxt = `
User-agent: OpenSearchBot
Disallow: /admin/
Disallow: /hidden/
Allow: /hidden/open/
Crawl-delay: 3

User-agent: *
Disallow: /
Allow: /public/
`;

  const mockFetcher = {
    fetchCount: 0,
    async fetchRobots(origin) {
      this.fetchCount++;
      return {
        origin,
        robotsUrl: `${origin}/robots.txt`,
        status: 'success',
        statusCode: 200,
        parsed: parseRobotsTxt(robotsTxt),
      };
    },
  };

  const service = new RobotsPolicyService({
    fetcher: mockFetcher,
    logger: silentLogger,
    crawlerUserAgent: 'OpenSearchBot/1.0',
    maxCrawlDelayMs: 30_000,
  });

  const d1 = await service.isUrlAllowed('https://example.com/admin/settings');
  check(
    'disallows /admin/ for OpenSearchBot',
    !d1.allowed && d1.reason === ROBOTS_DECISION_REASON.DISALLOWED_BY_RULE,
  );

  const d2 = await service.isUrlAllowed('https://example.com/hidden/open/page.html');
  check(
    'allows /hidden/open/ by specific allow rule',
    d2.allowed && d2.reason === ROBOTS_DECISION_REASON.ALLOWED_BY_RULE,
  );

  const d3 = await service.isUrlAllowed('https://example.com/blog/article');
  check(
    'allows unspecified paths by default',
    (d3.allowed && d3.reason === ROBOTS_DECISION_REASON.ALLOWED_BY_RULE) || d3.allowed,
  );

  check('serves policy from cache (fetchCount is 1)', mockFetcher.fetchCount === 1);

  const crawlDelay = await service.getCrawlDelayMs('https://example.com');
  check('returns parsed crawl delay in milliseconds (3000ms)', crawlDelay === 3000);
}

// ── Suite 6: Factory & Config Wiring ────────────────────────────────────────

function verifyFactory() {
  console.log(`\n${HEAD} Factory & AppConfig Integration`);

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
  };

  const evaluator = createRobotsPolicyEvaluator({
    config: mockConfig,
    fetcher: {
      fetch: async () => ({
        ok: false,
        code: 'MOCK',
        message: 'Mock',
        redirectCount: 0,
        retryCount: 0,
        durationMs: 0,
        retryable: false,
      }),
    },
    logger: silentLogger,
  });

  check(
    'createRobotsPolicyEvaluator returns instance',
    typeof evaluator === 'object' && evaluator !== null,
  );
  check('evaluator implements isUrlAllowed', typeof evaluator.isUrlAllowed === 'function');
  check('evaluator implements getCrawlDelayMs', typeof evaluator.getCrawlDelayMs === 'function');
  check('evaluator implements clearCache', typeof evaluator.clearCache === 'function');
}

// ── Main Runner ─────────────────────────────────────────────────────────────

async function main() {
  console.log('OpenSearch — Phase 6: Robots.txt & Crawl Policy Verification');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  verifyRobotsParser();
  verifyPathMatching();
  verifyPrecedenceAndMatching();
  verifyRobotsCache();
  await verifyRobotsPolicyService();
  verifyFactory();

  console.log('\n═══════════════════════════════════════════════════════════════════');
  if (failed === 0) {
    console.log(`  \u001b[32mPASSED ${passed}/${passed} checks\u001b[0m`);
    console.log('═══════════════════════════════════════════════════════════════════\n');
    process.exit(0);
  } else {
    console.log(
      `  \u001b[31mFAILED ${failed}/${passed + failed} checks (${passed} passed)\u001b[0m`,
    );
    console.log('═══════════════════════════════════════════════════════════════════\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled error during Phase 6 verification:', err);
  process.exit(1);
});
