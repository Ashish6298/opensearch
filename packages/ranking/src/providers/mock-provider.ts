/**
 * @opensearch/ranking — Mock Search Provider (Phase 69 & Phase 71)
 *
 * Deterministic, fully mockable search provider for unit testing, offline testing,
 * and edge-case resilience simulation:
 * - Timeouts (per-provider & overall search deadlines)
 * - Offline mode / network failures (ENOTFOUND, connection refused)
 * - HTTP 429 rate limiting with Retry-After header
 * - HTTP 5xx upstream failures
 * - Malformed / invalid JSON payloads
 * - Oversized response bodies exceeding safety thresholds
 * - Cancellation via AbortSignal
 * - Transient failure recovery (fail N times, then succeed)
 */

import {
  NormalizedSearchResult,
  ProviderMetadata,
  ProviderQueryOptions,
  ProviderQueryResult,
  SearchProvider,
} from './provider-types.js';

export interface MockProviderOptions {
  metadata?: Partial<ProviderMetadata>;
  initialEnabled?: boolean;
  /** Fixed list of results to return */
  fixtures?: NormalizedSearchResult[];
  /** Simulate artificial execution delay in ms */
  simulatedDelayMs?: number;
  /** Force a generic error */
  forcedError?: string;
  /** Force a timeout rejection */
  forceTimeout?: boolean;
  /** Simulate offline / network disconnection */
  simulateNetworkError?: boolean;
  /** Simulate upstream server 5xx error */
  simulate5xx?: boolean;
  /** Simulate HTTP 429 rate limit */
  simulate429?: boolean;
  /** Retry-After duration in seconds when simulating HTTP 429 */
  retryAfterSeconds?: number;
  /** Simulate malformed JSON response */
  simulateInvalidJson?: boolean;
  /** Simulate oversized payload exceeding safety threshold */
  simulateOversized?: boolean;
  /** Fail this number of times before succeeding on subsequent retry */
  failCountBeforeSuccess?: number;
}

export class MockSearchProvider implements SearchProvider {
  public readonly metadata: ProviderMetadata;
  private enabled: boolean;
  private fixtures: NormalizedSearchResult[];
  private simulatedDelayMs: number;
  private forcedError: string | null;
  private forceTimeout: boolean;

  // Resilience simulation flags
  public simulateNetworkError: boolean;
  public simulate5xx: boolean;
  public simulate429: boolean;
  public retryAfterSeconds: number;
  public simulateInvalidJson: boolean;
  public simulateOversized: boolean;
  public failCountBeforeSuccess: number;

  public queryCount = 0;
  public lastQuery: string | null = null;
  public lastOptions: ProviderQueryOptions | null = null;

