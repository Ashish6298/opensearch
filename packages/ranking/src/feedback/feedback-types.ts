/**
 * @opensearch/ranking — Privacy-Conscious Feedback Types (Phase 105)
 *
 * Defines contracts, schemas, validation rules, and privacy models for:
 * - Restrained, voluntary search quality feedback
 * - Strict prohibition of raw queries, IP addresses, identifiers, and click histories
 * - Explicit user consent management (transmission disabled by default)
 * - Local-only storage vs. explicitly consented minimal aggregate feedback
 * - Documented 30-day retention, purging, and infrastructure network metadata disclosures
 */

export type FeedbackRating = 'helpful' | 'not_helpful';

export type FeedbackReasonCode =
  | 'accurate_answer'
  | 'relevant_results'
  | 'fast_discovery'
  | 'poor_relevance'
  | 'outdated_results'
  | 'broken_links'
  | 'inaccurate_answer'
  | 'missing_information'
  | 'other';

export type ResultCountBucket = '0' | '1-5' | '6-10' | '10+';

export type FeedbackMode = 'local_only' | 'consented_aggregate';

export interface FeedbackConsent {
  /** Must be true for any network submission */
  explicitConsentGranted: boolean;
  /** ISO timestamp when consent was granted */
  consentTimestamp: string;
  /** Selected transmission mode */
  mode: FeedbackMode;
  /** Version of the privacy disclosure presented to the user */
  disclosureVersion: string;
}

export interface FeedbackSubmissionPayload {
  /** Unique client-generated UUID for deduplication */
  feedbackId?: string;
  /** Rating: helpful or not helpful */
  rating: FeedbackRating;
  /** Coarse category of the search (e.g. 'general', 'developer', 'news', 'images') */
  category?: string;
  /** Coarse bucket of results returned — never the raw results or documents */
  resultCountBucket: ResultCountBucket;
  /** Optional standardized reason code */
  reasonCode?: FeedbackReasonCode;
  /** Explicit user consent container */
  consent: FeedbackConsent;
}

export interface StoredFeedbackRecord {
  /** Unique feedback ID */
  feedbackId: string;
  /** ISO timestamp of submission */
  timestamp: string;
  /** Feedback rating */
  rating: FeedbackRating;
  /** Coarse search category */
  category: string;
  /** Coarse result count bucket */
  resultCountBucket: ResultCountBucket;
  /** Standardized reason code if supplied */
  reasonCode?: FeedbackReasonCode;
  /** Verified consent metadata */
  consent: FeedbackConsent;
  /** Expiration timestamp for automatic 30-day purge */
  expiresAt: string;
}

export interface FeedbackValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedPayload?: FeedbackSubmissionPayload;
}

export interface FeedbackRetentionPolicy {
  /** Maximum retention window in days (30 days default) */
  maxRetentionDays: number;
  /** Maximum number of records retained in local ring buffer */
  maxStoredRecords: number;
  /** Explanation of deletion and purge procedures */
  deletionPolicy: string;
  /** Transport layer and network infrastructure disclosure */
  networkMetadataDisclosure: string;
}

export interface FeedbackExportPayload {
  exportTimestamp: string;
  totalRecords: number;
  retentionPolicy: FeedbackRetentionPolicy;
  records: StoredFeedbackRecord[];
}

export interface FeedbackStats {
  totalSubmissions: number;
  helpfulCount: number;
  notHelpfulCount: number;
  byCategory: Record<string, { helpful: number; notHelpful: number }>;
  byBucket: Record<ResultCountBucket, { helpful: number; notHelpful: number }>;
  oldestRecordTimestamp?: string;
  newestRecordTimestamp?: string;
}

export const CURRENT_DISCLOSURE_VERSION = '1.0.0';

export const DEFAULT_RETENTION_POLICY: FeedbackRetentionPolicy = {
  maxRetentionDays: 30,
  maxStoredRecords: 1000,
  deletionPolicy:
    'Consented feedback records are retained for a maximum of 30 days and permanently deleted. Users may delete all stored feedback at any time via the DELETE /api/v1/feedback endpoint or local UI clear button.',
  networkMetadataDisclosure:
    'Notice on Network Metadata: OpenSearch strictly strips and does not log your IP address in feedback records. However, intermediate network infrastructure (cloud hosts, edge proxies, ISP routers) can observe transport-layer TCP/IP packets during transmission. For absolute network anonymity, submit feedback in Local-Only mode or route queries via Tor / VPN.',
};
