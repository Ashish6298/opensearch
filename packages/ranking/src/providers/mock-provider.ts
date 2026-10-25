/**
 * @opensearch/ranking — Mock Search Provider (Phase 69)
 *
 * Deterministic, fully mockable search provider for unit testing, offline testing,
 * and edge-case simulation (timeouts, 5xx errors, rate limits, empty results).
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
  /** Force an error to test failure isolation */
  forcedError?: string;
  /** Force a timeout rejection */
  forceTimeout?: boolean;
}

export class MockSearchProvider implements SearchProvider {
  public readonly metadata: ProviderMetadata;
  private enabled: boolean;
  private fixtures: NormalizedSearchResult[];
  private simulatedDelayMs: number;
  private forcedError: string | null;
  private forceTimeout: boolean;
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
        error: 'Provider is disabled',
      };
    }

    if (this.simulatedDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.simulatedDelayMs));
    }

    if (this.forceTimeout) {
      const timeoutLimit = options.timeoutMs ?? this.metadata.timeoutMs;
      await new Promise(resolve => setTimeout(resolve, timeoutLimit + 50));
      return {
        providerId: this.metadata.id,
        results: [],
        durationMs: Date.now() - startMs,
        error: `Provider timed out after ${timeoutLimit}ms`,
      };
    }

    if (this.forcedError) {
      return {
        providerId: this.metadata.id,
        results: [],
        durationMs: Date.now() - startMs,
        error: this.forcedError,
      };
    }

    const limit = options.limit ?? 10;
    // Filter fixtures matching query text (case-insensitive) or return all if query is empty
    let matched = this.fixtures;
    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      const filtered = this.fixtures.filter(
        f => f.title.toLowerCase().includes(q) || f.snippet.toLowerCase().includes(q),
      );
      // If none matched by keyword, return all fixtures for deterministic fixture tests
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
