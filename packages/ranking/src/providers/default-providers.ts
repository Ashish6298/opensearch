/**
 * @opensearch/ranking — Default Permitted Search Providers (Phase 70)
 *
 * Configures the standard suite of documented, permitted, non-scraping search providers:
 * 1. WikimediaProvider (MediaWiki OpenSearch API)
 * 2. HackerNewsProvider (Algolia HN API)
 *
 * All providers operate without paid API keys, respect rate limits, and preserve provenance.
 */

import { ProviderRegistry } from './provider-registry.js';
import { WikimediaProvider } from './wikimedia-provider.js';
import { HackerNewsProvider } from './hackernews-provider.js';

export function createDefaultProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.registerProvider(new WikimediaProvider());
  registry.registerProvider(new HackerNewsProvider());
  return registry;
}
