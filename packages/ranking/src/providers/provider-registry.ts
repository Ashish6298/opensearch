/**
 * @opensearch/ranking — Search Provider Registry & Resilient Dispatcher (Phase 69 & Phase 71)
 *
 * Coordinates provider registration, dynamic enabling/disabling, category routing,
 * and resilient parallel query execution with total failure isolation.
 *
 * Resilience features (Phase 71):
 * - Per-provider timeouts and global search deadline.
 * - Bounded concurrency worker pool.
 * - Transient failure retries with capped exponential backoff and jitter.
 * - HTTP 429 and Retry-After rate limit cooldown compliance.
 * - Circuit breaker protection to prevent upstream retry storms.
 * - Bounded LRU in-memory response caching conforming to privacy rules.
 * - Partial result aggregation (available results returned when some providers fail/timeout).
 * - User-facing error sanitization without revealing internal system paths or stack traces.
 */

import { ProviderResponseCache } from './provider-cache.js';
import {
  NormalizedSearchResult,
  ProviderErrorCode,
  ProviderQueryOptions,
  ProviderQueryResult,
  QueryCategory,
  SearchProvider,
} from './provider-types.js';
import { ResilienceManager } from './resilience-manager.js';

export interface ProviderExecutionSummary {
  /** Combined normalized results from all responsive providers */
  results: NormalizedSearchResult[];
  /** Detailed per-provider execution results */
  providerResults: ProviderQueryResult[];
  /** Total wall-clock execution duration in ms */
  totalDurationMs: number;
  /** Number of providers successfully queried */
  successfulProviders: number;
  /** Number of providers that failed or timed out */
  failedProviders: number;
  /** Number of providers served from cache */
  cachedProviders?: number;
  /** Whether the result set is partial (some succeeded while others failed/timed out) */
  isPartial: boolean;
  /** Whether the overall search deadline was exceeded */
  searchDeadlineExceeded?: boolean;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, SearchProvider>();
  private readonly cache: ProviderResponseCache;
  private readonly resilienceManager: ResilienceManager;

  constructor(options?: {
    cache?: ProviderResponseCache;
    resilienceManager?: ResilienceManager;
  }) {
    this.cache = options?.cache ?? new ProviderResponseCache();
    this.resilienceManager = options?.resilienceManager ?? new ResilienceManager();
  }

  /**
   * Returns the underlying response cache for testing or maintenance.
   */
  public getCache(): ProviderResponseCache {
    return this.cache;
  }

  /**
   * Returns the resilience manager for testing or maintenance.
   */
  public getResilienceManager(): ResilienceManager {
    return this.resilienceManager;
  }

  /**
   * Registers a new search provider.
   * Throws if a provider with the same identifier is already registered.
   */
  registerProvider(provider: SearchProvider): void {
    if (!provider || !provider.metadata || !provider.metadata.id) {
      throw new Error('Cannot register provider without valid metadata and id');
    }

    const id = provider.metadata.id.toLowerCase().trim();
    if (this.providers.has(id)) {
      throw new Error(`Provider with id "${id}" is already registered`);
    }

    this.providers.set(id, provider);
  }

  /**
   * Unregisters an existing search provider by ID.
   * Returns true if unregistered, false if not found.
   */
  unregisterProvider(id: string): boolean {
    const idClean = id.toLowerCase().trim();
    this.cache.invalidateProvider(idClean);
    return this.providers.delete(idClean);
  }

  /**
   * Retrieves a provider by identifier.
   */
  getProvider(id: string): SearchProvider | undefined {
    return this.providers.get(id.toLowerCase().trim());
  }

  /**
   * Returns all registered providers.
   */
  getAllProviders(): SearchProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Returns only currently enabled providers.
   */
  getEnabledProviders(): SearchProvider[] {
    return this.getAllProviders().filter(p => p.isEnabled());
  }

  /**
   * Enables or disables a provider by identifier.
   */
  setProviderEnabled(id: string, enabled: boolean): boolean {
    const provider = this.getProvider(id);
    if (!provider) return false;
    provider.setEnabled(enabled);
    return true;
  }

