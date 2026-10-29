import { describe, it, expect, beforeEach } from 'vitest';
import {
  NonInvasiveAbuseFilter,
  FeedbackReviewQueue,
  RankingSafetyGuard,
  RankingSafetyViolationError,
  HeldOutContaminationError,
  FeedbackNotFoundError,
  CURRENT_DISCLOSURE_VERSION,
  type StoredFeedbackRecord,
} from '../src/index.js';

describe('Phase 106: Feedback Review Workflow & Ranking Safety', () => {
  let queue: FeedbackReviewQueue;
  let abuseFilter: NonInvasiveAbuseFilter;

  const createMockRecord = (
    id: string,
    rating: 'helpful' | 'not_helpful' = 'helpful',
    category = 'developer',
    resultCountBucket: '0' | '1-5' | '6-10' | '10+' = '1-5',
    timestamp = new Date().toISOString()
  ): StoredFeedbackRecord => ({
    feedbackId: id,
    timestamp,
    rating,
    category,
    resultCountBucket,
    reasonCode: rating === 'helpful' ? 'relevant_results' : 'poor_relevance',
    consent: {
      explicitConsentGranted: true,
      consentTimestamp: timestamp,
      mode: 'consented_aggregate',
      disclosureVersion: CURRENT_DISCLOSURE_VERSION,
    },
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  });

  beforeEach(() => {
    abuseFilter = new NonInvasiveAbuseFilter({
      burstThreshold: 3,
      burstWindowMs: 5000,
      suspiciousSignalWeight: 0.1,
      normalSignalWeight: 1.0,
    });
    queue = new FeedbackReviewQueue(abuseFilter);
  });

  describe('NonInvasiveAbuseFilter', () => {
    it('evaluates normal submissions with full signal strength and no burst flag', () => {
      const record = createMockRecord('fb-1');
      const result = abuseFilter.evaluateRecord(record, []);

      expect(result.isSuspiciousBurst).toBe(false);
      expect(result.signalStrength).toBe(1.0);
      expect(result.burstCountInWindow).toBe(1);
      expect(result.reason).toBeUndefined();
    });

    it('detects high-frequency bursts without collecting user IP or device fingerprints', () => {
      const now = Date.now();
      const historicalTimestamps = [
        new Date(now - 1000).toISOString(),
        new Date(now - 2000).toISOString(),
        new Date(now - 3000).toISOString(),
        new Date(now - 4000).toISOString(),
      ];

      const burstRecord = createMockRecord('fb-burst', 'not_helpful', 'developer', '0', new Date(now).toISOString());
      const result = abuseFilter.evaluateRecord(burstRecord, historicalTimestamps);

      expect(result.isSuspiciousBurst).toBe(true);
      expect(result.signalStrength).toBe(0.1);
      expect(result.burstCountInWindow).toBe(5);
      expect(result.reason).toContain('High-frequency burst detected');
    });

    it('generates cluster keys based purely on non-identifying metadata', () => {
      const record = createMockRecord('fb-1', 'not_helpful', 'developer', '0');
      const clusterKey = abuseFilter.generateClusterKey(record);

      expect(clusterKey).toBe('cat:developer|bucket:0|reason:poor_relevance');
      expect(clusterKey).not.toContain('ip');
      expect(clusterKey).not.toContain('userId');
    });
  });

  describe('FeedbackReviewQueue', () => {
    it('imports records into queue idempotently and clusters them', () => {
      const records = [
        createMockRecord('fb-1', 'helpful', 'developer', '1-5'),
        createMockRecord('fb-2', 'helpful', 'developer', '1-5'),
        createMockRecord('fb-3', 'not_helpful', 'developer', '0'),
      ];

      const res1 = queue.importRecords(records);
      expect(res1.importedCount).toBe(3);
      expect(res1.skippedCount).toBe(0);

      // Re-importing same records should be skipped idempotently
      const res2 = queue.importRecords(records);
      expect(res2.importedCount).toBe(0);
      expect(res2.skippedCount).toBe(3);

      const stats = queue.getStats();
      expect(stats.totalItems).toBe(3);
      expect(stats.pendingCount).toBe(3);
      expect(stats.clustersCount).toBe(2);
    });

    it('imports from raw JSON payload', () => {
      const records = [createMockRecord('fb-json-1')];
      const json = JSON.stringify(records);

      const res = queue.importFromJson(json);
      expect(res.importedCount).toBe(1);
      expect(queue.getStats().totalItems).toBe(1);
    });

    it('lists items with filtering and pagination', () => {
      const records = [
        createMockRecord('fb-1', 'helpful', 'news'),
        createMockRecord('fb-2', 'not_helpful', 'news'),
        createMockRecord('fb-3', 'helpful', 'developer'),
      ];
      queue.importRecords(records);

      const all = queue.listItems({ limit: 10 });
      expect(all.total).toBe(3);
      expect(all.items.length).toBe(3);

      // Filter by clusterKey
      const newsCluster = abuseFilter.generateClusterKey(records[0]!);
      const filtered = queue.listItems({ clusterKey: newsCluster });
      expect(filtered.total).toBe(1);
      expect(filtered.items[0]?.feedback.feedbackId).toBe('fb-1');
    });

    it('updates review status and attaches curator notes', () => {
      const records = [createMockRecord('fb-1')];
      const { items } = queue.importRecords(records);
      const queueId = items[0]!.queueId;

      const updated = queue.updateStatus(queueId, 'under_investigation', 'curator_alice', 'Reviewing query pattern');
      expect(updated.status).toBe('under_investigation');
      expect(updated.curatorId).toBe('curator_alice');
      expect(updated.curatorNotes).toBe('Reviewing query pattern');
      expect(updated.reviewedAt).toBeDefined();

      const retrieved = queue.getItem(queueId);
      expect(retrieved?.status).toBe('under_investigation');
    });

    it('throws FeedbackNotFoundError for non-existent queue ID on update', () => {
      expect(() => {
        queue.updateStatus('non_existent_id', 'rejected');
      }).toThrow(FeedbackNotFoundError);
    });

    it('generates cluster summaries with vote distribution and average confidence', () => {
      const records = [
        createMockRecord('fb-1', 'helpful', 'developer', '1-5'),
        createMockRecord('fb-2', 'helpful', 'developer', '1-5'),
        createMockRecord('fb-3', 'not_helpful', 'developer', '1-5'),
      ];
      queue.importRecords(records);

      const clusters = queue.getClusters();
      expect(clusters.length).toBeGreaterThan(0);
      const devCluster = clusters.find((c) => c.category === 'developer');
      expect(devCluster).toBeDefined();
      expect(devCluster?.totalVotes).toBeGreaterThanOrEqual(1);
      expect(devCluster?.signalConfidence).toBe(1.0);
    });

    it('strictly prevents feedback from contaminating held-out evaluation datasets', () => {
      const records = [createMockRecord('fb-1', 'not_helpful', 'developer', '0')];
      const { items } = queue.importRecords(records);
      const queueId = items[0]!.queueId;

      expect(() => {
        queue.approveCandidateEvaluationCase(queueId, {
          curatorId: 'curator_bob',
          curatorRationale: 'Attempting invalid allocation to held-out',
          syntheticQuery: 'rust async stream',
          category: 'code',
          intent: 'Finding Rust async stream documentation',
          judgments: [],
          targetSplit: 'held_out' as any,
        });
      }).toThrow(HeldOutContaminationError);

      // Verify the item remains unchanged in pending status
      expect(queue.getItem(queueId)?.status).toBe('pending');
    });

    it('approves candidate evaluation cases strictly for tuning split with curator sign-off', () => {
      const records = [createMockRecord('fb-1', 'not_helpful', 'developer', '0')];
      const { items } = queue.importRecords(records);
      const queueId = items[0]!.queueId;

      const candidateCase = queue.approveCandidateEvaluationCase(queueId, {
        curatorId: 'curator_alice',
        curatorRationale: 'Verified zero-result query on Rust async streams. Added curated benchmark judgments.',
        syntheticQuery: 'rust async stream example',
        category: 'code',
        intent: 'Developer searching for async stream patterns in Rust',
        judgments: [
          { docId: 'doc_rust_stream_1', grade: 3, rationale: 'Official documentation' },
        ],
      });

      expect(candidateCase.split).toBe('tuning');
      expect(candidateCase.query).toBe('rust async stream example');
      expect(candidateCase.approval.approvedBy).toBe('curator_alice');
      expect(candidateCase.approval.requiresReproducibleBenchmark).toBe(true);

      const item = queue.getItem(queueId);
      expect(item?.status).toBe('approved_for_evaluation');
      expect(item?.candidateCase).toBeDefined();
    });
  });

  describe('RankingSafetyGuard', () => {
    it('rejects automated vote application into production ranking weights', () => {
      expect(() => {
        RankingSafetyGuard.rejectAutomatedVoteApplication('Direct feedback weight tuning');
      }).toThrow(RankingSafetyViolationError);
    });

    it('rejects ranking changes without human curator approval', () => {
      expect(() => {
        RankingSafetyGuard.assertSafeRankingModification({
          proposedBy: 'auto_feedback_agent',
          approvedBy: '',
          description: 'Automated boost on developer terms',
          parameterDiff: { bm25K1: { before: 1.2, after: 1.4 } },
          reproducibleBenchmark: {
            runId: 'bench-101',
            tuningNdcgDelta: 0.05,
            heldOutNdcgDelta: 0.02,
            regressionDetected: false,
            verificationDate: new Date().toISOString(),
          },
        });
      }).toThrow(/Automated ranking modification blocked/);
    });

    it('rejects ranking changes without reproducible benchmark results', () => {
      expect(() => {
        RankingSafetyGuard.assertSafeRankingModification({
          proposedBy: 'ranking_team',
          approvedBy: 'senior_lead',
          description: 'Manual ranking adjustment without benchmarks',
          parameterDiff: { bm25B: { before: 0.75, after: 0.8 } },
        });
      }).toThrow(/Missing reproducible benchmark/);
    });

    it('rejects ranking changes exhibiting regression on held-out evaluation datasets', () => {
      expect(() => {
        RankingSafetyGuard.assertSafeRankingModification({
          proposedBy: 'ranking_team',
          approvedBy: 'lead_curator',
          description: 'Tuning parameters that overfit tuning and regress held-out',
          parameterDiff: { titleBoost: { before: 2.0, after: 4.0 } },
          reproducibleBenchmark: {
            runId: 'bench-overfit-99',
            tuningNdcgDelta: 0.12,
            heldOutNdcgDelta: -0.04, // Regression!
            regressionDetected: true,
            verificationDate: new Date().toISOString(),
          },
        });
      }).toThrow(/held-out evaluation regression/);
    });

    it('approves verified ranking changes with human review and non-regressing benchmarks', () => {
      const record = RankingSafetyGuard.assertSafeRankingModification({
        proposedBy: 'ranking_engineer_dan',
        approvedBy: 'lead_curator_sarah',
        description: 'Refined phrase match weight after tuning evaluation',
        parameterDiff: { phraseBoost: { before: 1.5, after: 1.8 } },
        reproducibleBenchmark: {
          runId: 'bench-v1.5.0-pass',
          tuningNdcgDelta: 0.035,
          heldOutNdcgDelta: 0.008,
          regressionDetected: false,
          verificationDate: new Date().toISOString(),
        },
      });

      expect(record.safetyGatePassed).toBe(true);
      expect(record.changeId).toMatch(/^rk_chg_/);
      expect(record.approvedBy).toBe('lead_curator_sarah');
      expect(record.reproducibleBenchmark.regressionDetected).toBe(false);
    });
  });
});
