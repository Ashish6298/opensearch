/**
 * @opensearch/crawler — URL Model (Phase 4)
 * Typed domain objects representing a validated, normalized crawl URL.
 */

// ============================================================
// Parsed Crawl URL — result of successful validation
// ============================================================

export interface ParsedCrawlUrl {
  /** Canonical normalized URL string (fragment always removed) */
  href: string;
  /** Protocol, always lowercase: 'http:' | 'https:' */
  protocol: 'http:' | 'https:';
  /** Lowercase hostname (no port) */
  hostname: string;
  /** Lowercase host (hostname + optional non-default port) */
  host: string;
  /** URL path (always starts with /) */
  pathname: string;
  /** Query string including leading '?', or empty string */
  search: string;
  /** Port string, empty if default for scheme */
  port: string;
  /** Original raw URL before normalization */
  originalUrl: string;
}

// ============================================================
// Crawl Queue Entry — unit of work in the crawl queue
// ============================================================

export interface CrawlQueueEntry {
  /** Normalized canonical URL */
  normalizedUrl: string;
  /** SHA-256 hex of normalizedUrl — stable identity key */
  urlHash: string;
  /** Crawl depth (0 = seed URL) */
  depth: number;
  /** URL that linked to this one; null for seed URLs */
  discoveredFrom: string | null;
  /** ISO timestamp when this entry was added to the queue */
  enqueuedAt: string;
}

// ============================================================
// Enqueue result — returned by CrawlQueue.enqueue()
// ============================================================

export const ENQUEUE_RESULT = {
  /** URL was accepted and added to the queue */
  QUEUED: 'queued',
  /** URL was already seen (enqueued before or dequeued); skipped */
  DUPLICATE_SKIPPED: 'duplicate_skipped',
  /** Queue has reached its configured maximum capacity */
  QUEUE_FULL: 'queue_full',
  /** URL validation/normalization failed; entry was rejected */
  INVALID_URL: 'invalid_url',
} as const;

export type EnqueueResultCode = (typeof ENQUEUE_RESULT)[keyof typeof ENQUEUE_RESULT];

export interface EnqueueOutcome {
  code: EnqueueResultCode;
  /** Set when code === 'queued' */
  entry?: CrawlQueueEntry;
  /** Set when code === 'invalid_url' */
  reason?: string;
}

// ============================================================
// Validation result — returned by URL validator
// ============================================================

export type UrlValidationResult =
  { ok: true; parsed: ParsedCrawlUrl } | { ok: false; reason: string };
