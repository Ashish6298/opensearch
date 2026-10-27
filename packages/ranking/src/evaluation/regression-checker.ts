/**
 * @opensearch/ranking — Ranking Regression Checks Engine (Phase 93)
 *
 * Implements deterministic regression gating, query-level regression analysis,
 * category trade-off detection, and privacy validation for continuous integration (CI).
 *
 * Key Invariant:
 * Regressions can NEVER be concealed behind a single aggregate score.
 */

import { CI_JUDGED_DATASET } from './datasets/ci-judged-dataset.js';
import { DEFAULT_BASELINE_CONFIG, compareExperiments } from './experiment-runner.js';
import { ExperimentComparisonResult, RankingExperimentConfig } from './experiment-types.js';
import { scanDatasetForPrivacyViolations } from './judged-dataset-loader.js';
import { JudgedDataset, JudgedQueryCategory } from './judged-dataset-types.js';
import {
  CategoryRegressionSummary,
  CategoryTradeOff,
  QueryRegressionRecord,
  RankingRegressionResult,
  RegressionSeverity,
  RegressionThresholds,
} from './regression-types.js';

export const DEFAULT_REGRESSION_THRESHOLDS: RegressionThresholds = {
  maxAggregateNdcgDrop: 0.01, // Max 1.0% drop in overall mean nDCG
  maxAggregateMrrDrop: 0.02, // Max 2.0% drop in overall MRR
  maxIndividualQueryNdcgDrop: 0.1, // Max 0.10 drop for any individual query
  maxCategoryNdcgDrop: 0.03, // Max 0.03 drop for any semantic category
  categoryTradeoffDropThreshold: 0.02, // Drop of 0.02 in one category while another improves triggers review
  maxAllowedRegressionRatio: 0.2, // At most 20% of queries may regress
};

/**
 * Checks a comparison result against formal ranking regression thresholds.
 */
