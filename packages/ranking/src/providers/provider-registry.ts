/**
 * @opensearch/ranking — Search Provider Registry & Dispatcher (Phase 69)
 *
 * Coordinates provider registration, dynamic enabling/disabling, category routing,
 * and resilient parallel query execution with total failure isolation.
 */

import {
  NormalizedSearchResult,
  ProviderQueryOptions,
  ProviderQueryResult,
  QueryCategory,
  SearchProvider,
} from './provider-types.js';

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
}

export class ProviderRegistry {
  private readonly providers = new Map<string, SearchProvider>();

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
    return this.providers.delete(id.toLowerCase().trim());
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
   * Executes a search across all eligible enabled providers in parallel.
   * CRITICAL GUARANTEE: Total failure isolation.
   * If a provider throws, times out, or returns an error, other providers continue
   * and their results are collected without crashing the search pipeline.
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
      };
    }

    // Execute provider queries in parallel with individual failure isolation
    const settledPromises = await Promise.allSettled(
      providersToQuery.map(async provider => {
        const timeoutMs = options.timeoutMs ?? provider.metadata.timeoutMs;
        const providerStart = Date.now();

        try {
          // Bound execution time with Promise.race
          const searchPromise = provider.search(query, options);
          const timeoutPromise = new Promise<ProviderQueryResult>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Timeout of ${timeoutMs}ms exceeded`)),
              timeoutMs,
            ),
          );

          return await Promise.race([searchPromise, timeoutPromise]);
        } catch (err: any) {
          return {
            providerId: provider.metadata.id,
            results: [],
            durationMs: Date.now() - providerStart,
            error: err?.message || 'Unknown provider error',
          };
        }
      }),
    );

    const providerResults: ProviderQueryResult[] = [];
    const aggregatedResults: NormalizedSearchResult[] = [];
    let successfulProviders = 0;
    let failedProviders = 0;

    for (const settled of settledPromises) {
      if (settled.status === 'fulfilled') {
        const res = settled.value;
        providerResults.push(res);
        if (res.error) {
          failedProviders++;
        } else {
          successfulProviders++;
          aggregatedResults.push(...res.results);
        }
      } else {
        failedProviders++;
        providerResults.push({
          providerId: 'unknown',
          results: [],
          durationMs: Date.now() - startMs,
          error: settled.reason?.message || 'Unhandled provider failure',
        });
      }
    }

    return {
      results: aggregatedResults,
      providerResults,
      totalDurationMs: Date.now() - startMs,
      successfulProviders,
      failedProviders,
    };
  }
}

/**
 * Singleton factory helper for ProviderRegistry.
 */
export function createProviderRegistry(): ProviderRegistry {
  return new ProviderRegistry();
}
