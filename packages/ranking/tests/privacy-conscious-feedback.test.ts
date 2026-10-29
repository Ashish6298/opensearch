import { describe, it, expect, beforeEach } from 'vitest';
import {
  FeedbackService,
  FeedbackStorage,
  validateFeedbackPayload,
  createFeedbackService,
  getSharedFeedbackService,
  DEFAULT_RETENTION_POLICY,
  CURRENT_DISCLOSURE_VERSION,
} from '../src/feedback/index.js';
import type { FeedbackSubmissionPayload } from '../src/feedback/feedback-types.js';

describe('Phase 105 — Privacy-Conscious Feedback Suite', () => {
  let service: FeedbackService;
  let storage: FeedbackStorage;

  beforeEach(() => {
    storage = new FeedbackStorage();
    service = new FeedbackService(storage);
  });

  describe('1. Payload Validation & Privacy Prohibitions', () => {
    it('acceptance criterion: rejects submission without explicit user consent', () => {
      const payloadWithoutConsent: unknown = {
        rating: 'helpful',
        category: 'general',
        resultCountBucket: '6-10',
      };

      const result = validateFeedbackPayload(payloadWithoutConsent);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('explicit user consent'))).toBe(true);

      const payloadWithFalseConsent: unknown = {
        rating: 'helpful',
        category: 'general',
        resultCountBucket: '6-10',
        consent: {
          explicitConsentGranted: false,
          consentTimestamp: new Date().toISOString(),
          mode: 'consented_aggregate',
          disclosureVersion: '1.0.0',
        },
      };

      const result2 = validateFeedbackPayload(payloadWithFalseConsent);
      expect(result2.isValid).toBe(false);
      expect(result2.errors.some(e => e.includes('explicitly true'))).toBe(true);
    });

    it('strictly forbids and rejects raw query strings', () => {
      const payloadWithQuery: unknown = {
        rating: 'helpful',
        query: 'secret medical condition symptoms',
        resultCountBucket: '1-5',
        consent: {
          explicitConsentGranted: true,
          consentTimestamp: new Date().toISOString(),
          mode: 'consented_aggregate',
          disclosureVersion: '1.0.0',
        },
      };

      const result = validateFeedbackPayload(payloadWithQuery);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Forbidden field "query"'))).toBe(true);
    });

    it('strictly forbids and rejects IP addresses, account IDs, and user identifiers', () => {
      const payloadWithIdentifiers: unknown = {
        rating: 'not_helpful',
        ip: '192.168.1.100',
        userId: 'usr_12345',
        fingerprint: 'canvas_hash_abc',
        resultCountBucket: '0',
        consent: {
          explicitConsentGranted: true,
          consentTimestamp: new Date().toISOString(),
          mode: 'consented_aggregate',
          disclosureVersion: '1.0.0',
        },
      };

      const result = validateFeedbackPayload(payloadWithIdentifiers);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Forbidden field "ip"'))).toBe(true);
      expect(result.errors.some(e => e.includes('Forbidden field "userId"'))).toBe(true);
      expect(result.errors.some(e => e.includes('Forbidden field "fingerprint"'))).toBe(true);
    });

    it('strictly forbids click histories, clicked links, and dwell times', () => {
      const payloadWithClickHistory: unknown = {
        rating: 'helpful',
        clickHistory: ['https://example.com/clicked-link'],
        dwellTime: 45,
        resultCountBucket: '1-5',
        consent: {
          explicitConsentGranted: true,
          consentTimestamp: new Date().toISOString(),
          mode: 'consented_aggregate',
          disclosureVersion: '1.0.0',
        },
      };

      const result = validateFeedbackPayload(payloadWithClickHistory);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Forbidden field "clickHistory"'))).toBe(true);
      expect(result.errors.some(e => e.includes('Forbidden field "dwellTime"'))).toBe(true);
    });

    it('rejects oversized payloads to prevent data-dump exploits', () => {
      const oversizedPayload: unknown = {
        rating: 'helpful',
        category: 'a'.repeat(1200),
        resultCountBucket: '1-5',
        consent: {
          explicitConsentGranted: true,
          consentTimestamp: new Date().toISOString(),
          mode: 'consented_aggregate',
          disclosureVersion: '1.0.0',
        },
      };

      const result = validateFeedbackPayload(oversizedPayload);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds maximum allowed limit'))).toBe(true);
    });

    it('validates rating, buckets, and allowed reason codes', () => {
      const validPayload: FeedbackSubmissionPayload = {
        rating: 'not_helpful',
        category: 'developer',
        resultCountBucket: '1-5',
        reasonCode: 'outdated_results',
        consent: {
          explicitConsentGranted: true,
          consentTimestamp: new Date().toISOString(),
          mode: 'consented_aggregate',
          disclosureVersion: '1.0.0',
        },
      };

      const result = validateFeedbackPayload(validPayload);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedPayload?.rating).toBe('not_helpful');
      expect(result.sanitizedPayload?.reasonCode).toBe('outdated_results');
    });
  });

  describe('2. Bounded Storage & 30-Day Retention Policy', () => {
    it('acceptance criterion: automatically computes 30-day expiration for each record', () => {
      const submission: FeedbackSubmissionPayload = {
        rating: 'helpful',
        category: 'research',
        resultCountBucket: '10+',
        consent: {
          explicitConsentGranted: true,
          consentTimestamp: new Date().toISOString(),
          mode: 'consented_aggregate',
          disclosureVersion: '1.0.0',
        },
      };

      const record = storage.addRecord(submission);
      expect(record.feedbackId).toBeDefined();
      expect(record.expiresAt).toBeDefined();

      const createdTime = new Date(record.timestamp).getTime();
      const expiresTime = new Date(record.expiresAt).getTime();
      const diffDays = Math.round((expiresTime - createdTime) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(30);
    });

    it('enforces FIFO ring-buffer bounds when maxStoredRecords is exceeded', () => {
      const smallStorage = new FeedbackStorage({ maxStoredRecords: 3 });

      for (let i = 1; i <= 5; i++) {
        smallStorage.addRecord({
          feedbackId: `feedback-${i}`,
          rating: 'helpful',
          category: 'general',
          resultCountBucket: '1-5',
          consent: {
            explicitConsentGranted: true,
            consentTimestamp: new Date().toISOString(),
            mode: 'consented_aggregate',
            disclosureVersion: '1.0.0',
          },
        });
      }

      const records = smallStorage.getAllRecords();
      expect(records).toHaveLength(3);
      // Oldest (1, 2) were evicted; 3, 4, 5 remain
      expect(records.map(r => r.feedbackId)).toEqual(['feedback-3', 'feedback-4', 'feedback-5']);
    });

    it('supports immediate total purge (user deletion right)', () => {
      storage.addRecord({
        rating: 'helpful',
        resultCountBucket: '1-5',
        consent: {
          explicitConsentGranted: true,
          consentTimestamp: new Date().toISOString(),
          mode: 'consented_aggregate',
          disclosureVersion: '1.0.0',
        },
      });

      expect(storage.getAllRecords()).toHaveLength(1);
      const purged = storage.purgeAll();
      expect(purged).toBe(1);
      expect(storage.getAllRecords()).toHaveLength(0);
    });
  });

  describe('3. Local Feedback Export & Network Metadata Limitations', () => {
    it('exports local feedback formatted as JSON with embedded retention policy disclosure', () => {
      storage.addRecord({
        rating: 'helpful',
        category: 'developer',
        resultCountBucket: '6-10',
        reasonCode: 'accurate_answer',
        consent: {
          explicitConsentGranted: true,
          consentTimestamp: new Date().toISOString(),
          mode: 'consented_aggregate',
          disclosureVersion: CURRENT_DISCLOSURE_VERSION,
        },
      });

      const exported = storage.exportToJson();
      expect(exported.totalRecords).toBe(1);
      expect(exported.records).toHaveLength(1);
      expect(exported.retentionPolicy.maxRetentionDays).toBe(30);
      expect(exported.retentionPolicy.networkMetadataDisclosure).toContain('Notice on Network Metadata');
    });

    it('acceptance criterion: documents network metadata limitations (does not falsely claim anonymity)', () => {
      const policy = service.getPrivacyNotice();
      expect(policy.networkMetadataDisclosure).toContain('Notice on Network Metadata');
      expect(policy.networkMetadataDisclosure).toContain('OpenSearch strictly strips and does not log your IP address');
      expect(policy.networkMetadataDisclosure).toContain('intermediate network infrastructure');
      expect(policy.deletionPolicy).toContain('retained for a maximum of 30 days');
    });

    it('computes aggregate statistics without tracking individual users', () => {
      service.submitFeedback({
        rating: 'helpful',
        category: 'developer',
        resultCountBucket: '6-10',
        consent: {
          explicitConsentGranted: true,
          consentTimestamp: new Date().toISOString(),
          mode: 'consented_aggregate',
          disclosureVersion: '1.0.0',
        },
      });

      service.submitFeedback({
        rating: 'not_helpful',
        category: 'developer',
        resultCountBucket: '0',
        consent: {
          explicitConsentGranted: true,
          consentTimestamp: new Date().toISOString(),
          mode: 'consented_aggregate',
          disclosureVersion: '1.0.0',
        },
      });

      const stats = service.getStats();
      expect(stats.totalSubmissions).toBe(2);
      expect(stats.helpfulCount).toBe(1);
      expect(stats.notHelpfulCount).toBe(1);
      expect(stats.byCategory['developer']?.helpful).toBe(1);
      expect(stats.byCategory['developer']?.notHelpful).toBe(1);
    });
  });

  describe('4. Factory and Shared Instances', () => {
    it('provides isolated and shared service singletons', () => {
      const inst = createFeedbackService();
      const shared = getSharedFeedbackService();

      expect(inst).toBeInstanceOf(FeedbackService);
      expect(shared).toBeInstanceOf(FeedbackService);
      expect(getSharedFeedbackService()).toBe(shared);
    });
  });
});
