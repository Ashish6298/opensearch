import { describe, it, expect, beforeEach } from 'vitest';
import { createDocumentProcessor, createInvertedIndex, InvertedIndex } from '@opensearch/indexer';
import { createQueryParser } from '../src/query/query-parser.js';
import { createCandidateRetriever } from '../src/retrieval/candidate-retriever.js';
import { createRankingEngine } from '../src/scorer/ranking-engine.js';
import { BM25Scorer } from '../src/scorer/bm25-scorer.js';

describe('Phase 14 — Ranking Engine & BM25 Scoring Suite', () => {
  let index: InvertedIndex;
  const processor = createDocumentProcessor();
  const parser = createQueryParser();

  beforeEach(() => {
    index = createInvertedIndex();

    // Populate test corpus
    // Doc 1: Title match on 'rust' and 'concurrency'
    index.addDocument(
      processor.process({
        id: 'doc-rust-title',
        url: 'https://rust-lang.org/concurrency-guide',
        title: 'Rust Concurrency and Multithreading Guide',
        headings: 'Fearless Concurrency Patterns',
        description: 'Guide to memory safe threads and async in Rust.',
        bodyText: 'This article explores basic parallelism concepts and channels.',
        language: 'en',
      }),
    );

    // Doc 2: Body only match for 'concurrency'
    index.addDocument(
      processor.process({
        id: 'doc-general-concurrency',
        url: 'https://cs.university.edu/os/processes',
        title: 'Operating Systems Principles',
        headings: 'Process Scheduling and Memory',
        description: 'Textbook chapters on system architecture.',
        bodyText:
          'Operating systems manage threads and concurrency across multiple CPU cores. Synchronization is key to prevent race conditions.',
        language: 'en',
      }),
    );

    // Doc 3: Highly relevant with exact phrase match
    index.addDocument(
      processor.process({
        id: 'doc-rust-phrase',
        url: 'https://blog.rustaceans.org/deep-dive',
        title: 'Memory Safety in Modern Systems',
        headings: 'Why Rust Rocks',
        description: 'A deep dive into systems programming.',
        bodyText:
          'We love fearless concurrency in production. Fearless concurrency guarantees zero data races at compile time.',
        language: 'en',
      }),
    );

    // Doc 4: Near duplicate on same domain with lower relevance
    index.addDocument(
      processor.process({
        id: 'doc-rust-dup1',
        url: 'https://rust-lang.org/mirror/threads-copy',
        title: 'Rust Concurrency and Multithreading Guide Mirror',
        headings: 'Fearless Patterns Mirror',
        description: 'Mirror copy of the guide.',
        bodyText: 'This article explores basic parallelism concepts and channels in duplicate.',
        language: 'en',
      }),
    );
  });

  describe('BM25Scorer', () => {
    it('computes non-negative smoothed IDF values', () => {
      const scorer = new BM25Scorer(index);
      const idfCommon = scorer.computeIdf(4, 3);
      const idfRare = scorer.computeIdf(4, 1);
      const idfZero = scorer.computeIdf(0, 0);

      expect(idfRare).toBeGreaterThan(idfCommon);
      expect(idfCommon).toBeGreaterThanOrEqual(0);
      expect(idfZero).toBe(0);
    });

    it('scores multi-field terms with title boost weighting', () => {
      const retriever = createCandidateRetriever(index);
      const query = parser.parse('rust');
      const retrieval = retriever.retrieve(query);

      const scorer = new BM25Scorer(index);
      const titleCandidate = retrieval.candidates.find(c => c.documentId === 'doc-rust-title')!;
      const phraseCandidate = retrieval.candidates.find(c => c.documentId === 'doc-rust-phrase')!;

      const titleScore = scorer.scoreCandidate(titleCandidate, ['rust']);
      const phraseScore = scorer.scoreCandidate(phraseCandidate, ['rust']);

      // Title match has 3.0x boost, so title score should be higher than body-only match
      expect(titleScore.bm25Score).toBeGreaterThan(phraseScore.bm25Score);
      expect(titleScore.fieldScoreSums['title']).toBeGreaterThan(0);
    });
  });

  describe('DefaultRankingEngine', () => {
    it('ranks documents deterministically with title matches dominating', () => {
      const retriever = createCandidateRetriever(index);
      const engine = createRankingEngine(index);

      const query = parser.parse('concurrency');
      const retrieval = retriever.retrieve(query);
      const result = engine.rank(query, retrieval.candidates);

      expect(result.hits.length).toBeGreaterThanOrEqual(3);
      // Doc with 'concurrency' in title should rank above body-only match
      expect(result.hits[0]?.documentId).toBe('doc-rust-title');
      expect(result.hits[0]?.rank).toBe(1);
      expect(result.hits[0]?.score).toBeGreaterThan(result.hits[1]?.score ?? 0);
    });

    it('boosts documents matching exact quoted phrases', () => {
      const retriever = createCandidateRetriever(index);
      const engine = createRankingEngine(index);

      const query = parser.parse('"fearless concurrency"');
      const retrieval = retriever.retrieve(query);
      const result = engine.rank(query, retrieval.candidates);

      // doc-rust-phrase has exact phrase match in body text
      const phraseHit = result.hits.find(h => h.documentId === 'doc-rust-phrase');
      expect(phraseHit).toBeDefined();
      expect(phraseHit?.explanation?.phraseMultiplier).toBe(1.5);
    });

    it('awards bonus score when query terms match the URL slug', () => {
      const retriever = createCandidateRetriever(index);
      const engine = createRankingEngine(index);

      const query = parser.parse('concurrency');
      const retrieval = retriever.retrieve(query);
      const result = engine.rank(query, retrieval.candidates);

      const urlMatchedHit = result.hits.find(h => h.documentId === 'doc-rust-title');
      expect(urlMatchedHit?.explanation?.urlBonus).toBeGreaterThan(0);
    });

    it('applies duplicate dampening penalty to secondary results from same domain', () => {
      const retriever = createCandidateRetriever(index);
      const engine = createRankingEngine(index);

      const query = parser.parse('concurrency');
      const retrieval = retriever.retrieve(query);
      const result = engine.rank(query, retrieval.candidates, { enableDuplicatePenalty: true });

      const primary = result.hits.find(h => h.documentId === 'doc-rust-title');
      const duplicate = result.hits.find(h => h.documentId === 'doc-rust-dup1');

      expect(primary?.explanation?.duplicatePenalty).toBe(1.0);
      expect(duplicate?.explanation?.duplicatePenalty).toBeLessThan(1.0);
    });

    it('provides comprehensive score explanations for explainability', () => {
      const retriever = createCandidateRetriever(index);
      const engine = createRankingEngine(index);

      const query = parser.parse('rust concurrency');
      const retrieval = retriever.retrieve(query);
      const result = engine.rank(query, retrieval.candidates, { explain: true });

      const topHit = result.hits[0];
      expect(topHit?.explanation).toBeDefined();
      expect(topHit?.explanation?.bm25Score).toBeGreaterThan(0);
      expect(topHit?.explanation?.termBreakdowns.length).toBeGreaterThan(0);
      expect(topHit?.explanation?.finalScore).toBe(topHit?.score);
    });

    it('handles empty candidate lists and empty queries gracefully', () => {
      const engine = createRankingEngine(index);
      const query = parser.parse('');
      const emptyResult = engine.rank(query, []);

      expect(emptyResult.hits).toEqual([]);
      expect(emptyResult.stats.totalCandidates).toBe(0);
      expect(emptyResult.stats.rankedCount).toBe(0);
      expect(emptyResult.stats.maxScore).toBe(0);
    });

    it('respects topK parameter limiting output candidates', () => {
      const retriever = createCandidateRetriever(index);
      const engine = createRankingEngine(index);

      const query = parser.parse('concurrency');
      const retrieval = retriever.retrieve(query, { mode: 'union' });
      const result = engine.rank(query, retrieval.candidates, { topK: 2 });

      expect(result.hits.length).toBe(2);
      expect(result.stats.rankedCount).toBe(2);
    });
  });
});
