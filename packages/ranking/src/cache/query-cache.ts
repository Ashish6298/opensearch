/**
 * @opensearch/ranking — LRU Query Cache (Phase 28)
 *
 * Provides a lightweight, privacy-compatible, in-memory LRU cache for search results:
 * - Deterministic, normalized query keys (ignoring extra whitespace and case variations)
 * - Configurable capacity limit (default: 250 entries, bounded memory)
 * - Configurable TTL expiration (default: 60,000ms / 1 minute)
 * - Zero user identifiers, zero IP addresses, and zero tracking keys stored
 * - Automatic eviction of oldest entries when capacity is reached
 * - Detailed cache telemetry (hits, misses, evictions, hit-rate)
 */

export interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: number;
  lastAccessedAt: number;
  hitCount: number;
}

export interface CacheStats {
  size: number;
  maxCapacity: number;
  ttlMs: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRatePercent: number;
}

export interface QueryCacheOptions {
  /** Maximum number of queries cached concurrently (default: 250) */
  maxCapacity?: number;
  /** Time-to-live in milliseconds before cache expiration (default: 60000ms) */
  ttlMs?: number;
}

export class LruQueryCache<T = unknown> {
  private readonly maxCapacity: number;
  private readonly ttlMs: number;
  private readonly entries = new Map<string, CacheEntry<T>>();

  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: QueryCacheOptions = {}) {
    this.maxCapacity = Math.max(1, options.maxCapacity ?? 250);
    this.ttlMs = Math.max(10, options.ttlMs ?? 60000);
  }

  /**
   * Normalizes a search query string and pagination parameters into a deterministic cache key.
   */
  static buildKey(query: string, page = 1, pageSize = 10): string {
    const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
    return `q:${normalizedQuery}|p:${page}|s:${pageSize}`;
  }

  /**
   * Retrieves a cached value if present and unexpired. Refreshes LRU position.
   */
  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    // Check if expired
    if (now - entry.createdAt > this.ttlMs) {
      this.entries.delete(key);
      this.misses++;
      return null;
    }

    // Refresh LRU order by deleting and re-inserting
    this.entries.delete(key);
    entry.lastAccessedAt = now;
    entry.hitCount++;
    this.entries.set(key, entry);

    this.hits++;
    return entry.value;
  }

  /**
   * Stores a value in cache, evicting the oldest accessed entry if at capacity.
   */
  set(key: string, value: T): void {
    const now = Date.now();

    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxCapacity) {
      // Evict least recently used entry (first key in Map iterator)
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) {
        this.entries.delete(oldestKey);
        this.evictions++;
      }
    }

    this.entries.set(key, {
      key,
      value,
      createdAt: now,
      lastAccessedAt: now,
      hitCount: 0,
    });
  }

  /**
   * Checks if a key exists and is unexpired without altering access stats.
   */
  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Invalidates all cache entries.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Returns cache metrics and hit rates.
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRatePercent =
      totalRequests > 0 ? Math.round((this.hits / totalRequests) * 10000) / 100 : 0;

    return {
      size: this.entries.size,
      maxCapacity: this.maxCapacity,
      ttlMs: this.ttlMs,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRatePercent,
    };
  }
}

/**
 * Factory creating an LRU query cache.
 */
export function createQueryCache<T = unknown>(options?: QueryCacheOptions): LruQueryCache<T> {
  return new LruQueryCache<T>(options);
}
