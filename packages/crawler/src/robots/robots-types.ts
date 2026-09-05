/**
 * @opensearch/crawler — Robots & Crawl Policy Types (Phase 6)
 *
 * Defines the type contracts for:
 * - RobotsRule: single allow or disallow path pattern
 * - RobotsUserAgentGroup: parsed group of rules for specific user-agent tokens
 * - ParsedRobotsTxt: fully parsed robots.txt model
 * - RobotsPolicyDecision: URL crawl authorization decision
 * - RobotsFetcher: retrieval abstraction
 * - RobotsCache: in-memory / origin-keyed policy cache
 * - RobotsPolicyEvaluator: the overall policy interface
 */

export interface RobotsRule {
  /** 'allow' or 'disallow' */
  type: 'allow' | 'disallow';
  /** Path pattern (e.g. '/', '/private/', '/search?*', '*.pdf$') */
  pattern: string;
  /** Length of the pattern used for RFC 9309 precedence resolution */
  patternLength: number;
}

export interface RobotsUserAgentGroup {
  /** User-agent tokens lowercased (e.g. ['opensearchbot', '*']) */
  userAgents: string[];
  /** Rules for this group in order of appearance */
  rules: RobotsRule[];
  /** Crawl-delay in seconds if specified and valid */
  crawlDelaySeconds?: number;
}

export interface ParsedRobotsTxt {
  /** All user-agent groups parsed from the file */
  groups: RobotsUserAgentGroup[];
  /** Sitemaps declared in the file */
  sitemaps: string[];
  /** Raw content length in bytes */
  rawLengthBytes: number;
  /** Whether the file had syntax errors or unrecognized lines (gracefully ignored) */
  hasSyntaxWarnings?: boolean;
}

export const ROBOTS_DECISION_REASON = {
  ALLOWED_BY_RULE: 'ALLOWED_BY_RULE',
  DISALLOWED_BY_RULE: 'DISALLOWED_BY_RULE',
  ALLOWED_DEFAULT: 'ALLOWED_DEFAULT',
  ALLOWED_ROBOTS_DISABLED: 'ALLOWED_ROBOTS_DISABLED',
  ALLOWED_ROBOTS_404_OR_ABSENT: 'ALLOWED_ROBOTS_404_OR_ABSENT',
  ALLOWED_ON_FETCH_ERROR: 'ALLOWED_ON_FETCH_ERROR',
  DISALLOWED_RESTRICTIVE_5XX: 'DISALLOWED_RESTRICTIVE_5XX',
} as const;

export type RobotsDecisionReason =
  (typeof ROBOTS_DECISION_REASON)[keyof typeof ROBOTS_DECISION_REASON];

export interface RobotsPolicyDecision {
  /** Whether the URL is allowed to be crawled */
  allowed: boolean;
  /** Explanation / category of the decision */
  reason: RobotsDecisionReason;
  /** The matching rule pattern if matched (e.g. '/admin/') */
  matchedPattern?: string;
  /** The matching rule type if matched ('allow' | 'disallow') */
  matchedType?: 'allow' | 'disallow';
  /** The user-agent group matched (e.g. 'opensearchbot' or '*') */
  matchedUserAgent?: string;
  /** Crawl delay in milliseconds if specified for this user agent */
  crawlDelayMs?: number;
  /** Origin of the robots.txt file */
  origin: string;
  /** Whether the decision was served from cache */
  cached: boolean;
}

export interface CachedRobotsPolicy {
  origin: string;
  parsed: ParsedRobotsTxt | null;
  /** HTTP status code if fetched (e.g. 200, 404, 500) */
  statusCode?: number;
  /** When this entry was fetched (timestamp ms) */
  fetchedAt: number;
  /** Expiration timestamp ms */
  expiresAt: number;
  /** Fetch status: 'success' | 'absent' | 'error' */
  status: 'success' | 'absent' | 'error';
  /** Error message if status is 'error' */
  errorMessage?: string;
}

export interface RobotsCache {
  get(origin: string): CachedRobotsPolicy | undefined;
  set(origin: string, policy: CachedRobotsPolicy): void;
  has(origin: string): boolean;
  clear(): void;
  size(): number;
}

export interface RobotsPolicyEvaluator {
  /**
   * Evaluates whether a target URL is permitted according to the site's robots.txt policy.
   * Fetches (and caches) robots.txt if not already cached.
   */
  isUrlAllowed(url: string, customUserAgent?: string): Promise<RobotsPolicyDecision>;

  /**
   * Retrieves crawl delay in milliseconds for an origin if specified.
   */
  getCrawlDelayMs(originOrUrl: string, customUserAgent?: string): Promise<number | undefined>;

  /**
   * Clears the policy cache.
   */
  clearCache(): void;
}
