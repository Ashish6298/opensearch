/**
 * @opensearch/crawler — Persistent FIFO Crawl Queue (Phase 4)
 *
 * A JSON-backed crawl queue that:
 *   - Maintains FIFO ordering
 *   - Deduplicates by urlHash (seen-set survives process restarts)
 *   - Persists state atomically to prevent data corruption
 *   - Enforces a configurable maximum queue size
 *   - Validates and normalizes URLs before accepting them
 *
 * Persistence:
 *   Two files are written to `persistenceDir`:
 *   - queue.json  — the ordered array of pending CrawlQueueEntry objects
 *   - seen.json   — a flat set of urlHash strings (includes dequeued entries)
 *
 *   Both files use write-to-tmp-then-rename for atomic writes.
 *   On restart, both files are loaded and the seen-set is rebuilt, preventing
 *   re-enqueuing of URLs that were already processed in a previous run.
 *
 * Thread safety:
 *   This implementation is single-process, single-thread safe (Node.js event loop).
 *   It is NOT safe for concurrent multi-process access to the same directory.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  CRAWLER_LIMITS,
  Logger,
  StorageError,
  createLogger,
  safeJsonParse,
} from '@opensearch/shared';

import { CrawlQueueEntry, ENQUEUE_RESULT, EnqueueOutcome } from '../url/url-model.js';
import { validateUrl } from '../url/url-validator.js';
import { computeUrlHash } from '../url/url-fingerprint.js';
import { CrawlQueue, QueueStats } from './queue-types.js';

// ============================================================
// On-disk data structures
// ============================================================

interface QueueStore {
  version: number;
  entries: CrawlQueueEntry[];
  lastSaved: string;
}

interface SeenStore {
  version: number;
  seen: string[]; // flat array of urlHashes — converted to Set on load
  lastSaved: string;
}

// ============================================================
// Utility helpers
// ============================================================

function nowIso(): string {
  return new Date().toISOString();
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function atomicWrite(filePath: string, data: unknown): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
  fs.renameSync(tmp, filePath);
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, { encoding: 'utf-8' });
  return safeJsonParse<T>(raw, fallback);
}

// ============================================================
// PersistentCrawlQueue implementation
// ============================================================

export interface PersistentCrawlQueueOptions {
  /** Directory where queue.json and seen.json are stored */
  persistenceDir: string;
  /** Maximum entries allowed in the queue at once (not including dequeued) */
  maxQueueSize?: number;
  logger?: Logger;
}

export class PersistentCrawlQueue implements CrawlQueue {
  private readonly persistenceDir: string;
  private readonly maxQueueSize: number;
  private readonly logger: Logger;

  // In-memory state
  private queue: CrawlQueueEntry[] = [];
  private seen: Set<string> = new Set();
  private initialized = false;

  // File paths
  private readonly queueFile: string;
  private readonly seenFile: string;

  constructor(options: PersistentCrawlQueueOptions) {
    this.persistenceDir = options.persistenceDir;
    this.maxQueueSize = options.maxQueueSize ?? CRAWLER_LIMITS.MAX_QUEUE_SIZE;
    this.logger = options.logger ?? createLogger('@opensearch/crawler:queue');
    this.queueFile = path.join(this.persistenceDir, 'queue.json');
    this.seenFile = path.join(this.persistenceDir, 'seen.json');
  }

  // ---- Lifecycle ------------------------------------------------

  /**
   * Initialize: create directory, load queue and seen-set from disk.
   * Must be called before any other method.
   */
  async initialize(): Promise<void> {
    try {
      ensureDir(this.persistenceDir);
      this.loadFromDisk();
      this.initialized = true;
      this.logger.info('Crawl queue initialized', {
        pending: this.queue.length,
        seen: this.seen.size,
        persistenceDir: this.persistenceDir,
      });
    } catch (err) {
      throw new StorageError('Failed to initialize crawl queue', {
        code: 'QUEUE_INIT_FAILED',
        cause: err,
        context: { persistenceDir: this.persistenceDir },
      });
    }
  }

  async close(): Promise<void> {
    this.persistQueue();
    this.persistSeen();
    this.initialized = false;
    this.logger.info('Crawl queue closed');
  }

