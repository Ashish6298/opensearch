/**
 * @opensearch/crawler — Tracker and Privacy Metadata Subsystem (Phase 99)
 */

export type {
  SubresourceType,
  ResourceOriginCategory,
  TrackerCategory,
  ExtractedResource,
  TrackerRegistryEntry,
  TrackerRegistryMetadata,
  TrackerMatch,
  TrackerClassificationStatus,
  ClassificationConfidence,
  ClassificationEvidence,
  TrackerClassificationResult,
} from './tracker-types.js';

export {
  extractRegistrableDomain,
  extractOrigin,
  isFirstPartyResource,
} from './domain-utils.js';

export {
  REVIEWABLE_TRACKER_REGISTRY_METADATA,
  REVIEWABLE_TRACKER_ENTRIES,
  TrackerRegistry,
  getDefaultTrackerRegistry,
} from './tracker-registry.js';

export {
  extractSubresources,
  type ResourceExtractorOptions,
} from './resource-extractor.js';

export {
  TrackerClassifier,
  getDefaultTrackerClassifier,
  classifyDocumentResources,
  type TrackerClassifierOptions,
} from './tracker-classifier.js';
