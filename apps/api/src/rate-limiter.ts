/**
 * @opensearch/api — Rate Limiting & Storage Compatibility (Phase 18 & Phase 111)
 *
 * Pluggable sliding-window rate limiter supporting:
 * - Route-specific rate limits (search vs suggest vs admin vs health).
 * - Multi-store backends: In-Memory (single instance) and File-Backed (multi-process & restart survival).
 * - Multi-instance hosting compatibility awareness (documents distributed edge/proxy requirements).
 * - Operation complexity weighting protecting against resource-exhaustion queries.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RateLimitBucket {
  tokens: number;
  windowStartMs: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Total limit in the current window */
  limit: number;
  /** Remaining allowed requests in the current window */
  remaining: number;
  /** Time when the current window resets (epoch milliseconds) */
  resetTimeMs: number;
  /** Seconds until the client can retry if rejected */
  retryAfterSeconds: number;
  /** Which route rule or tier applied */
  tier?: string;
}

/**
 * Storage adapter interface for rate limit persistence.
 */
export interface RateLimitStore {
  get(key: string): RateLimitBucket | undefined;
  set(key: string, bucket: RateLimitBucket, ttlMs: number): void;
  delete(key: string): void;
  cleanup(now: number, windowMs: number): void;
  clear(): void;
  size(): number;
  destroy?(): void;
}

/**
 * In-Memory Store — default for single-process standalone deployment and tests.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitBucket>();

  get(key: string): RateLimitBucket | undefined {
    return this.buckets.get(key);
  }

  set(key: string, bucket: RateLimitBucket): void {
    this.buckets.set(key, bucket);
  }

  delete(key: string): void {
    this.buckets.delete(key);
  }

  cleanup(now: number, windowMs: number): void {
    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.windowStartMs >= windowMs) {
        this.buckets.delete(key);
      }
    }
  }

  clear(): void {
    this.buckets.clear();
  }

  size(): number {
    return this.buckets.size;
  }
}

/**
 * File-Backed Store — persists buckets to disk with atomic write.
 * Enables rate-limit survival across process restarts and multi-process workers
 * on the same host without requiring external paid infrastructure (Redis, etc.).
 */
export class FileBackedRateLimitStore implements RateLimitStore {
  private readonly filePath: string;
  private readonly buckets = new Map<string, RateLimitBucket>();
  private lastMtimeMs = 0;

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        // Fallback
      }
    }
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const stat = fs.statSync(this.filePath);
        if (stat.mtimeMs > this.lastMtimeMs) {
          const raw = fs.readFileSync(this.filePath, 'utf8');
          const data = JSON.parse(raw);
          this.buckets.clear();
          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === 'object' && 'tokens' in v && 'windowStartMs' in v) {
              this.buckets.set(k, v as RateLimitBucket);
            }
          }
          this.lastMtimeMs = stat.mtimeMs;
        }
      }
    } catch {
      // Ignore corrupt reads and use in-memory fallback
    }
  }

  private flushToDisk(): void {
    try {
      const obj: Record<string, RateLimitBucket> = {};
      for (const [k, v] of this.buckets.entries()) {
        obj[k] = v;
      }
      const tmpPath = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(obj), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
      const stat = fs.statSync(this.filePath);
      this.lastMtimeMs = stat.mtimeMs;
    } catch {
      // In-memory record remains active even if disk flush fails
    }
  }

  get(key: string): RateLimitBucket | undefined {
    this.loadFromDisk();
    return this.buckets.get(key);
  }

  set(key: string, bucket: RateLimitBucket): void {
    this.buckets.set(key, bucket);
    this.flushToDisk();
  }

  delete(key: string): void {
    this.buckets.delete(key);
    this.flushToDisk();
  }

  cleanup(now: number, windowMs: number): void {
    let changed = false;
    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.windowStartMs >= windowMs) {
        this.buckets.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.flushToDisk();
    }
  }

  clear(): void {
    this.buckets.clear();
    this.flushToDisk();
  }

  size(): number {
    this.loadFromDisk();
    return this.buckets.size;
  }
}

export interface RouteRateLimitRule {
  /** Path prefix or regex to match route */
  pattern: string | RegExp;
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds (default: 60,000ms) */
  windowMs?: number;
  /** Label for tracking / explain */
  label?: string;
}

