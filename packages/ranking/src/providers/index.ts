/**
 * @opensearch/ranking — Providers Subsystem (Phase 69, Phase 70, Phase 71 & Phase 80)
 */

export type {
  QueryCategory,
  ContentType,
  ProviderErrorCode,
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
  validateSafeImageUrl,
  validateImageAttribution,
  isImageResult,
  isNewsResult,
  evaluateNewsRecency,
} from './image-validation.js';
export type { NewsRecencyEvaluation } from './image-validation.js';

export {
  MockSearchProvider,
} from './mock-provider.js';
export type { MockProviderOptions } from './mock-provider.js';

export {
  ProviderRegistry,
  createProviderRegistry,
} from './provider-registry.js';
export type { ProviderExecutionSummary } from './provider-registry.js';

export {
  ProviderResponseCache,
} from './provider-cache.js';
export type {
  CacheEntry,
  ProviderCacheStats,
} from './provider-cache.js';

export {
  ResilienceManager,
} from './resilience-manager.js';
export type {
  CircuitState,
  ProviderCircuitStatus,
  ResilienceManagerOptions,
} from './resilience-manager.js';

export {
  WikimediaProvider,
  WIKIMEDIA_PROVIDER_METADATA,
} from './wikimedia-provider.js';

export {
  HackerNewsProvider,
  HACKERNEWS_PROVIDER_METADATA,
} from './hackernews-provider.js';

export {
  WikimediaImageProvider,
  WIKIMEDIA_IMAGE_PROVIDER_METADATA,
} from './wikimedia-image-provider.js';

export {
  createDefaultProviderRegistry,
} from './default-providers.js';

export {
  validateProviderPrivacyContract,
  assertProviderPrivacyContract,
} from './privacy-contract.js';
export type { PrivacyContractValidationResult } from './privacy-contract.js';
