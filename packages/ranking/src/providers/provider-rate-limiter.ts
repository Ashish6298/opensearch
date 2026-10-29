/**
 * @opensearch/ranking — Provider-Specific Rate Limiter (Phase 111)
 *
 * Proactively enforces rate limits and quota windows for external search providers
 * (e.g. Wikimedia, external APIs) to prevent upstream throttling, IP bans,
 * and HTTP 429 response spikes.
 */

export interface ProviderRateLimitRule {
  /** Maximum requests allowed within window */
  maxRequests: number;
  /** Window duration in milliseconds (default: 60,000ms = 1 min) */
  windowMs?: number;
}

export interface ProviderRateLimiterOptions {
  /** Default request limit for providers without custom rule */
  defaultMaxRequests?: number;
  /** Default window duration in milliseconds (default: 60,000ms) */
  defaultWindowMs?: number;
  /** Custom rules per provider ID */
  providerLimits?: Record<string, ProviderRateLimitRule>;
}

export interface ProviderAcquireResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTimeMs: number;
  retryAfterSeconds: number;
}

interface ProviderBucket {
  tokens: number;
  windowStartMs: number;
}

export class ProviderRateLimiter {
  private readonly defaultMaxRequests: number;
  private readonly defaultWindowMs: number;
  private readonly rules = new Map<string, ProviderRateLimitRule>();
  private readonly buckets = new Map<string, ProviderBucket>();

  constructor(options: ProviderRateLimiterOptions = {}) {
    this.defaultMaxRequests = Math.max(1, options.defaultMaxRequests ?? 30);
    this.defaultWindowMs = Math.max(1000, options.defaultWindowMs ?? 60_000);

    if (options.providerLimits) {
      for (const [id, rule] of Object.entries(options.providerLimits)) {
        this.rules.set(id.toLowerCase().trim(), {
          maxRequests: Math.max(1, rule.maxRequests),
          windowMs: Math.max(1000, rule.windowMs ?? this.defaultWindowMs),
        });
      }
    }
  }

  /**
   * Sets or updates custom rate limit rule for a specific provider.
   */
  setProviderLimit(providerId: string, maxRequests: number, windowMs: number = this.defaultWindowMs): void {
    this.rules.set(providerId.toLowerCase().trim(), {
      maxRequests: Math.max(1, maxRequests),
      windowMs: Math.max(1000, windowMs),
    });
  }

  /**
   * Proactively checks and consumes a request token for an external provider.
   */
  acquire(providerId: string): ProviderAcquireResult {
    const id = providerId.toLowerCase().trim();
    const rule = this.rules.get(id);
    const limit = rule ? rule.maxRequests : this.defaultMaxRequests;
    const windowMs = rule?.windowMs ?? this.defaultWindowMs;

    const now = Date.now();
    let bucket = this.buckets.get(id);

    if (!bucket || now - bucket.windowStartMs >= windowMs) {
      bucket = {
        tokens: 1,
        windowStartMs: now,
      };
      this.buckets.set(id, bucket);

      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetTimeMs: now + windowMs,
        retryAfterSeconds: 0,
      };
    }

    const resetTimeMs = bucket.windowStartMs + windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));

    if (bucket.tokens < limit) {
      bucket.tokens += 1;
      return {
        allowed: true,
        limit,
        remaining: limit - bucket.tokens,
        resetTimeMs,
        retryAfterSeconds: 0,
      };
    }

    // Limit exceeded
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetTimeMs,
      retryAfterSeconds,
    };
  }

  /**
   * Returns remaining requests in current window for a provider.
   */
  getRemaining(providerId: string): number {
    const id = providerId.toLowerCase().trim();
    const rule = this.rules.get(id);
    const limit = rule ? rule.maxRequests : this.defaultMaxRequests;
    const windowMs = rule?.windowMs ?? this.defaultWindowMs;

    const now = Date.now();
    const bucket = this.buckets.get(id);
    if (!bucket || now - bucket.windowStartMs >= windowMs) {
      return limit;
    }
    return Math.max(0, limit - bucket.tokens);
  }

  /**
   * Resets rate tracking for a provider or all providers.
   */
  reset(providerId?: string): void {
    if (providerId) {
      this.buckets.delete(providerId.toLowerCase().trim());
    } else {
      this.buckets.clear();
    }
  }

  destroy(): void {
    this.buckets.clear();
    this.rules.clear();
  }
}

export function createProviderRateLimiter(options?: ProviderRateLimiterOptions): ProviderRateLimiter {
  return new ProviderRateLimiter(options);
}
