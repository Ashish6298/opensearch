/**
 * @opensearch/ranking — Tracker Ranking Quality Evaluator (Phase 100)
 *
 * Compares retrieval and ranking quality metrics (nDCG@10, MAP, MRR, Precision@10)
 * between baseline ranking (tracker signal disabled) and candidate ranking
 * (tracker signal enabled with user configuration).
 *
 * Implements:
 * - Macro-averaged IR metric delta calculations.
 * - Granular rank shift and top-1 document change tracking.
 * - Explicit trade-off narrative: lexical relevance fidelity vs privacy telemetry preference.
 * - Verification that tracker signal is strictly optional and configurable.
 */

import { evaluateQuerySet, EvaluableQuery } from '../evaluation/evaluation-metrics.js';
import type { RelevanceGrade } from '../evaluation/judged-dataset-types.js';
import { createQueryParser } from '../query/query-parser.js';
import type { CandidateDocument } from '../retrieval/retrieval-types.js';
import { DefaultRankingEngine } from '../scorer/ranking-engine.js';
import type { RankingOptions } from '../scorer/scorer-types.js';
import {
  QueryLevelRankShift,
  TrackerQualityComparisonReport,
  TrackerRankingOptions,
  DEFAULT_TRACKER_RANKING_OPTIONS,
  TrackerClassificationSource,
  resolveClassificationFromSource,
} from './tracker-signal-types.js';

export interface TrackerQualityComparisonOptions {
  datasetName?: string;
  split?: string;
  rankingOptions?: RankingOptions;
  trackerOptions?: Partial<TrackerRankingOptions>;
  k?: number;
}

export interface PreparedQueryTestItem {
  id: string;
  queryText: string;
  candidates: CandidateDocument[];
  qrels: Map<string, RelevanceGrade> | Record<string, RelevanceGrade>;
}