export function checkRankingRegression(
  comparison: ExperimentComparisonResult,
  dataset: JudgedDataset,
  thresholdOverrides: Partial<RegressionThresholds> = {},
): RankingRegressionResult {
  const thresholds: RegressionThresholds = {
    ...DEFAULT_REGRESSION_THRESHOLDS,
    ...thresholdOverrides,
  };

  const failureReasons: string[] = [];
  const reviewReasons: string[] = [];
  const regressedQueries: QueryRegressionRecord[] = [];
  const improvedQueries: QueryRegressionRecord[] = [];

  const queryLookup = new Map(dataset.queries.map(q => [q.id, q]));
  const baselineMap = new Map(comparison.baselineMetrics.queryResults.map(r => [r.queryId, r]));

  // 1. Query-Level Regression Analysis
  for (const candRes of comparison.candidateMetrics.queryResults) {
    const baseRes = baselineMap.get(candRes.queryId);
    const queryDef = queryLookup.get(candRes.queryId);
    if (!baseRes || !queryDef) continue;

    const deltaNdcg = candRes.ndcg - baseRes.ndcg;
    const deltaMrr = candRes.reciprocalRank - baseRes.reciprocalRank;

    let severity: RegressionSeverity = 'none';

    if (deltaNdcg < -0.001) {
      const drop = Math.abs(deltaNdcg);
      if (drop > thresholds.maxIndividualQueryNdcgDrop) {
        severity = 'severe';
      } else if (drop > 0.05) {
        severity = 'moderate';
      } else {
        severity = 'minor';
      }

      regressedQueries.push({
        queryId: candRes.queryId,
        query: queryDef.query,
        category: queryDef.category,
        baselineNdcg: baseRes.ndcg,
        candidateNdcg: candRes.ndcg,
        deltaNdcg,
        baselineMrr: baseRes.reciprocalRank,
        candidateMrr: candRes.reciprocalRank,
        deltaMrr,
        severity,
        reason:
          severity === 'severe'
            ? `Severe query regression: nDCG dropped by ${drop.toFixed(4)} (exceeds threshold ${thresholds.maxIndividualQueryNdcgDrop})`
            : undefined,
      });
    } else if (deltaNdcg > 0.001) {
      improvedQueries.push({
        queryId: candRes.queryId,
        query: queryDef.query,
        category: queryDef.category,
        baselineNdcg: baseRes.ndcg,
        candidateNdcg: candRes.ndcg,
        deltaNdcg,
        baselineMrr: baseRes.reciprocalRank,
        candidateMrr: candRes.reciprocalRank,
        deltaMrr,
        severity: 'none',
      });
    }
  }

  // Sort regressed queries: most severe drop first
  regressedQueries.sort((a, b) => a.deltaNdcg - b.deltaNdcg);
  // Sort improved queries: highest gain first
  improvedQueries.sort((a, b) => b.deltaNdcg - a.deltaNdcg);

  // 2. Check Aggregate Metric Thresholds
  const aggDeltas = {
    ndcg: comparison.comparison.ndcg.absoluteDelta,
    mrr: comparison.comparison.mrr.absoluteDelta,
    map: comparison.comparison.map.absoluteDelta,
    precision: comparison.comparison.precision.absoluteDelta,
    recall: comparison.comparison.recall.absoluteDelta,
  };

  if (aggDeltas.ndcg < -thresholds.maxAggregateNdcgDrop) {
    failureReasons.push(
      `Aggregate nDCG dropped by ${Math.abs(aggDeltas.ndcg).toFixed(4)} (max allowed drop: ${thresholds.maxAggregateNdcgDrop})`,
    );
  }

  if (aggDeltas.mrr < -thresholds.maxAggregateMrrDrop) {
    failureReasons.push(
      `Aggregate MRR dropped by ${Math.abs(aggDeltas.mrr).toFixed(4)} (max allowed drop: ${thresholds.maxAggregateMrrDrop})`,
    );
  }

  // 3. Check Individual Query Severity Threshold
  const severeQueries = regressedQueries.filter(q => q.severity === 'severe');
  if (severeQueries.length > 0) {
    failureReasons.push(
      `${severeQueries.length} query/queries suffered severe individual regression exceeding threshold of ${thresholds.maxIndividualQueryNdcgDrop}: ${severeQueries.map(q => `${q.queryId} (${q.deltaNdcg.toFixed(4)})`).join(', ')}`,
    );
  }

  // 4. Check Fraction of Regressed Queries
  const regressionRatio =
    comparison.metadata.queryCount > 0 ? regressedQueries.length / comparison.metadata.queryCount : 0;

  if (regressionRatio > thresholds.maxAllowedRegressionRatio) {
    failureReasons.push(
      `Regression ratio ${(regressionRatio * 100).toFixed(1)}% exceeds threshold ${(thresholds.maxAllowedRegressionRatio * 100).toFixed(1)}% (${regressedQueries.length} of ${comparison.metadata.queryCount} queries regressed)`,
    );
  }

  // 5. Category-Level Shift & Trade-Off Analysis
  const categoryBreakdown: Partial<Record<JudgedQueryCategory, CategoryRegressionSummary>> = {};
  const categoryTradeOffs: CategoryTradeOff[] = [];

  for (const catComp of comparison.categoryComparisons) {
    const regInCat = regressedQueries.filter(q => q.category === catComp.category).length;
    const impInCat = improvedQueries.filter(q => q.category === catComp.category).length;

    let status: 'improved' | 'neutral' | 'regressed' = 'neutral';
    if (catComp.deltaNDCG > 0.005) status = 'improved';
    else if (catComp.deltaNDCG < -0.005) status = 'regressed';

    categoryBreakdown[catComp.category] = {
      category: catComp.category,
      queryCount: catComp.queryCount,
      deltaNdcg: catComp.deltaNDCG,
      deltaMrr: catComp.deltaMRR,
      regressedQueriesCount: regInCat,
      improvedQueriesCount: impInCat,
      status,
    };

    if (catComp.deltaNDCG < -thresholds.maxCategoryNdcgDrop) {
      failureReasons.push(
        `Category '${catComp.category}' regressed by ${Math.abs(catComp.deltaNDCG).toFixed(4)} nDCG (max allowed category drop: ${thresholds.maxCategoryNdcgDrop})`,
      );
    }
  }

  // Check if one category improved at another's expense
  const improvedCats = Object.values(categoryBreakdown).filter(
    (c): c is CategoryRegressionSummary => c !== undefined && c.deltaNdcg > 0.01,
  );
  const regressedCats = Object.values(categoryBreakdown).filter(
    (c): c is CategoryRegressionSummary =>
      c !== undefined && c.deltaNdcg < -thresholds.categoryTradeoffDropThreshold,
  );

  for (const imp of improvedCats) {
    for (const reg of regressedCats) {
      const tradeOff: CategoryTradeOff = {
        improvedCategory: imp.category,
        regressedCategory: reg.category,
        improvedDeltaNdcg: imp.deltaNdcg,
        regressedDeltaNdcg: reg.deltaNdcg,
        requiresReview: true,
        notes: `Category '${imp.category}' improved (+${imp.deltaNdcg.toFixed(4)} nDCG) while category '${reg.category}' regressed (${reg.deltaNdcg.toFixed(4)} nDCG).`,
      };
      categoryTradeOffs.push(tradeOff);
      reviewReasons.push(tradeOff.notes);
    }
  }

  // 6. Privacy Validation Assertion
  const piiScan = scanDatasetForPrivacyViolations(dataset);
  const privacyVerified = piiScan.clean;
  if (!privacyVerified) {
    failureReasons.push(
      `Privacy violation detected in evaluation dataset: ${piiScan.findings.length} personal identifiers identified.`,
    );
  }

  const passed = failureReasons.length === 0;
  const requiresReview = reviewReasons.length > 0 || categoryTradeOffs.length > 0;

  return {
    passed,
    requiresReview,
    failureReasons,
    reviewReasons,
    thresholds,
    aggregateDeltas: aggDeltas,
    regressedQueries,
    improvedQueries,
    categoryTradeOffs,
    categoryBreakdown,
    privacyVerified,
    evaluationTimestamp: new Date().toISOString(),
  };
}

