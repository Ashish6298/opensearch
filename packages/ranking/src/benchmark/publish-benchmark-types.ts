/**
 * @opensearch/ranking — Publish Benchmark Types & Contracts (Phase 98)
 *
 * Defines contracts, multi-scale tier structures, chart models,
 * environment specifications, and non-misrepresentation invariants
 * for published search benchmarks.
 */

import { HardwareEnvironment, LatencyDistribution, MemorySnapshot } from './benchmark-types.js';

export interface ProgressiveScaleTierConfig {
  name: string;
  targetDocs: number;
  description: string;
}

export interface TierBenchmarkResult {
  tierName: string;
  targetDocs: number;
  actualDocs: number;
  corpusSizeBytes: number;
  corpusSizeMb: number;
  buildDurationMs: number;
  buildDocsPerSec: number;
  buildMbPerSec: number;
  indexSizeBytes: number;
  indexSizeMb: number;
  compressionRatio: number;
  vocabularyTermCount: number;
  postingCount: number;
  startupDurationMs: number;
  memoryBefore: MemorySnapshot;
  memoryAfter: MemorySnapshot;
  memoryDeltaMb: number;
  coldLatency: LatencyDistribution;
  warmLatency: LatencyDistribution;
  queryThroughputQps: number;
  status: 'completed' | 'skipped_hardware_constraint';
  hardwareConstraintReason?: string;
}

export interface BenchmarkChartSet {
  buildTimeChart: string;
  throughputChart: string;
  latencyChart: string;
  indexSizeChart: string;
  mermaidChart: string;
}

export interface HardwareLimitGuard {
  maxAllocatedHeapMb: number;
  freeMemoryMb: number;
  totalMemoryMb: number;
  recommendedMaxDocs: number;
  targetDocsAttempted: number;
}

export interface PublishBenchmarkReport {
  reportId: string;
  timestamp: string;
  systemVersion: string;
  environment: HardwareEnvironment;
  hardwareLimitGuard: HardwareLimitGuard;
  methodology: {
    datasetGeneration: string;
    querySuiteVersion: string;
    warmupIterations: number;
    measuredIterations: number;
    deterministicSeed: number;
  };
  productionDisclaimer: string;
  limitations: string[];
  tiers: TierBenchmarkResult[];
  charts: BenchmarkChartSet;
}

export interface PublishBenchmarkOptions {
  tiers?: ProgressiveScaleTierConfig[];
  maxTargetDocs?: number;
  skipHardwareGuard?: boolean;
  warmupIterations?: number;
  measuredIterations?: number;
  customQueries?: string[];
  seed?: number;
}