  constructor(options: MockProviderOptions = {}) {
    this.metadata = {
      id: options.metadata?.id || 'mock-provider',
      displayName: options.metadata?.displayName || 'Mock Test Provider',
      supportedCategories: options.metadata?.supportedCategories || ['general', 'reference'],
      endpoint: options.metadata?.endpoint || 'https://mock.opensearch.local/v1/search',
      attribution: options.metadata?.attribution || {
        name: 'OpenSearch Mock Fixtures',
        license: 'MIT',
        url: 'https://github.com/Ashish6298/opensearch',
      },
      rateLimits: options.metadata?.rateLimits || {
        maxRequestsPerMinute: 600,
        minDelayMs: 0,
      },
      timeoutMs: options.metadata?.timeoutMs ?? 1000,
      cachePolicy: options.metadata?.cachePolicy || {
        enabled: true,
        ttlSeconds: 60,
      },
      privacy: options.metadata?.privacy || {
        querySentToOrigin: false,
        forwardClientIp: false,
        forwardCookies: false,
        logsRetentionPolicy: 'zero-retention',
        requiresAuth: false,
      },
    };

    this.enabled = options.initialEnabled ?? true;
    this.fixtures = options.fixtures || [];
    this.simulatedDelayMs = options.simulatedDelayMs ?? 0;
    this.forcedError = options.forcedError ?? null;
    this.forceTimeout = options.forceTimeout ?? false;

    this.simulateNetworkError = options.simulateNetworkError ?? false;
    this.simulate5xx = options.simulate5xx ?? false;
    this.simulate429 = options.simulate429 ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds ?? 2;
    this.simulateInvalidJson = options.simulateInvalidJson ?? false;
    this.simulateOversized = options.simulateOversized ?? false;
    this.failCountBeforeSuccess = options.failCountBeforeSuccess ?? 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setFixtures(fixtures: NormalizedSearchResult[]): void {
    this.fixtures = [...fixtures];
  }

  setForcedError(error: string | null): void {
    this.forcedError = error;
  }

  setSimulatedDelay(delayMs: number): void {
    this.simulatedDelayMs = delayMs;
  }

  async search(query: string, options: ProviderQueryOptions = {}): Promise<ProviderQueryResult> {
    const startMs = Date.now();
    this.queryCount++;
    this.lastQuery = query;
    this.lastOptions = options;

    if (!this.enabled) {
      return {
        providerId: this.metadata.id,
        results: [],
        durationMs: Date.now() - startMs,
        errorCode: 'DISABLED',
        error: 'Provider is disabled',
      };
    }

    // Check cancellation immediately
    if (options.signal?.aborted) {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    if (this.simulatedDelayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.simulatedDelayMs);
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          }, { once: true });
        }
      });
    }

    // 1. Force timeout
    if (this.forceTimeout) {
      const timeoutLimit = options.timeoutMs ?? this.metadata.timeoutMs;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, timeoutLimit + 100);
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          }, { once: true });
        }
      });
      const timeoutErr = new Error(`Provider timed out after ${timeoutLimit}ms`);
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    }

    // 2. Transient failures before success
    if (this.failCountBeforeSuccess > 0) {
      this.failCountBeforeSuccess--;
      const err500: any = new Error('500 Internal Server Error (Transient)');
      err500.status = 500;
      throw err500;
    }

    // 3. Network error simulation
    if (this.simulateNetworkError) {
      const netErr: any = new TypeError('fetch failed: ENOTFOUND mock.opensearch.local (network offline)');
      throw netErr;
    }

    // 4. HTTP 5xx simulation
    if (this.simulate5xx) {
      const serverErr: any = new Error('503 Service Unavailable: upstream cluster unready');
      serverErr.status = 503;
      throw serverErr;
    }

    // 5. HTTP 429 simulation
    if (this.simulate429) {
      const rateErr: any = new Error(`429 Too Many Requests: Rate limit exceeded`);
      rateErr.status = 429;
      rateErr.retryAfterSeconds = this.retryAfterSeconds;
      return {
        providerId: this.metadata.id,
        results: [],
        durationMs: Date.now() - startMs,
        errorCode: 'RATE_LIMITED',
        error: 'HTTP 429 Too Many Requests',
        retryAfterSeconds: this.retryAfterSeconds,
      };
    }

    // 6. Invalid JSON simulation
    if (this.simulateInvalidJson) {
      const parseErr = new SyntaxError('Unexpected token < in JSON at position 0');
      throw parseErr;
    }

    // 7. Oversized response simulation
    if (this.simulateOversized) {
      const oversizeErr = new Error('Response body exceeded maximum permitted size (5242880 bytes > 2097152 bytes)');
      throw oversizeErr;
    }

    // 8. Explicit forced error
    if (this.forcedError) {
      return {
        providerId: this.metadata.id,
        results: [],
        durationMs: Date.now() - startMs,
        errorCode: 'UPSTREAM_ERROR',
        error: this.forcedError,
      };
    }

    // Happy path
    const limit = options.limit ?? 10;
    let matched = this.fixtures;
    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      const filtered = this.fixtures.filter(
        f => f.title.toLowerCase().includes(q) || f.snippet.toLowerCase().includes(q),
      );
      matched = filtered.length > 0 ? filtered : this.fixtures;
    }

    const sliced = matched.slice(0, limit);

    return {
      providerId: this.metadata.id,
      results: sliced,
      durationMs: Date.now() - startMs,
      totalHits: matched.length,
    };
  }
}
