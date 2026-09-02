/**
 * @opensearch/storage — Domain Models
 * Well-typed domain models for crawled documents and search metadata.
 */

// ============================================================
// Core Identifiers & Timestamps
// ============================================================

export type DocumentId = string; // UUID v4
export type UrlHash = string; // SHA-256 hex of normalized URL

// ============================================================
// Crawl State Enum
// ============================================================

export const CRAWL_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  SUCCESS: 'success',
  FAILED: 'failed',
  DISALLOWED: 'disallowed',
  SKIPPED: 'skipped',
} as const;

export type CrawlStatus = (typeof CRAWL_STATUS)[keyof typeof CRAWL_STATUS];

// ============================================================
// Index State Enum
// ============================================================

export const INDEX_STATUS = {
  NOT_INDEXED: 'not_indexed',
  PENDING: 'pending',
  INDEXED: 'indexed',
  STALE: 'stale',
  ERROR: 'error',
} as const;

export type IndexStatus = (typeof INDEX_STATUS)[keyof typeof INDEX_STATUS];

// ============================================================
// URL Metadata Model
// ============================================================

export interface UrlRecord {
  /** Unique hash of the normalized URL */
  urlHash: UrlHash;
  /** Normalized, canonical URL string */
  url: string;
  /** Domain/host extracted from URL */
  domain: string;
  /** URL scheme (http | https) */
  scheme: 'http' | 'https';
  /** Crawl status of this URL */
  crawlStatus: CrawlStatus;
  /** Unix timestamp (ms) when first discovered */
  discoveredAt: number;
  /** Unix timestamp (ms) when last attempted */
  lastAttemptedAt: number | null;
  /** Unix timestamp (ms) when last successfully crawled */
  lastSucceededAt: number | null;
  /** Number of crawl attempts made */
  attemptCount: number;
  /** HTTP status code from last fetch (null if never fetched) */
  lastHttpStatus: number | null;
  /** Optional: URL that referred/discovered this URL */
  referrerUrl: string | null;
  /** Crawl depth from seed URL (0 = seed) */
  depth: number;
}

// ============================================================
// Crawl Metadata Model
// ============================================================

export interface CrawlRecord {
  /** Unique crawl event identifier (UUID) */
  crawlId: string;
  /** The URL that was crawled */
  url: string;
  /** URL hash for join with UrlRecord */
  urlHash: UrlHash;
  /** Final outcome of this crawl attempt */
  status: CrawlStatus;
  /** HTTP status code returned (null if network error) */
  httpStatus: number | null;
  /** Content-Type header value returned */
  contentType: string | null;
  /** Response size in bytes */
  responseBytes: number | null;
  /** Time taken to complete fetch in milliseconds */
  durationMs: number | null;
  /** ISO timestamp when this crawl started */
  startedAt: string;
  /** ISO timestamp when this crawl completed */
  completedAt: string | null;
  /** Error message if crawl failed */
  errorMessage: string | null;
  /** Redirect chain if applicable */
  redirectChain: string[];
  /** Final URL after redirects */
  finalUrl: string | null;
  /** Associated document ID if content was stored */
  documentId: DocumentId | null;
}

// ============================================================
// Document (Crawled Page Content) Model
// ============================================================

export interface DocumentRecord {
  /** Unique document identifier (UUID) */
  id: DocumentId;
  /** The canonical URL of the document */
  url: string;
  /** URL hash for join with UrlRecord */
  urlHash: UrlHash;
  /** Page title extracted from HTML */
  title: string;
  /** Meta description extracted from HTML */
  description: string;
  /** All heading text concatenated (h1-h6) */
  headings: string;
  /** Visible body text content */
  bodyText: string;
  /** Detected language code (e.g. 'en', null if unknown) */
  language: string | null;
  /** HTTP Content-Type of the source response */
  contentType: string;
  /** Size in bytes of the stored content */
  contentLength: number;
  /** HTTP status code of the successful fetch */
  httpStatus: number;
  /** Outbound links discovered in this document */
  outboundLinks: string[];
  /** ISO timestamp when this document was crawled */
  crawledAt: string;
  /** ISO timestamp when this document record was last updated */
  updatedAt: string;
  /** Index state of this document */
  indexStatus: IndexStatus;
  /** ISO timestamp of the last indexing attempt */
  lastIndexedAt: string | null;
  /** Version/hash of the index build this document belongs to */
  indexVersion: string | null;
}

// ============================================================
// Index Metadata Model
// ============================================================

export interface IndexMetadataRecord {
  /** Unique build identifier for the index version */
  buildId: string;
  /** Human-readable semantic version label */
  version: string;
  /** ISO timestamp when this index build started */
  startedAt: string;
  /** ISO timestamp when this index build completed */
  completedAt: string | null;
  /** Whether this index is the active/serving index */
  isActive: boolean;
  /** Total number of documents indexed in this build */
  documentCount: number;
  /** Total number of unique terms in the index */
  termCount: number;
  /** Path to the index data on disk */
  indexPath: string;
  /** Build status */
  status: 'building' | 'ready' | 'failed' | 'stale';
  /** Error message if build failed */
  errorMessage: string | null;
  /** ISO timestamp of the last rebuild attempt */
  lastRebuildAt: string | null;
}

// ============================================================
// Input/Create Types (omit system-generated fields)
// ============================================================

export type CreateDocumentInput = Omit<
  DocumentRecord,
  'id' | 'crawledAt' | 'updatedAt' | 'indexStatus' | 'lastIndexedAt' | 'indexVersion'
> & {
  indexStatus?: IndexStatus;
};

export type CreateUrlRecordInput = Omit<
  UrlRecord,
  'discoveredAt' | 'lastAttemptedAt' | 'lastSucceededAt' | 'attemptCount'
> & {
  attemptCount?: number;
};

export type CreateCrawlRecordInput = Omit<CrawlRecord, 'crawlId'>;

export type CreateIndexMetadataInput = Omit<IndexMetadataRecord, 'buildId' | 'startedAt'>;

// ============================================================
// Update Types (all fields optional except identifier)
// ============================================================

export type UpdateDocumentInput = Partial<
  Omit<DocumentRecord, 'id' | 'url' | 'urlHash' | 'crawledAt'>
>;

export type UpdateUrlRecordInput = Partial<Omit<UrlRecord, 'urlHash' | 'url' | 'discoveredAt'>>;

export type UpdateIndexMetadataInput = Partial<Omit<IndexMetadataRecord, 'buildId' | 'startedAt'>>;