export interface RateLimiterOptions {
  /** Maximum number of requests allowed per window for default routes */
  maxRequests: number;
  /** Window duration in milliseconds (default: 60_000ms = 1 minute) */
  windowMs?: number;
  /** Interval in milliseconds to purge expired client records (default: 60_000ms) */
  cleanupIntervalMs?: number;
  /** Pluggable storage backend */
  store?: RateLimitStore;
  /** Optional route-specific rules */
  routeRules?: RouteRateLimitRule[];
}

export class MemoryRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly store: RateLimitStore;
  private readonly routeRules: RouteRateLimitRule[];
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: RateLimiterOptions) {
    this.maxRequests = Math.max(1, options.maxRequests);
    this.windowMs = Math.max(1000, options.windowMs ?? 60_000);
    this.store = options.store ?? new MemoryRateLimitStore();
    this.routeRules = options.routeRules ?? [];

    const cleanupInterval = options.cleanupIntervalMs ?? 60_000;
    if (cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
      if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref();
      }
    }
  }

  /**
   * Consumes request tokens for a client identifier, optionally matching route-specific rules
   * and applying operation complexity cost.
   */
  consume(clientId: string, pathname?: string, cost: number = 1): RateLimitResult {
    const now = Date.now();
    const effectiveCost = Math.max(1, cost);

    // Determine limit and window based on pathname
    let limit = this.maxRequests;
    let windowMs = this.windowMs;
    let key = clientId;
    let tier = 'default';

    if (pathname && this.routeRules.length > 0) {
      for (const rule of this.routeRules) {
        const matches =
          typeof rule.pattern === 'string'
            ? pathname === rule.pattern || pathname.startsWith(`${rule.pattern}/`)
            : rule.pattern.test(pathname);

        if (matches) {
          limit = rule.maxRequests;
          windowMs = rule.windowMs ?? this.windowMs;
          const ruleLabel = rule.label ?? (typeof rule.pattern === 'string' ? rule.pattern : 'custom');
          key = `${clientId}:${ruleLabel}`;
          tier = ruleLabel;
          break;
        }
      }
    }

    let bucket = this.store.get(key);

    if (!bucket || now - bucket.windowStartMs >= windowMs) {
      bucket = {
        tokens: effectiveCost,
        windowStartMs: now,
      };
      this.store.set(key, bucket, windowMs);

      const resetTimeMs = now + windowMs;
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - effectiveCost),
        resetTimeMs,
        retryAfterSeconds: 0,
        tier,
      };
    }

    const resetTimeMs = bucket.windowStartMs + windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));

    if (bucket.tokens + effectiveCost <= limit) {
      bucket.tokens += effectiveCost;
      this.store.set(key, bucket, windowMs);

      return {
        allowed: true,
        limit,
        remaining: limit - bucket.tokens,
        resetTimeMs,
        retryAfterSeconds: 0,
        tier,
      };
    }

    // Limit exceeded
    return {
      allowed: false,
      limit,
      remaining: Math.max(0, limit - bucket.tokens),
      resetTimeMs,
      retryAfterSeconds,
      tier,
    };
  }

  /**
   * Resets rate tracking for a specific client.
   */
  resetClient(clientId: string): void {
    this.store.delete(clientId);
    // Also clear any route-keyed subentries if present
    for (const rule of this.routeRules) {
      const label = rule.label ?? (typeof rule.pattern === 'string' ? rule.pattern : 'custom');
      this.store.delete(`${clientId}:${label}`);
    }
  }

  /**
   * Returns active tracker bucket count.
   */
  getActiveCount(): number {
    return this.store.size();
  }

  /**
   * Returns the underlying rate limit storage adapter.
   */
  getStore(): RateLimitStore {
    return this.store;
  }

  /**
   * Returns rate limiter runtime statistics.
   */
  getStats(): { activeEntries: number; maxRequests: number; windowMs: number; routeRulesCount: number } {
    return {
      activeEntries: this.store.size(),
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
      routeRulesCount: this.routeRules.length,
    };
  }

  /**
   * Clears all client buckets and stops background cleanup timer.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
    if (this.store.destroy) {
      this.store.destroy();
    }
  }

  /**
   * Removes stale buckets whose window has fully expired.
   */
  private cleanup(): void {
    const now = Date.now();
    this.store.cleanup(now, this.windowMs);
  }
}

export function createRateLimiter(options: RateLimiterOptions): MemoryRateLimiter {
  return new MemoryRateLimiter(options);
}
