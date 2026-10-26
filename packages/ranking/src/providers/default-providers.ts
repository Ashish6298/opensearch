/**
 * @opensearch/ranking — Default Permitted Search Providers (Phase 70 & Phase 80)
 *
 * Configures the standard suite of documented, permitted, non-scraping search providers:
 * 1. WikimediaProvider (MediaWiki OpenSearch API - general/encyclopedia)
 * 2. HackerNewsProvider (Algolia HN API - general/news/code)
 * 3. WikimediaImageProvider (Wikimedia Commons Action API - multimedia/images)
 *
 * All providers operate without paid API keys, respect rate limits, and preserve provenance.
 */

import { ProviderRegistry } from './provider-registry.js';
import { WikimediaProvider } from './wikimedia-provider.js';
import { HackerNewsProvider } from './hackernews-provider.js';
import { WikimediaImageProvider } from './wikimedia-image-provider.js';

export function createDefaultProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.registerProvider(new WikimediaProvider());
  registry.registerProvider(new HackerNewsProvider());
  registry.registerProvider(new WikimediaImageProvider());
  return registry;
}
