/**
 * @opensearch/api — In-Memory Rate Limiter (Phase 18)
 *
 * Lightweight, zero-external-dependency sliding-window rate limiter.
 * Tracks request counts per client key (IP address) within a sliding time window.
 * Suitable for free tier/low-memory hosting environments.
 */

export interface RateLimiterOptions {
  /** Maximum number of requests allowed per window */
  maxRequests: number;
  /** Window duration in milliseconds (default: 60_000ms = 1 minute) */
  windowMs?: number;
  /** Interval in milliseconds to purge expired client records (default: 60_000ms) */
  cleanupIntervalMs?: number;
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
}

interface ClientBucket {
  tokens: number;
  windowStartMs: number;
}

export class MemoryRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly buckets = new Map<string, ClientBucket>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: RateLimiterOptions) {
    this.maxRequests = Math.max(1, options.maxRequests);
    this.windowMs = Math.max(1000, options.windowMs ?? 60_000);

    const cleanupInterval = options.cleanupIntervalMs ?? 60_000;
    if (cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
      if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref();
      }
    }
  }

  /**
   * Consumes a request token for the given client identifier.
   */
  consume(clientId: string): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(clientId);

    if (!bucket || now - bucket.windowStartMs >= this.windowMs) {
      bucket = {
        tokens: 1,
        windowStartMs: now,
      };
      this.buckets.set(clientId, bucket);

      const resetTimeMs = now + this.windowMs;
      return {
        allowed: true,
        limit: this.maxRequests,
        remaining: this.maxRequests - 1,
        resetTimeMs,
        retryAfterSeconds: 0,
      };
    }

    const resetTimeMs = bucket.windowStartMs + this.windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));

    if (bucket.tokens < this.maxRequests) {
      bucket.tokens += 1;
      return {
        allowed: true,
        limit: this.maxRequests,
        remaining: this.maxRequests - bucket.tokens,
        resetTimeMs,
        retryAfterSeconds: 0,
      };
    }

    // Limit exceeded
    return {
      allowed: false,
      limit: this.maxRequests,
      remaining: 0,
      resetTimeMs,
      retryAfterSeconds,
    };
  }

  /**
   * Resets rate tracking for a specific client (useful for unit testing).
   */
  resetClient(clientId: string): void {
    this.buckets.delete(clientId);
  }

  /**
   * Returns active tracker bucket count.
   */
  getActiveCount(): number {
    return this.buckets.size;
  }

  /**
   * Returns rate limiter runtime statistics.
   */
  getStats(): { activeEntries: number; maxRequests: number; windowMs: number } {
    return {
      activeEntries: this.buckets.size,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
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
    this.buckets.clear();
  }

  /**
   * Removes stale buckets whose window has fully expired.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [clientId, bucket] of this.buckets.entries()) {
      if (now - bucket.windowStartMs >= this.windowMs) {
        this.buckets.delete(clientId);
      }
    }
  }
}

export function createRateLimiter(options: RateLimiterOptions): MemoryRateLimiter {
  return new MemoryRateLimiter(options);
}
