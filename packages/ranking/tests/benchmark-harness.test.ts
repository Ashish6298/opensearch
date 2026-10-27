import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_QUERY_SET_VERSION,
  FIXED_BENCHMARK_CORPUS_VERSION,
  REPEATABLE_BENCHMARK_QUERIES,
  benchmarkIndexingPhase,
  benchmarkQueryPhases,
  calculateDistribution,
  captureEnvironment,
  exportBenchmarkJson,
  exportBenchmarkMarkdown,
  getMemorySnapshot,
  runBenchmark,
} from '../src/index.js';

describe('Phase 94 — Benchmark Harness', () => {
  describe('Environment and Memory Auditing', () => {
    it('captures complete host hardware and runtime environment', () => {
      const env = captureEnvironment();

      expect(typeof env.platform).toBe('string');
      expect(env.platform.length).toBeGreaterThan(0);
      expect(typeof env.release).toBe('string');
      expect(typeof env.arch).toBe('string');
      expect(typeof env.cpuModel).toBe('string');
      expect(env.cpuCores).toBeGreaterThanOrEqual(1);
      expect(typeof env.cpuSpeedMhz).toBe('number');
      expect(env.totalMemoryMb).toBeGreaterThan(0);
      expect(env.freeMemoryMb).toBeGreaterThan(0);
      expect(env.nodeVersion).toMatch(/^v\d+\./);
      expect(typeof env.v8Version).toBe('string');
      expect(typeof env.openSearchVersion).toBe('string');
    });

    it('captures process memory snapshot with all required metrics', () => {
      const mem = getMemorySnapshot();

      expect(mem.heapUsedMb).toBeGreaterThan(0);
      expect(mem.heapTotalMb).toBeGreaterThan(0);
      expect(mem.rssMb).toBeGreaterThan(0);
      expect(typeof mem.externalMb).toBe('number');
      expect(mem.heapTotalMb).toBeGreaterThanOrEqual(mem.heapUsedMb);
    });
  });

  describe('Latency Distribution Calculations', () => {
    it('returns zeroes for an empty latency array', () => {
      const dist = calculateDistribution([]);

      expect(dist.minMs).toBe(0);
      expect(dist.p50Ms).toBe(0);
      expect(dist.p90Ms).toBe(0);
      expect(dist.p95Ms).toBe(0);
      expect(dist.p99Ms).toBe(0);
      expect(dist.maxMs).toBe(0);
      expect(dist.meanMs).toBe(0);
      expect(dist.stdDevMs).toBe(0);
    });

    it('calculates exact percentiles and stats on single-element array', () => {
      const dist = calculateDistribution([12.5]);

      expect(dist.minMs).toBe(12.5);
      expect(dist.p50Ms).toBe(12.5);
      expect(dist.p90Ms).toBe(12.5);
      expect(dist.p95Ms).toBe(12.5);
      expect(dist.p99Ms).toBe(12.5);
      expect(dist.maxMs).toBe(12.5);
      expect(dist.meanMs).toBe(12.5);
      expect(dist.stdDevMs).toBe(0);
    });

    it('accurately computes p50, p90, p95, p99 and mean on sequential dataset', () => {
      // 100 values: 1, 2, ..., 100
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const dist = calculateDistribution(values);

      expect(dist.minMs).toBe(1);
      expect(dist.maxMs).toBe(100);
      expect(dist.meanMs).toBe(50.5);
      // Index for p50: Math.floor(0.5 * 99) = 49 -> value 50
      expect(dist.p50Ms).toBe(50);
      // Index for p90: Math.floor(0.9 * 99) = 89 -> value 90
      expect(dist.p90Ms).toBe(90);
      // Index for p95: Math.floor(0.95 * 99) = 94 -> value 95
      expect(dist.p95Ms).toBe(95);
      // Index for p99: Math.floor(0.99 * 99) = 98 -> value 99
      expect(dist.p99Ms).toBe(99);
      expect(dist.stdDevMs).toBeGreaterThan(28);
    });
  });

  describe('Indexing Phase Isolation & Measurements', () => {
    const sampleDocs = [
      {
        id: 'doc-bench-1',
        title: 'TypeScript Performance Guide',
        description: 'Comprehensive guidelines for optimizing TypeScript compiler and search performance.',
        headings: 'Performance Benchmarking Memory Profiling',
        bodyText: 'Measuring cold start and warm latency is essential for large-scale search infrastructure.',
      },
      {
        id: 'doc-bench-2',
        title: 'Distributed Inverted Index Architecture',
        description: 'Design patterns for high-throughput inverted index construction and postings storage.',
        headings: 'Inverted Index Dictionary Postings BM25',
        bodyText: 'High performance term dictionary lookups enable sub-millisecond candidate retrieval.',
      },
      {
        id: 'doc-bench-3',
        title: 'Search Ranking and Scoring Algorithms',
        description: 'BM25F and PageRank hybrid relevance scoring mechanisms.',
        headings: 'Relevance Ranking BM25 PageRank Evaluation',
        bodyText: 'Offline IR quality benchmarks evaluate nDCG and MRR across judged query collections.',
      },
    ];

    it('measures build duration, throughput, index disk size, and cold startup time', async () => {
      const { result, index } = await benchmarkIndexingPhase(sampleDocs, 'test-tier');

      expect(result.corpusTier).toBe('test-tier');
      expect(result.documentCount).toBe(3);
      expect(result.corpusSizeBytes).toBeGreaterThan(0);
      expect(result.corpusSizeMb).toBeGreaterThanOrEqual(0);
      expect(result.buildDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.buildRateDocsPerSec).toBeGreaterThanOrEqual(0);
      expect(result.indexSizeBytes).toBeGreaterThan(0);
      expect(result.vocabularyTermCount).toBeGreaterThan(10);
      expect(result.postingCount).toBeGreaterThan(10);
      expect(result.startupDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.memoryBefore).toBeDefined();
      expect(result.memoryAfter).toBeDefined();

      // Ensure the re-hydrated index is fully functional
      const stats = index.getStats();
      expect(stats.totalDocuments).toBe(3);
      expect(index.getPostings('benchmark') || index.getPostings('performance')).toBeDefined();
    });
  });

  describe('Query Execution Phases (Cold vs Warm)', () => {
    it('distinguishes cold query phase from steady-state warm query phase', async () => {
      const sampleDocs = [
        {
          id: 'doc-1',
          title: 'JavaScript Asynchronous Programming',
          headings: 'Promises Async Await Event Loop',
          bodyText: 'Understanding the Node.js event loop and microtask queue for high performance APIs.',
        },
        {
          id: 'doc-2',
          title: 'Information Retrieval Systems',
          headings: 'Search Engine Indexing Query Ranking',
          bodyText: 'Vector space models and BM25 term weighting algorithms.',
        },
      ];

      const { index } = await benchmarkIndexingPhase(sampleDocs, 'test-tier');
      const testQueries = ['javascript async', 'search engine', 'information retrieval'];

      const { coldResult, warmResult, queryDetails } = await benchmarkQueryPhases(
        index,
        testQueries,
        {
          warmupIterations: 2,
          measuredIterations: 3,
          recordQueryLevelDetails: true,
        },
      );

      // Cold phase checks
      expect(coldResult.queryCount).toBe(3);
      expect(coldResult.totalExecutions).toBe(3);
      expect(coldResult.durationMs).toBeGreaterThanOrEqual(0);
      expect(coldResult.throughputQps).toBeGreaterThan(0);
      expect(coldResult.latencies.p50Ms).toBeGreaterThanOrEqual(0);

      // Warm phase checks
      expect(warmResult.queryCount).toBe(3);
      expect(warmResult.totalExecutions).toBe(9); // 3 queries * 3 measured iterations
      expect(warmResult.durationMs).toBeGreaterThanOrEqual(0);
      expect(warmResult.throughputQps).toBeGreaterThan(0);
      expect(warmResult.latencies.p95Ms).toBeGreaterThanOrEqual(0);

      // Per-query detail checks
      expect(queryDetails).toBeDefined();
      expect(queryDetails!.length).toBe(3);
      expect(queryDetails![0]!.query).toBe('javascript async');
      expect(queryDetails![0]!.coldLatencyMs).toBeGreaterThanOrEqual(0);
      expect(queryDetails![0]!.warmP50Ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('End-to-End Benchmark Runner & Exporters', () => {
    it('runs repeatable benchmark with fixed versions and records complete report', async () => {
      const report = await runBenchmark({
        documentCount: 5,
        customQueries: ['typescript', 'react', 'python'],
        warmupIterations: 1,
        measuredIterations: 2,
        recordQueryLevelDetails: true,
      });

      expect(report.benchmarkId).toMatch(/^bench-\d+-[a-z0-9]+$/);
      expect(report.timestamp).toBeDefined();
      expect(report.environment.nodeVersion).toBeDefined();
      expect(report.methodology.fixedCorpusVersion).toBe(FIXED_BENCHMARK_CORPUS_VERSION);
      expect(report.methodology.fixedQuerySetVersion).toBe(BENCHMARK_QUERY_SET_VERSION);
      expect(report.methodology.separatedPhases).toBe(true);
      expect(report.indexingPhase.documentCount).toBe(5);
      expect(report.coldQueryPhase.queryCount).toBe(3);
      expect(report.warmQueryPhase.queryCount).toBe(3);
      expect(report.queryLevelDetails?.length).toBe(3);

      // Export JSON verification
      const jsonStr = exportBenchmarkJson(report);
      const parsed = JSON.parse(jsonStr);
      expect(parsed.benchmarkId).toBe(report.benchmarkId);
      expect(parsed.environment.platform).toBe(report.environment.platform);
      expect(parsed.indexingPhase.documentCount).toBe(5);

      // Export Markdown verification
      const mdStr = exportBenchmarkMarkdown(report);
      expect(mdStr).toContain('# OpenSearch Performance Benchmark Report');
      expect(mdStr).toContain('## 1. Hardware & Runtime Environment');
      expect(mdStr).toContain('## 2. Methodology & Invariants');
      expect(mdStr).toContain('## 3. Indexing Phase Benchmarks');
      expect(mdStr).toContain('## 4. Query Latency & Throughput Distribution');
      expect(mdStr).toContain('p50 Latency (Median)');
      expect(mdStr).toContain('p95 Latency');
      expect(mdStr).toContain('p99 Latency');
    });

    it('verifies standard repeatable benchmark query collection has diverse categories', () => {
      expect(REPEATABLE_BENCHMARK_QUERIES.length).toBe(30);
      expect(BENCHMARK_QUERY_SET_VERSION).toBe('v1.0.0-standard-30');

      // Verify presence of single-term, technical, informational, ambiguous queries
      expect(REPEATABLE_BENCHMARK_QUERIES).toContain('search');
      expect(REPEATABLE_BENCHMARK_QUERIES).toContain('typescript async await');
      expect(REPEATABLE_BENCHMARK_QUERIES).toContain('quantum computing superposition qubits');
      expect(REPEATABLE_BENCHMARK_QUERIES).toContain('apple');
    });
  });
});
