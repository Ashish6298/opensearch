/**
 * @opensearch/crawler
 * Phase 4: URL Model, Normalization & Queue — Complete Implementation
 * Phase 5: HTTP Fetcher — Complete Implementation
 * Phase 6: Robots.txt & Crawl Policy — Complete Implementation
 * Phase 7: HTML Parsing & Content Extraction — Complete Implementation
 */

// ── URL Model ────────────────────────────────────────────────
export type {
  ParsedCrawlUrl,
  CrawlQueueEntry,
  EnqueueOutcome,
  UrlValidationResult,
} from './url/url-model.js';
export { ENQUEUE_RESULT } from './url/url-model.js';

// ── URL Validation ───────────────────────────────────────────
export { validateUrl } from './url/url-validator.js';

// ── URL Normalization ────────────────────────────────────────
export { normalizeUrl } from './url/url-normalizer.js';
export type { NormalizeResult } from './url/url-normalizer.js';

// ── URL Fingerprinting ───────────────────────────────────────
export { computeUrlHash, computeRawUrlHash } from './url/url-fingerprint.js';

// ── Queue Abstraction ────────────────────────────────────────
export type { CrawlQueue, QueueStats } from './queue/queue-types.js';

// ── Persistent Queue Implementation ─────────────────────────
export { PersistentCrawlQueue } from './queue/persistent-queue.js';
export type { PersistentCrawlQueueOptions } from './queue/persistent-queue.js';

// ── Queue Factory ─────────────────────────────────────────────
export { createCrawlQueue } from './queue/queue-factory.js';
export type { CrawlQueueFactoryOptions } from './queue/queue-factory.js';

// ── HTTP Fetcher Types ────────────────────────────────────────
export type {
  FetchTarget,
  FetchSuccess,
  FetchFailure,
  FetchResult,
  HttpFetcher,
  HttpFetcherOptions,
} from './fetcher/fetcher-types.js';
export { FETCH_ERROR_CODE } from './fetcher/fetcher-types.js';

// ── SSRF Guard ────────────────────────────────────────────────
export {
  ssrfCheck,
  isPrivateHostname,
  isPrivateIpv4,
  isPrivateIpv6,
  isPrivateOrLoopbackIp,
  validateTargetHostSync,
  validateTargetHostDns,
} from './fetcher/ssrf-guard.js';
export type { DnsCheckResult } from './fetcher/ssrf-guard.js';

// ── NodeFetcher Implementation ────────────────────────────────
export { NodeFetcher } from './fetcher/node-fetcher.js';
export type { NodeFetcherConfig } from './fetcher/node-fetcher.js';

// ── Fetcher Factory ───────────────────────────────────────────
export {
  createHttpFetcher,
  createHttpFetcher as createFetcher,
} from './fetcher/fetcher-factory.js';
export type { FetcherFactoryOptions } from './fetcher/fetcher-factory.js';

// ── Phase 6: Robots.txt & Policy ──────────────────────────────
export type {
  RobotsRule,
  RobotsUserAgentGroup,
  ParsedRobotsTxt,
  RobotsPolicyDecision,
  RobotsDecisionReason,
  CachedRobotsPolicy,
  RobotsCache,
  RobotsPolicyEvaluator,
} from './robots/robots-types.js';
export { ROBOTS_DECISION_REASON } from './robots/robots-types.js';

export {
  parseRobotsTxt,
  matchPathPattern,
  findMatchingUserAgentGroup,
  evaluatePathRules,
} from './robots/robots-parser.js';

export { MemoryRobotsCache } from './robots/robots-cache.js';
export type { MemoryRobotsCacheOptions } from './robots/robots-cache.js';

export { RobotsFetcher, getOriginFromUrl, buildRobotsUrl } from './robots/robots-fetcher.js';
export type { FetchRobotsResult, RobotsFetcherOptions } from './robots/robots-fetcher.js';

export { RobotsPolicyService } from './robots/robots-policy-service.js';
export type { RobotsPolicyServiceOptions } from './robots/robots-policy-service.js';

export { createRobotsPolicyEvaluator } from './robots/robots-factory.js';
export type { RobotsPolicyFactoryOptions } from './robots/robots-factory.js';

// ── Phase 7: HTML Parsing & Content Extraction ────────────────
export type {
  HeadingItem,
  ExtractedLink,
  ExtractedDocument,
  HtmlParserOptions,
  HtmlParser,
} from './parser/parser-types.js';

export { decodeHtmlEntities, stripHtmlNoiseTags, cleanVisibleText } from './parser/text-cleaner.js';
export { extractBaseHref, extractOutboundLinks } from './parser/link-extractor.js';
export { DefaultHtmlParser } from './parser/html-parser.js';
export { createHtmlParser } from './parser/parser-factory.js';

// ── Phase 8: Crawl Orchestrator ──────────────────────────────
export type {
  CrawlRunOptions,
  CrawlRunStats,
  ProcessedPageOutcome,
  CrawlSummary,
  CrawlOrchestrator,
} from './orchestrator/orchestrator-types.js';

export { DefaultCrawlOrchestrator } from './orchestrator/crawl-orchestrator.js';
export type { CrawlOrchestratorOptions } from './orchestrator/crawl-orchestrator.js';

export { createCrawlOrchestrator } from './orchestrator/orchestrator-factory.js';
export type { CrawlOrchestratorFactoryOptions } from './orchestrator/orchestrator-factory.js';

// ── Phase 23: Seed Corpus ────────────────────────────────────
export type { SeedCategory, SeedEntry } from './orchestrator/seed-corpus.js';
export {
  CURATED_SEED_CORPUS,
  getCuratedSeedUrls,
  getAllCuratedSeeds,
} from './orchestrator/seed-corpus.js';
