/**
 * @opensearch/storage — Repository Abstractions
 * Defines the storage contracts separately from their concrete implementations.
 * Future adapters (SQLite, PostgreSQL, etc.) must satisfy these interfaces.
 */

import {
  CrawlRecord,
  CreateCrawlRecordInput,
  CreateDocumentInput,
  CreateIndexMetadataInput,
  CreateUrlRecordInput,
  DocumentId,
  DocumentRecord,
  IndexMetadataRecord,
  UpdateDocumentInput,
  UpdateIndexMetadataInput,
  UpdateUrlRecordInput,
  UrlHash,
  UrlRecord,
} from './models.js';

// ============================================================
// Document Repository
// ============================================================

export interface DocumentRepository {
  /**
   * Create and persist a new document. Throws ConflictError if id or urlHash exists.
   */
  create(input: CreateDocumentInput): Promise<DocumentRecord>;

  /**
   * Find a document by its unique ID. Returns null if not found.
   */
  findById(id: DocumentId): Promise<DocumentRecord | null>;

  /**
   * Find a document by its URL hash. Returns null if not found.
   */
  findByUrlHash(urlHash: UrlHash): Promise<DocumentRecord | null>;

  /**
   * Find a document by its exact URL. Returns null if not found.
   */
  findByUrl(url: string): Promise<DocumentRecord | null>;

  /**
   * Update an existing document. Throws NotFoundError if document doesn't exist.
   */
  update(id: DocumentId, updates: UpdateDocumentInput): Promise<DocumentRecord>;

  /**
   * Return count of documents in storage.
   */
  count(): Promise<number>;

  /**
   * List documents with optional pagination.
   */
  list(options?: { limit?: number; offset?: number }): Promise<DocumentRecord[]>;

  /**
   * Find all documents with a given index status.
   */
  findByIndexStatus(
    status: DocumentRecord['indexStatus'],
    options?: { limit?: number },
  ): Promise<DocumentRecord[]>;
}

// ============================================================
// URL Record Repository
// ============================================================

export interface UrlRepository {
  /**
   * Create and persist a URL record. Throws ConflictError if urlHash exists.
   */
  create(input: CreateUrlRecordInput): Promise<UrlRecord>;

  /**
   * Find a URL record by its hash. Returns null if not found.
   */
  findByHash(urlHash: UrlHash): Promise<UrlRecord | null>;

  /**
   * Find a URL record by its raw URL. Returns null if not found.
   */
  findByUrl(url: string): Promise<UrlRecord | null>;

  /**
   * Update an existing URL record. Throws NotFoundError if not found.
   */
  update(urlHash: UrlHash, updates: UpdateUrlRecordInput): Promise<UrlRecord>;

  /**
   * Returns count of URL records.
   */
  count(): Promise<number>;

  /**
   * Find URLs with given crawl status.
   */
  findByCrawlStatus(
    status: UrlRecord['crawlStatus'],
    options?: { limit?: number },
  ): Promise<UrlRecord[]>;
}

// ============================================================
// Crawl Record Repository
// ============================================================

export interface CrawlRepository {
  /**
   * Create and persist a new crawl event record.
   */
  create(input: CreateCrawlRecordInput): Promise<CrawlRecord>;

  /**
   * Find a crawl record by ID.
   */
  findById(crawlId: string): Promise<CrawlRecord | null>;

  /**
   * Find all crawl records for a given URL.
   */
  findByUrl(url: string): Promise<CrawlRecord[]>;

  /**
   * Find crawl records for a URL hash.
   */
  findByUrlHash(urlHash: UrlHash): Promise<CrawlRecord[]>;

  /**
   * Returns count of crawl records.
   */
  count(): Promise<number>;
}

// ============================================================
// Index Metadata Repository
// ============================================================

export interface IndexMetadataRepository {
  /**
   * Create and persist an index metadata record.
   */
  create(input: CreateIndexMetadataInput): Promise<IndexMetadataRecord>;

  /**
   * Find index metadata by build ID.
   */
  findById(buildId: string): Promise<IndexMetadataRecord | null>;

  /**
   * Get the currently active index metadata record. Returns null if none.
   */
  findActive(): Promise<IndexMetadataRecord | null>;

  /**
   * Update index metadata. Throws NotFoundError if not found.
   */
  update(buildId: string, updates: UpdateIndexMetadataInput): Promise<IndexMetadataRecord>;

  /**
   * List all index metadata records ordered by startedAt (descending).
   */
  list(): Promise<IndexMetadataRecord[]>;
}

// ============================================================
// Storage Adapter — top-level composition
// ============================================================

export interface StorageAdapter {
  documents: DocumentRepository;
  urls: UrlRepository;
  crawls: CrawlRepository;
  indexMetadata: IndexMetadataRepository;

  /**
   * Initialize the storage (create directories, load data, run migrations, etc.)
   * Must be called before any repository operations.
   */
  initialize(): Promise<void>;

  /**
   * Flush any pending writes and close connections cleanly.
   */
  close(): Promise<void>;

  /**
   * Returns human-readable storage health/statistics for diagnostics.
   */
  health(): Promise<StorageHealth>;
}

export interface StorageHealth {
  initialized: boolean;
  documentCount: number;
  urlCount: number;
  crawlCount: number;
  indexMetadataCount: number;
  storageDir: string;
}
