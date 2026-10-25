/**
 * @opensearch/ranking — Search Provider In-Memory Response Cache (Phase 71)
 *
 * Implements bounded LRU response caching conforming strictly to privacy constraints:
 * - Deterministic, query-only cache keys (no user identities, cookies, or tracking headers).
 * - Bounded maximum cache size with least-recently-used (LRU) eviction.
 * - Time-To-Live (TTL) expiration per provider policy.
 * - Isolated, thread-safe memory storage without disk persistence of queries.
 */

import { NormalizedSearchResult } from './provider-types.js';

export interface CacheEntry {
  key: string;
  providerId: string;
  results: NormalizedSearchResult[];
  totalHits?: number;
  createdAtMs: number;
  expiresAtMs: number;
  lastAccessedMs: number;
}

export interface ProviderCacheStats {
  hits: number;
  misses: number;
  evictions: number;
  entryCount: number;
}

export class ProviderResponseCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly defaultMaxSize: number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(defaultMaxSize = 500) {
    this.defaultMaxSize = defaultMaxSize;
  }

  /**
   * Generates a deterministic, privacy-preserving cache key.
   * Strips all user-identifying attributes, hashing only providerId, normalized query, limit, and categories.
   */
  public static makeKey(
    providerId: string,
    query: string,
    limit = 10,
    categories: string[] = [],
  ): string {
    const cleanProvider = providerId.toLowerCase().trim();
    const cleanQuery = query.toLowerCase().trim();
    const cleanCategories = [...categories].sort().join(',');
    return `${cleanProvider}::${cleanQuery}::lim=${limit}::cat=${cleanCategories}`;
  }

  /**
   * Retrieves an unexpired cached result for the given key.
   */
  public get(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    const now = Date.now();
    if (now >= entry.expiresAtMs) {
      // Expired entry
      this.entries.delete(key);
      this.misses++;
      return undefined;
    }

    // Refresh LRU order: delete and re-insert
    entry.lastAccessedMs = now;
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits++;
    return entry;
  }

  /**
   * Stores a search result in the cache respecting TTL and size limits.
   */
  public set(
    key: string,
    providerId: string,
    results: NormalizedSearchResult[],
    ttlSeconds: number,
    totalHits?: number,
    maxSizeOverride?: number,
  ): void {
    if (ttlSeconds <= 0) {
      return; // Caching disabled for this item
    }

    const maxSize = maxSizeOverride ?? this.defaultMaxSize;
    const now = Date.now();

    // Evict oldest if reaching capacity
    if (this.entries.size >= maxSize && !this.entries.has(key)) {
      this.evictOldest();
    }

    const entry: CacheEntry = {
      key,
      providerId,
      results: results.map(r => ({ ...r })), // Deep clone
      totalHits,
      createdAtMs: now,
      expiresAtMs: now + ttlSeconds * 1000,
      lastAccessedMs: now,
    };

    // Store entry
    this.entries.set(key, entry);
  }

  /**
   * Evicts the least recently used entry.
   */
  private evictOldest(): void {
    const oldestKey = this.entries.keys().next().value;
    if (oldestKey) {
      this.entries.delete(oldestKey);
      this.evictions++;
    }
  }

  /**
   * Explicitly invalidates all entries for a given provider.
   */
  public invalidateProvider(providerId: string): number {
    const cleanId = providerId.toLowerCase().trim();
    let count = 0;
    for (const [key, entry] of this.entries.entries()) {
      if (entry.providerId === cleanId) {
        this.entries.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Cleans up all expired entries.
   */
  public purgeExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.entries.entries()) {
      if (now >= entry.expiresAtMs) {
        this.entries.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clears the entire cache and resets counters.
   */
  public clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Returns operational statistics for testing and health monitoring.
   */
  public getStats(): ProviderCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      entryCount: this.entries.size,
    };
  }
}
