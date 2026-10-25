/**
 * @opensearch/ranking — Providers Subsystem (Phase 69)
 */

export type {
  QueryCategory,
  ContentType,
  ProviderAttribution,
  ProviderRateLimits,
  ProviderCachePolicy,
  ProviderPrivacyBehavior,
  ProviderMetadata,
  ThumbnailInfo,
  NormalizedSearchResult,
  ProviderQueryOptions,
  ProviderQueryResult,
  SearchProvider,
} from './provider-types.js';

export {
  normalizeProviderResult,
  convertToSearchResultItem,
} from './provider-normalizer.js';
export type { RawResultInput } from './provider-normalizer.js';

export {
  MockSearchProvider,
} from './mock-provider.js';
export type { MockProviderOptions } from './mock-provider.js';

export {
  ProviderRegistry,
  createProviderRegistry,
} from './provider-registry.js';
export type { ProviderExecutionSummary } from './provider-registry.js';
