/**
 * @opensearch/crawler — PageRank Algorithm Implementation (Phase 88)
 *
 * Implements deterministic PageRank computation via the power-iteration method:
 * - Formal transition matrix with damping factor (default: 0.85)
 * - Dangling node mass redistribution (prevents probability sinkholes)
 * - Strict convergence checking with L1 norm threshold (default: 1e-6)
 * - Complete boundary handling: empty graphs, single-node graphs, cyclic graphs, disconnected components
 * - Explicit fallback model: never presents fake constant placeholders as computed PageRank
 * - Versioned serialization and metadata persistence with the graph/index generation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeUrl } from '../url/url-normalizer.js';
import { LinkGraph } from './link-graph.js';
import { LinkGraphData } from './graph-types.js';
import {
  PageRankData,
  PageRankLookupResult,
  PageRankMetadata,
  PageRankOptions,
  PageRankScoreStats,
  PageRankStatus,
} from './pagerank-types.js';

export const DEFAULT_DAMPING_FACTOR = 0.85;
export const DEFAULT_CONVERGENCE_THRESHOLD = 1e-6;
export const DEFAULT_MAX_ITERATIONS = 100;

/**
 * Computes descriptive statistics for a distribution of PageRank scores.
 */
export function computeScoreStats(scores: number[]): PageRankScoreStats {
  if (scores.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, sum: 0 };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const sum = scores.reduce((acc, val) => acc + val, 0);
  const mean = sum / scores.length;

  let median: number;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    median = (sorted[mid - 1]! + sorted[mid]!) / 2;
  } else {
    median = sorted[mid]!;
  }

  return {
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean,
    median,
    sum,
  };
}

/**
 * Evaluates PageRank across a graph via the power-iteration algorithm.
 * Accepts either an active LinkGraph instance or serialized LinkGraphData.
 */