  // ---- CrawlQueue interface methods ----------------------------

  async enqueue(
    rawUrl: string,
    depth: number,
    discoveredFrom: string | null,
  ): Promise<EnqueueOutcome> {
    this.requireInitialized();

    // Validate (which also normalizes internally)
    const validation = validateUrl(rawUrl);
    if (!validation.ok) {
      return { code: ENQUEUE_RESULT.INVALID_URL, reason: validation.reason };
    }

    const normalizedUrl = validation.parsed.href;
    const urlHash = computeUrlHash(normalizedUrl);

    // Deduplication check (seen-set includes dequeued entries)
    if (this.seen.has(urlHash)) {
      return { code: ENQUEUE_RESULT.DUPLICATE_SKIPPED };
    }

    // Capacity check
    if (this.queue.length >= this.maxQueueSize) {
      this.logger.warn('Crawl queue is full', {
        size: this.queue.length,
        maxQueueSize: this.maxQueueSize,
      });
      return { code: ENQUEUE_RESULT.QUEUE_FULL };
    }

    const entry: CrawlQueueEntry = {
      normalizedUrl,
      urlHash,
      depth,
      discoveredFrom,
      enqueuedAt: nowIso(),
    };

    this.queue.push(entry);
    this.seen.add(urlHash);

    this.persistQueue();
    this.persistSeen();

    this.logger.debug('URL enqueued', { normalizedUrl, depth, urlHash });
    return { code: ENQUEUE_RESULT.QUEUED, entry };
  }

  async dequeue(): Promise<CrawlQueueEntry | null> {
    this.requireInitialized();
    if (this.queue.length === 0) return null;

    const entry = this.queue.shift()!;
    // Note: we do NOT remove from seen-set — seen means "ever queued"
    this.persistQueue();

    this.logger.debug('URL dequeued', { normalizedUrl: entry.normalizedUrl });
    return entry;
  }

  async peek(): Promise<CrawlQueueEntry | null> {
    this.requireInitialized();
    return this.queue[0] ?? null;
  }

  async contains(urlHash: string): Promise<boolean> {
    this.requireInitialized();
    return this.seen.has(urlHash);
  }

  async size(): Promise<number> {
    this.requireInitialized();
    return this.queue.length;
  }

  async isEmpty(): Promise<boolean> {
    this.requireInitialized();
    return this.queue.length === 0;
  }

  async clear(): Promise<void> {
    this.requireInitialized();
    this.queue = [];
    this.persistQueue();
    this.logger.info('Crawl queue cleared (seen-set preserved)');
  }

  // ---- Stats ---------------------------------------------------

  stats(): QueueStats {
    return {
      pendingCount: this.queue.length,
      seenCount: this.seen.size,
      maxQueueSize: this.maxQueueSize,
      persistencePath: this.persistenceDir,
    };
  }

  // ---- Internal ------------------------------------------------

  private requireInitialized(): void {
    if (!this.initialized) {
      throw new StorageError('CrawlQueue has not been initialized. Call initialize() first.', {
        code: 'QUEUE_NOT_INITIALIZED',
      });
    }
  }

  private loadFromDisk(): void {
    const qStore = readJsonFile<QueueStore>(this.queueFile, {
      version: 1,
      entries: [],
      lastSaved: nowIso(),
    });
    const sStore = readJsonFile<SeenStore>(this.seenFile, {
      version: 1,
      seen: [],
      lastSaved: nowIso(),
    });

    // Validate entries are proper objects before loading
    this.queue = Array.isArray(qStore.entries)
      ? qStore.entries.filter(
          e => typeof e?.normalizedUrl === 'string' && typeof e?.urlHash === 'string',
        )
      : [];

    this.seen = new Set(
      Array.isArray(sStore.seen) ? sStore.seen.filter(h => typeof h === 'string') : [],
    );
  }

  private persistQueue(): void {
    const store: QueueStore = {
      version: 1,
      entries: this.queue,
      lastSaved: nowIso(),
    };
    atomicWrite(this.queueFile, store);
  }

  private persistSeen(): void {
    const store: SeenStore = {
      version: 1,
      seen: [...this.seen],
      lastSaved: nowIso(),
    };
    atomicWrite(this.seenFile, store);
  }
}
