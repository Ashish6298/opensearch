/**
/**
 * @opensearch/crawler — PageRank Algorithm Types & Schemas (Phase 88)
 *
 * Defines the configuration, metadata, and score representations for the
 * real PageRank power-iteration algorithm.
 */

export type PageRankStatus = 'computed' | 'unavailable' | 'empty' | 'fallback';

export type DanglingNodeHandling = 'redistribute-uniform' | 'self-loop' | 'teleport';

export interface PageRankOptions {
  /**
   * Damping factor representing probability of following a forward link vs teleporting.
   * Standard web search damping factor is 0.85. Range: (0, 1).
   * @default 0.85
   */
  dampingFactor?: number;

  /**
   * Convergence tolerance threshold (L1 norm difference between iterations).
   * Iteration stops when sum(|PR_t - PR_{t-1}|) < convergenceThreshold.
   * @default 1e-6
   */
  convergenceThreshold?: number;

  /**
   * Maximum power iterations before terminating if convergence not reached.
   * @default 100
   */
  maxIterations?: number;

  /**
   * Strategy for handling dangling nodes (nodes with out-degree = 0).
   * - 'redistribute-uniform': Distributes dangling mass evenly across all N nodes (prevents rank leakage).
   * - 'teleport': Teleports random surfer uniformly across all nodes.
   * @default 'redistribute-uniform'
   */
  danglingNodeHandling?: DanglingNodeHandling;

  /**
   * Optional custom timestamp for deterministic testing and snapshot reproducibility.
   */
  customTimestamp?: string;
}

export interface PageRankScoreStats {
  /** Minimum score in the graph */
  min: number;
  /** Maximum score in the graph */
  max: number;
  /** Arithmetic mean score (strictly 1/N for non-empty graphs) */
  mean: number;
  /** Median score in the graph */
  median: number;
  /** Sum of all scores across all nodes (conserved to 1.0) */
  sum: number;
}

export interface PageRankMetadata {
  /** Schema version */
  schemaVersion: '1.0.0';
  /** Computation algorithm name */
  algorithm: 'pagerank-power-iteration';
  /** PageRank execution status */
  status: PageRankStatus;
  /** Total unique nodes evaluated */
  totalNodes: number;
  /** Total directed edges traversed */
  totalEdges: number;
  /** Count of dangling nodes (out-degree = 0) */
  danglingNodesCount: number;
  /** Damping factor used (e.g. 0.85) */
  dampingFactor: number;
  /** Convergence tolerance threshold */
  convergenceThreshold: number;
  /** Maximum allowable iterations */
  maxIterations: number;
  /** Number of iterations executed until convergence or limit */
  iterations: number;
  /** Whether power iteration achieved convergence within threshold */
  converged: boolean;
  /** Final L1 difference on termination */
  finalDelta: number;
  /** ISO 8601 timestamp when computation finished */
  computedAt: string;
  /** Elapsed computation time in milliseconds */
  durationMs: number;
  /** Statistical distribution of computed scores */
  scoreStats: PageRankScoreStats;
  /** Optional associated graph hash or identifier */
  graphHash?: string;
}

export interface PageRankData {
  /** Schema version */
  schemaVersion: '1.0.0';
  /** Execution status */
  status: PageRankStatus;
  /** Score table mapping canonical URL -> PageRank score */
  scores: Record<string, number>;
  /** Complete computation metadata */
  metadata: PageRankMetadata;
}

export interface PageRankLookupResult {
  /** Normalized URL requested */
  url: string;
  /**
   * Computed PageRank score, or null if unavailable or uncomputed.
   * Never contains a fake placeholder score disguised as computed.
   */
  score: number | null;
  /** Whether the score was legitimately computed from an actual graph */
  isComputed: boolean;
  /** Lookup status */
  status: PageRankStatus;
  /** Diagnostic reason describing score source or reason for absence */
  reason:
    | 'computed-from-graph'
    | 'url-not-in-graph'
    | 'graph-empty'
    | 'graph-unavailable'
    | 'fallback-default';
  /** Optional metadata snapshot */
  metadata?: PageRankMetadata;
}
