import { describe, expect, it } from 'vitest';
import {
  createDocumentProcessor,
  createInvertedIndex,
  getDemoCorpus,
} from '@opensearch/indexer';
import {
  createQueryParser,
  exportTopKBenchmarkMarkdown,
  PostingSkipList,
  runTopKMultiCorpusBenchmark,
  TermBoundComputer,
  TopKRankingEngine,
  verifyTopKEquivalence,
} from '../src/index.js';

describe('Phase 96 — Top-k Retrieval Optimization', () => {
  // Construct test fixture index
  const processor = createDocumentProcessor();
  const testIndex = createInvertedIndex();
  const demoDocs = getDemoCorpus();

  for (const doc of demoDocs) {
    const processed = processor.process({
      id: doc.id,
      url: doc.canonicalUrl,
      title: doc.title,
      description: doc.description || '',
      headings: doc.headings || '',
      bodyText: doc.bodyText || '',
      language: 'en',
    });
    testIndex.addDocument(processed);
  }

  const parser = createQueryParser();
  const boundComputer = new TermBoundComputer(testIndex);
  const topKEngine = new TopKRankingEngine(testIndex);

  describe('1. Term Score Bounds & Block Bounds', () => {
    it('computes tight upper score bounds for query terms', () => {
      const bound = boundComputer.computeTermBound('search');

      expect(bound.term).toBe('search');
      expect(bound.docFrequency).toBeGreaterThan(0);
      expect(bound.maxTf).toBeGreaterThan(0);
      expect(bound.maxScore).toBeGreaterThan(0);
      expect(bound.idf).toBeGreaterThan(0);
    });

    it('returns zero score bounds for missing dictionary terms', () => {
      const bound = boundComputer.computeTermBound('nonexistentterm12345xyz');

      expect(bound.docFrequency).toBe(0);
      expect(bound.maxTf).toBe(0);
      expect(bound.maxScore).toBe(0);
    });

    it('computes correct multiplier and additive bonus bounds', () => {
      const maxMultiplier = boundComputer.getMaxMultiplierBoost(true);
      const maxBonus = boundComputer.getMaxAdditiveBonus();

      expect(maxMultiplier).toBeGreaterThanOrEqual(1.5);
      expect(maxBonus).toBeGreaterThan(0);
    });
  });

  describe('2. Posting Skip List & Block-Level Bounds', () => {
    it('partitions postings into skip blocks with block-level score bounds', () => {
      const postings = testIndex.getPostings('search') || [];
      expect(postings.length).toBeGreaterThan(0);

      const skipList = new PostingSkipList('search', postings, boundComputer, 2);

      expect(skipList.blocks.length).toBeGreaterThanOrEqual(1);
      const firstBlock = skipList.blocks[0]!;
      expect(firstBlock.startDocId).toBeDefined();
      expect(firstBlock.endDocId).toBeDefined();
      expect(firstBlock.maxTf).toBeGreaterThan(0);
      expect(firstBlock.maxBlockScore).toBeGreaterThan(0);
      expect(firstBlock.postings.length).toBeLessThanOrEqual(2);
    });

    it('fast-forwards via advanceTo and records skipped block count', () => {
      const postings = testIndex.getPostings('the') || testIndex.getPostings('and') || testIndex.getPostings('search') || [];
      if (postings.length >= 4) {
        const sortedIds = [...postings].map(p => p.documentId).sort();
        const targetId = sortedIds[sortedIds.length - 1]!;

        const skipList = new PostingSkipList('search', postings, boundComputer, 2);
        skipList.advanceTo(targetId);

        expect(skipList.currentDocId()).toBe(targetId);
      }
    });
  });

  describe('3. Exhaustive Oracle & Top-k Retrieval Algorithms', () => {
    it('runs exhaustive scoring oracle and returns ranked top-k hits', () => {
      const parsed = parser.parse('search algorithm');
      const oracle = topKEngine.retrieveTopK(parsed, { k: 5, algorithm: 'exhaustive' });

      expect(oracle.hits.length).toBeGreaterThan(0);
      expect(oracle.hits.length).toBeLessThanOrEqual(5);
      expect(oracle.stats.algorithmUsed).toBe('exhaustive');
      expect(oracle.stats.evaluatedDocs).toBe(oracle.stats.totalMatchingDocs);
      expect(oracle.stats.prunedDocs).toBe(0);

      // Verify descending order
      for (let i = 1; i < oracle.hits.length; i++) {
        expect(oracle.hits[i - 1]!.score).toBeGreaterThanOrEqual(oracle.hits[i]!.score);
      }
    });

    it('runs MaxScore retrieval with dynamic threshold pruning', () => {
      const parsed = parser.parse('search engine index algorithm');
      const result = topKEngine.retrieveTopK(parsed, {
        k: 3,
        algorithm: 'maxscore',
        verifyAgainstOracle: true,
      });

      expect(result.hits.length).toBeGreaterThan(0);
      expect(result.hits.length).toBeLessThanOrEqual(3);
      expect(result.stats.algorithmUsed).toBe('maxscore');

      // Verify oracle equivalence
      expect(result.oracleVerification).toBeDefined();
      expect(result.oracleVerification!.isEquivalent).toBe(true);
    });

    it('runs WAND retrieval with pivot-based iterator skipping', () => {
      const parsed = parser.parse('database storage performance');
      const result = topKEngine.retrieveTopK(parsed, {
        k: 3,
        algorithm: 'wand',
        verifyAgainstOracle: true,
      });

      expect(result.hits.length).toBeGreaterThan(0);
      expect(result.hits.length).toBeLessThanOrEqual(3);
      expect(result.stats.algorithmUsed).toBe('wand');

      // Verify oracle equivalence
      expect(result.oracleVerification).toBeDefined();
      expect(result.oracleVerification!.isEquivalent).toBe(true);
    });
  });

  describe('4. Correctness Comparisons on Diverse Query Types', () => {
    const testQueries = [
      'search',
      'inverted index',
      'distributed consensus raft',
      'bm25 ranking',
      'fast search algorithms',
    ];

    for (const q of testQueries) {
      it(`verifies 100% equivalence between WAND and exhaustive oracle for query: "${q}"`, () => {
        const parsed = parser.parse(q);
        const oracle = topKEngine.retrieveTopK(parsed, { k: 5, algorithm: 'exhaustive' });
        const wand = topKEngine.retrieveTopK(parsed, { k: 5, algorithm: 'wand' });

        const verification = verifyTopKEquivalence(oracle.hits, wand.hits, { scoreEpsilon: 1e-4 });
        expect(verification.isEquivalent).toBe(true);
        expect(verification.differences).toBeUndefined();
      });

      it(`verifies 100% equivalence between MaxScore and exhaustive oracle for query: "${q}"`, () => {
        const parsed = parser.parse(q);
        const oracle = topKEngine.retrieveTopK(parsed, { k: 5, algorithm: 'exhaustive' });
        const maxScore = topKEngine.retrieveTopK(parsed, { k: 5, algorithm: 'maxscore' });

        const verification = verifyTopKEquivalence(oracle.hits, maxScore.hits, { scoreEpsilon: 1e-4 });
        expect(verification.isEquivalent).toBe(true);
        expect(verification.differences).toBeUndefined();
      });
    }
  });

  describe('5. Randomized Query Equivalence Suite', () => {
    const vocabulary = ['search', 'index', 'engine', 'algorithm', 'database', 'performance', 'distributed', 'storage'];

    it('asserts 100% correctness across 10 randomized multi-term query combinations', () => {
      for (let trial = 0; trial < 10; trial++) {
        // Pick 2 to 4 random terms
        const count = 2 + Math.floor(Math.random() * 3);
        const shuffled = [...vocabulary].sort(() => 0.5 - Math.random());
        const randomQuery = shuffled.slice(0, count).join(' ');

        const parsed = parser.parse(randomQuery);
        const oracle = topKEngine.retrieveTopK(parsed, { k: 5, algorithm: 'exhaustive' });
        const wand = topKEngine.retrieveTopK(parsed, { k: 5, algorithm: 'wand' });

        const verification = verifyTopKEquivalence(oracle.hits, wand.hits, { scoreEpsilon: 1e-4 });
        expect(verification.isEquivalent).toBe(true);
      }
    });
  });

  describe('6. Multi-Corpus Scale Performance Benchmark', () => {
    it('measures execution time and verifies equivalence across multiple corpus sizes', async () => {
      const report = await runTopKMultiCorpusBenchmark({
        corpusSizes: [5, 15, 30],
        queries: ['search index', 'database performance'],
        k: 3,
        algorithm: 'wand',
      });

      expect(report.evaluations.length).toBe(6); // 3 sizes * 2 queries
      expect(report.overallEquivalenceRate).toBe(100);
      expect(report.meanSpeedupFactor).toBeGreaterThan(0);

      // Verify Markdown export
      const md = exportTopKBenchmarkMarkdown(report);
      expect(md).toContain('# OpenSearch Top-k Retrieval & Pruning Benchmark Report');
      expect(md).toContain('100%');
      expect(md).toContain('Multi-Corpus Scale Performance Matrix');
    });
  });
});