export function computePageRank(
  graphInput: LinkGraph | LinkGraphData,
  options: PageRankOptions = {},
): PageRankTable {
  const startTime = Date.now();
  const dampingFactor = options.dampingFactor ?? DEFAULT_DAMPING_FACTOR;
  const convergenceThreshold = options.convergenceThreshold ?? DEFAULT_CONVERGENCE_THRESHOLD;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const danglingHandling = options.danglingNodeHandling ?? 'redistribute-uniform';

  if (dampingFactor <= 0 || dampingFactor >= 1) {
    throw new Error(`Damping factor must be strictly between 0 and 1, got ${dampingFactor}`);
  }
  if (convergenceThreshold <= 0) {
    throw new Error(`Convergence threshold must be > 0, got ${convergenceThreshold}`);
  }
  if (maxIterations < 1) {
    throw new Error(`Max iterations must be >= 1, got ${maxIterations}`);
  }

  // 1. Extract graph structure (handle LinkGraph instance or LinkGraphData object)
  const isInstance = graphInput instanceof LinkGraph;
  const graphData: LinkGraphData = isInstance ? graphInput.toJSON() : graphInput;

  const nodeUrls = Object.keys(graphData.nodes).sort(); // Deterministic ordering
  const N = nodeUrls.length;
  const totalEdges = graphData.edgeCount;

  // 2. Boundary Condition: Empty Graph (N = 0)
  if (N === 0) {
    const emptyMetadata: PageRankMetadata = {
      schemaVersion: '1.0.0',
      algorithm: 'pagerank-power-iteration',
      status: 'empty',
      totalNodes: 0,
      totalEdges: 0,
      danglingNodesCount: 0,
      dampingFactor,
      convergenceThreshold,
      maxIterations,
      iterations: 0,
      converged: true,
      finalDelta: 0,
      computedAt: options.customTimestamp || new Date(startTime).toISOString(),
      durationMs: Date.now() - startTime,
      scoreStats: { min: 0, max: 0, mean: 0, median: 0, sum: 0 },
    };
    return new PageRankTable(new Map(), emptyMetadata);
  }

  // 3. Boundary Condition: Single Node (N = 1)
  if (N === 1) {
    const singleUrl = nodeUrls[0]!;
    const scores = new Map<string, number>([[singleUrl, 1.0]]);
    const singleMetadata: PageRankMetadata = {
      schemaVersion: '1.0.0',
      algorithm: 'pagerank-power-iteration',
      status: 'computed',
      totalNodes: 1,
      totalEdges,
      danglingNodesCount: (graphData.nodes[singleUrl]?.outDegree ?? 0) === 0 ? 1 : 0,
      dampingFactor,
      convergenceThreshold,
      maxIterations,
      iterations: 1,
      converged: true,
      finalDelta: 0,
      computedAt: options.customTimestamp || new Date(startTime).toISOString(),
      durationMs: Date.now() - startTime,
      scoreStats: { min: 1.0, max: 1.0, mean: 1.0, median: 1.0, sum: 1.0 },
    };
    return new PageRankTable(scores, singleMetadata);
  }

  // 4. Multi-node Power Iteration Setup (N >= 2)
  // Pre-index node indices, out-degrees, and incoming backlinks (reverse adjacency)
  const nodeIndexMap = new Map<string, number>();
  const outDegrees = new Float64Array(N);
  const isDangling = new Uint8Array(N);
  const reverseAdjacencyIndices: number[][] = new Array(N);

  for (let i = 0; i < N; i++) {
    const url = nodeUrls[i]!;
    nodeIndexMap.set(url, i);
    const outDeg = graphData.nodes[url]?.outDegree ?? (graphData.adjacencyList[url]?.length || 0);
    outDegrees[i] = outDeg;
    if (outDeg === 0) {
      isDangling[i] = 1;
    }
    reverseAdjacencyIndices[i] = [];
  }

  // Build reverse adjacency index array for fast inner-loop traversal
  let danglingCount = 0;
  for (let i = 0; i < N; i++) {
    if (isDangling[i] === 1) danglingCount++;
    const url = nodeUrls[i]!;
    const inlinks = graphData.reverseAdjacencyList[url] || [];
    for (const inUrl of inlinks) {
      const sourceIdx = nodeIndexMap.get(inUrl);
      if (sourceIdx !== undefined) {
        reverseAdjacencyIndices[i]!.push(sourceIdx);
      }
    }
  }

  // Initialize rank vector: uniform probability PR_0(u) = 1 / N
  let prevScores = new Float64Array(N);
  const initialRank = 1.0 / N;
  for (let i = 0; i < N; i++) {
    prevScores[i] = initialRank;
  }

  let currScores = new Float64Array(N);
  let iterations = 0;
  let converged = false;
  let finalDelta = 0;

  const teleportBase = (1.0 - dampingFactor) / N;

  // 5. Power Iteration Loop
  while (iterations < maxIterations) {
    iterations++;

    // Calculate sum of rank from dangling nodes in prevScores
    let danglingSum = 0;
    for (let i = 0; i < N; i++) {
      if (isDangling[i] === 1) {
        danglingSum += prevScores[i]!;
      }
    }

    // Base redistribution per node from random teleportation and dangling redistribution
    const danglingShare = danglingHandling === 'redistribute-uniform'
      ? (dampingFactor * danglingSum) / N
      : 0;
    const baseScore = teleportBase + danglingShare;

    let delta = 0;

    for (let i = 0; i < N; i++) {
      // Inbound link contributions: sum_{v in Inlinks(i)} (prevScores[v] / outDegree[v])
      const inlinkIndices = reverseAdjacencyIndices[i]!;
      let inlinkSum = 0;
      for (let j = 0; j < inlinkIndices.length; j++) {
        const sourceIdx = inlinkIndices[j]!;
        const srcOutDeg = outDegrees[sourceIdx]!;
        if (srcOutDeg > 0) {
          inlinkSum += prevScores[sourceIdx]! / srcOutDeg;
        }
      }

      const newScore = baseScore + dampingFactor * inlinkSum;
      currScores[i] = newScore;
      delta += Math.abs(newScore - prevScores[i]!);
    }

    finalDelta = delta;

    if (delta < convergenceThreshold) {
      converged = true;
      break;
    }

    // Swap buffers for next iteration
    const temp = prevScores;
    prevScores = currScores;
    currScores = temp;
  }

  // 6. Final normalization and score preservation
  const finalRankVector = converged || iterations % 2 === 1 ? currScores : prevScores;

  // Build final score map
  const scoreMap = new Map<string, number>();
  const scoreValues: number[] = [];
  for (let i = 0; i < N; i++) {
    const url = nodeUrls[i]!;
    const score = finalRankVector[i]!;
    scoreMap.set(url, score);
    scoreValues.push(score);
  }

  const scoreStats = computeScoreStats(scoreValues);

  const metadata: PageRankMetadata = {
    schemaVersion: '1.0.0',
    algorithm: 'pagerank-power-iteration',
    status: 'computed',
    totalNodes: N,
    totalEdges,
    danglingNodesCount: danglingCount,
    dampingFactor,
    convergenceThreshold,
    maxIterations,
    iterations,
    converged,
    finalDelta,
    computedAt: options.customTimestamp || new Date(startTime).toISOString(),
    durationMs: Date.now() - startTime,
    scoreStats,
  };

  return new PageRankTable(scoreMap, metadata);
}

