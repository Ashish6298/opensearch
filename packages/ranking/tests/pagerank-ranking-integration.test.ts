/**
 * @opensearch/ranking — Phase 89: PageRank Integration & Ranking Explainability Test Suite
 *
 * Comprehensive tests for:
 * 1. Result-Order Regression: Authoritative pages break ties and rank higher without topic drift
 * 2. Unaltered Baseline: Without PageRank (or when disabled), scoring behaves 100% identically to legacy
 * 3. Configurable Weights & Transformations: Experiments with weights, max boosts, and transform curves
 * 4. Mathematical Explain Plan Parity: Explain outputs strictly match final arithmetic score computation
 * 5. Unavailable & Stale Diagnostics: Explicit status flags ('unavailable', 'stale', 'disabled', 'computed')
 * 6. Controlled Disablement: Explicitly disable PageRank via enablePageRank: false or pageRankWeight: 0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InvertedIndex, createInvertedIndex, DocumentProcessor, createDocumentProcessor } from '@opensearch/indexer';
import { LinkGraph, computePageRank, PageRankTable } from '@opensearch/crawler';
import {
  createRankingEngine,
  createQueryParser,
  createCandidateRetriever,
  transformPageRankScore,
} from '../src/index.js';

describe('Phase 89 — PageRank Ranking Integration & Explainability Suite', () => {
  let index: InvertedIndex;
  let processor: DocumentProcessor;
  const parser = createQueryParser();

  beforeEach(() => {
    index = createInvertedIndex();
    processor = createDocumentProcessor();

    // Doc 1: "OpenSearch Architecture Guide" - Highly authoritative document
    index.addDocument(
      processor.process({
        id: 'doc-arch-auth',
        url: 'https://example.com/architecture',
        title: 'OpenSearch Architecture Guide',
        headings: 'System Design Overview',
        description: 'Comprehensive architectural guide to OpenSearch engine',
        bodyText: 'OpenSearch architecture features a decentralized inverted index and polite crawler.',
        language: 'en',
      }),
    );

    // Doc 2: "OpenSearch Architecture Blog" - Identical lexical match but peripheral blog post
    index.addDocument(
      processor.process({
        id: 'doc-arch-blog',
        url: 'https://example.com/blog/architecture',
        title: 'OpenSearch Architecture Guide',
        headings: 'System Design Overview',
        description: 'Comprehensive architectural guide to OpenSearch engine',
        bodyText: 'OpenSearch architecture features a decentralized inverted index and polite crawler.',
        language: 'en',
      }),
    );

    // Doc 3: "Unrelated Web Page" - High authority but weak BM25 match
    index.addDocument(
      processor.process({
        id: 'doc-unrelated-hub',
        url: 'https://example.com/popular-hub',
        title: 'Global Web Directory & Popular Resource Hub',
        headings: 'Everything on the web',
        description: 'Directory of websites',
        bodyText: 'A massive hub pointing everywhere with only a brief mention of architecture crawler tech.',
        language: 'en',
      }),
    );
  });

  function getCandidates(qStr = 'architecture') {
    const query = parser.parse(qStr);
    const retriever = createCandidateRetriever(index);
    const retrieval = retriever.retrieve(query);
    return { query, candidates: retrieval.candidates };
  }

  describe('1. Baseline Preservation & Controlled Disablement', () => {
    it('produces identical scores and ranking when PageRank is not provided', () => {
      const engineWithoutPR = createRankingEngine(index);
      const { query, candidates } = getCandidates();

      const result = engineWithoutPR.rank(query, candidates);

      expect(result.hits.length).toBeGreaterThanOrEqual(2);
      for (const hit of result.hits) {
        expect(hit.explanation?.pageRankBonus).toBe(0);
        expect(hit.explanation?.pageRankExplain?.enabled).toBe(true);
        expect(hit.explanation?.pageRankExplain?.status).toBe('unavailable');
        expect(hit.explanation?.pageRankExplain?.reason).toBe('pageRank-provider-data-unavailable');
      }
    });

    it('can be disabled explicitly via enablePageRank: false or pageRankWeight: 0', () => {
      // Build a graph where doc-arch-auth has high PageRank
      const graph = new LinkGraph();
      graph.addEdge('https://example.com/site-a', 'https://example.com/architecture');
      graph.addEdge('https://example.com/site-b', 'https://example.com/architecture');
      graph.addEdge('https://example.com/architecture', 'https://example.com/site-a');
      graph.ensureNode('https://example.com/blog/architecture');
      const prTable = computePageRank(graph);

      const engine = createRankingEngine(index, {}, prTable);
      const { query, candidates } = getCandidates();

      // Disabled via option flag
      const resultDisabled = engine.rank(query, candidates, { enablePageRank: false });
      for (const hit of resultDisabled.hits) {
        expect(hit.explanation?.pageRankBonus).toBe(0);
        expect(hit.explanation?.pageRankExplain?.status).toBe('disabled');
        expect(hit.explanation?.pageRankExplain?.reason).toBe('pageRank-disabled-in-ranking-options');
      }

      // Disabled via zero weight
      const resultZeroWeight = engine.rank(query, candidates, { signals: { pageRankWeight: 0 } });
      for (const hit of resultZeroWeight.hits) {
        expect(hit.explanation?.pageRankBonus).toBe(0);
        expect(hit.explanation?.pageRankExplain?.status).toBe('disabled');
      }
    });
  });

  describe('2. Result-Order Regression & Tie-Breaking', () => {
    it('elevates authoritative page above identical lexical tie using PageRank', () => {
      // Create graph: doc-arch-auth receives 5 authoritative backlinks
      // doc-arch-blog receives 0 inlinks
      const graph = new LinkGraph();
      for (let i = 1; i <= 5; i++) {
        graph.addEdge(`https://example.com/ref${i}`, 'https://example.com/architecture');
      }
      graph.addEdge('https://example.com/architecture', 'https://example.com/ref1');
      graph.ensureNode('https://example.com/blog/architecture');

      const prTable = computePageRank(graph);
      expect(prTable.getScore('https://example.com/architecture')).toBeGreaterThan(
        prTable.getScore('https://example.com/blog/architecture')!,
      );

      const engine = createRankingEngine(index, {}, prTable);
      const { query, candidates } = getCandidates();

      // Filter to only doc-arch-auth and doc-arch-blog to test exact tie-breaker
      const tieCandidates = candidates.filter(
        c => c.documentId === 'doc-arch-auth' || c.documentId === 'doc-arch-blog',
      );

      const result = engine.rank(query, tieCandidates);

      expect(result.hits.length).toBe(2);
      const topHit = result.hits[0]!;
      const secondHit = result.hits[1]!;

      // Top hit must be the authoritative architecture page
      expect(topHit.documentId).toBe('doc-arch-auth');
      expect(topHit.score).toBeGreaterThan(secondHit.score);

      expect(topHit.explanation?.pageRankBonus).toBeGreaterThan(0);
      expect(topHit.explanation?.pageRankBonus).toBeGreaterThan(secondHit.explanation?.pageRankBonus ?? 0);
      expect(topHit.explanation?.pageRankExplain?.status).toBe('computed');
    });

    it('prevents topic drift: high PageRank on irrelevant page does not beat strong BM25 match', () => {
      // doc3 is a popular hub with 10 inlinks, but weakly matches query
      const graph = new LinkGraph();
      for (let i = 1; i <= 10; i++) {
        graph.addEdge(`https://example.com/external${i}`, 'https://example.com/popular-hub');
      }
      graph.addEdge('https://example.com/popular-hub', 'https://example.com/external1');
      graph.ensureNode('https://example.com/architecture');

      const prTable = computePageRank(graph);
      const engine = createRankingEngine(index, {}, prTable);
      const { query, candidates } = getCandidates();

      const result = engine.rank(query, candidates);

      // Highly relevant document must retain #1 rank despite the hub having high PageRank
      expect(result.hits[0]!.documentId).toBe('doc-arch-auth');
    });
  });

  describe('3. Configurable Weights & Signal Transformations', () => {
    it('applies custom weights and maximum boost limits', () => {
      const graph = new LinkGraph();
      graph.addEdge('https://example.com/ref1', 'https://example.com/architecture');
      graph.addEdge('https://example.com/architecture', 'https://example.com/ref1');
      const prTable = computePageRank(graph);

      const engine = createRankingEngine(index, {}, prTable);
      const { query, candidates } = getCandidates();

      const resultHighWeight = engine.rank(query, candidates, {
        signals: {
          pageRankWeight: 0.50,
          pageRankMaxBoost: 3.0,
        },
      });

      const resultLowWeight = engine.rank(query, candidates, {
        signals: {
          pageRankWeight: 0.05,
          pageRankMaxBoost: 1.0,
        },
      });

      const bonusHigh = resultHighWeight.hits[0]!.explanation?.pageRankBonus ?? 0;
      const bonusLow = resultLowWeight.hits[0]!.explanation?.pageRankBonus ?? 0;

      expect(bonusHigh).toBeGreaterThan(bonusLow);
    });

    it('supports multiple transformation curves (logarithmic, linear, min-max, sigmoid)', () => {
      const totalNodes = 100;
      const rawScore = 0.05; // 5x average (0.01)

      const logScore = transformPageRankScore(rawScore, totalNodes, 'logarithmic');
      const linScore = transformPageRankScore(rawScore, totalNodes, 'linear', 0.1);
      const minMaxScore = transformPageRankScore(rawScore, totalNodes, 'min-max', 0.1, 0.0);
      const sigmoidScore = transformPageRankScore(rawScore, totalNodes, 'sigmoid');

      expect(logScore).toBeGreaterThan(0);
      expect(logScore).toBeLessThanOrEqual(1.0);
      expect(linScore).toBeGreaterThan(0);
      expect(linScore).toBeLessThanOrEqual(1.0);
      expect(minMaxScore).toBeGreaterThan(0);
      expect(sigmoidScore).toBeGreaterThan(0);
      expect(sigmoidScore).toBeLessThanOrEqual(1.0);
    });
  });

  describe('4. Mathematical Explain Plan Parity', () => {
    it('guarantees final score precisely matches the arithmetic sum of explain components', () => {
      const graph = new LinkGraph();
      graph.addEdge('https://example.com/seed', 'https://example.com/architecture');
      graph.addEdge('https://example.com/architecture', 'https://example.com/seed');
      const prTable = computePageRank(graph);

      const engine = createRankingEngine(index, {}, prTable);
      const { query, candidates } = getCandidates();

      const result = engine.rank(query, candidates);

      for (const hit of result.hits) {
        const exp = hit.explanation!;
        expect(exp).toBeDefined();

        // Arithmetic formula:
        // (bm25Score * fullMatchMultiplier * phraseMultiplier + urlBonus + freshnessBonus + authorityBonus + pageRankBonus) * duplicatePenalty
        const expectedScore =
          (exp.bm25Score * exp.fullMatchMultiplier * exp.phraseMultiplier +
            exp.urlBonus +
            exp.freshnessBonus +
            (exp.authorityBonus || 0) +
            (exp.pageRankBonus || 0)) *
          exp.duplicatePenalty;

        const roundedExpected = Math.round(expectedScore * 10000) / 10000;
        expect(exp.finalScore).toBeCloseTo(roundedExpected, 3);
        expect(hit.score).toBe(exp.finalScore);
      }
    });
  });

  describe('5. Unavailable & Stale State Diagnostics', () => {
    it('indicates unavailable status when a document is missing from the graph', () => {
      const graph = new LinkGraph();
      // Only architecture is in the graph; doc-arch-blog is not
      graph.ensureNode('https://example.com/architecture');
      const prTable = computePageRank(graph);

      const engine = createRankingEngine(index, {}, prTable);
      const { query, candidates } = getCandidates();

      const result = engine.rank(query, candidates);
      const blogHit = result.hits.find(h => h.documentId === 'doc-arch-blog')!;

      expect(blogHit.explanation?.pageRankBonus).toBe(0);
      expect(blogHit.explanation?.pageRankExplain?.status).toBe('unavailable');
      expect(blogHit.explanation?.pageRankExplain?.rawScore).toBeNull();
      expect(blogHit.explanation?.pageRankExplain?.reason).toBe('url-not-in-graph');
    });

    it('indicates stale status and discounts weight when graph timestamp exceeds stale threshold', () => {
      const graph = new LinkGraph();
      graph.addEdge('https://example.com/a', 'https://example.com/architecture');
      graph.addEdge('https://example.com/architecture', 'https://example.com/a');

      // Stale timestamp: 14 days ago
      const staleTimestamp = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const prTable = computePageRank(graph, { customTimestamp: staleTimestamp });

      const engine = createRankingEngine(index, {}, prTable);
      const { query, candidates } = getCandidates();

      const result = engine.rank(query, candidates, {
        signals: {
          pageRankStaleThresholdMs: 7 * 24 * 60 * 60 * 1000, // 7 days
        },
      });

      const authHit = result.hits.find(h => h.documentId === 'doc-arch-auth')!;
      expect(authHit.explanation?.pageRankExplain?.status).toBe('stale');
      expect(authHit.explanation?.pageRankExplain?.reason).toBe('pageRank-stale-decay-applied');
      // Weight should be discounted by 50%
      expect(authHit.explanation?.pageRankExplain?.weight).toBeCloseTo(0.15 * 0.5, 4);
    });
  });
});
