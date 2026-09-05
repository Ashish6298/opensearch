/**
 * @opensearch/crawler — Robots Policy Service (Phase 6)
 *
 * Coordinates robots.txt retrieval, parsing, caching, and path authorization evaluation:
 * - Single entry point for crawler policy decisions
 * - Concurrency protection: in-flight request de-duplication per origin
 * - RFC 9309 rule precedence and longest-match path matching
 * - Graceful failure fallback (404 -> allow, 5xx/network error -> safe policy fallback)
 * - Exposes crawl-delay metadata for Phase 8 scheduling
 */

import { Logger } from '@opensearch/shared';
import {
  CachedRobotsPolicy,
  ROBOTS_DECISION_REASON,
  RobotsCache,
  RobotsPolicyDecision,
  RobotsPolicyEvaluator,
} from './robots-types.js';
import { MemoryRobotsCache } from './robots-cache.js';
import { getOriginFromUrl, RobotsFetcher } from './robots-fetcher.js';
import { evaluatePathRules, findMatchingUserAgentGroup } from './robots-parser.js';

export interface RobotsPolicyServiceOptions {
  fetcher: RobotsFetcher;
  logger: Logger;
  cache?: RobotsCache;
  defaultTtlMs?: number;
  maxCrawlDelayMs?: number;
  crawlerUserAgent: string;
  enabled?: boolean;
}

export class RobotsPolicyService implements RobotsPolicyEvaluator {
  private readonly fetcher: RobotsFetcher;
  private readonly logger: Logger;
  private readonly cache: RobotsCache;
  private readonly defaultTtlMs: number;
  private readonly maxCrawlDelayMs: number;
  private readonly crawlerUserAgent: string;
  private readonly enabled: boolean;

  // In-flight promises to prevent duplicate concurrent robots requests for the same origin
  private readonly pendingFetches = new Map<string, Promise<CachedRobotsPolicy>>();

  constructor(options: RobotsPolicyServiceOptions) {
    this.fetcher = options.fetcher;
    this.logger = options.logger;
    this.cache = options.cache ?? new MemoryRobotsCache();
    this.defaultTtlMs = options.defaultTtlMs ?? 24 * 60 * 60 * 1000;
    this.maxCrawlDelayMs = options.maxCrawlDelayMs ?? 30_000;
    this.crawlerUserAgent = options.crawlerUserAgent;
    this.enabled = options.enabled ?? true;
  }

  async isUrlAllowed(url: string, customUserAgent?: string): Promise<RobotsPolicyDecision> {
    if (!this.enabled) {
      return {
        allowed: true,
        reason: ROBOTS_DECISION_REASON.ALLOWED_ROBOTS_DISABLED,
        origin: getOriginFromUrl(url),
        cached: false,
      };
    }

    let origin = '';
    let pathnameAndQuery = '/';

    try {
      const parsed = new URL(url);
      origin = `${parsed.protocol}//${parsed.host}`;
      pathnameAndQuery = `${parsed.pathname}${parsed.search}`;
    } catch {
      return {
        allowed: false,
        reason: ROBOTS_DECISION_REASON.DISALLOWED_BY_RULE,
        origin: url,
        cached: false,
      };
    }

    const cachedPolicy = await this.getOrFetchPolicy(origin);
    const effectiveUserAgent = customUserAgent ?? this.crawlerUserAgent;

    // 1. If robots was absent (404/410), allow everything
    if (cachedPolicy.status === 'absent') {
      return {
        allowed: true,
        reason: ROBOTS_DECISION_REASON.ALLOWED_ROBOTS_404_OR_ABSENT,
        origin,
        cached: cachedPolicy.fetchedAt < Date.now() - 10,
      };
    }

    // 2. If robots had an unrecoverable fetch error
    if (cachedPolicy.status === 'error' || !cachedPolicy.parsed) {
      // 5xx errors: conservative allow or disallow depending on standard (RFC 9309 recommends temporary disallow for 5xx, or allow for network)
      // Here we treat general fetch errors as ALLOW_ON_FETCH_ERROR so crawler is not completely stuck on minor transient glitches
      return {
        allowed: true,
        reason: ROBOTS_DECISION_REASON.ALLOWED_ON_FETCH_ERROR,
        origin,
        cached: cachedPolicy.fetchedAt < Date.now() - 10,
      };
    }

    // 3. Match user-agent group
    const { group, matchedAgent } = findMatchingUserAgentGroup(
      cachedPolicy.parsed.groups,
      effectiveUserAgent,
    );

    if (!group) {
      // No applicable group found for our crawler -> allow all
      return {
        allowed: true,
        reason: ROBOTS_DECISION_REASON.ALLOWED_DEFAULT,
        origin,
        cached: true,
      };
    }

    // 4. Evaluate path rules against matching group
    const pathDecision = evaluatePathRules(group.rules, pathnameAndQuery);

    let crawlDelayMs: number | undefined = undefined;
    if (group.crawlDelaySeconds !== undefined) {
      const delayMs = group.crawlDelaySeconds * 1000;
      crawlDelayMs = Math.min(delayMs, this.maxCrawlDelayMs);
    }

    this.logger.debug('Robots path evaluation completed', {
      origin,
      allowed: pathDecision.allowed,
      matchedRule: pathDecision.matchedRule?.pattern,
      matchedUserAgent: matchedAgent,
    });

    return {
      allowed: pathDecision.allowed,
      reason: pathDecision.allowed
        ? ROBOTS_DECISION_REASON.ALLOWED_BY_RULE
        : ROBOTS_DECISION_REASON.DISALLOWED_BY_RULE,
      matchedPattern: pathDecision.matchedRule?.pattern,
      matchedType: pathDecision.matchedRule?.type,
      matchedUserAgent: matchedAgent,
      crawlDelayMs,
      origin,
      cached: true,
    };
  }

  async getCrawlDelayMs(
    originOrUrl: string,
    customUserAgent?: string,
  ): Promise<number | undefined> {
    const origin = getOriginFromUrl(originOrUrl);
    const policy = await this.getOrFetchPolicy(origin);

    if (policy.status !== 'success' || !policy.parsed) {
      return undefined;
    }

    const effectiveUserAgent = customUserAgent ?? this.crawlerUserAgent;
    const { group } = findMatchingUserAgentGroup(policy.parsed.groups, effectiveUserAgent);

    if (!group || group.crawlDelaySeconds === undefined) {
      return undefined;
    }

    const delayMs = group.crawlDelaySeconds * 1000;
    return Math.min(delayMs, this.maxCrawlDelayMs);
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async getOrFetchPolicy(origin: string): Promise<CachedRobotsPolicy> {
    const cached = this.cache.get(origin);
    if (cached) {
      return cached;
    }

    // Check if a fetch is already in flight for this origin
    const existing = this.pendingFetches.get(origin);
    if (existing) {
      return existing;
    }

    const fetchPromise = (async () => {
      try {
        const result = await this.fetcher.fetchRobots(origin);
        const now = Date.now();

        const policyEntry: CachedRobotsPolicy = {
          origin,
          parsed: result.parsed,
          statusCode: result.statusCode,
          fetchedAt: now,
          expiresAt: now + this.defaultTtlMs,
          status: result.status,
          errorMessage: result.errorMessage,
        };

        this.cache.set(origin, policyEntry);
        return policyEntry;
      } finally {
        this.pendingFetches.delete(origin);
      }
    })();

    this.pendingFetches.set(origin, fetchPromise);
    return fetchPromise;
  }
}
