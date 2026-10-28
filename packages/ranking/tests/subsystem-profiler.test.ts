import { describe, expect, it } from 'vitest';
import {
  compareOptimizedCorrectness,
  exportProfilerJson,
  exportProfilerMarkdown,
  runSubsystemProfiling,
  ScoredDocument,
} from '../src/index.js';

describe('Phase 95 — Profile Before Optimizing', () => {
  describe('Subsystem Profiler Execution', () => {
    it('profiles query, indexing, and storage pipelines with fine-grained stage breakdown', async () => {
      const report = await runSubsystemProfiling({
        documentCount: 5,
        customQueries: ['typescript async', 'bm25 ranking', 'algorithm'],
        iterations: 2,
      });

      expect(report.profileId).toMatch(/^prof-\d+-[a-z0-9]+$/);
      expect(report.documentCount).toBe(5);
      expect(report.queryCount).toBe(3);
      expect(report.measuredIterations).toBe(2);

      // Verify Query Pipeline Stages
      expect(report.queryPipelineStages.length).toBeGreaterThanOrEqual(5);
      const queryParsing = report.queryPipelineStages.find(s => s.stage === 'query_parsing');
      const postingTraversal = report.queryPipelineStages.find(s => s.stage === 'posting_traversal');
      const bm25Scoring = report.queryPipelineStages.find(s => s.stage === 'bm25_relevance_scoring');
      const sorting = report.queryPipelineStages.find(s => s.stage === 'score_sorting_and_tie_breaking');
      const snippets = report.queryPipelineStages.find(s => s.stage === 'snippet_and_result_generation');

      expect(queryParsing).toBeDefined();
      expect(postingTraversal).toBeDefined();
      expect(bm25Scoring).toBeDefined();
      expect(sorting).toBeDefined();
      expect(snippets).toBeDefined();

      for (const stage of report.queryPipelineStages) {
        expect(stage.callCount).toBe(6); // 3 queries * 2 iterations
        expect(stage.totalDurationMs).toBeGreaterThanOrEqual(0);
        expect(stage.meanDurationMs).toBeGreaterThanOrEqual(0);
        expect(stage.p50DurationMs).toBeGreaterThanOrEqual(0);
        expect(stage.p95DurationMs).toBeGreaterThanOrEqual(0);
      }

      // Verify Indexing Pipeline Stages
      expect(report.indexingPipelineStages.length).toBe(2);
      for (const stage of report.indexingPipelineStages) {
        expect(stage.callCount).toBe(5);
        expect(stage.totalDurationMs).toBeGreaterThanOrEqual(0);
      }

      // Verify Storage Pipeline Stages
      expect(report.storagePipelineStages.length).toBe(3);
      const ser = report.storagePipelineStages.find(s => s.stage === 'index_serialization');
      const save = report.storagePipelineStages.find(s => s.stage === 'disk_persistence_write');
      const load = report.storagePipelineStages.find(s => s.stage === 'disk_deserialization_load');

      expect(ser).toBeDefined();
      expect(save).toBeDefined();
      expect(load).toBeDefined();
    });

    it('identifies dominant bottlenecks with empirical evidence', async () => {
      const report = await runSubsystemProfiling({
        documentCount: 4,
        customQueries: ['search', 'database'],
        iterations: 2,
      });

      expect(report.dominantCosts.length).toBeGreaterThanOrEqual(2);

      const queryDominant = report.dominantCosts.find(d => d.category === 'query_pipeline');
      expect(queryDominant).toBeDefined();
      expect(queryDominant!.percentContribution).toBeGreaterThan(0);
      expect(queryDominant!.empiricalEvidence).toContain('mean=');
      expect(queryDominant!.explanation).toBeDefined();

      // Ensure query parsing is confirmed as minor overhead
      const queryParsing = report.queryPipelineStages.find(s => s.stage === 'query_parsing');
      expect(queryParsing?.percentOfCategory).toBeLessThan(35);
    });

    it('provides justified optimization recommendations and guards against premature rewrites', async () => {
      const report = await runSubsystemProfiling({
        documentCount: 3,
        customQueries: ['ranking'],
        iterations: 1,
      });

      expect(report.optimizationRecommendations.length).toBe(3);

      const topK = report.optimizationRecommendations.find(r => r.recommendationId === 'REC-01-TOPK-PRUNING');
      expect(topK).toBeDefined();
      expect(topK!.priority).toBe('HIGH');
      expect(topK!.decision).toBe('JUSTIFIED_FOR_PHASE_96');
      expect(topK!.correctnessVerificationPlan).toContain('exhaustive scoring oracle');

      const segments = report.optimizationRecommendations.find(
        r => r.recommendationId === 'REC-02-IMMUTABLE-SEGMENTS',
      );
      expect(segments).toBeDefined();
      expect(segments!.decision).toBe('JUSTIFIED_FOR_PHASE_97');

      const parserRewrite = report.optimizationRecommendations.find(
        r => r.recommendationId === 'REC-03-QUERY-PARSER-REWRITE',
      );
      expect(parserRewrite).toBeDefined();
      expect(parserRewrite!.priority).toBe('AVOID_PREMATURE');
      expect(parserRewrite!.decision).toBe('DEFERRED_PREMATURE_REWRITE');
      expect(parserRewrite!.rationale).toContain('less than 5%');
    });
  });

  describe('Correctness Comparison Oracle', () => {
    const mockBaseline: ScoredDocument[] = [
      {
        documentId: 'doc-1',
        score: 12.456,
        rank: 1,
        bm25Score: 10.0,
        explanation: {
          documentId: 'doc-1',
          finalScore: 12.456,
          bm25Score: 10.0,
          fieldScores: { title: 5.0, body: 5.0, description: 0, headings: 0 },
          termScores: { search: 10.0 },
          matchedTerms: ['search'],
          bonuses: [],
          penalties: [],
          breakdown: 'bm25=10.0',
        },
      },
      {
        documentId: 'doc-2',
        score: 8.123,
        rank: 2,
        bm25Score: 7.5,
        explanation: {
          documentId: 'doc-2',
          finalScore: 8.123,
          bm25Score: 7.5,
          fieldScores: { title: 4.0, body: 3.5, description: 0, headings: 0 },
          termScores: { search: 7.5 },
          matchedTerms: ['search'],
          bonuses: [],
          penalties: [],
          breakdown: 'bm25=7.5',
        },
      },
    ];

    it('confirms identical results when candidate matches baseline exactly', () => {
      const candidate = [...mockBaseline.map(doc => ({ ...doc }))];
      const result = compareOptimizedCorrectness(mockBaseline, candidate);

      expect(result.isIdentical).toBe(true);
      expect(result.differences).toBeUndefined();
      expect(result.divergenceIndex).toBeUndefined();
    });

    it('detects score mismatch beyond epsilon threshold', () => {
      const candidate = [
        { ...mockBaseline[0]!, score: 12.456 },
        { ...mockBaseline[1]!, score: 7.95 }, // diverged score
      ];

      const result = compareOptimizedCorrectness(mockBaseline, candidate, { scoreEpsilon: 0.01 });

      expect(result.isIdentical).toBe(false);
      expect(result.divergenceIndex).toBe(1);
      expect(result.differences?.[0]).toContain('Score mismatch');
    });

    it('detects document ID rank order mismatch', () => {
      const candidate = [
        { ...mockBaseline[1]!, rank: 1 },
        { ...mockBaseline[0]!, rank: 2 },
      ];

      const result = compareOptimizedCorrectness(mockBaseline, candidate);

      expect(result.isIdentical).toBe(false);
      expect(result.divergenceIndex).toBe(0);
      expect(result.differences?.[0]).toContain('ID mismatch');
    });

    it('detects length mismatch', () => {
      const candidate = [mockBaseline[0]!];
      const result = compareOptimizedCorrectness(mockBaseline, candidate);

      expect(result.isIdentical).toBe(false);
      expect(result.differences?.[0]).toContain('Length mismatch');
    });
  });

  describe('Report Serialization & Exporters', () => {
    it('serializes report to valid JSON', async () => {
      const report = await runSubsystemProfiling({
        documentCount: 2,
        customQueries: ['test'],
        iterations: 1,
      });

      const jsonStr = exportProfilerJson(report);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.profileId).toBe(report.profileId);
      expect(parsed.queryPipelineStages.length).toBeGreaterThan(0);
      expect(parsed.dominantCosts.length).toBeGreaterThan(0);
    });

    it('exports formatted Markdown with all sections', async () => {
      const report = await runSubsystemProfiling({
        documentCount: 2,
        customQueries: ['test'],
        iterations: 1,
      });

      const mdStr = exportProfilerMarkdown(report);

      expect(mdStr).toContain('# OpenSearch Subsystem Profiling & Optimization Report');
      expect(mdStr).toContain('## 1. Query Pipeline Subsystem Breakdown');
      expect(mdStr).toContain('## 2. Storage & Persistence Breakdown');
      expect(mdStr).toContain('## 3. Dominant Cost Bottlenecks (Evidence-Based)');
      expect(mdStr).toContain('## 4. Optimization Recommendations & Decision Ledger');
      expect(mdStr).toContain('JUSTIFIED_FOR_PHASE_96');
      expect(mdStr).toContain('DEFERRED_PREMATURE_REWRITE');
    });
  });
});
