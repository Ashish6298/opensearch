/**
 * @opensearch/api — Documented External Provider Integration (Phase 70, Phase 80 & Phase 81)
 *
 * Replaces brittle HTML scraping (Google Suggest, DuckDuckGo HTML regex scraping)
 * with the standard, typed SearchProvider interface and permitted APIs:
 * - Wikimedia OpenSearch Action API (All / General / Reference)
 * - Hacker News (Algolia Search API - News / Code / General)
 * - Wikimedia Commons Action API (Images / Multimedia)
 *
 * All external search calls go strictly through the @opensearch/ranking provider layer.
 * Zero paid API keys, strict failure isolation, and preserved result provenance.
 */

import {
  SearchResultItem,
  createDefaultProviderRegistry,
  convertToSearchResultItem,
  ProviderRegistry,
  QueryCategory,
  SafeSearchLevel,
} from '@opensearch/ranking';

let sharedRegistry: ProviderRegistry | null = null;

export function getSharedProviderRegistry(): ProviderRegistry {
  if (!sharedRegistry) {
    sharedRegistry = createDefaultProviderRegistry();
  }
  return sharedRegistry;
}

export function resetSharedProviderRegistry(): void {
  sharedRegistry = null;
}

/**
 * Queries documented external search providers through the standard provider layer.
 */
export async function fetchExternalWebResults(
  query: string,
  limit = 10,
  registryOverride?: ProviderRegistry,
  category = 'all',
  safeSearch: SafeSearchLevel = 'moderate',
): Promise<SearchResultItem[]> {
  const registry = registryOverride ?? getSharedProviderRegistry();

  let targetCategories: QueryCategory[] = ['general', 'encyclopedia', 'code', 'news'];
  const catLower = category.toLowerCase().trim();

  if (catLower === 'images' || catLower === 'multimedia' || catLower === 'image') {
    targetCategories = ['multimedia'];
  } else if (catLower === 'news') {
    targetCategories = ['news'];
  } else if (catLower === 'code') {
    targetCategories = ['code'];
  }

  const summary = await registry.executeSearch(query, {
    limit,
    categories: targetCategories,
    timeoutMs: 3000,
    safeSearch,
  });

  return summary.results
    .slice(0, limit)
    .map((norm, idx) => convertToSearchResultItem(norm, idx + 1));
}

/**
 * @deprecated Legacy alias retained for backward compatibility. Dispatches through standard provider layer.
 */
export async function fetchGoogleLive(query: string, limit = 10): Promise<SearchResultItem[]> {
  return fetchExternalWebResults(query, limit);
}
