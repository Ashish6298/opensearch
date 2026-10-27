import { describe, expect, it } from 'vitest';
import { CI_JUDGED_DATASET } from '../src/evaluation/datasets/ci-judged-dataset.js';
import { FULL_JUDGED_DATASET } from '../src/evaluation/datasets/full-judged-dataset.js';
import {
  DEFAULT_BASELINE_CONFIG,
  PRODUCTION_SAFEGUARD_NOTICE,
  compareExperiments,
  defaultDeterministicScorer,
  exportExperimentJson,
  exportExperimentMarkdown,
  runParameterSweep,
  runSingleEvaluation,
} from '../src/evaluation/experiment-runner.js';
import { RankingExperimentConfig } from '../src/evaluation/experiment-types.js';

describe('Phase 92 — Experiment Runner Suite', () => {
  // ── 1. Single Configuration Evaluation ───────────────────────────────────
  describe('1. Single Configuration Evaluation', () => {
    it('evaluates baseline ranking configuration against CI dataset tuning split', () => {
      const metrics = runSingleEvaluation(
        CI_JUDGED_DATASET,
        DEFAULT_BASELINE_CONFIG,
        'tuning',
        { k: 10 },
      );

      expect(metrics.queryCount).toBe(10);
      expect(metrics.evaluatedQueryCount).toBe(10);
      expect(metrics.meanNDCG).toBeGreaterThan(0.7);
      expect(metrics.meanReciprocalRank).toBeGreaterThan(0.7);
      expect(metrics.categoryBreakdown.programming).toBeDefined();
    });

    it('evaluates baseline ranking configuration against Full dataset held-out split', () => {
      const metrics = runSingleEvaluation(
        FULL_JUDGED_DATASET,
        DEFAULT_BASELINE_CONFIG,
        'held_out',
        { k: 10 },
      );

      expect(metrics.queryCount).toBe(20);
      expect(metrics.evaluatedQueryCount).toBe(20);
      expect(metrics.meanNDCG).toBeGreaterThan(0.6);
      expect(metrics.meanReciprocalRank).toBeGreaterThan(0.6);
    });
  });

  // ── 2. Baseline vs Candidate Comparison ──────────────────────────────────
  describe('2. Baseline vs. Candidate Comparison & Evidence Verification', () => {
    it('compares baseline and candidate configurations with metric deltas', () => {
      const candidateConfig: RankingExperimentConfig = {
        ...DEFAULT_BASELINE_CONFIG,
        name: 'candidate-higher-title-boost',
        bm25: {
          ...DEFAULT_BASELINE_CONFIG.bm25,
          titleBoost: 5.0,
        },
      };

      const comparison = compareExperiments(CI_JUDGED_DATASET, DEFAULT_BASELINE_CONFIG, candidateConfig, {
        split: 'tuning',
        metricOptions: { k: 10 },
      });

      expect(comparison.metadata.datasetName).toBe(CI_JUDGED_DATASET.name);
      expect(comparison.metadata.datasetSplit).toBe('tuning');
      expect(comparison.metadata.productionSafeguard).toBe(PRODUCTION_SAFEGUARD_NOTICE);

      // Verify metric deltas structure
      expect(comparison.comparison.ndcg).toHaveProperty('baseline');
      expect(comparison.comparison.ndcg).toHaveProperty('candidate');
      expect(comparison.comparison.ndcg).toHaveProperty('absoluteDelta');
      expect(comparison.comparison.ndcg).toHaveProperty('percentChange');

      // Verify query win/loss tracking
      expect(comparison.queryWinLoss).toHaveProperty('wins');
      expect(comparison.queryWinLoss).toHaveProperty('ties');
      expect(comparison.queryWinLoss).toHaveProperty('losses');
      expect(
        comparison.queryWinLoss.wins + comparison.queryWinLoss.ties + comparison.queryWinLoss.losses,
      ).toBe(comparison.metadata.queryCount);

      // Verify category comparisons
      expect(comparison.categoryComparisons.length).toBeGreaterThan(0);
      for (const catComp of comparison.categoryComparisons) {
        expect(catComp).toHaveProperty('category');
        expect(catComp).toHaveProperty('deltaNDCG');
        expect(catComp).toHaveProperty('deltaMRR');
      }

      // Verify conclusion evidence
      expect(comparison.conclusion).toHaveProperty('improved');
      expect(comparison.conclusion).toHaveProperty('evidenceRationale');
      expect(comparison.conclusion.evidenceRationale.length).toBeGreaterThan(10);
    });

    it('claims improvement ONLY when supported by statistical evidence', () => {
      // Degraded candidate (PageRank disabled, BM25 titleBoost 0)
      const degradedConfig: RankingExperimentConfig = {
        ...DEFAULT_BASELINE_CONFIG,
        name: 'degraded-no-title-boost',
        bm25: {
          ...DEFAULT_BASELINE_CONFIG.bm25,
          titleBoost: 0.1,
          k1: 0.1,
        },
        pageRank: {
          ...DEFAULT_BASELINE_CONFIG.pageRank,
          enabled: false,
          weight: 0,
        },
      };

      const comparison = compareExperiments(CI_JUDGED_DATASET, DEFAULT_BASELINE_CONFIG, degradedConfig, {
        split: 'tuning',
      });

      // No improvement claimed
      expect(comparison.conclusion.improved).toBe(false);
      expect(comparison.conclusion.evidenceRationale).toContain('does not demonstrate sufficient evidence');
    });
  });

  // ── 3. Parameter Grid Sweeps ─────────────────────────────────────────────
  describe('3. Controlled Parameter Sweeps', () => {
    it('executes parameter sweep across BM25 and PageRank grid deterministically', () => {
      const sweep = runParameterSweep(
        CI_JUDGED_DATASET,
        DEFAULT_BASELINE_CONFIG,
        {
          k1: [0.8, 1.2],
          b: [0.5, 0.75],
          pageRankWeight: [0.0, 0.2],
        },
        { split: 'tuning', metricOptions: { k: 10 } },
      );

      // 2 * 2 * 2 = 8 candidates evaluated
      expect(sweep.candidatesEvaluated).toBe(8);
      expect(sweep.rankedConfigurations.length).toBe(8);

      // Ranks should be 1..8 in descending order of meanNDCG
      for (let i = 0; i < sweep.rankedConfigurations.length - 1; i++) {
        const curr = sweep.rankedConfigurations[i]!;
        const next = sweep.rankedConfigurations[i + 1]!;
        expect(curr.rank).toBe(i + 1);
        expect(curr.metrics.meanNDCG).toBeGreaterThanOrEqual(next.metrics.meanNDCG);
      }

      expect(sweep.bestConfiguration.rank).toBe(1);
    });

    it('ensures experiments are 100% reproducible from recorded settings', () => {
      const grid = {
        k1: [1.0, 1.5],
        pageRankWeight: [0.1, 0.2],
      };

      const sweep1 = runParameterSweep(CI_JUDGED_DATASET, DEFAULT_BASELINE_CONFIG, grid, {
        split: 'tuning',
      });
      const sweep2 = runParameterSweep(CI_JUDGED_DATASET, DEFAULT_BASELINE_CONFIG, grid, {
        split: 'tuning',
      });

      expect(sweep1.bestConfiguration.config).toEqual(sweep2.bestConfiguration.config);
      expect(sweep1.bestConfiguration.metrics.meanNDCG).toBe(sweep2.bestConfiguration.metrics.meanNDCG);
      expect(sweep1.bestConfiguration.metrics.meanReciprocalRank).toBe(
        sweep2.bestConfiguration.metrics.meanReciprocalRank,
      );
    });
  });

  // ── 4. Serialization & Exporters ──────────────────────────────────────────
  describe('4. JSON & Markdown Export Formats', () => {
    it('exports valid, parseable JSON with all required audit fields', () => {
      const comparison = compareExperiments(CI_JUDGED_DATASET, DEFAULT_BASELINE_CONFIG, {
        ...DEFAULT_BASELINE_CONFIG,
        name: 'test-cand',
      });

      const json = exportExperimentJson(comparison);
      const parsed = JSON.parse(json);

      expect(parsed.metadata.experimentId).toBeDefined();
      expect(parsed.metadata.productionSafeguard).toBe(PRODUCTION_SAFEGUARD_NOTICE);
      expect(parsed.comparison.ndcg).toBeDefined();
      expect(parsed.queryWinLoss).toBeDefined();
    });

    it('exports clean Markdown summary with tables and production safeguard', () => {
      const comparison = compareExperiments(CI_JUDGED_DATASET, DEFAULT_BASELINE_CONFIG, {
        ...DEFAULT_BASELINE_CONFIG,
        name: 'test-cand',
      });

      const md = exportExperimentMarkdown(comparison);

      expect(md).toContain('# Search Quality Experiment Comparison Report');
      expect(md).toContain(PRODUCTION_SAFEGUARD_NOTICE);
      expect(md).toContain('| Metric | Baseline');
      expect(md).toContain('| Category | Queries |');
      expect(md).toContain('## Query Win / Loss Distribution');
    });
  });
});
