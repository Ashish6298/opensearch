/**
 * @opensearch/ranking — Benchmark Harness Types & Contracts (Phase 94)
 *
 * Defines contracts, metrics, hardware audit structures, and execution options
 * for reproducible search performance benchmarking.
 */

export interface HardwareEnvironment {
  platform: string;
  release: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  cpuSpeedMhz: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  nodeVersion: string;
  v8Version: string;
  openSearchVersion: string;
}

export interface MemorySnapshot {
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  rssMb: number;
}

export interface IndexingBenchmarkResult {
  corpusTier: string;
  documentCount: number;
  corpusSizeBytes: number;
  corpusSizeMb: number;
  buildDurationMs: number;
  buildRateDocsPerSec: number;
  buildRateMbPerSec: number;
  indexSizeBytes: number;
  indexSizeMb: number;
  vocabularyTermCount: number;
  postingCount: number;
  startupDurationMs: number;
  memoryBefore: MemorySnapshot;
  memoryAfter: MemorySnapshot;
  memoryDeltaMb: number;
}

export interface LatencyDistribution {
  minMs: number;
  p50Ms: number; // Median
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  meanMs: number;
  stdDevMs: number;
}

export interface QueryPhaseBenchmarkResult {
  queryCount: number;
  totalExecutions: number;
  durationMs: number;
  throughputQps: number;
  latencies: LatencyDistribution;
  memoryDeltaMb: number;
}

export interface QueryLevelBenchmarkItem {
  query: string;
  coldLatencyMs: number;
  warmP50Ms: number;
  totalHits: number;
}

export interface BenchmarkReport {
  benchmarkId: string;
  timestamp: string;
  environment: HardwareEnvironment;
  methodology: {
    fixedCorpusVersion: string;
    fixedQuerySetVersion: string;
    coldRunDefinition: string;
    warmRunDefinition: string;
    warmupIterations: number;
    measuredIterations: number;
    separatedPhases: boolean;
  };
  indexingPhase: IndexingBenchmarkResult;
  coldQueryPhase: QueryPhaseBenchmarkResult;
  warmQueryPhase: QueryPhaseBenchmarkResult;
  queryLevelDetails?: QueryLevelBenchmarkItem[];
}

export interface BenchmarkHarnessOptions {
  corpusTier?: 'seed' | 'demo';
  documentCount?: number;
  customQueries?: string[];
  warmupIterations?: number;
  measuredIterations?: number;
  recordQueryLevelDetails?: boolean;
}
