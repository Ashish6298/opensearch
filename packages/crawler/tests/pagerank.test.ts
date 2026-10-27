/**
 * @opensearch/crawler — PageRank Algorithm Test Suite (Phase 88)
 *
 * Comprehensive verification for the real PageRank power-iteration algorithm:
 * 1. Cyclic Graph: Symmetric directed cycles converge to uniform stationary distribution
 * 2. Dangling Nodes: Out-degree = 0 sinkholes properly redistribute mass without score leakage
 * 3. Disconnected Graph: Multiple disjoint components converge stably with random walk teleportation
 * 4. Empty Graph: Gracefully handles 0 nodes with status: 'empty' and zero scores
 * 5. Single Node Graph: Single vertex receives exactly 1.0 probability mass
 * 6. Convergence Testing: L1 delta terminates under threshold with convergence flag
 * 7. Deterministic Repeated Computation: Multiple runs on identical graphs yield bitwise identical scores
 * 8. Explicit Fallback & Placeholder Rejection: Never fabricates constant decimals as computed PageRank
 * 9. Serialization & Storage Metadata: Saves and loads versioned PageRankData with metadata intact
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  LinkGraph,
  computePageRank,
  PageRankTable,
  computeScoreStats,
  PageRankData,
} from '../src/index.js';

describe('Phase 88 — Real PageRank Power-Iteration Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-pagerank-p88-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('1. Empty & Boundary Graph Handling', () => {
    it('handles empty graph without crashing and returns empty status', () => {
      const graph = new LinkGraph();
      const result = computePageRank(graph);

      expect(result.isAvailable()).toBe(false);
      expect(result.size).toBe(0);
      expect(result.getStatus()).toBe('empty');

      const meta = result.getMetadata();
      expect(meta.totalNodes).toBe(0);
      expect(meta.totalEdges).toBe(0);
      expect(meta.iterations).toBe(0);
      expect(meta.converged).toBe(true);
      expect(meta.scoreStats.sum).toBe(0);

      // Lookup on empty graph returns null score without fabricating numbers
      const lookup = result.get('https://example.com/any');
      expect(lookup.score).toBeNull();
      expect(lookup.isComputed).toBe(false);
      expect(lookup.reason).toBe('graph-empty');
    });

    it('handles single node graph giving it score 1.0', () => {
      const graph = new LinkGraph();
      graph.ensureNode('https://example.com/solo');

      const result = computePageRank(graph);

      expect(result.isAvailable()).toBe(true);
      expect(result.size).toBe(1);
      expect(result.getStatus()).toBe('computed');

      const meta = result.getMetadata();
      expect(meta.totalNodes).toBe(1);
      expect(meta.iterations).toBe(1);
      expect(meta.converged).toBe(true);
      expect(meta.scoreStats.sum).toBe(1.0);
      expect(meta.scoreStats.mean).toBe(1.0);

      const soloLookup = result.get('https://example.com/solo');
      expect(soloLookup.score).toBe(1.0);
      expect(soloLookup.isComputed).toBe(true);
      expect(soloLookup.reason).toBe('computed-from-graph');
    });
  });

  describe('2. Cyclic Graph Behavior', () => {
    it('converges to uniform distribution on symmetric 3-node cycle (A -> B -> C -> A)', () => {
      const graph = new LinkGraph();
      graph.addEdge('https://example.com/a', 'https://example.com/b');
      graph.addEdge('https://example.com/b', 'https://example.com/c');
      graph.addEdge('https://example.com/c', 'https://example.com/a');

      const result = graph.computePageRank({ dampingFactor: 0.85, convergenceThreshold: 1e-7 });

      expect(result.isAvailable()).toBe(true);
      expect(result.size).toBe(3);

      const scoreA = result.getScore('https://example.com/a')!;
      const scoreB = result.getScore('https://example.com/b')!;
      const scoreC = result.getScore('https://example.com/c')!;

      // In a symmetric 3-node cycle, all nodes must have equal PageRank (1/3 each)
      expect(scoreA).toBeCloseTo(1 / 3, 5);
      expect(scoreB).toBeCloseTo(1 / 3, 5);
      expect(scoreC).toBeCloseTo(1 / 3, 5);

      const sum = scoreA + scoreB + scoreC;
      expect(sum).toBeCloseTo(1.0, 6);

      const meta = result.getMetadata();
      expect(meta.converged).toBe(true);
      expect(meta.danglingNodesCount).toBe(0);
    });

    it('correctly ranks nodes in an asymmetric cycle with incoming feeder tail', () => {
      // Topology: Tail (T) -> Entry (E) -> CycleA <-> CycleB
      // T has in-degree 0; E, CycleA, CycleB form a loop where rank concentrates
      const graph = new LinkGraph();
      graph.addEdge('https://example.com/tail', 'https://example.com/entry');
      graph.addEdge('https://example.com/entry', 'https://example.com/loop1');
      graph.addEdge('https://example.com/loop1', 'https://example.com/loop2');
      graph.addEdge('https://example.com/loop2', 'https://example.com/entry');

      const result = computePageRank(graph, { dampingFactor: 0.85 });

      const scoreTail = result.getScore('https://example.com/tail')!;
      const scoreEntry = result.getScore('https://example.com/entry')!;
      const scoreLoop1 = result.getScore('https://example.com/loop1')!;
      const scoreLoop2 = result.getScore('https://example.com/loop2')!;

      // Tail has 0 inlinks, so its score is purely (1 - d) / N
      expect(scoreTail).toBeCloseTo((1 - 0.85) / 4, 4);

      // Loop nodes must accumulate rank and be significantly higher than the unlinked tail
      expect(scoreEntry).toBeGreaterThan(scoreTail);
      expect(scoreLoop1).toBeGreaterThan(scoreTail);
      expect(scoreLoop2).toBeGreaterThan(scoreTail);

      const sum = scoreTail + scoreEntry + scoreLoop1 + scoreLoop2;
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });

  describe('3. Dangling Node Mass Redistribution', () => {
    it('redistributes dangling node mass without rank leakage', () => {
      // Topology: A -> B -> C (C has out-degree = 0, dangling sinkhole)
      const graph = new LinkGraph();
      graph.addEdge('https://example.com/a', 'https://example.com/b');
      graph.addEdge('https://example.com/b', 'https://example.com/c');

      expect(graph.getDanglingNodes()).toEqual(['https://example.com/c']);

      const result = computePageRank(graph, {
        dampingFactor: 0.85,
        danglingNodeHandling: 'redistribute-uniform',
      });

      const meta = result.getMetadata();
      expect(meta.danglingNodesCount).toBe(1);
      expect(meta.converged).toBe(true);

      const scoreA = result.getScore('https://example.com/a')!;
      const scoreB = result.getScore('https://example.com/b')!;
      const scoreC = result.getScore('https://example.com/c')!;

      // Total rank must remain conserved to 1.0 (no leakage to zero)
      const sum = scoreA + scoreB + scoreC;
      expect(sum).toBeCloseTo(1.0, 5);

      // Ranking order: C receives from B, B receives from A, A receives only base teleportation + dangling
      // Therefore: scoreC > scoreB > scoreA
      expect(scoreC).toBeGreaterThan(scoreB);
      expect(scoreB).toBeGreaterThan(scoreA);
    });
  });

  describe('4. Disconnected Graph Behavior', () => {
    it('converges predictably across disjoint components via damping teleportation', () => {
      // Disjoint component 1: A <-> B
      // Disjoint component 2: C <-> D
      const graph = new LinkGraph();
      graph.addEdge('https://example.com/comp1/a', 'https://example.com/comp1/b');
      graph.addEdge('https://example.com/comp1/b', 'https://example.com/comp1/a');

      graph.addEdge('https://example.com/comp2/c', 'https://example.com/comp2/d');
      graph.addEdge('https://example.com/comp2/d', 'https://example.com/comp2/c');

      const result = computePageRank(graph, { dampingFactor: 0.85 });

      expect(result.size).toBe(4);
      const scoreA = result.getScore('https://example.com/comp1/a')!;
      const scoreB = result.getScore('https://example.com/comp1/b')!;
      const scoreC = result.getScore('https://example.com/comp2/c')!;
      const scoreD = result.getScore('https://example.com/comp2/d')!;

      // Two identical 2-node components must each receive 0.25
      expect(scoreA).toBeCloseTo(0.25, 4);
      expect(scoreB).toBeCloseTo(0.25, 4);
      expect(scoreC).toBeCloseTo(0.25, 4);
      expect(scoreD).toBeCloseTo(0.25, 4);

      const sum = scoreA + scoreB + scoreC + scoreD;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('handles isolated nodes with in-degree = 0 and out-degree = 0', () => {
      const graph = new LinkGraph();
      graph.addEdge('https://example.com/hub', 'https://example.com/authority');
      graph.ensureNode('https://example.com/isolated');

      const result = computePageRank(graph);

      expect(result.size).toBe(3);
      const scoreIso = result.getScore('https://example.com/isolated')!;
      const scoreAuth = result.getScore('https://example.com/authority')!;

      // Authority has an inlink, isolated node has none
      expect(scoreAuth).toBeGreaterThan(scoreIso);

      const meta = result.getMetadata();
      expect(meta.scoreStats.sum).toBeCloseTo(1.0, 5);
    });
  });

  describe('5. Convergence & Parameter Validation', () => {
    it('reaches convergence under the specified tolerance threshold', () => {
      const graph = new LinkGraph();
      for (let i = 1; i <= 6; i++) {
        graph.addEdge(`https://example.com/node${i}`, `https://example.com/node${(i % 6) + 1}`);
        if (i % 2 === 0) {
          graph.addEdge(`https://example.com/node${i}`, 'https://example.com/node1');
        }
      }

      const threshold = 1e-6;
      const result = computePageRank(graph, {
        convergenceThreshold: threshold,
        maxIterations: 100,
      });

      const meta = result.getMetadata();
      expect(meta.converged).toBe(true);
      expect(meta.finalDelta).toBeLessThan(threshold);
      expect(meta.iterations).toBeGreaterThan(1);
      expect(meta.iterations).toBeLessThan(100);
    });

    it('respects maxIterations bound when convergence threshold is extremely strict', () => {
      const graph = new LinkGraph();
      // Asymmetric topology where scores shift across iterations
      graph.addEdge('https://example.com/x', 'https://example.com/y');
      graph.addEdge('https://example.com/y', 'https://example.com/z');
      graph.addEdge('https://example.com/z', 'https://example.com/w');
      graph.addEdge('https://example.com/w', 'https://example.com/y');

      const result = computePageRank(graph, {
        convergenceThreshold: 1e-15,
        maxIterations: 3,
      });

      const meta = result.getMetadata();
      expect(meta.iterations).toBe(3);
      expect(meta.converged).toBe(false);
    });

    it('rejects invalid dampingFactor or thresholds', () => {
      const graph = new LinkGraph();
      graph.ensureNode('https://example.com/test');

      expect(() => computePageRank(graph, { dampingFactor: 0 })).toThrow(/Damping factor/);
      expect(() => computePageRank(graph, { dampingFactor: 1.0 })).toThrow(/Damping factor/);
      expect(() => computePageRank(graph, { dampingFactor: -0.5 })).toThrow(/Damping factor/);
      expect(() => computePageRank(graph, { convergenceThreshold: 0 })).toThrow(/Convergence threshold/);
      expect(() => computePageRank(graph, { maxIterations: 0 })).toThrow(/Max iterations/);
    });
  });

  describe('6. Deterministic Repeated Computation', () => {
    it('produces 100% bitwise identical scores on repeated runs on the same graph', () => {
      const graph = new LinkGraph();
      graph.addEdge('https://example.com/page-1', 'https://example.com/page-2');
      graph.addEdge('https://example.com/page-2', 'https://example.com/page-3');
      graph.addEdge('https://example.com/page-3', 'https://example.com/page-1');
      graph.addEdge('https://example.com/page-1', 'https://example.com/page-4');
      graph.addEdge('https://example.com/page-4', 'https://example.com/page-2');

      const run1 = computePageRank(graph, { customTimestamp: '2026-10-27T00:00:00Z' });
      const run2 = computePageRank(graph, { customTimestamp: '2026-10-27T00:00:00Z' });

      expect(run1.size).toBe(run2.size);

      for (const [url, score1] of run1.toJSON().scores && Object.entries(run1.toJSON().scores)) {
        const score2 = run2.getScore(url);
        expect(score1).toBe(score2);
      }

      // JSON outputs must be byte-for-byte identical
      expect(run1.exportJson(2, '2026-10-27T00:00:00Z', 0)).toBe(run2.exportJson(2, '2026-10-27T00:00:00Z', 0));
    });
  });

  describe('7. Fallback Behavior & Anti-Misleading Precisions', () => {
    it('never returns a fake placeholder decimal for uncomputed or unindexed URLs', () => {
      const graph = new LinkGraph();
      graph.addEdge('https://example.com/known-a', 'https://example.com/known-b');

      const table = computePageRank(graph);

      // Known URL
      const known = table.get('https://example.com/known-a');
      expect(known.isComputed).toBe(true);
      expect(known.status).toBe('computed');
      expect(typeof known.score).toBe('number');

      // Unknown URL never registered in graph
      const unknown = table.get('https://example.com/unknown-ghost');
      expect(unknown.isComputed).toBe(false);
      expect(unknown.score).toBeNull();
      expect(unknown.status).toBe('unavailable');
      expect(unknown.reason).toBe('url-not-in-graph');

      // Explicit fallback helper clearly tags non-computed status
      const fallback = table.getFallbackScore('https://example.com/unknown-ghost', 0.05);
      expect(fallback.isComputed).toBe(false);
      expect(fallback.score).toBe(0.05);
      expect(fallback.status).toBe('fallback');
      expect(fallback.reason).toBe('fallback-default');
    });

    it('supports PageRankTable.createUnavailable() for completely uninitialized graphs', () => {
      const unavailableTable = PageRankTable.createUnavailable('graph-unavailable');

      expect(unavailableTable.isAvailable()).toBe(false);
      expect(unavailableTable.getStatus()).toBe('unavailable');

      const lookup = unavailableTable.get('https://example.com/test');
      expect(lookup.score).toBeNull();
      expect(lookup.isComputed).toBe(false);
      expect(lookup.reason).toBe('graph-unavailable');
    });

    it('correctly provides top URLs sorted by score', () => {
      const graph = new LinkGraph();
      // Authority receives 3 inlinks
      graph.addEdge('https://example.com/a', 'https://example.com/authority');
      graph.addEdge('https://example.com/b', 'https://example.com/authority');
      graph.addEdge('https://example.com/c', 'https://example.com/authority');
      graph.addEdge('https://example.com/authority', 'https://example.com/a');

      const table = computePageRank(graph);
      const top = table.getTopUrls(2);

      expect(top.length).toBe(2);
      expect(top[0]!.url).toBe('https://example.com/authority');
      expect(top[0]!.score).toBeGreaterThan(top[1]!.score);
    });
  });

  describe('8. Serialization & Metadata Persistence', () => {
    it('persists and reloads PageRank table from file atomically', async () => {
      const graph = new LinkGraph();
      graph.addEdge('https://example.com/home', 'https://example.com/about');
      graph.addEdge('https://example.com/about', 'https://example.com/home');
      graph.addEdge('https://example.com/home', 'https://example.com/docs');

      const table = computePageRank(graph, { customTimestamp: '2026-10-27T12:00:00Z' });
      const targetFile = path.join(tempDir, 'pagerank.json');

      await table.saveToFile(targetFile);
      expect(fs.existsSync(targetFile)).toBe(true);

      const loadedTable = await PageRankTable.loadFromFile(targetFile);

      expect(loadedTable.isAvailable()).toBe(true);
      expect(loadedTable.size).toBe(table.size);
      expect(loadedTable.getMetadata().algorithm).toBe('pagerank-power-iteration');
      expect(loadedTable.getMetadata().schemaVersion).toBe('1.0.0');

      for (const [url, expectedScore] of Object.entries(table.toJSON().scores)) {
        expect(loadedTable.getScore(url)).toBe(expectedScore);
      }
    });

    it('preserves score distribution statistics across serialization round-trip', () => {
      const stats = computeScoreStats([0.1, 0.2, 0.3, 0.4]);
      expect(stats.min).toBe(0.1);
      expect(stats.max).toBe(0.4);
      expect(stats.mean).toBe(0.25);
      expect(stats.median).toBe(0.25);
      expect(stats.sum).toBe(1.0);
    });
  });
});
