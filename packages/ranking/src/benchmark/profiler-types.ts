/**
 * @opensearch/ranking — Subsystem Profiler Types (Phase 95)
 *
 * Types for high-resolution profiling across all search and indexing subsystems:
 * - Query parsing, tokenization, posting traversal, scoring, sorting, serialization, persistence.
 * - Dominant cost identification with empirical percentage breakdown.
 * - Formal optimization candidate justification and correctness verification oracle.
 */

import { HardwareEnvironment, MemorySnapshot } from './benchmark-types.js';

export type SearchSubsystemStage =
  | 'query_parsing'
  | 'tokenization_and_normalization'
  | 'posting_traversal'
  | 'phrase_positional_verification'
  | 'bm25_relevance_scoring'
  | 'pagerank_and_freshness_scoring'
  | 'score_sorting_and_tie_breaking'
  | 'snippet_and_result_generation'
  | 'index_serialization'
  | 'disk_persistence_write'
  | 'disk_deserialization_load';

export interface StageExecutionStats {
  stage: SearchSubsystemStage;
  stageLabel: string;
  category: 'query_pipeline' | 'indexing_pipeline' | 'storage_pipeline';
  totalDurationMs: number;
  callCount: number;
  meanDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  percentOfCategory: number;
}

export interface DominantCostFinding {
  stage: SearchSubsystemStage;
  stageLabel: string;
  category: 'query_pipeline' | 'indexing_pipeline' | 'storage_pipeline';
  percentContribution: number;
  explanation: string;
  empiricalEvidence: string;
}

export interface OptimizationRecommendation {
  recommendationId: string;
  targetSubsystem: SearchSubsystemStage;
  targetLabel: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'AVOID_PREMATURE';
  rationale: string;
  measuredBaselineMs: number;
  expectedSpeedupRange: string;
  correctnessVerificationPlan: string;
  decision: 'JUSTIFIED_FOR_PHASE_96' | 'JUSTIFIED_FOR_PHASE_97' | 'DEFERRED_PREMATURE_REWRITE';
}

export interface ProfilerReport {
  profileId: string;
  timestamp: string;
  environment: HardwareEnvironment;
  documentCount: number;
  queryCount: number;
  measuredIterations: number;
  queryPipelineStages: StageExecutionStats[];
  indexingPipelineStages: StageExecutionStats[];
  storagePipelineStages: StageExecutionStats[];
  dominantCosts: DominantCostFinding[];
  optimizationRecommendations: OptimizationRecommendation[];
  memorySnapshot: MemorySnapshot;
}

export interface CorrectnessComparisonResult {
  isIdentical: boolean;
  baselineSummary: string;
  candidateSummary: string;
  differences?: string[];
  divergenceIndex?: number;
}