/**
 * Container and lookup service for PageRank scores and metadata.
 * Provides explicit fallback mechanics and serialization capabilities.
 */
export class PageRankTable {
  private readonly scores: Map<string, number>;
  private readonly metadata: PageRankMetadata;

  constructor(scores: Map<string, number>, metadata: PageRankMetadata) {
    this.scores = scores;
    this.metadata = metadata;
  }

  /**
   * Factory to create an unavailable PageRankTable instance.
   * Ensures callers have an explicit object that signals missing data without throwing.
   */
  static createUnavailable(
    reason: 'graph-empty' | 'graph-unavailable' = 'graph-unavailable',
  ): PageRankTable {
    const meta: PageRankMetadata = {
      schemaVersion: '1.0.0',
      algorithm: 'pagerank-power-iteration',
      status: reason === 'graph-empty' ? 'empty' : 'unavailable',
      totalNodes: 0,
      totalEdges: 0,
      danglingNodesCount: 0,
      dampingFactor: DEFAULT_DAMPING_FACTOR,
      convergenceThreshold: DEFAULT_CONVERGENCE_THRESHOLD,
      maxIterations: DEFAULT_MAX_ITERATIONS,
      iterations: 0,
      converged: false,
      finalDelta: 0,
      computedAt: new Date().toISOString(),
      durationMs: 0,
      scoreStats: { min: 0, max: 0, mean: 0, median: 0, sum: 0 },
    };
    return new PageRankTable(new Map(), meta);
  }

  /**
   * Whether valid computed PageRank scores are available.
   */
  isAvailable(): boolean {
    return this.metadata.status === 'computed' && this.scores.size > 0;
  }

  /**
   * Returns current execution status ('computed', 'empty', 'unavailable', 'fallback').
   */
  getStatus(): PageRankStatus {
    return this.metadata.status;
  }

  /**
   * Gets metadata describing the computation execution and distribution.
   */
  getMetadata(): PageRankMetadata {
    return { ...this.metadata };
  }

  /**
   * Total number of URLs scored in the table.
   */
  get size(): number {
    return this.scores.size;
  }