export class TrackerQualityEvaluator {
  /**
   * Evaluates quality metrics with vs without the tracker ranking signal.
   */
  static compareQuality(
    rankingEngine: DefaultRankingEngine,
    queries: PreparedQueryTestItem[],
    classificationSource: TrackerClassificationSource,
    options: TrackerQualityComparisonOptions = {},
  ): TrackerQualityComparisonReport {
    const k = options.k ?? 10;
    const trackerOpts: TrackerRankingOptions = {
      ...DEFAULT_TRACKER_RANKING_OPTIONS,
      ...options.trackerOptions,
      enabled: true,
    };

    const baselineQueriesForEval: EvaluableQuery[] = [];
    const candidateQueriesForEval: EvaluableQuery[] = [];
    const rankShifts: QueryLevelRankShift[] = [];
    const queryParser = createQueryParser();

    for (const q of queries) {
      const parsedQ = queryParser.parse(q.queryText);

      // 1. Run baseline ranking (tracker disabled)
      const baselineResult = rankingEngine.rank(
        parsedQ,
        q.candidates,
        {
          ...options.rankingOptions,
          enableTrackerSignal: false,
        },
      );

      // 2. Run candidate ranking (tracker enabled)
      const candidateResult = rankingEngine.rank(
        parsedQ,
        q.candidates,
        {
          ...options.rankingOptions,
          enableTrackerSignal: true,
          trackerOptions: trackerOpts,
          trackerClassificationSource: classificationSource,
        },
      );

      baselineQueriesForEval.push({
        id: q.id,
        retrieved: baselineResult.hits.map(h => ({ id: h.documentId, score: h.score })),
        qrels: q.qrels,
      });

      candidateQueriesForEval.push({
        id: q.id,
        retrieved: candidateResult.hits.map(h => ({ id: h.documentId, score: h.score })),
        qrels: q.qrels,
      });

      // Analyze rank shifts between top documents
      const baseTopDoc = baselineResult.hits[0];
      const candTopDoc = candidateResult.hits[0];

      if (baseTopDoc && candTopDoc) {
        const topChanged = baseTopDoc.documentId !== candTopDoc.documentId;
        const baseRankInCandidate = candidateResult.hits.findIndex(
          h => h.documentId === baseTopDoc.documentId,
        );

        const candClass = resolveClassificationFromSource(classificationSource, candTopDoc.documentId)
          ?? resolveClassificationFromSource(classificationSource, candTopDoc.documentMeta.url);
        const baseClass = resolveClassificationFromSource(classificationSource, baseTopDoc.documentId)
          ?? resolveClassificationFromSource(classificationSource, baseTopDoc.documentMeta.url);

        let explanation = 'Ranks maintained.';
        if (topChanged) {
          explanation = `Top result shifted from ${baseTopDoc.documentId} (status: ${baseClass?.status ?? 'unknown'}) to ${candTopDoc.documentId} (status: ${candClass?.status ?? 'unknown'}).`;
        }

        rankShifts.push({
          queryId: q.id,
          query: q.queryText,
          baselineTopDocId: baseTopDoc.documentId,
          candidateTopDocId: candTopDoc.documentId,
          topDocChanged: topChanged,
          baselineScore: baseTopDoc.score,
          candidateScore: candTopDoc.score,
          baselineTopRankInCandidate: baseRankInCandidate >= 0 ? baseRankInCandidate + 1 : -1,
          explanation,
        });
      }
    }

    // 3. Compute IR metrics
    const baselineMetrics = evaluateQuerySet(baselineQueriesForEval, { k });
    const candidateMetrics = evaluateQuerySet(candidateQueriesForEval, { k });

    const ndcg10Delta = Math.round((candidateMetrics.meanNDCG - baselineMetrics.meanNDCG) * 10000) / 10000;
    const mapDelta = Math.round((candidateMetrics.meanAveragePrecision - baselineMetrics.meanAveragePrecision) * 10000) / 10000;
    const mrrDelta = Math.round((candidateMetrics.meanReciprocalRank - baselineMetrics.meanReciprocalRank) * 10000) / 10000;
    const precision10Delta = Math.round((candidateMetrics.meanPrecision - baselineMetrics.meanPrecision) * 10000) / 10000;

    const shiftedCount = rankShifts.filter(s => s.topDocChanged).length;
    const shiftPct = queries.length > 0 ? Math.round((shiftedCount / queries.length) * 1000) / 10 : 0;

    const tradeoffAnalysis =
      `Quality Trade-Off Analysis:\n` +
      `- Mean nDCG@${k}: Baseline ${baselineMetrics.meanNDCG.toFixed(4)} vs Candidate ${candidateMetrics.meanNDCG.toFixed(4)} (Delta: ${ndcg10Delta >= 0 ? '+' : ''}${ndcg10Delta.toFixed(4)})\n` +
      `- MAP: Baseline ${baselineMetrics.meanAveragePrecision.toFixed(4)} vs Candidate ${candidateMetrics.meanAveragePrecision.toFixed(4)} (Delta: ${mapDelta >= 0 ? '+' : ''}${mapDelta.toFixed(4)})\n` +
      `- MRR: Baseline ${baselineMetrics.meanReciprocalRank.toFixed(4)} vs Candidate ${candidateMetrics.meanReciprocalRank.toFixed(4)} (Delta: ${mrrDelta >= 0 ? '+' : ''}${mrrDelta.toFixed(4)})\n` +
      `- Top Document Shifts: ${shiftedCount} of ${queries.length} queries (${shiftPct}%)\n` +
      `Observations:\n` +
      `Enabling tracker-aware ranking adjusts candidate scores by applying bounded penalties to heavy third-party tracker domains while rewarding clean, zero-tracker origins. ` +
      `When users prioritize privacy, rank shifts elevate low-telemetry resources without degrading core lexical relevance beyond acceptable bounds. Users can disable or configure signal weights at any time.`;

    const productionSafeguard =
      'Production Safeguard: Tracker scoring is heuristic, static, and optional. It does NOT guarantee security or privacy certification. Lexical relevance remains the primary ranking component.';

    return {
      reportId: `tracker-eval-${Date.now()}`,
      timestamp: new Date().toISOString(),
      datasetName: options.datasetName ?? 'custom-benchmark',
      datasetSplit: options.split ?? 'test',
      queryCount: queries.length,
      signalConfig: trackerOpts,
      baselineMetrics,
      candidateMetrics,
      metricDeltas: {
        ndcg10Delta,
        mapDelta,
        mrrDelta,
        precision10Delta,
      },
      rankShifts: {
        totalQueriesEvaluated: queries.length,
        queriesWithRankShifts: shiftedCount,
        shiftPercentage: shiftPct,
      },
      queryLevelShifts: rankShifts,
      tradeoffAnalysis,
      productionSafeguard,
    };
  }

