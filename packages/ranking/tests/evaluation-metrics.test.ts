import { describe, expect, it } from 'vitest';
import {
  computeAveragePrecision,
  computeDCG,
  computeIDCG,
  computeNDCG,
  computePrecisionAtK,
  computeRecallAtK,
  computeReciprocalRank,
  evaluateQuerySet,
  evaluateRankedList,
} from '../src/evaluation/evaluation-metrics.js';
import { RelevanceGrade } from '../src/evaluation/judged-dataset-types.js';
import { HandCalculatedFixture } from '../src/evaluation/metrics-types.js';

describe('Phase 91 — Evaluation Metrics Suite', () => {
  // ── 1. Hand-Calculated Mathematical Fixtures ──────────────────────────────
  describe('1. Hand-Calculated Fixtures & Mathematical Accuracy', () => {
    /**
     * Fixture A: 4-document retrieval in non-optimal order
     * Ground Truth:
     *   doc-A: 3 (Perfect)
     *   doc-B: 2 (Relevant)
     *   doc-C: 1 (Marginal)
     *   doc-D: 0 (Irrelevant)
     * Retrieved order: [doc-B, doc-A, doc-D, doc-C]
     *
     * Hand calculations (gain = 2^g - 1, discount = log2(rank + 1)):
     * rank 1: doc-B (g=2) -> (4 - 1) / log2(2) = 3 / 1 = 3.0
     * rank 2: doc-A (g=3) -> (8 - 1) / log2(3) = 7 / 1.584962500721156 = 4.416508275...
     * rank 3: doc-D (g=0) -> (1 - 1) / log2(4) = 0.0
     * rank 4: doc-C (g=1) -> (2 - 1) / log2(5) = 1 / 2.321928094887362 = 0.430676558...
     * Total DCG@4 = 3.0 + 4.416508275 + 0.0 + 0.430676558 = 7.847184833...
     *
     * Ideal order: [doc-A (3), doc-B (2), doc-C (1), doc-D (0)]
     * rank 1: 7 / 1 = 7.0
     * rank 2: 3 / log2(3) = 1.892789260...
     * rank 3: 1 / 2 = 0.5
     * rank 4: 0.0
     * Total IDCG@4 = 7.0 + 1.892789260 + 0.5 + 0.0 = 9.392789260...
     *
     * nDCG@4 = 7.847184833 / 9.392789260 = 0.83544778...
     *
     * Binary relevance (threshold = 1):
     * Relevant: doc-A, doc-B, doc-C (3 docs)
     * R = [rel, rel, not-rel, rel]
     * P@1 = 1/1 = 1.0
     * P@2 = 2/2 = 1.0
     * P@3 = 2/3 = 0.6666667
     * P@4 = 3/4 = 0.75
     *
     * R@2 = 2/3 = 0.6666667
     * R@4 = 3/3 = 1.0
     *
     * RR: first relevant doc is at rank 1 -> 1 / 1 = 1.0
     *
     * AP@4:
     * rank 1 (rel): P@1 = 1.0
     * rank 2 (rel): P@2 = 1.0
     * rank 3 (not-rel): 0.0
     * rank 4 (rel): P@4 = 0.75
     * Sum = 1.0 + 1.0 + 0.75 = 2.75
     * AP@4 = 2.75 / min(3, 4) = 2.75 / 3 = 0.91666667
     */
    const fixtureA: HandCalculatedFixture = {
      name: 'Fixture A: 4-document non-optimal ranking',
      description: 'Standard 4-level graded relevance retrieval',
      qrels: {
        'doc-A': 3,
        'doc-B': 2,
        'doc-C': 1,
        'doc-D': 0,
      },
      retrieved: [{ id: 'doc-B' }, { id: 'doc-A' }, { id: 'doc-D' }, { id: 'doc-C' }],
      options: { k: 4, relevanceThreshold: 1, gainMethod: 'exponential' },
      expected: {
        dcg: 7.847184833,
        idcg: 9.39278926,
        ndcg: 0.83544778,
        precision: 0.75, // P@4
        recall: 1.0, // R@4
        reciprocalRank: 1.0,
        averagePrecision: 0.91666667,
      },
    };

    it('matches exact hand-calculated values for Fixture A', () => {
      const result = evaluateRankedList('q-fixture-a', fixtureA.retrieved, fixtureA.qrels, fixtureA.options);

      expect(result.dcg).toBeCloseTo(fixtureA.expected.dcg, 5);
      expect(result.idcg).toBeCloseTo(fixtureA.expected.idcg, 5);
      expect(result.ndcg).toBeCloseTo(fixtureA.expected.ndcg, 5);
      expect(result.precision).toBeCloseTo(fixtureA.expected.precision, 5);
      expect(result.recall).toBeCloseTo(fixtureA.expected.recall, 5);
      expect(result.reciprocalRank).toBeCloseTo(fixtureA.expected.reciprocalRank, 5);
      expect(result.averagePrecision).toBeCloseTo(fixtureA.expected.averagePrecision, 5);
      expect(result.retrievedCount).toBe(4);
      expect(result.relevantRetrievedCount).toBe(3);
      expect(result.totalRelevantCount).toBe(3);
    });

    /**
     * Fixture B: Perfect retrieval (exact ideal order)
     * Expected nDCG@k = 1.0, Precision@1 = 1.0, Reciprocal Rank = 1.0
     */
    it('achieves exact 1.0 nDCG and MAP for perfectly ranked retrieval', () => {
      const qrels: Record<string, RelevanceGrade> = {
        'doc-1': 3,
        'doc-2': 2,
        'doc-3': 1,
      };
      const retrieved = ['doc-1', 'doc-2', 'doc-3'];
      const result = evaluateRankedList('q-perfect', retrieved, qrels, { k: 3 });

      expect(result.dcg).toBe(result.idcg);
      expect(result.ndcg).toBe(1.0);
      expect(result.precision).toBe(1.0);
      expect(result.recall).toBe(1.0);
      expect(result.reciprocalRank).toBe(1.0);
      expect(result.averagePrecision).toBe(1.0);
    });

    /**
     * Fixture C: Completely irrelevant retrieval (all 0s)
     * Expected nDCG = 0.0, Precision = 0.0, Recall = 0.0, RR = 0.0
     */
    it('returns exact 0.0 for completely irrelevant retrieval', () => {
      const qrels: Record<string, RelevanceGrade> = {
        'doc-good-1': 3,
        'doc-good-2': 2,
        'doc-bad-1': 0,
        'doc-bad-2': 0,
      };
      const retrieved = ['doc-bad-1', 'doc-bad-2'];
      const result = evaluateRankedList('q-irrelevant', retrieved, qrels, { k: 2 });

      expect(result.dcg).toBe(0.0);
      expect(result.ndcg).toBe(0.0);
      expect(result.precision).toBe(0.0);
      expect(result.recall).toBe(0.0);
      expect(result.reciprocalRank).toBe(0.0);
      expect(result.averagePrecision).toBe(0.0);
    });

    /**
     * Fixture D: Linear Gain formulation
     * Linear DCG: g / log2(rank + 1)
     * [doc-2 (g=2), doc-1 (g=3)] at k=2
     * rank 1: 2 / log2(2) = 2.0
     * rank 2: 3 / log2(3) = 3 / 1.5849625 = 1.892789
     * DCG = 2.0 + 1.892789 = 3.892789
     * IDCG: [doc-1 (3), doc-2 (2)] -> 3.0 + 2 / 1.5849625 = 3.0 + 1.261859 = 4.261859
     * nDCG = 3.892789 / 4.261859 = 0.913399
     */
    it('computes linear gain formulation correctly', () => {
      const retrievedGrades = [2, 3];
      const allGrades = [3, 2];
      const dcg = computeDCG(retrievedGrades, 2, 'linear');
      const idcg = computeIDCG(allGrades, 2, 'linear');
      const ndcg = computeNDCG(retrievedGrades, allGrades, 2, 'linear');

      expect(dcg).toBeCloseTo(3.892789, 5);
      expect(idcg).toBeCloseTo(4.261859, 5);
      expect(ndcg).toBeCloseTo(0.913399, 5);
    });
  });

  // ── 2. Individual Metric Computations ─────────────────────────────────────
  describe('2. Standalone Metric Functions & Edge Invariants', () => {
    it('computeDCG handles empty list, negative k, and zero grades safely', () => {
      expect(computeDCG([], 10)).toBe(0.0);
      expect(computeDCG([0, 0, 0], 3)).toBe(0.0);
      expect(computeDCG([3, 2], 0)).toBe(0.0);
      expect(computeDCG([3, 2], -1)).toBe(0.0);
    });

    it('computeNDCG avoids division-by-zero when IDCG is 0', () => {
      expect(computeNDCG([0, 0], [0, 0], 2)).toBe(0.0);
      expect(computeNDCG([], [], 5)).toBe(0.0);
    });

    it('computePrecisionAtK correctly computes partial and overflow k', () => {
      expect(computePrecisionAtK([true, false, true, true], 4)).toBe(0.75);
      expect(computePrecisionAtK([true, true], 4)).toBe(0.5); // only 2 items retrieved for k=4
      expect(computePrecisionAtK([false], 1)).toBe(0.0);
      expect(computePrecisionAtK([], 5)).toBe(0.0);
      expect(computePrecisionAtK([true], 0)).toBe(0.0);
    });

    it('computeRecallAtK respects total ground-truth pool size', () => {
      // 2 retrieved relevant out of 4 total in corpus
      expect(computeRecallAtK([true, true, false], 4, 3)).toBe(0.5);
      // All 4 retrieved
      expect(computeRecallAtK([true, true, true, true], 4, 4)).toBe(1.0);
      // Truncated at k=2
      expect(computeRecallAtK([true, true, true, true], 4, 2)).toBe(0.5);
    });

    it('computeReciprocalRank computes reciprocal of first relevant item rank', () => {
      expect(computeReciprocalRank([true, false, false])).toBe(1.0); // rank 1
      expect(computeReciprocalRank([false, true, false])).toBe(0.5); // rank 2
      expect(computeReciprocalRank([false, false, true])).toBeCloseTo(0.333333, 5); // rank 3
      expect(computeReciprocalRank([false, false, false])).toBe(0.0); // none found
      // Truncated by k: relevant item at rank 3, but k=2
      expect(computeReciprocalRank([false, false, true], 2)).toBe(0.0);
    });

    it('computeAveragePrecision normalizes by min(totalRelevant, k)', () => {
      // 2 relevant items retrieved at rank 1 and rank 3; total relevant = 2
      // P@1 = 1/1 = 1.0; P@2 = 1/2 (not rel); P@3 = 2/3 = 0.666667
      // sumPrecision = 1.0 + 0.666667 = 1.666667
      // denominator = min(2, 3) = 2
      // AP = 1.666667 / 2 = 0.833333
      const ap = computeAveragePrecision([true, false, true], 2, 3);
      expect(ap).toBeCloseTo(0.833333, 5);
    });
  });

  // ── 3. Treatment of Missing Judgments ─────────────────────────────────────
  describe('3. Treatment of Missing Judgments (Unjudged Documents)', () => {
    const qrels: Record<string, RelevanceGrade> = {
      'known-1': 3,
      'known-2': 2,
    };
    const retrieved = ['known-1', 'unknown-doc-x', 'known-2'];

    it("policy 'zero' penalizes unjudged documents by assigning grade 0", () => {
      const result = evaluateRankedList('q-missing', retrieved, qrels, {
        k: 3,
        unjudgedPolicy: 'zero',
      });

      expect(result.unjudgedCount).toBe(1);
      expect(result.notes.some(n => n.includes("policy 'zero'"))).toBe(true);
      // rank 2 is unjudged (grade 0), pushing known-2 to rank 3
      expect(result.precision).toBeCloseTo(2 / 3, 5);
      expect(result.dcg).toBeLessThan(result.idcg);
    });

    it("policy 'ignore' skips unjudged documents from evaluation", () => {
      const result = evaluateRankedList('q-missing', retrieved, qrels, {
        k: 2,
        unjudgedPolicy: 'ignore',
      });

      expect(result.unjudgedCount).toBe(1);
      // unknown-doc-x is omitted, so known-1 (rank 1) and known-2 (rank 2) are evaluated
      expect(result.ndcg).toBe(1.0);
      expect(result.precision).toBe(1.0);
    });

    it("policy 'defaultGrade' assigns fallback grade to unjudged documents", () => {
      const result = evaluateRankedList('q-missing', retrieved, qrels, {
        k: 3,
        unjudgedPolicy: 'defaultGrade',
        defaultGrade: 1, // Marginal
      });

      expect(result.unjudgedCount).toBe(1);
      // All 3 documents are now considered relevant (grade >= 1)
      expect(result.relevantRetrievedCount).toBe(3);
      expect(result.precision).toBe(1.0);
    });
  });

  // ── 4. Queries with No Relevant Documents ────────────────────────────────
  describe('4. Queries with Zero Relevant Documents in Ground Truth', () => {
    const qrelsAllZero: Record<string, RelevanceGrade> = {
      'doc-1': 0,
      'doc-2': 0,
    };
    const retrieved = ['doc-1', 'doc-2'];

    it("returns 0.0 for recall and AP under policy 'zero'", () => {
      const result = evaluateRankedList('q-zero-rel', retrieved, qrelsAllZero, {
        noRelevantDocsPolicy: 'zero',
      });

      expect(result.totalRelevantCount).toBe(0);
      expect(result.recall).toBe(0.0);
      expect(result.averagePrecision).toBe(0.0);
      expect(result.ndcg).toBe(0.0);
    });

    it("returns 1.0 for recall and AP under policy 'one' (vacuous truth)", () => {
      const result = evaluateRankedList('q-zero-rel', retrieved, qrelsAllZero, {
        noRelevantDocsPolicy: 'one',
      });

      expect(result.totalRelevantCount).toBe(0);
      expect(result.recall).toBe(1.0);
      expect(result.averagePrecision).toBe(1.0);
    });

    it("excludes zero-relevant queries from macro-aggregates under policy 'ignore'", () => {
      const queries = [
        {
          id: 'q-good',
          retrieved: ['doc-rel'],
          qrels: { 'doc-rel': 3 as RelevanceGrade },
        },
        {
          id: 'q-empty',
          retrieved: ['doc-zero'],
          qrels: { 'doc-zero': 0 as RelevanceGrade },
        },
      ];

      const agg = evaluateQuerySet(queries, { noRelevantDocsPolicy: 'ignore' });

      expect(agg.queryCount).toBe(2);
      expect(agg.evaluatedQueryCount).toBe(1);
      expect(agg.ignoredQueryCount).toBe(1);
      expect(agg.meanNDCG).toBe(1.0); // only q-good counted
      expect(agg.meanRecall).toBe(1.0);
    });
  });

  // ── 5. Deterministic Tie-Breaking ────────────────────────────────────────
  describe('5. Deterministic Tie-Breaking & Consistency', () => {
    it('deterministically breaks ties using docId ascending when scores are equal', () => {
      const qrels: Record<string, RelevanceGrade> = {
        'doc-alpha': 2,
        'doc-beta': 2,
        'doc-gamma': 2,
      };

      // Shuffled input with equal scores
      const retrievedWithScores = [
        { id: 'doc-gamma', score: 10.5 },
        { id: 'doc-alpha', score: 10.5 },
        { id: 'doc-beta', score: 10.5 },
      ];

      const result1 = evaluateRankedList('q-tie', retrievedWithScores, qrels, {
        tieBreaking: 'docIdAsc',
      });
      const result2 = evaluateRankedList('q-tie', retrievedWithScores, qrels, {
        tieBreaking: 'docIdAsc',
      });

      expect(result1.dcg).toBe(result2.dcg);
      expect(result1.ndcg).toBe(result2.ndcg);
      expect(result1.dcg).toBeGreaterThan(0);
    });

    it('produces identical repeated evaluation outputs (determinism)', () => {
      const qrels: Record<string, RelevanceGrade> = {
        'doc-1': 3,
        'doc-2': 1,
        'doc-3': 0,
      };
      const retrieved = ['doc-2', 'doc-1', 'doc-3'];

      const run1 = evaluateRankedList('q-det', retrieved, qrels);
      const run2 = evaluateRankedList('q-det', retrieved, qrels);

      expect(run1).toEqual(run2);
    });
  });

  // ── 6. Aggregate Evaluation & Category Summaries ──────────────────────────
  describe('6. Multi-Query Aggregate Evaluation & Category Breakdown', () => {
    it('computes macro-averaged metrics and per-category breakdowns', () => {
      const queries = [
        {
          id: 'q-prog-1',
          category: 'programming' as const,
          retrieved: ['doc-p1', 'doc-p2'],
          qrels: { 'doc-p1': 3 as RelevanceGrade, 'doc-p2': 2 as RelevanceGrade },
        },
        {
          id: 'q-prog-2',
          category: 'programming' as const,
          retrieved: ['doc-p3'],
          qrels: { 'doc-p3': 3 as RelevanceGrade },
        },
        {
          id: 'q-everyday-1',
          category: 'everyday' as const,
          retrieved: ['doc-e1', 'doc-e2'],
          qrels: { 'doc-e1': 2 as RelevanceGrade, 'doc-e2': 0 as RelevanceGrade },
        },
      ];

      const aggregate = evaluateQuerySet(queries, { k: 5 });

      expect(aggregate.queryCount).toBe(3);
      expect(aggregate.evaluatedQueryCount).toBe(3);
      expect(aggregate.meanNDCG).toBeGreaterThan(0.8);
      expect(aggregate.meanReciprocalRank).toBe(1.0); // each query had relevant doc at rank 1
      expect(aggregate.categoryBreakdown.programming).toBeDefined();
      expect(aggregate.categoryBreakdown.everyday).toBeDefined();
      expect(aggregate.categoryBreakdown.programming?.queryCount).toBe(2);
      expect(aggregate.categoryBreakdown.everyday?.queryCount).toBe(1);
    });
  });
});