  /**
   * Looks up a URL's PageRank score.
   * If URL was not in the graph, score is null and isComputed is false.
   * Never fabricates a placeholder decimal as computed PageRank.
   */
  get(rawUrl: string): PageRankLookupResult {
    const norm = this.normalizeKey(rawUrl);

    if (!this.isAvailable()) {
      return {
        url: norm,
        score: null,
        isComputed: false,
        status: this.metadata.status,
        reason: this.metadata.status === 'empty' ? 'graph-empty' : 'graph-unavailable',
        metadata: this.getMetadata(),
      };
    }

    if (this.scores.has(norm)) {
      return {
        url: norm,
        score: this.scores.get(norm)!,
        isComputed: true,
        status: 'computed',
        reason: 'computed-from-graph',
        metadata: this.getMetadata(),
      };
    }

    return {
      url: norm,
      score: null,
      isComputed: false,
      status: 'unavailable',
      reason: 'url-not-in-graph',
      metadata: this.getMetadata(),
    };
  }

  /**
   * Returns raw score if computed, or null if uncomputed / unavailable.
   */
  getScore(rawUrl: string): number | null {
    return this.get(rawUrl).score;
  }

  /**
   * Explicit fallback accessor: if the URL has no computed score, returns
   * the provided fallback value while explicitly tagging it as uncomputed.
   */
  getFallbackScore(rawUrl: string, fallbackValue: number = 0): PageRankLookupResult {
    const lookup = this.get(rawUrl);
    if (lookup.isComputed && lookup.score !== null) {
      return lookup;
    }

    return {
      url: lookup.url,
      score: fallbackValue,
      isComputed: false,
      status: 'fallback',
      reason: 'fallback-default',
      metadata: this.getMetadata(),
    };
  }

  /**
   * Returns all URLs sorted by PageRank in descending order.
   */
  getTopUrls(limit?: number): Array<{ url: string; score: number }> {
    const list: Array<{ url: string; score: number }> = [];
    for (const [url, score] of this.scores.entries()) {
      list.push({ url, score });
    }
    list.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
    return typeof limit === 'number' && limit > 0 ? list.slice(0, limit) : list;
  }

  /**
   * Serializes the score table and metadata into versioned PageRankData format.
   * URL keys are deterministically sorted for bitwise reproducibility.
   */
  toJSON(customTimestamp?: string, customDurationMs?: number): PageRankData {
    const sortedScores: Record<string, number> = {};
    const sortedKeys = Array.from(this.scores.keys()).sort();
    for (const key of sortedKeys) {
      sortedScores[key] = this.scores.get(key)!;
    }

    const meta = { ...this.metadata };
    if (customTimestamp) {
      meta.computedAt = customTimestamp;
    }
    if (typeof customDurationMs === 'number') {
      meta.durationMs = customDurationMs;
    }

    return {
      schemaVersion: '1.0.0',
      status: this.metadata.status,
      scores: sortedScores,
      metadata: meta,
    };
  }

  /**
   * Reconstructs a PageRankTable from serialized PageRankData.
   */
  static fromJSON(data: PageRankData): PageRankTable {
    if (!data || data.schemaVersion !== '1.0.0') {
      throw new Error(`Unsupported PageRankData schema version: ${data?.schemaVersion}`);
    }

    const map = new Map<string, number>();
    if (data.scores) {
      for (const [url, score] of Object.entries(data.scores)) {
        map.set(url, score);
      }
    }

    return new PageRankTable(map, data.metadata);
  }

  /**
   * Exports the PageRank table as a formatted JSON string.
   */
  exportJson(indent = 2, customTimestamp?: string, customDurationMs?: number): string {
    return JSON.stringify(this.toJSON(customTimestamp, customDurationMs), null, indent);
  }

  /**
   * Saves PageRank data to disk atomically with metadata.
   */
  async saveToFile(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    await fs.promises.writeFile(tmpPath, this.exportJson(), 'utf-8');
    await fs.promises.rename(tmpPath, filePath);
  }

  /**
   * Loads PageRank data from disk.
   */
  static async loadFromFile(filePath: string): Promise<PageRankTable> {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as PageRankData;
    return PageRankTable.fromJSON(parsed);
  }

  private normalizeKey(url: string): string {
    const trimmed = url.trim();
    const norm = normalizeUrl(trimmed);
    return norm.ok && norm.normalized ? norm.normalized : trimmed;
  }
}