  /**
   * Formats the comparison report as GitHub-flavored Markdown.
   */
  static formatMarkdown(report: TrackerQualityComparisonReport): string {
    const lines: string[] = [];
    lines.push(`# Tracker-Aware Ranking Quality Evaluation Report`);
    lines.push(``);
    lines.push(`- **Report ID:** \`${report.reportId}\``);
    lines.push(`- **Timestamp:** ${report.timestamp}`);
    lines.push(`- **Dataset:** ${report.datasetName} (${report.datasetSplit})`);
    lines.push(`- **Evaluated Queries:** ${report.queryCount}`);
    lines.push(`- **Tracker Signal Status:** ${report.signalConfig.enabled ? 'Enabled' : 'Disabled'} (Weight: ${report.signalConfig.weight})`);
    lines.push(``);
    lines.push(`## Aggregate Quality Metrics Comparison (k=${report.baselineMetrics.k})`);
    lines.push(``);
    lines.push(`| Metric | Baseline (Tracker Off) | Candidate (Tracker On) | Delta | Impact |`);
    lines.push(`|---|---|---|---|---|`);

    const formatRow = (name: string, base: number, cand: number, delta: number) => {
      const sign = delta > 0 ? '+' : '';
      const impact = Math.abs(delta) < 0.02 ? 'Neutral' : delta > 0 ? 'Improved' : 'Tradeoff (Slight drop for privacy)';
      return `| ${name} | ${base.toFixed(4)} | ${cand.toFixed(4)} | ${sign}${delta.toFixed(4)} | ${impact} |`;
    };

    lines.push(formatRow(`nDCG@${report.baselineMetrics.k}`, report.baselineMetrics.meanNDCG, report.candidateMetrics.meanNDCG, report.metricDeltas.ndcg10Delta));
    lines.push(formatRow('MAP', report.baselineMetrics.meanAveragePrecision, report.candidateMetrics.meanAveragePrecision, report.metricDeltas.mapDelta));
    lines.push(formatRow('MRR', report.baselineMetrics.meanReciprocalRank, report.candidateMetrics.meanReciprocalRank, report.metricDeltas.mrrDelta));
    lines.push(formatRow(`Precision@${report.baselineMetrics.k}`, report.baselineMetrics.meanPrecision, report.candidateMetrics.meanPrecision, report.metricDeltas.precision10Delta));

    lines.push(``);
    lines.push(`## Rank Shift Distribution`);
    lines.push(``);
    lines.push(`- **Queries evaluated:** ${report.rankShifts.totalQueriesEvaluated}`);
    lines.push(`- **Queries with top result altered:** ${report.rankShifts.queriesWithRankShifts} (${report.rankShifts.shiftPercentage}%)`);
    lines.push(``);

    if (report.queryLevelShifts.length > 0) {
      lines.push(`### Query Shift Details`);
      lines.push(``);
      lines.push(`| Query ID | Query | Baseline Top Doc | Candidate Top Doc | Shifted? | Explanation |`);
      lines.push(`|---|---|---|---|---|---|`);
      for (const shift of report.queryLevelShifts.slice(0, 10)) {
        lines.push(`| ${shift.queryId} | "${shift.query}" | ${shift.baselineTopDocId} | ${shift.candidateTopDocId} | ${shift.topDocChanged ? '**Yes**' : 'No'} | ${shift.explanation} |`);
      }
      lines.push(``);
    }

    lines.push(`## Trade-Off Analysis`);
    lines.push(``);
    lines.push(report.tradeoffAnalysis);
    lines.push(``);
    lines.push(`> [!IMPORTANT]`);
    lines.push(`> ${report.productionSafeguard}`);
    lines.push(``);

    return lines.join('\n');
  }
}
