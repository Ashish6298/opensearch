/**
 * @opensearch/crawler
 * Phase 4: URL Model, Normalization & Queue — Complete Implementation
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