  /**
   * Clears all registered providers (useful for test resets).
   */
  clear(): void {
    this.providers.clear();
    this.cache.clear();
    this.resilienceManager.reset();
  }

  /**
   * Finds enabled providers capable of serving the specified categories.
   */
  getProvidersForCategories(categories: QueryCategory[]): SearchProvider[] {
    if (!categories || categories.length === 0) {
      return this.getEnabledProviders();
    }

    return this.getEnabledProviders().filter(provider =>
      provider.metadata.supportedCategories.some(cat => categories.includes(cat)),
    );
  }

  /**
   * Helper executing tasks with bounded concurrency.
   */
  private async runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    if (items.length === 0) return [];
    const concurrency = Math.max(1, Math.min(limit, items.length));
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: concurrency }, async () => {
      while (nextIndex < items.length) {
        const idx = nextIndex++;
        const item = items[idx];
        if (item !== undefined) {
          results[idx] = await fn(item);
        }
      }
    });

    await Promise.all(workers);
    return results;
  }

  /**
   * Executes a single provider query with timeout, retries, circuit breaker,
   * rate limit cooldown, and response caching.
   */
  private async executeSingleProvider(
    provider: SearchProvider,
    query: string,
    options: ProviderQueryOptions,
    parentSignal?: AbortSignal,
  ): Promise<ProviderQueryResult> {
    const providerId = provider.metadata.id;
    const providerStart = Date.now();
    const categories = options.categories || ['general'];
    const limit = options.limit ?? 10;

    // 1. Response cache lookup (if permitted)
    const cachingEnabled =
      options.enableCache !== false && provider.metadata.cachePolicy.enabled;
    const cacheKey = ProviderResponseCache.makeKey(providerId, query, limit, categories);

    if (cachingEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return {
          providerId,
          results: cached.results,
          durationMs: Date.now() - providerStart,
          totalHits: cached.totalHits,
          cached: true,
        };
      }
    }

    // 2. Circuit Breaker & Rate Limit Cooldown Check
    if (!options.bypassCircuitBreaker) {
      const execCheck = this.resilienceManager.canExecute(providerId);
      if (!execCheck.allowed) {
        const code: ProviderErrorCode =
          execCheck.reason === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'CIRCUIT_OPEN';
        const sanitizedMsg = this.resilienceManager.sanitizeErrorMessage(code);
        return {
          providerId,
          results: [],
          durationMs: Date.now() - providerStart,
          errorCode: code,
          error: sanitizedMsg,
          sanitizedMessage: sanitizedMsg,
          retryAfterSeconds: execCheck.retryAfterSeconds,
        };
      }
    }

    // 3. Execution & Retry Loop
    const maxRetries = options.maxRetries ?? 2;
    let attempts = 0;
    let lastError: any = null;
    let lastErrorCode: ProviderErrorCode | undefined;

    while (attempts <= maxRetries) {
      // Check cancellation before each attempt
      if (parentSignal?.aborted) {
        return {
          providerId,
          results: [],
          durationMs: Date.now() - providerStart,
          errorCode: 'CANCELLED',
          error: 'Search request was cancelled',
          sanitizedMessage: this.resilienceManager.sanitizeErrorMessage('CANCELLED'),
          retriesAttempted: attempts,
        };
      }

      const timeoutMs = options.timeoutMs ?? provider.metadata.timeoutMs;
      const attemptController = new AbortController();

      const onParentAbort = () => {
        attemptController.abort(parentSignal?.reason);
      };

      if (parentSignal) {
        if (parentSignal.aborted) {
          attemptController.abort(parentSignal.reason);
        } else {
          parentSignal.addEventListener('abort', onParentAbort, { once: true });
        }
      }

      let timeoutTimer: NodeJS.Timeout | undefined;
      let timedOut = false;

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutTimer = setTimeout(() => {
            timedOut = true;
            const err = new Error(`Timeout of ${timeoutMs}ms exceeded`);
            err.name = 'TimeoutError';
            attemptController.abort(err);
            reject(err);
          }, timeoutMs);
        });

        const searchPromise = provider.search(query, {
          ...options,
          signal: attemptController.signal,
          timeoutMs,
        });

        const result = await Promise.race([searchPromise, timeoutPromise]);
        clearTimeout(timeoutTimer);

        // Check for error in result payload
        if (result.error || result.errorCode) {
          const errCode = result.errorCode || this.resilienceManager.classifyError(result.error);
          if (errCode === 'RATE_LIMITED') {
            this.resilienceManager.setRateLimit(
              providerId,
              result.retryAfterSeconds || 5,
            );
            return {
              ...result,
              errorCode: 'RATE_LIMITED',
              sanitizedMessage: this.resilienceManager.sanitizeErrorMessage('RATE_LIMITED'),
              retriesAttempted: attempts,
            };
          }

          if (this.resilienceManager.isTransient(errCode) && attempts < maxRetries) {
            attempts++;
            lastError = result.error;
            lastErrorCode = errCode;
            const backoffMs = this.resilienceManager.calculateBackoff(attempts);
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          }

          // Unrecoverable or retries exhausted
          this.resilienceManager.recordFailure(providerId, errCode);
          return {
            ...result,
            errorCode: errCode,
            sanitizedMessage: this.resilienceManager.sanitizeErrorMessage(
              errCode,
              result.error,
            ),
            retriesAttempted: attempts,
          };
        }

        // Success!
        this.resilienceManager.recordSuccess(providerId);

        // Cache results if permitted
        if (cachingEnabled && result.results.length >= 0) {
          this.cache.set(
            cacheKey,
            providerId,
            result.results,
            provider.metadata.cachePolicy.ttlSeconds,
            result.totalHits,
            provider.metadata.cachePolicy.maxSize,
          );
        }

        return {
          ...result,
          durationMs: Date.now() - providerStart,
          retriesAttempted: attempts,
        };
      } catch (err: any) {
        clearTimeout(timeoutTimer);
        lastError = err;
        const errCode = timedOut
          ? 'TIMEOUT'
          : this.resilienceManager.classifyError(err);
        lastErrorCode = errCode;

        if (errCode === 'CANCELLED') {
          return {
            providerId,
            results: [],
            durationMs: Date.now() - providerStart,
            errorCode: 'CANCELLED',
            error: 'Search request was cancelled',
            sanitizedMessage: this.resilienceManager.sanitizeErrorMessage('CANCELLED'),
            retriesAttempted: attempts,
          };
        }

        if (errCode === 'RATE_LIMITED') {
          const retryAfter = err.retryAfterSeconds || 5;
          this.resilienceManager.setRateLimit(providerId, retryAfter);
          return {
            providerId,
            results: [],
            durationMs: Date.now() - providerStart,
            errorCode: 'RATE_LIMITED',
            error: err.message || 'Rate limit exceeded',
            sanitizedMessage: this.resilienceManager.sanitizeErrorMessage('RATE_LIMITED'),
            retryAfterSeconds: retryAfter,
            retriesAttempted: attempts,
          };
        }

        // Check if retryable transient error
        if (this.resilienceManager.isTransient(errCode) && attempts < maxRetries) {
          attempts++;
          const backoffMs = this.resilienceManager.calculateBackoff(attempts);
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }

        // Retries exhausted or non-transient failure
        this.resilienceManager.recordFailure(providerId, errCode);
        return {
          providerId,
          results: [],
          durationMs: Date.now() - providerStart,
          errorCode: errCode,
          error: lastError?.message || 'Provider execution failure',
          sanitizedMessage: this.resilienceManager.sanitizeErrorMessage(
            errCode,
            lastError?.message,
          ),
          retriesAttempted: attempts,
        };
      } finally {
        clearTimeout(timeoutTimer);
        if (parentSignal) {
          parentSignal.removeEventListener('abort', onParentAbort);
        }
      }
    }

    // Fallback if loop exits
    const finalCode = lastErrorCode || 'UPSTREAM_ERROR';
    this.resilienceManager.recordFailure(providerId, finalCode);
    return {
      providerId,
      results: [],
      durationMs: Date.now() - providerStart,
      errorCode: finalCode,
      error: lastError?.message || 'Provider retries exhausted',
      sanitizedMessage: this.resilienceManager.sanitizeErrorMessage(finalCode),
      retriesAttempted: attempts,
    };
  }

  /**
   * Executes a search across all eligible enabled providers in parallel with:
   * 1. Total failure isolation.
   * 2. Overall search deadline (searchDeadlineMs).
   * 3. Bounded concurrency (maxConcurrency).
   * 4. Transient failure retries with backoff & jitter.
   * 5. Circuit breaker & Rate limit cooldown.
   * 6. Response caching.
   * 7. Partial results aggregation with isPartial flag.
   */
  async executeSearch(
    query: string,
    options: ProviderQueryOptions = {},
  ): Promise<ProviderExecutionSummary> {
    const startMs = Date.now();
    const categories = options.categories || ['general'];
    const providersToQuery = this.getProvidersForCategories(categories);

    if (providersToQuery.length === 0) {
      return {
        results: [],
        providerResults: [],
        totalDurationMs: Date.now() - startMs,
        successfulProviders: 0,
        failedProviders: 0,
        cachedProviders: 0,
        isPartial: false,
        searchDeadlineExceeded: false,
      };
    }

    // Set up overall search deadline and cancellation controller
    const deadlineController = new AbortController();
    let searchDeadlineExceeded = false;
    let deadlineTimer: NodeJS.Timeout | undefined;

    if (options.searchDeadlineMs && options.searchDeadlineMs > 0) {
      deadlineTimer = setTimeout(() => {
        searchDeadlineExceeded = true;
        const deadlineErr = new Error(
          `Search deadline of ${options.searchDeadlineMs}ms exceeded`,
        );
        deadlineErr.name = 'TimeoutError';
        deadlineController.abort(deadlineErr);
      }, options.searchDeadlineMs);
    }

    if (options.signal) {
      if (options.signal.aborted) {
        deadlineController.abort(options.signal.reason);
      } else {
        options.signal.addEventListener(
          'abort',
          () => deadlineController.abort(options.signal?.reason),
          { once: true },
        );
      }
    }

    const maxConcurrency = options.maxConcurrency ?? 4;

    try {
      // Execute providers concurrently within bounded pool
      const providerResults = await this.runWithConcurrency(
        providersToQuery,
        maxConcurrency,
        provider =>
          this.executeSingleProvider(
            provider,
            query,
            options,
            deadlineController.signal,
          ),
      );

      const aggregatedResults: NormalizedSearchResult[] = [];
      let successfulProviders = 0;
      let failedProviders = 0;
      let cachedProviders = 0;

      for (const res of providerResults) {
        if (res.cached) {
          cachedProviders++;
        }

        if (res.error || res.errorCode) {
          failedProviders++;
        } else {
          successfulProviders++;
          aggregatedResults.push(...res.results);
        }
      }

      // Partial results occur when at least one provider succeeded and at least one failed
      const isPartial = successfulProviders > 0 && failedProviders > 0;

      return {
        results: aggregatedResults,
        providerResults,
        totalDurationMs: Date.now() - startMs,
        successfulProviders,
        failedProviders,
        cachedProviders,
        isPartial,
        searchDeadlineExceeded,
      };
    } finally {
      if (deadlineTimer) {
        clearTimeout(deadlineTimer);
      }
    }
  }
}

/**
 * Singleton factory helper for ProviderRegistry.
 */
export function createProviderRegistry(options?: {
  cache?: ProviderResponseCache;
  resilienceManager?: ResilienceManager;
}): ProviderRegistry {
  return new ProviderRegistry(options);
}
