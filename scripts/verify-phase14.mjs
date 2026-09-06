#!/usr/bin/env node
/**
 * OpenSearch — Phase 14: Ranking Engine Verification
 *
 * Exercises the complete Phase 14 relevance-ranking engine end-to-end:
 *   1. BM25 Lexical Scoring:
 *      - Calculation of IDF across corpus documents
 *      - TF saturation and document length normalization
 *   2. Title & Structural Field Boosting:
 *      - High salience matches in title/headings score significantly higher than body-only matches
 *   3. Exact Quoted Phrase Boosting:
 *      - Quoted phrases that match positional word sequences receive boost multiplier
 *   4. URL & Domain Signal:
 *      - URL path slug matches add additive bonus score
 *   5. Near-Duplicate & Domain Clustering Penalty:
 *      - Multiple results from same host or with duplicate title prefixes receive dampening penalty
 *   6. Ranking Stability & Determinism:
 *      - Repeated runs on identical queries yield strictly deterministic scores and rankings
 *   7. Explainability & Diagnostics:
 *      - Full ScoreExplanation breakdown with term breakdowns and field sums
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDocumentProcessor, createInvertedIndex } from '../packages/indexer/dist/index.js';
import {
  createQueryParser,
  createCandidateRetriever,
  createRankingEngine,
} from '../packages/ranking/dist/index.js';

const PASS = '\u001b[32m✓\u001b[0m';
const FAIL = '\u001b[31m✗\u001b[0m';
const HEAD = '\u001b[36m►\u001b[0m';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

async function runVerification() {
  console.log('\n=== Phase 14: Ranking Engine Verification ===\n');

  const testDir = await mkdtemp(join(tmpdir(), 'opensearch-verify-phase14-'));
  const index = createInvertedIndex({ indexDir: testDir });
  const processor = createDocumentProcessor();
  const parser = createQueryParser();
  const retriever = createCandidateRetriever(index);
  const rankingEngine = createRankingEngine(index);

  // Ingest varied test corpus
  // Doc A: Perfect match on title + url
  index.addDocument(
    processor.process({
      id: 'doc-search-core',
      url: 'https://opensearch.dev/search-ranking',
      title: 'Search Ranking Engine Architecture',
      headings: 'BM25 Scoring and Relevance Optimization',
      description: 'Design of the deterministic ranking engine.',
      bodyText:
        'The search ranking engine uses BM25 lexical scoring, field boosting, and freshness signals.',
      language: 'en',
    }),
  );

  // Doc B: Body-only match
  index.addDocument(
    processor.process({
      id: 'doc-general-storage',
      url: 'https://opensearch.dev/storage-guide',
      title: 'Storage and Persistence Subsystem',
      headings: 'Disk Structures and Repositories',
      description: 'Document and URL repositories in OpenSearch.',
      bodyText:
        'Storage engine persists files to disk. A separate ranking module scores documents when search is invoked.',
      language: 'en',
    }),
  );

  // Doc C: Exact phrase in body
  index.addDocument(
    processor.process({
      id: 'doc-phrase-master',
      url: 'https://opensearch.dev/algorithms',
      title: 'Information Retrieval Algorithms',
      headings: 'Lexical vs Vector Models',
      description: 'Overview of modern retrieval systems.',
      bodyText:
        'In our architecture we implement relevance optimization for all queries. Relevance optimization produces the cleanest ranks.',
      language: 'en',
    }),
  );

  // Doc D: Duplicate title/host of Doc A
  index.addDocument(
    processor.process({
      id: 'doc-search-copy',
      url: 'https://opensearch.dev/search-ranking-mirror',
      title: 'Search Ranking Engine Architecture Copy',
      headings: 'BM25 Scoring Mirror',
      description: 'Mirror copy of the ranking engine guide.',
      bodyText: 'Duplicate copy of search ranking engine text.',
      language: 'en',
    }),
  );

  // 1. BM25 Lexical Relevance & Title Boost
  console.log(`${HEAD} 1. BM25 Lexical Relevance & Title Boost`);
  const qSearch = parser.parse('search ranking');
  const retSearch = retriever.retrieve(qSearch);
  const rankSearch = rankingEngine.rank(qSearch, retSearch.candidates);

  check('Candidates ranked successfully', rankSearch.hits.length >= 2);
  check(
    'Doc with title match (doc-search-core) ranks #1',
    rankSearch.hits[0]?.documentId === 'doc-search-core',
  );
  check('Top rank is assigned rank = 1', rankSearch.hits[0]?.rank === 1);
  check(
    'Title match score is higher than body-only match',
    (rankSearch.hits[0]?.score ?? 0) >
      (rankSearch.hits.find(h => h.documentId === 'doc-general-storage')?.score ?? 0),
  );

  // 2. Exact Quoted Phrase Boosting
  console.log(`\n${HEAD} 2. Exact Quoted Phrase Boosting`);
  const qPhrase = parser.parse('"relevance optimization"');
  const retPhrase = retriever.retrieve(qPhrase);
  const rankPhrase = rankingEngine.rank(qPhrase, retPhrase.candidates);

  const phraseDoc = rankPhrase.hits.find(h => h.documentId === 'doc-phrase-master');
  check('Phrase matching document found in results', phraseDoc !== undefined);
  check('Phrase multiplier boost applied (1.5x)', phraseDoc?.explanation?.phraseMultiplier === 1.5);

  // 3. URL & Domain Signal Bonus
  console.log(`\n${HEAD} 3. URL / Domain Match Signal`);
  const urlBonusHit = rankSearch.hits.find(h => h.documentId === 'doc-search-core');
  check(
    'URL slug match yields positive bonus score',
    (urlBonusHit?.explanation?.urlBonus ?? 0) > 0,
  );

  // 4. Duplicate Penalty & Domain Clustering
  console.log(`\n${HEAD} 4. Near-Duplicate & Domain Clustering Penalty`);
  const dupDoc = rankSearch.hits.find(h => h.documentId === 'doc-search-copy');
  check(
    'Duplicate / secondary same-host doc penalized',
    (dupDoc?.explanation?.duplicatePenalty ?? 1.0) < 1.0,
  );
  check(
    'Primary doc received no duplicate penalty (1.0)',
    urlBonusHit?.explanation?.duplicatePenalty === 1.0,
  );

  // 5. Stability & Determinism
  console.log(`\n${HEAD} 5. Ranking Stability & Determinism`);
  const run1 = rankingEngine.rank(qSearch, retSearch.candidates);
  const run2 = rankingEngine.rank(qSearch, retSearch.candidates);
  const identicalScores = run1.hits.every((hit, idx) => hit.score === run2.hits[idx]?.score);
  const identicalOrder = run1.hits.every(
    (hit, idx) => hit.documentId === run2.hits[idx]?.documentId,
  );
  check('Repeated rankings produce identical scores', identicalScores);
  check('Repeated rankings produce identical document ordering', identicalOrder);

  // 6. Detailed Score Explanations
  console.log(`\n${HEAD} 6. Explainability & Diagnostics`);
  const topExplanation = rankSearch.hits[0]?.explanation;
  check('Explanation includes BM25 score', (topExplanation?.bm25Score ?? 0) > 0);
  check('Explanation includes term breakdowns', (topExplanation?.termBreakdowns.length ?? 0) > 0);
  check(
    'Explanation includes field score sums',
    topExplanation?.fieldScoreSums['title'] !== undefined,
  );
  check(
    'Final score in explanation matches hit score',
    topExplanation?.finalScore === rankSearch.hits[0]?.score,
  );

  // 7. Edge Cases & Resilience
  console.log(`\n${HEAD} 7. Edge Cases & Resilience`);
  const emptyRes = rankingEngine.rank(parser.parse(''), []);
  check('Empty candidate list returns empty hits safely', emptyRes.hits.length === 0);
  check(
    'Empty candidate stats reported safely',
    emptyRes.stats.totalCandidates === 0 && emptyRes.stats.rankedCount === 0,
  );

  const topKRes = rankingEngine.rank(qSearch, retSearch.candidates, { topK: 1 });
  check('TopK option limits number of results returned', topKRes.hits.length === 1);

  await rm(testDir, { recursive: true, force: true });

  console.log('\n--------------------------------------------------');
  console.log(`Phase 14 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Unhandled error during Phase 14 verification:', err);
  process.exit(1);
});
