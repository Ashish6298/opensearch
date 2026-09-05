/**
 * @opensearch/crawler — Robots Cache (Phase 6)
 *
 * Implements an LRU-bounded in-memory cache keyed by canonical origin (scheme://host:port):
 * - Fast map lookup
 * - TTL-based expiration
 * - Maximum capacity eviction (LRU order)
 * - Safe concurrency and isolation
 */

import { CachedRobotsPolicy, RobotsCache } from './robots-types.js';

export interface MemoryRobotsCacheOptions {
  maxSize?: number;
  defaultTtlMs?: number;
}

export class MemoryRobotsCache implements RobotsCache {
  private readonly map = new Map<string, CachedRobotsPolicy>();
  private readonly maxSize: number;

  constructor(options: MemoryRobotsCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 5_000;
  }

  get(origin: string): CachedRobotsPolicy | undefined {
    const entry = this.map.get(origin);
    if (!entry) return undefined;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.map.delete(origin);
      return undefined;
    }

    // Refresh LRU order (re-insert)
    this.map.delete(origin);
    this.map.set(origin, entry);
    return entry;
  }

  set(origin: string, policy: CachedRobotsPolicy): void {
    if (this.map.has(origin)) {
      this.map.delete(origin);
    } else if (this.map.size >= this.maxSize) {
      // Evict oldest (first key in insertion order)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey) {
        this.map.delete(oldestKey);
      }
    }

    this.map.set(origin, policy);
  }

  has(origin: string): boolean {
    return this.get(origin) !== undefined;
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}
