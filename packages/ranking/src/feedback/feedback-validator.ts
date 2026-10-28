/**
 * @opensearch/ranking — Feedback Payload Validator (Phase 105)
 *
 * Enforces strict privacy constraints on all incoming search feedback:
 * 1. Requires explicit consent before any feedback is processed or stored.
 * 2. Strictly forbids and rejects sensitive fields (raw queries, IP addresses,
 *    user/account IDs, device fingerprints, click histories, dwell times).
 * 3. Restricts payloads to minimal, structured categorical ratings.
 * 4. Limits total payload size to prevent denial-of-service / data-dump attacks.
 */

import {
  FeedbackReasonCode,
  FeedbackSubmissionPayload,
  FeedbackValidationResult,
  ResultCountBucket,
} from './feedback-types.js';

const FORBIDDEN_FIELDS = [
  'query',
  'rawquery',
  'q',
  'searchquery',
  'ip',
  'clientip',
  'remoteaddress',
  'ipaddress',
  'userid',
  'accountid',
  'sessionid',
  'fingerprint',
  'browserfingerprint',
  'canvasfingerprint',
  'useragent',
  'clickhistory',
  'clickedurls',
  'clickedlinks',
  'dwelltime',
  'history',
  'cookies',
  'auth',
  'token',
  'email',
  'username',
];

const VALID_RATINGS = new Set(['helpful', 'not_helpful']);
const VALID_BUCKETS: Set<ResultCountBucket> = new Set(['0', '1-5', '6-10', '10+']);
const VALID_REASONS: Set<FeedbackReasonCode> = new Set([
  'accurate_answer',
  'relevant_results',
  'fast_discovery',
  'poor_relevance',
  'outdated_results',
  'broken_links',
  'inaccurate_answer',
  'missing_information',
  'other',
]);

const MAX_PAYLOAD_BYTES = 1024;

/**
 * Validates a search feedback submission payload.
 *
 * @param input Raw untrusted object submitted by user or client
 * @returns FeedbackValidationResult indicating validity, errors, and sanitized payload
 */
export function validateFeedbackPayload(input: unknown): FeedbackValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { isValid: false, errors: ['Payload must be a non-null JSON object.'] };
  }

  // 1. Enforce payload size limit
  try {
    const serialized = JSON.stringify(input);
    if (serialized.length > MAX_PAYLOAD_BYTES) {
      return {
        isValid: false,
        errors: [`Payload size exceeds maximum allowed limit of ${MAX_PAYLOAD_BYTES} bytes.`],
      };
    }
  } catch {
    return { isValid: false, errors: ['Payload cannot be serialized to JSON.'] };
  }

  const raw = input as Record<string, unknown>;

  // 2. Check for forbidden privacy-invasive fields (case-insensitive)
  const keys = Object.keys(raw);
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_FIELDS.includes(lowerKey)) {
      errors.push(
        `Forbidden field "${key}" detected. Privacy policy strictly forbids collecting queries, IP addresses, identifiers, or click histories.`,
      );
    }
  }

  // 3. Validate Rating
  const rating = raw['rating'];
  if (typeof rating !== 'string' || !VALID_RATINGS.has(rating)) {
    errors.push('Field "rating" must be either "helpful" or "not_helpful".');
  }

  // 4. Validate Result Count Bucket
  const bucket = raw['resultCountBucket'];
  if (typeof bucket !== 'string' || !VALID_BUCKETS.has(bucket as ResultCountBucket)) {
    errors.push('Field "resultCountBucket" must be one of: "0", "1-5", "6-10", "10+".');
  }

  // 5. Validate Optional Reason Code
  const reason = raw['reasonCode'];
  if (reason !== undefined && reason !== null) {
    if (typeof reason !== 'string' || !VALID_REASONS.has(reason as FeedbackReasonCode)) {
      errors.push(`Field "reasonCode" contains an invalid code. Allowed: ${Array.from(VALID_REASONS).join(', ')}.`);
    }
  }

  // 6. Validate Category
  const category = raw['category'];
  let cleanCategory = 'general';
  if (category !== undefined && category !== null) {
    if (typeof category !== 'string' || category.length > 50) {
      errors.push('Field "category" must be a string up to 50 characters.');
    } else {
      cleanCategory = category.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'general';
    }
  }

  // 7. Validate Consent Container (Acceptance criterion: No feedback transmitted without explicit consent)
  const consent = raw['consent'];
  if (!consent || typeof consent !== 'object' || Array.isArray(consent)) {
    errors.push('Field "consent" object is required. Feedback transmission cannot occur without explicit user consent.');
  } else {
    const cObj = consent as Record<string, unknown>;
    if (cObj['explicitConsentGranted'] !== true) {
      errors.push('Field "consent.explicitConsentGranted" must be explicitly true.');
    }
    if (typeof cObj['consentTimestamp'] !== 'string' || !cObj['consentTimestamp'].trim()) {
      errors.push('Field "consent.consentTimestamp" must be a valid ISO timestamp.');
    }
    const mode = cObj['mode'];
    if (mode !== 'local_only' && mode !== 'consented_aggregate') {
      errors.push('Field "consent.mode" must be either "local_only" or "consented_aggregate".');
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  const cObj = raw['consent'] as Record<string, unknown>;
  const sanitized: FeedbackSubmissionPayload = {
    feedbackId: typeof raw['feedbackId'] === 'string' && raw['feedbackId'].length <= 64 ? raw['feedbackId'] : undefined,
    rating: rating as 'helpful' | 'not_helpful',
    category: cleanCategory,
    resultCountBucket: bucket as ResultCountBucket,
    reasonCode: reason ? (reason as FeedbackReasonCode) : undefined,
    consent: {
      explicitConsentGranted: true,
      consentTimestamp: String(cObj['consentTimestamp']),
      mode: cObj['mode'] as 'local_only' | 'consented_aggregate',
      disclosureVersion: String(cObj['disclosureVersion'] || '1.0.0'),
    },
  };

  return {
    isValid: true,
    errors: [],
    sanitizedPayload: sanitized,
  };
}
