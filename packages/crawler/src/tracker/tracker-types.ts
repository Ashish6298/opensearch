/**
 * @opensearch/crawler — Tracker and Subresource Metadata Types (Phase 99)
 *
 * Defines contracts, domain models, and classification schemas for:
 * - Parsing third-party subresources (scripts, images, stylesheets, iframes, beacons)
 * - Classifying first-party vs third-party origins using registrable domains (eTLD+1)
 * - Reviewable tracker registry entries with provenance, license, and update timestamps
 * - Deterministic classification evidence and confidence levels
 * - Incomplete/unverified fallback states ensuring no site is labeled tracker-free without adequate evidence
 */

export type SubresourceType =
  | 'script'
  | 'stylesheet'
  | 'image'
  | 'iframe'
  | 'audio_video'
  | 'beacon'
  | 'preconnect'
  | 'other';

export type ResourceOriginCategory = 'first-party' | 'third-party';

export type TrackerCategory =
  | 'advertising'
  | 'analytics'
  | 'social'
  | 'fingerprinting'
  | 'telemetry'
  | 'session-recording'
  | 'other';

export interface ExtractedResource {
  /** Raw attribute string from HTML tag */
  rawUrl: string;
  /** Resolved, absolute normalized URL */
  resolvedUrl: string;
  /** Resource origin (protocol + hostname + optional port) */
  origin: string;
  /** Extracted hostname */
  hostname: string;
  /** Registrable root domain (eTLD+1) */
  registrableDomain: string;
  /** Classified subresource type */
  resourceType: SubresourceType;
  /** First-party or third-party relative to the document origin */
  originCategory: ResourceOriginCategory;
  /** HTML tag name that initiated the reference (e.g. 'script', 'img', 'iframe') */
  tagName: string;
  /** Whether the element exhibits tracking pixel beacon heuristics (e.g. 1x1, 0x0) */
  isPixelBeacon: boolean;
}

export interface TrackerRegistryEntry {
  /** Root or exact domain pattern (e.g. 'google-analytics.com', 'doubleclick.net') */
  domain: string;
  /** Human-readable tracker or company name */
  name: string;
  /** Primary tracking category */
  category: TrackerCategory;
  /** Corporate or organizational owner entity */
  owner: string;
  /** Public source provenance of the rule */
  provenance: string;
  /** License governing this dataset entry */
  license: string;
  /** ISO date when rule was curated or last verified */
  updatedAt: string;
  /** Functional description of data collection behavior */
  description: string;
}

export interface TrackerRegistryMetadata {
  version: string;
  name: string;
  provenance: string;
  license: string;
  licenseUrl: string;
  updatedAt: string;
  totalDomains: number;
  maintainer: string;
}

export interface TrackerMatch {
  /** Matched tracker domain rule */
  matchedDomain: string;
  /** Friendly tracker name */
  trackerName: string;
  /** Tracker categorization */
  category: TrackerCategory;
  /** Organization operating the tracker */
  owner: string;
  /** Provenance of the matched registry entry */
  provenance: string;
  /** License governing entry */
  license: string;
  /** Update timestamp of the rule */
  updatedAt: string;
  /** The specific resource reference that triggered the match */
  resource: ExtractedResource;
}

export type TrackerClassificationStatus =
  | 'trackers_detected'
  | 'no_trackers_detected'
  | 'unverified'
  | 'unknown';

export type ClassificationConfidence = 'high' | 'medium' | 'low' | 'none';

export interface ClassificationEvidence {
  /** Total byte length of analyzed HTML */
  htmlLength: number;
  /** Whether a standard <head> or header structure was detected */
  hasHead: boolean;
  /** Whether a standard <body> or content container was detected */
  hasBody: boolean;
  /** Whether standard doctype or html container was detected */
  hasValidStructure: boolean;
  /** Breakdown of analyzed tags found in markup */
  analyzedTagCounts: Record<string, number>;
  /** Number of tracking pixel beacons detected */
  beaconCount: number;
  /** Deterministic explanation for the classification and confidence assigned */
  rationale: string;
}

export interface TrackerClassificationResult {
  /** Canonical or base URL of the analyzed document */
  documentUrl: string;
  /** Normalized origin of the document (protocol + hostname + optional port) */
  documentOrigin: string;
  /** Registrable domain of the document (eTLD+1) */
  documentRegistrableDomain: string;
  /** Overall classification state */
  status: TrackerClassificationStatus;
  /** Confidence in the determination */
  confidence: ClassificationConfidence;
  /** Total subresources discovered */
  totalResources: number;
  /** Count of first-party resources */
  firstPartyCount: number;
  /** Count of third-party resources */
  thirdPartyCount: number;
  /** Count of resources identified as known trackers */
  trackerCount: number;
  /** Matched tracker entries */
  trackers: TrackerMatch[];
  /** Distinct third-party origins referenced */
  thirdPartyOrigins: string[];
  /** Distinct first-party origins referenced */
  firstPartyOrigins: string[];
  /** Set of distinct tracking categories detected */
  categoriesDetected: TrackerCategory[];
  /** Verifiable structural evidence supporting the classification */
  evidence: ClassificationEvidence;
  /** ISO timestamp when classification was executed */
  classifiedAt: string;
}
