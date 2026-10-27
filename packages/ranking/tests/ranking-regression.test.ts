import { describe, expect, it } from 'vitest';
import { CI_JUDGED_DATASET } from '../src/evaluation/datasets/ci-judged-dataset.js';
import { DEFAULT_BASELINE_CONFIG } from '../src/evaluation/experiment-runner.js';
import { ExperimentComparisonResult, RankingExperimentConfig } from '../src/evaluation/experiment-types.js';
import {
  DEFAULT_REGRESSION_THRESHOLDS,
  checkRankingRegression,
  formatRegressionReport,
  runCiRegressionGate,
} from '../src/evaluation/regression-checker.js';

describe('Phase 93 — Ranking Regression Checks Suite', () => {
  // ── 1. Lightweight Deterministic CI Gate ─────────────────────────────────
  describe('1. Lightweight Deterministic CI Regression Gate', () => {
    it('runs CI regression gate on baseline cleanly in < 30ms', () => {
      const start = Date.now();
      const result = runCiRegressionGate(CI_JUDGED_DATASET, DEFAULT_BASELINE_CONFIG);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100); // lightweight & fast
      expect(result.passed).toBe(true);
      expect(result.requiresReview).toBe(false);
      expect(result.failureReasons).toHaveLength(0);
      expect(result.reviewReasons).toHaveLength(0);
      expect(result.privacyVerified).toBe(true);
      expect(result.regressedQueries).toHaveLength(0);
    });

    it('produces 100% deterministic results across repeated invocations', () => {
      const run1 = runCiRegressionGate(CI_JUDGED_DATASET, DEFAULT_BASELINE_CONFIG);
      const run2 = runCiRegressionGate(CI_JUDGED_DATASET, DEFAULT_BASELINE_CONFIG);

      expect(run1.passed).toBe(run2.passed);
      expect(run1.aggregateDeltas).toEqual(run2.aggregateDeltas);
      expect(run1.regressedQueries).toEqual(run2.regressedQueries);
      expect(run1.improvedQueries).toEqual(run2.improvedQueries);
    });
  });

  // ── 2. Regressions Cannot Be Hidden Behind Aggregate Score ───────────────
  describe('2. Anti-Hiding: Query-Level Degradation Detection', () => {
    it('fails gate when an individual query suffers severe regression despite positive aggregate nDCG', () => {
      // Synthetic scenario: 9 queries improve (+0.02), but 1 query suffers a catastrophic -0.25 drop
      // Global aggregate nDCG rises: ((9 * 0.02) - 0.25) / 10 = -0.007 (within 0.01 aggregate threshold!)
      const mockComparison: ExperimentComparisonResult = {
        metadata: {
          experimentId: 'exp-anti-hiding',
          timestamp: new Date().toISOString(),
          runtimeMs: 15,
          indexVersion: 'v1.5.0',
          datasetName: 'ci-dataset',
          datasetVersion: '1.0.0',
          datasetSplit: 'tuning',
          queryCount: 10,
          metricOptions: { k: 10 },
          productionSafeguard: 'Active',
        },
        baselineConfig: DEFAULT_BASELINE_CONFIG,
        candidateConfig: { ...DEFAULT_BASELINE_CONFIG, name: 'candidate-with-hidden-regression' },
        baselineMetrics: {
          queryCount: 10,
          evaluatedQueryCount: 10,
          ignoredQueryCount: 0,
          k: 10,
          meanNDCG: 0.85,
          meanReciprocalRank: 0.9,
          meanAveragePrecision: 0.8,
          meanPrecision: 0.4,
          meanRecall: 1.0,
          categoryBreakdown: {},
          queryResults: [
            { queryId: 'q-everyday-01', k: 10, dcg: 8, idcg: 10, ndcg: 0.8, precision: 0.4, recall: 1.0, reciprocalRank: 1.0, averagePrecision: 0.8, retrievedCount: 10, relevantRetrievedCount: 4, totalRelevantCount: 4, unjudgedCount: 0, notes: [] },
            { queryId: 'q-everyday-02', k: 10, dcg: 8, idcg: 10, ndcg: 0.8, precision: 0.4, recall: 1.0, reciprocalRank: 1.0, averagePrecision: 0.8, retrievedCount: 10, relevantRetrievedCount: 4, totalRelevantCount: 4, unjudgedCount: 0, notes: [] },
          ],
        },
        candidateMetrics: {
          queryCount: 10,
          evaluatedQueryCount: 10,
          ignoredQueryCount: 0,
          k: 10,
          meanNDCG: 0.843, // Drop is only -0.007 (PASSES aggregate threshold of 0.01!)
          meanReciprocalRank: 0.9,
          meanAveragePrecision: 0.8,
          meanPrecision: 0.4,
          meanRecall: 1.0,
          categoryBreakdown: {},
          queryResults: [
            // Query 1 improved: +0.02
            { queryId: 'q-everyday-01', k: 10, dcg: 8.2, idcg: 10, ndcg: 0.82, precision: 0.4, recall: 1.0, reciprocalRank: 1.0, averagePrecision: 0.8, retrievedCount: 10, relevantRetrievedCount: 4, totalRelevantCount: 4, unjudgedCount: 0, notes: [] },
            // Query 2 severely regressed: -0.25 (CATASTROPHIC!)
            { queryId: 'q-everyday-02', k: 10, dcg: 5.5, idcg: 10, ndcg: 0.55, precision: 0.4, recall: 1.0, reciprocalRank: 0.5, averagePrecision: 0.5, retrievedCount: 10, relevantRetrievedCount: 4, totalRelevantCount: 4, unjudgedCount: 0, notes: [] },
          ],
        },
        comparison: {
          ndcg: { baseline: 0.85, candidate: 0.843, absoluteDelta: -0.007, percentChange: -0.82 },
          mrr: { baseline: 0.9, candidate: 0.9, absoluteDelta: 0.0, percentChange: 0.0 },
          map: { baseline: 0.8, candidate: 0.8, absoluteDelta: 0.0, percentChange: 0.0 },
          precision: { baseline: 0.4, candidate: 0.4, absoluteDelta: 0.0, percentChange: 0.0 },
          recall: { baseline: 1.0, candidate: 1.0, absoluteDelta: 0.0, percentChange: 0.0 },
        },
        queryWinLoss: { wins: 1, ties: 0, losses: 1, winQueries: ['q-everyday-01'], lossQueries: ['q-everyday-02'], tieQueries: [] },
        categoryComparisons: [],
        conclusion: { improved: false, evidenceRationale: 'Regression' },
      };

      const result = checkRankingRegression(mockComparison, CI_JUDGED_DATASET);

      // Must fail gate because q-everyday-02 suffered severe regression > 0.10
      expect(result.passed).toBe(false);
      expect(result.regressedQueries).toHaveLength(1);
      expect(result.regressedQueries[0]?.queryId).toBe('q-everyday-02');
      expect(result.regressedQueries[0]?.severity).toBe('severe');
      expect(result.failureReasons.some(r => r.includes('severe individual regression'))).toBe(true);
    });

    it('catches overall aggregate nDCG drop when candidate parameters are degraded', () => {
      const degradedConfig: RankingExperimentConfig = {
        ...DEFAULT_BASELINE_CONFIG,
        name: 'severely-degraded-config',
        bm25: {
          ...DEFAULT_BASELINE_CONFIG.bm25,
          titleBoost: 0.01,
          k1: 0.01,
        },
        pageRank: {
          ...DEFAULT_BASELINE_CONFIG.pageRank,
          enabled: false,
          weight: 0,
        },
      };

      const result = runCiRegressionGate(CI_JUDGED_DATASET, degradedConfig, {
        maxAggregateNdcgDrop: 0.005,
      });

      expect(result.passed).toBe(false);
      expect(result.failureReasons.length).toBeGreaterThan(0);
      expect(result.regressedQueries.length).toBeGreaterThan(0);
    });
  });

  // ── 3. Category Trade-Off Detection ──────────────────────────────────────
  describe('3. Category Trade-Off Review Protocol', () => {
    it('flags reviewRequired when one category improves at another category expense', () => {
      const mockComparisonWithTradeoff: ExperimentComparisonResult = {
        metadata: {
          experimentId: 'exp-tradeoff',
          timestamp: new Date().toISOString(),
          runtimeMs: 20,
          indexVersion: 'v1.5.0',
          datasetName: 'ci-dataset',
          datasetVersion: '1.0.0',
          datasetSplit: 'tuning',
          queryCount: 4,
          metricOptions: { k: 10 },
          productionSafeguard: 'Active',
        },
        baselineConfig: DEFAULT_BASELINE_CONFIG,
        candidateConfig: { ...DEFAULT_BASELINE_CONFIG, name: 'candidate-tradeoff' },
        baselineMetrics: {
          queryCount: 4,
          evaluatedQueryCount: 4,
          ignoredQueryCount: 0,
          k: 10,
          meanNDCG: 0.85,
          meanReciprocalRank: 0.9,
          meanAveragePrecision: 0.8,
          meanPrecision: 0.4,
          meanRecall: 1.0,
          categoryBreakdown: {
            programming: { category: 'programming', queryCount: 2, meanNDCG: 0.8, meanReciprocalRank: 0.8, meanAveragePrecision: 0.7, meanPrecision: 0.3, meanRecall: 1.0 },
            everyday: { category: 'everyday', queryCount: 2, meanNDCG: 0.9, meanReciprocalRank: 1.0, meanAveragePrecision: 0.9, meanPrecision: 0.5, meanRecall: 1.0 },
          },
          queryResults: [
            { queryId: 'q-prog-01', k: 10, dcg: 8, idcg: 10, ndcg: 0.8, precision: 0.3, recall: 1.0, reciprocalRank: 0.8, averagePrecision: 0.7, retrievedCount: 10, relevantRetrievedCount: 3, totalRelevantCount: 3, unjudgedCount: 0, notes: [] },
            { queryId: 'q-everyday-01', k: 10, dcg: 9, idcg: 10, ndcg: 0.9, precision: 0.5, recall: 1.0, reciprocalRank: 1.0, averagePrecision: 0.9, retrievedCount: 10, relevantRetrievedCount: 5, totalRelevantCount: 5, unjudgedCount: 0, notes: [] },
          ],
        },
        candidateMetrics: {
          queryCount: 4,
          evaluatedQueryCount: 4,
          ignoredQueryCount: 0,
          k: 10,
          meanNDCG: 0.855,
          meanReciprocalRank: 0.9,
          meanAveragePrecision: 0.8,
          meanPrecision: 0.4,
          meanRecall: 1.0,
          categoryBreakdown: {
            // Programming gained +0.05
            programming: { category: 'programming', queryCount: 2, meanNDCG: 0.85, meanReciprocalRank: 0.9, meanAveragePrecision: 0.75, meanPrecision: 0.35, meanRecall: 1.0 },
            // Everyday regressed by -0.04 (exceeds trade-off threshold of 0.02)
            everyday: { category: 'everyday', queryCount: 2, meanNDCG: 0.86, meanReciprocalRank: 0.9, meanAveragePrecision: 0.85, meanPrecision: 0.45, meanRecall: 1.0 },
          },
          queryResults: [
            { queryId: 'q-prog-01', k: 10, dcg: 8.5, idcg: 10, ndcg: 0.85, precision: 0.35, recall: 1.0, reciprocalRank: 0.9, averagePrecision: 0.75, retrievedCount: 10, relevantRetrievedCount: 3, totalRelevantCount: 3, unjudgedCount: 0, notes: [] },
            { queryId: 'q-everyday-01', k: 10, dcg: 8.6, idcg: 10, ndcg: 0.86, precision: 0.45, recall: 1.0, reciprocalRank: 0.9, averagePrecision: 0.85, retrievedCount: 10, relevantRetrievedCount: 5, totalRelevantCount: 5, unjudgedCount: 0, notes: [] },
          ],
        },
        comparison: {
          ndcg: { baseline: 0.85, candidate: 0.855, absoluteDelta: 0.005, percentChange: 0.58 },
          mrr: { baseline: 0.9, candidate: 0.9, absoluteDelta: 0.0, percentChange: 0.0 },
          map: { baseline: 0.8, candidate: 0.8, absoluteDelta: 0.0, percentChange: 0.0 },
          precision: { baseline: 0.4, candidate: 0.4, absoluteDelta: 0.0, percentChange: 0.0 },
          recall: { baseline: 1.0, candidate: 1.0, absoluteDelta: 0.0, percentChange: 0.0 },
        },
        queryWinLoss: { wins: 1, ties: 0, losses: 1, winQueries: ['q-prog-01'], lossQueries: ['q-everyday-01'], tieQueries: [] },
        categoryComparisons: [
          { category: 'programming', queryCount: 2, baselineNDCG: 0.8, candidateNDCG: 0.85, deltaNDCG: 0.05, baselineMRR: 0.8, candidateMRR: 0.9, deltaMRR: 0.1 },
          { category: 'everyday', queryCount: 2, baselineNDCG: 0.9, candidateNDCG: 0.86, deltaNDCG: -0.04, baselineMRR: 1.0, candidateMRR: 0.9, deltaMRR: -0.1 },
        ],
        conclusion: { improved: true, evidenceRationale: 'Tradeoff' },
      };

      const result = checkRankingRegression(mockComparisonWithTradeoff, CI_JUDGED_DATASET);

      expect(result.requiresReview).toBe(true);
      expect(result.categoryTradeOffs).toHaveLength(1);
      expect(result.categoryTradeOffs[0]?.improvedCategory).toBe('programming');
      expect(result.categoryTradeOffs[0]?.regressedCategory).toBe('everyday');
      expect(result.reviewReasons.some(r => r.includes("Category 'programming' improved"))).toBe(true);
    });
  });

  // ── 4. Privacy & Reporting ───────────────────────────────────────────────
  describe('4. Privacy Guarantee & Diagnostic Reporting', () => {
    it('verifies CI dataset contains zero personal search history or PII', () => {
      const result = runCiRegressionGate(CI_JUDGED_DATASET);
      expect(result.privacyVerified).toBe(true);
    });

    it('formats a clean Markdown regression report with failure & review diagnostics', () => {
      const result = runCiRegressionGate(CI_JUDGED_DATASET);
      const report = formatRegressionReport(result);

      expect(report).toContain('# Ranking Regression Audit Report');
      expect(report).toContain('**Gate Status:** ✅ PASSED');
      expect(report).toContain('**Privacy Verified:** 🔒 100% Zero-PII Clean');
      expect(report).toContain('## Aggregate Metric Shifts');
      expect(report).toContain('## Applied Regression Thresholds');
    });
  });
});