/**
 * Runs a deterministic lightweight ranking regression gate in CI.
 * Default execution uses the lightweight CI_JUDGED_DATASET (< 25ms runtime).
 */
export function runCiRegressionGate(
  dataset: JudgedDataset = CI_JUDGED_DATASET,
  candidateConfig: RankingExperimentConfig = DEFAULT_BASELINE_CONFIG,
  thresholdOverrides: Partial<RegressionThresholds> = {},
): RankingRegressionResult {
  const comparison = compareExperiments(dataset, DEFAULT_BASELINE_CONFIG, candidateConfig, {
    split: 'tuning',
    metricOptions: { k: 10 },
  });

  return checkRankingRegression(comparison, dataset, thresholdOverrides);
}

/**
 * Formats a ranking regression result into a diagnostic Markdown report.
 */
export function formatRegressionReport(result: RankingRegressionResult): string {
  const lines: string[] = [
    `# Ranking Regression Audit Report`,
    ``,
    `**Evaluation Timestamp:** ${result.evaluationTimestamp}  `,
    `**Gate Status:** ${result.passed ? '✅ PASSED' : '❌ FAILED'}  `,
    `**Human Review Required:** ${result.requiresReview ? '⚠️ REVIEW REQUIRED' : '✔️ APPROVED (NO TRADEOFFS)'}  `,
    `**Privacy Verified:** ${result.privacyVerified ? '🔒 100% Zero-PII Clean' : '⚠️ PRIVACY LEAK DETECTED'}  `,
    ``,
  ];

  if (result.failureReasons.length > 0) {
    lines.push(`## ❌ Gate Failure Violations`);
    for (const reason of result.failureReasons) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
  }

  if (result.reviewReasons.length > 0) {
    lines.push(`## ⚠️ Items Requiring Engineering Review`);
    for (const reason of result.reviewReasons) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
  }

  lines.push(`## Aggregate Metric Shifts`);
  lines.push(`| Metric | Delta | Status |`);
  lines.push(`| :--- | :--- | :--- |`);
  lines.push(
    `| **nDCG@10** | ${result.aggregateDeltas.ndcg >= 0 ? '+' : ''}${result.aggregateDeltas.ndcg.toFixed(4)} | ${result.aggregateDeltas.ndcg >= 0 ? '✔️ Positive' : '⚠️ Negative'} |`,
  );
  lines.push(
    `| **MRR** | ${result.aggregateDeltas.mrr >= 0 ? '+' : ''}${result.aggregateDeltas.mrr.toFixed(4)} | ${result.aggregateDeltas.mrr >= 0 ? '✔️ Positive' : '⚠️ Negative'} |`,
  );
  lines.push(
    `| **MAP** | ${result.aggregateDeltas.map >= 0 ? '+' : ''}${result.aggregateDeltas.map.toFixed(4)} | ${result.aggregateDeltas.map >= 0 ? '✔️ Positive' : '⚠️ Negative'} |`,
  );
  lines.push(
    `| **Precision@10** | ${result.aggregateDeltas.precision >= 0 ? '+' : ''}${result.aggregateDeltas.precision.toFixed(4)} | ${result.aggregateDeltas.precision >= 0 ? '✔️ Positive' : '⚠️ Negative'} |`,
  );
  lines.push(
    `| **Recall@10** | ${result.aggregateDeltas.recall >= 0 ? '+' : ''}${result.aggregateDeltas.recall.toFixed(4)} | ${result.aggregateDeltas.recall >= 0 ? '✔️ Positive' : '⚠️ Negative'} |`,
  );
  lines.push('');

  lines.push(`## Query-Level Shift Breakdown`);
  lines.push(`- **Regressed Queries:** ${result.regressedQueries.length}`);
  lines.push(`- **Improved Queries:** ${result.improvedQueries.length}`);
  lines.push('');

  if (result.regressedQueries.length > 0) {
    lines.push(`### Regressed Queries Detail`);
    lines.push(`| Query ID | Query Text | Category | Baseline nDCG | Candidate nDCG | Δ nDCG | Severity |`);
    lines.push(`| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`);
    for (const q of result.regressedQueries) {
      lines.push(
        `| \`${q.queryId}\` | "${q.query}" | \`${q.category}\` | ${q.baselineNdcg.toFixed(4)} | ${q.candidateNdcg.toFixed(4)} | ${q.deltaNdcg.toFixed(4)} | **${q.severity.toUpperCase()}** |`,
      );
    }
    lines.push('');
  }

  if (result.categoryTradeOffs.length > 0) {
    lines.push(`### Category Trade-Offs Detected`);
    lines.push(`| Improved Category | Regressed Category | Δ Improved | Δ Regressed | Action |`);
    lines.push(`| :--- | :--- | :--- | :--- | :--- |`);
    for (const to of result.categoryTradeOffs) {
      lines.push(
        `| \`${to.improvedCategory}\` | \`${to.regressedCategory}\` | +${to.improvedDeltaNdcg.toFixed(4)} | ${to.regressedDeltaNdcg.toFixed(4)} | **Engineering Review Required** |`,
      );
    }
    lines.push('');
  }

  lines.push(`## Applied Regression Thresholds`);
  lines.push('```json');
  lines.push(JSON.stringify(result.thresholds, null, 2));
  lines.push('```');

  return lines.join('\n');
}
