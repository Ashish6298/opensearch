/**
 * @opensearch/storage — JSON File Store
 * A simple, durable, zero-dependency local storage backend.
 * Stores each collection as a single JSON file on disk.
 *
 * Persistence strategy:
 *   - Each collection is written as a JSON file: documents.json, urls.json,
 *     crawls.json, index-metadata.json inside the configured storageDir.
 *   - Writes are atomic (write to a .tmp file, then rename) to prevent corruption.
 *   - Data survives process restarts as long as the directory is not deleted.
 *   - This backend can be replaced by a SQLite or other adapter implementing
 *     the StorageAdapter interface without touching any other package.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  Logger,
  NotFoundError,
  StorageError,
  createLogger,
  safeJsonParse,
} from '@opensearch/shared';

import {
  CrawlRecord,
  CreateCrawlRecordInput,
  CreateDocumentInput,
  CreateIndexMetadataInput,
  CreateUrlRecordInput,
  DocumentId,
  DocumentRecord,
  INDEX_STATUS,
  IndexMetadataRecord,
  UpdateDocumentInput,
  UpdateIndexMetadataInput,
  UpdateUrlRecordInput,
  UrlHash,
  UrlRecord,
} from '../models.js';

import {
  CrawlRepository,
  DocumentRepository,
  IndexMetadataRepository,
  StorageAdapter,
  StorageHealth,
  UrlRepository,
} from '../repositories.js';

import {
  throwDuplicateError,
  validateCreateCrawlRecordInput,
  validateCreateDocumentInput,
  validateCreateIndexMetadataInput,
  validateCreateUrlRecordInput,
} from '../validation.js';

// ============================================================
// Internal data store type (in-memory representation)
// ============================================================

interface DataStore<T> {
  records: Record<string, T>;
  version: number;
  lastSaved: string;
}

// ============================================================
// Utility helpers
// ============================================================

function generateId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function nowMs(): number {
  return Date.now();
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function atomicWrite(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, json, { encoding: 'utf-8' });
  fs.renameSync(tmpPath, filePath);
}

function readStoreFile<T>(filePath: string): DataStore<T> {
  if (!fs.existsSync(filePath)) {
    return { records: {}, version: 1, lastSaved: nowIso() };
  }
  const raw = fs.readFileSync(filePath, { encoding: 'utf-8' });
  const parsed = safeJsonParse<DataStore<T>>(raw, { records: {}, version: 1, lastSaved: nowIso() });
  if (!parsed.records || typeof parsed.records !== 'object') {
    return { records: {}, version: 1, lastSaved: nowIso() };
  }
  return parsed;
}

// ============================================================
// Generic JSON Collection — manages a single file
// ============================================================

class JsonCollection<T> {
  private store: DataStore<T>;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.store = { records: {}, version: 1, lastSaved: nowIso() };
  }

  load(): void {
    this.store = readStoreFile<T>(this.filePath);
  }

  save(): void {
    this.store.lastSaved = nowIso();
    atomicWrite(this.filePath, this.store);
  }

  has(key: string): boolean {
    return key in this.store.records;
  }

  get(key: string): T | undefined {
    return this.store.records[key];
  }

  set(key: string, value: T): void {
    this.store.records[key] = value;
    this.save();
  }

  update(key: string, value: T): void {
    this.store.records[key] = value;
    this.save();
  }

  values(): T[] {
    return Object.values(this.store.records);
  }

  count(): number {
    return Object.keys(this.store.records).length;
  }
}

// ============================================================
// JSON Document Repository Implementation
// ============================================================

class JsonDocumentRepository implements DocumentRepository {
  private col: JsonCollection<DocumentRecord>;
  private urlIndex: Map<string, DocumentId> = new Map(); // url -> id
  private urlHashIndex: Map<string, DocumentId> = new Map(); // urlHash -> id

  constructor(storageDir: string) {
    this.col = new JsonCollection<DocumentRecord>(path.join(storageDir, 'documents.json'));
  }

  load(): void {
    this.col.load();
    // Rebuild in-memory indexes
    this.urlIndex.clear();
    this.urlHashIndex.clear();
    for (const doc of this.col.values()) {
      this.urlIndex.set(doc.url, doc.id);
      this.urlHashIndex.set(doc.urlHash, doc.id);
    }
  }

  async create(input: CreateDocumentInput): Promise<DocumentRecord> {
    validateCreateDocumentInput(input);

    // Check duplicates
    if (this.urlIndex.has(input.url)) {
      throwDuplicateError('Document', 'url', input.url);
    }
    if (this.urlHashIndex.has(input.urlHash)) {
      throwDuplicateError('Document', 'urlHash', input.urlHash);
    }

    const now = nowIso();
    const doc: DocumentRecord = {
      id: generateId(),
      url: input.url,
      urlHash: input.urlHash,
      title: input.title,
      description: input.description,
      headings: input.headings,
      bodyText: input.bodyText,
      language: input.language ?? null,
      contentType: input.contentType,
      contentLength: input.contentLength,
      httpStatus: input.httpStatus,
      outboundLinks: input.outboundLinks,
      crawledAt: now,
      updatedAt: now,
      indexStatus: input.indexStatus ?? INDEX_STATUS.NOT_INDEXED,
      lastIndexedAt: null,
      indexVersion: null,
    };

    this.col.set(doc.id, doc);
    this.urlIndex.set(doc.url, doc.id);
    this.urlHashIndex.set(doc.urlHash, doc.id);

    return doc;
  }

  async findById(id: DocumentId): Promise<DocumentRecord | null> {
    return this.col.get(id) ?? null;
  }

  async findByUrlHash(urlHash: UrlHash): Promise<DocumentRecord | null> {
    const id = this.urlHashIndex.get(urlHash);
    if (!id) return null;
    return this.col.get(id) ?? null;
  }

  async findByUrl(url: string): Promise<DocumentRecord | null> {
    const id = this.urlIndex.get(url);
    if (!id) return null;
    return this.col.get(id) ?? null;
  }

  async update(id: DocumentId, updates: UpdateDocumentInput): Promise<DocumentRecord> {
    const existing = this.col.get(id);
    if (!existing) {
      throw new NotFoundError(`Document with id "${id}" not found`, {
        code: 'DOCUMENT_NOT_FOUND',
        context: { id },
      });
    }
    const updated: DocumentRecord = { ...existing, ...updates, id: existing.id, updatedAt: nowIso() };
    this.col.update(id, updated);
    return updated;
  }

  async count(): Promise<number> {
    return this.col.count();
  }

  async list(options?: { limit?: number; offset?: number }): Promise<DocumentRecord[]> {
    const all = this.col.values();
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? all.length;
    return all.slice(offset, offset + limit);
  }

  async findByIndexStatus(
    status: DocumentRecord['indexStatus'],
    options?: { limit?: number },
  ): Promise<DocumentRecord[]> {
    const all = this.col.values().filter(d => d.indexStatus === status);
    if (options?.limit !== undefined) {
      return all.slice(0, options.limit);
    }
    return all;
  }
}

// ============================================================
// JSON URL Repository Implementation
// ============================================================

class JsonUrlRepository implements UrlRepository {
  private col: JsonCollection<UrlRecord>;
  private urlIndex: Map<string, UrlHash> = new Map(); // url -> hash

  constructor(storageDir: string) {
    this.col = new JsonCollection<UrlRecord>(path.join(storageDir, 'urls.json'));
  }

  load(): void {
    this.col.load();
    this.urlIndex.clear();
    for (const rec of this.col.values()) {
      this.urlIndex.set(rec.url, rec.urlHash);
    }
  }

  async create(input: CreateUrlRecordInput): Promise<UrlRecord> {
    validateCreateUrlRecordInput(input);

    if (this.col.has(input.urlHash)) {
      throwDuplicateError('UrlRecord', 'urlHash', input.urlHash);
    }
    if (this.urlIndex.has(input.url)) {
      throwDuplicateError('UrlRecord', 'url', input.url);
    }

    const now = nowMs();
    const rec: UrlRecord = {
      urlHash: input.urlHash,
      url: input.url,
      domain: input.domain,
      scheme: input.scheme,
      crawlStatus: input.crawlStatus,
      discoveredAt: now,
      lastAttemptedAt: null,
      lastSucceededAt: null,
      attemptCount: input.attemptCount ?? 0,
      lastHttpStatus: input.lastHttpStatus ?? null,
      referrerUrl: input.referrerUrl ?? null,
      depth: input.depth,
    };

    this.col.set(rec.urlHash, rec);
    this.urlIndex.set(rec.url, rec.urlHash);
    return rec;
  }

  async findByHash(urlHash: UrlHash): Promise<UrlRecord | null> {
    return this.col.get(urlHash) ?? null;
  }

  async findByUrl(url: string): Promise<UrlRecord | null> {
    const hash = this.urlIndex.get(url);
    if (!hash) return null;
    return this.col.get(hash) ?? null;
  }

  async update(urlHash: UrlHash, updates: UpdateUrlRecordInput): Promise<UrlRecord> {
    const existing = this.col.get(urlHash);
    if (!existing) {
      throw new NotFoundError(`UrlRecord with hash "${urlHash}" not found`, {
        code: 'URL_NOT_FOUND',
        context: { urlHash },
      });
    }
    const updated: UrlRecord = { ...existing, ...updates, urlHash: existing.urlHash, url: existing.url };
    this.col.update(urlHash, updated);
    return updated;
  }

  async count(): Promise<number> {
    return this.col.count();
  }

  async findByCrawlStatus(
    status: UrlRecord['crawlStatus'],
    options?: { limit?: number },
  ): Promise<UrlRecord[]> {
    const all = this.col.values().filter(r => r.crawlStatus === status);
    if (options?.limit !== undefined) {
      return all.slice(0, options.limit);
    }
    return all;
  }
}

// ============================================================
// JSON Crawl Repository Implementation
// ============================================================

class JsonCrawlRepository implements CrawlRepository {
  private col: JsonCollection<CrawlRecord>;

  constructor(storageDir: string) {
    this.col = new JsonCollection<CrawlRecord>(path.join(storageDir, 'crawls.json'));
  }

  load(): void {
    this.col.load();
  }

  async create(input: CreateCrawlRecordInput): Promise<CrawlRecord> {
    validateCreateCrawlRecordInput(input);

    const record: CrawlRecord = {
      crawlId: generateId(),
      url: input.url,
      urlHash: input.urlHash,
      status: input.status,
      httpStatus: input.httpStatus ?? null,
      contentType: input.contentType ?? null,
      responseBytes: input.responseBytes ?? null,
      durationMs: input.durationMs ?? null,
      startedAt: input.startedAt,
      completedAt: input.completedAt ?? null,
      errorMessage: input.errorMessage ?? null,
      redirectChain: input.redirectChain,
      finalUrl: input.finalUrl ?? null,
      documentId: input.documentId ?? null,
    };

    this.col.set(record.crawlId, record);
    return record;
  }

  async findById(crawlId: string): Promise<CrawlRecord | null> {
    return this.col.get(crawlId) ?? null;
  }

  async findByUrl(url: string): Promise<CrawlRecord[]> {
    return this.col.values().filter(r => r.url === url);
  }

  async findByUrlHash(urlHash: UrlHash): Promise<CrawlRecord[]> {
    return this.col.values().filter(r => r.urlHash === urlHash);
  }

  async count(): Promise<number> {
    return this.col.count();
  }
}

// ============================================================
// JSON Index Metadata Repository Implementation
// ============================================================

class JsonIndexMetadataRepository implements IndexMetadataRepository {
  private col: JsonCollection<IndexMetadataRecord>;

  constructor(storageDir: string) {
    this.col = new JsonCollection<IndexMetadataRecord>(path.join(storageDir, 'index-metadata.json'));
  }

  load(): void {
    this.col.load();
  }

  async create(input: CreateIndexMetadataInput): Promise<IndexMetadataRecord> {
    validateCreateIndexMetadataInput(input);

    const record: IndexMetadataRecord = {
      buildId: generateId(),
      version: input.version,
      startedAt: nowIso(),
      completedAt: input.completedAt ?? null,
      isActive: input.isActive ?? false,
      documentCount: input.documentCount,
      termCount: input.termCount ?? 0,
      indexPath: input.indexPath,
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      lastRebuildAt: input.lastRebuildAt ?? null,
    };

    this.col.set(record.buildId, record);
    return record;
  }

  async findById(buildId: string): Promise<IndexMetadataRecord | null> {
    return this.col.get(buildId) ?? null;
  }

  async findActive(): Promise<IndexMetadataRecord | null> {
    const active = this.col.values().find(m => m.isActive && m.status === 'ready');
    return active ?? null;
  }

  async update(buildId: string, updates: UpdateIndexMetadataInput): Promise<IndexMetadataRecord> {
    const existing = this.col.get(buildId);
    if (!existing) {
      throw new NotFoundError(`IndexMetadata with buildId "${buildId}" not found`, {
        code: 'INDEX_METADATA_NOT_FOUND',
        context: { buildId },
      });
    }
    const updated: IndexMetadataRecord = { ...existing, ...updates, buildId: existing.buildId };
    this.col.update(buildId, updated);
    return updated;
  }

  async list(): Promise<IndexMetadataRecord[]> {
    return this.col
      .values()
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }
}

// ============================================================
// JSON Storage Adapter (top-level composition)
// ============================================================

export interface JsonStorageAdapterOptions {
  storageDir: string;
  logger?: Logger;
}

export class JsonStorageAdapter implements StorageAdapter {
  private readonly storageDir: string;
  private readonly logger: Logger;
  private _initialized = false;

  private readonly _documents: JsonDocumentRepository;
  private readonly _urls: JsonUrlRepository;
  private readonly _crawls: JsonCrawlRepository;
  private readonly _indexMetadata: JsonIndexMetadataRepository;

  constructor(options: JsonStorageAdapterOptions) {
    this.storageDir = options.storageDir;
    this.logger = options.logger ?? createLogger('@opensearch/storage:json-adapter');

    this._documents = new JsonDocumentRepository(this.storageDir);
    this._urls = new JsonUrlRepository(this.storageDir);
    this._crawls = new JsonCrawlRepository(this.storageDir);
    this._indexMetadata = new JsonIndexMetadataRepository(this.storageDir);
  }

  get documents(): DocumentRepository {
    this.requireInitialized();
    return this._documents;
  }

  get urls(): UrlRepository {
    this.requireInitialized();
    return this._urls;
  }

  get crawls(): CrawlRepository {
    this.requireInitialized();
    return this._crawls;
  }

  get indexMetadata(): IndexMetadataRepository {
    this.requireInitialized();
    return this._indexMetadata;
  }

  async initialize(): Promise<void> {
    try {
      ensureDir(this.storageDir);
      this._documents.load();
      this._urls.load();
      this._crawls.load();
      this._indexMetadata.load();
      this._initialized = true;
      this.logger.info('Storage initialized', { storageDir: this.storageDir });
    } catch (err) {
      throw new StorageError('Failed to initialize storage', {
        code: 'STORAGE_INIT_FAILED',
        cause: err,
        context: { storageDir: this.storageDir },
      });
    }
  }

  async close(): Promise<void> {
    this._initialized = false;
    this.logger.info('Storage closed');
  }

  async health(): Promise<StorageHealth> {
    return {
      initialized: this._initialized,
      documentCount: await this._documents.count(),
      urlCount: await this._urls.count(),
      crawlCount: await this._crawls.count(),
      indexMetadataCount: (await this._indexMetadata.list()).length,
      storageDir: this.storageDir,
    };
  }

  private requireInitialized(): void {
    if (!this._initialized) {
      throw new StorageError('Storage has not been initialized. Call initialize() first.', {
        code: 'STORAGE_NOT_INITIALIZED',
      });
    }
  }
}
