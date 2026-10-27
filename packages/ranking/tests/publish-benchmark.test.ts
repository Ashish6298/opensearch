import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_LIMITATIONS,
  DEFAULT_SCALE_TIERS,
  evaluateHardwareGuard,
  exportPublishBenchmarkJson,
  exportPublishBenchmarkMarkdown,
  generateAsciiBarChart,
  generateBenchmarkCharts,
  PRODUCTION_DISCLAIMER,
  runPublishBenchmark,
  TierBenchmarkResult,
} from '../src/index.js';

describe('Phase 98 — Publish Benchmark Results & Visual Reporting Suite', () => {
  describe('1. Hardware Limit Guard & Capacity Heuristic', () => {
    it('evaluates host memory and produces recommended document bounds', () => {
      const guard = evaluateHardwareGuard(100_000, false);

      expect(guard.totalMemoryMb).toBeGreaterThan(0);
      expect(guard.freeMemoryMb).toBeGreaterThan(0);
      expect(guard.maxAllocatedHeapMb).toBeGreaterThan(0);
      expect(guard.recommendedMaxDocs).toBeGreaterThan(0);
      expect(guard.targetDocsAttempted).toBe(100_000);
    });

    it('respects skipHardwareGuard when requested', () => {
      const guard = evaluateHardwareGuard(100_000, true);
      expect(guard.recommendedMaxDocs).toBe(100_000);
    });
  });

  describe('2. Chart Generation from Actual Output Metrics', () => {
    it('renders ASCII horizontal bar charts proportional to maximum value', () => {
      const items = [
        { label: 'tier-1k', value: 100, formattedValue: '100 ms' },
        { label: 'tier-5k', value: 500, formattedValue: '500 ms' },
        { label: 'tier-10k', value: 1000, formattedValue: '1000 ms' },
      ];

      const chart = generateAsciiBarChart('Build Time Scaling', items, 20);

      expect(chart).toContain('Build Time Scaling');
      expect(chart).toContain('tier-1k');
      expect(chart).toContain('tier-5k');
      expect(chart).toContain('tier-10k');
      expect(chart).toContain('1000 ms');
      expect(chart).toContain('█');
    });

    it('builds full chart set including Mermaid diagram syntax', () => {
      const mockTiers: TierBenchmarkResult[] = [
        {
          tierName: 'tier-1k',
          targetDocs: 1000,
          actualDocs: 1000,
          corpusSizeBytes: 1024 * 1024,
          corpusSizeMb: 1.0,
          buildDurationMs: 250,
          buildDocsPerSec: 4000,
          buildMbPerSec: 4.0,
          indexSizeBytes: 2 * 1024 * 1024,
          indexSizeMb: 2.0,
          compressionRatio: 2.0,
          vocabularyTermCount: 1500,
          postingCount: 20000,
          startupDurationMs: 50,
          memoryBefore: { heapUsedMb: 50, heapTotalMb: 100, externalMb: 5, rssMb: 120 },
          memoryAfter: { heapUsedMb: 90, heapTotalMb: 120, externalMb: 5, rssMb: 150 },
          memoryDeltaMb: 40,
          coldLatency: { minMs: 1, p50Ms: 2, p90Ms: 4, p95Ms: 5, p99Ms: 6, maxMs: 10, meanMs: 2.5, stdDevMs: 1 },
          warmLatency: { minMs: 0.5, p50Ms: 1.2, p90Ms: 2.5, p95Ms: 3.1, p99Ms: 4, maxMs: 5, meanMs: 1.5, stdDevMs: 0.5 },
          queryThroughputQps: 650,
          status: 'completed',
        },
      ];

      const charts = generateBenchmarkCharts(mockTiers);

      expect(charts.buildTimeChart).toContain('Build Time Scaling');
      expect(charts.throughputChart).toContain('Steady-State Query Throughput');
      expect(charts.latencyChart).toContain('p50 =');
      expect(charts.latencyChart).toContain('p95 =');
      expect(charts.indexSizeChart).toContain('Serialized Index Size');
      expect(charts.mermaidChart).toContain('```mermaid');
      expect(charts.mermaidChart).toContain('xychart-beta');
      expect(charts.mermaidChart).toContain('bar [650]');
    });
  });

  describe('3. Multi-Corpus Scalability & Execution', () => {
    it('executes progressive benchmarking across custom mini tiers reproducibly', async () => {
      const customTiers = [
        { name: 'mini-50', targetDocs: 50, description: 'Micro test tier 50' },
        { name: 'mini-100', targetDocs: 100, description: 'Micro test tier 100' },
      ];

      const report = await runPublishBenchmark({
        tiers: customTiers,
        warmupIterations: 1,
        measuredIterations: 1,
        seed: 42,
      });

      expect(report.reportId).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.tiers.length).toBe(2);

      const tier50 = report.tiers[0]!;
      const tier100 = report.tiers[1]!;

      expect(tier50.actualDocs).toBe(50);
      expect(tier100.actualDocs).toBe(100);
      expect(tier50.status).toBe('completed');
      expect(tier100.status).toBe('completed');
      expect(tier50.buildDurationMs).toBeGreaterThan(0);
      expect(tier100.buildDurationMs).toBeGreaterThan(0);
      expect(tier50.queryThroughputQps).toBeGreaterThan(0);
      expect(tier100.queryThroughputQps).toBeGreaterThan(0);
      expect(tier50.warmLatency.p50Ms).toBeGreaterThanOrEqual(0);
      expect(tier100.warmLatency.p95Ms).toBeGreaterThanOrEqual(0);
    });

    it('records skipped status when tier target exceeds maxTargetDocs', async () => {
      const customTiers = [
        { name: 'mini-50', targetDocs: 50, description: 'Micro tier 50' },
        { name: 'mini-200', targetDocs: 200, description: 'Micro tier 200' },
      ];

      const report = await runPublishBenchmark({
        tiers: customTiers,
        maxTargetDocs: 50,
        warmupIterations: 1,
        measuredIterations: 1,
      });

      // Only mini-50 runs because mini-200 > maxTargetDocs (50)
      expect(report.tiers.length).toBe(1);
      expect(report.tiers[0]!.tierName).toBe('mini-50');
    });
  });

  describe('4. Acceptance Criteria: Non-Misrepresentation Invariant & Limitations', () => {
    it('enforces non-misrepresentation disclaimer in report object and serialization', async () => {
      const report = await runPublishBenchmark({
        tiers: [{ name: 'mini-20', targetDocs: 20, description: 'Quick check' }],
        warmupIterations: 1,
        measuredIterations: 1,
      });

      expect(report.productionDisclaimer).toContain('DISCLAIMER & NON-MISREPRESENTATION NOTICE');
      expect(report.productionDisclaimer).toContain('single-node runtime environment');
      expect(report.productionDisclaimer).toContain('do NOT represent, and must NOT be cited or misrepresented as, production traffic measurements');

      const jsonStr = exportPublishBenchmarkJson(report);
      expect(jsonStr).toContain('productionDisclaimer');
      expect(jsonStr).toContain('single-node runtime environment');

      const mdStr = exportPublishBenchmarkMarkdown(report);
      expect(mdStr).toContain('Official Disclaimer & Non-Misrepresentation Guarantee');
      expect(mdStr).toContain('LOCAL BENCHMARK NOTICE');
      expect(mdStr).toContain('Progressive Corpus Scaling Results');
      expect(mdStr).toContain('Visual Charts from Actual Benchmark Output');
      expect(mdStr).toContain('Architectural Limitations & Benchmark Boundary Notes');
    });

    it('documents comprehensive environment details and execution limitations', () => {
      expect(BENCHMARK_LIMITATIONS.length).toBeGreaterThanOrEqual(5);
      const limitationText = BENCHMARK_LIMITATIONS.join(' ');
      expect(limitationText).toContain('In-Process Execution');
      expect(limitationText).toContain('Synthetic Corpus');
      expect(limitationText).toContain('Single-Node Architecture');
      expect(limitationText).toContain('Cache Warmth');
      expect(limitationText).toContain('Hardware Co-tenancy');
    });
  });
});
