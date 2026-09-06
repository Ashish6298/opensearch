#!/usr/bin/env node
/**
 * OpenSearch — Phase 13: Candidate Retrieval Verification
 *
 * Exercises the complete Phase 13 implementation end-to-end:
 *   1. Single Exact Term Lookup:
 *      - Posting list retrieval for known term
 *      - Accurate candidate document extraction with field breakdown & metadata
 *   2. Multi-Term Candidate Merging:
 *      - Merging candidates across multiple query terms
 *      - Calculation of matchedTerms, matchCount, and isFullMatch
 *   3. Boolean Combination Modes:
 *      - Intersection mode ('intersection'): Documents matching ALL searched terms
 *      - Union mode ('union'): Documents matching ANY searched term
 *      - Adaptive mode ('adaptive'): Auto-selection based on candidate yield
 *   4. Negation Term Exclusion:
 *      - Minus-prefixed (`-term`) and `NOT term` documents excluded from candidate set
 *   5. Quoted Exact Phrase Verification:
 *      - Verifies positional adjacent term sequences in candidate documents
 *   6. Edge Cases & Resilience:
 *      - Missing terms in index dictionary return safe empty result (0 candidates)
 *      - Empty parsed queries return safe empty result
 *      - Max candidates limit clamped correctly
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDocumentProcessor, createInvertedIndex } from '../packages/indexer/dist/index.js';
import { createQueryParser, createCandidateRetriever } from '../packages/ranking/dist/index.js';

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
  console.log('\n=== Phase 13: Candidate Retrieval Verification ===\n');

  const testDir = await mkdtemp(join(tmpdir(), 'opensearch-verify-phase13-'));
  const index = createInvertedIndex({ indexDir: testDir });
  const processor = createDocumentProcessor();
  const parser = createQueryParser();
  const retriever = createCandidateRetriever(index);

  // Ingest sample documents into the index
  index.addDocument(
    processor.process({
      id: 'doc-search',
      url: 'https://opensearch.dev/docs/search',
      title: 'OpenSearch Search Engine Pipeline',
      headings: 'BM25 Ranking and Inverted Index',
      description: 'Core retrieval and ranking algorithms for web search.',
      bodyText:
        'OpenSearch provides high throughput candidate retrieval and BM25 relevance scoring with document storage.',
    }),
  );

  index.addDocument(
    processor.process({
      id: 'doc-crawler',
      url: 'https://opensearch.dev/docs/crawler',
      title: 'Web Crawler and Fetcher Subsystem',
      headings: 'Robots.txt Policy and Rate Limiting',
      description: 'Polite autonomous crawler for web pages.',
      bodyText: 'The crawler queues URLs, obeys robots.txt directives, and fetches raw HTML.',
    }),
  );

  index.addDocument(
    processor.process({
      id: 'doc-storage',
      url: 'https://opensearch.dev/docs/storage',
      title: 'ACID Storage and Persistence Layer',
      headings: 'Document and URL Repositories',
      description: 'Embedded JSON storage with atomic updates and file locking.',
      bodyText: 'Storage repository persists crawled documents, metadata, and index versions.',
    }),
  );

  // 1. Single Exact Term Lookup
  console.log(`${HEAD} 1. Single Exact Term Lookup`);
  const qSingle = parser.parse('bm25');
  const resSingle = retriever.retrieve(qSingle);

  check('Single term query retrieves matching candidate', resSingle.candidates.length === 1);
  check(
    'Matched documentId matches expected document',
    resSingle.candidates[0]?.documentId === 'doc-search',
  );
  check('Matched terms list populated', resSingle.candidates[0]?.matchedTerms.includes('bm25'));
  check('Match count is 1', resSingle.candidates[0]?.matchCount === 1);
  check('isFullMatch is true for single term', resSingle.candidates[0]?.isFullMatch === true);
  check(
    'Document metadata populated in candidate',
    resSingle.candidates[0]?.documentMeta.title === 'OpenSearch Search Engine Pipeline',
  );

  // 2. Multi-Term Candidate Merging
  console.log(`\n${HEAD} 2. Multi-Term Candidate Merging`);
  const qMulti = parser.parse('crawler storage');
  const resMulti = retriever.retrieve(qMulti, { mode: 'union' });

  check(
    'Multi-term query retrieves candidates matching either term',
    resMulti.candidates.length >= 2,
  );
  const docCrawler = resMulti.candidates.find(c => c.documentId === 'doc-crawler');
  const docStorage = resMulti.candidates.find(c => c.documentId === 'doc-storage');
  check('doc-crawler retrieved for "crawler"', docCrawler !== undefined);
  check('doc-storage retrieved for "storage"', docStorage !== undefined);
  check('Postings attached to candidate object', docStorage?.termPostings.has('storage') === true);

  // 3. Boolean Combination Modes
  console.log(`\n${HEAD} 3. Boolean Combination Modes (Intersection, Union, Adaptive)`);
  const qBoth = parser.parse('opensearch storage');
  const resInter = retriever.retrieve(qBoth, { mode: 'intersection' });

  check(
    'Intersection mode retrieves only documents matching all query terms',
    resInter.candidates.length === 1,
  );
  check(
    'Intersection candidate is doc-search',
    resInter.candidates[0]?.documentId === 'doc-search',
  );
  check('Effective mode reported as intersection', resInter.stats.effectiveMode === 'intersection');

  const resUnion = retriever.retrieve(qBoth, { mode: 'union' });
  check('Union mode retrieves all documents matching any term', resUnion.candidates.length >= 2);
  check('Effective mode reported as union', resUnion.stats.effectiveMode === 'union');

  const resAdaptive = retriever.retrieve(qBoth, { mode: 'adaptive' });
  check('Adaptive mode executes without error', resAdaptive.candidates.length >= 1);

  // 4. Negation Term Exclusion
  console.log(`\n${HEAD} 4. Negation Term Exclusion (-term / NOT term)`);
  const qNeg = parser.parse('storage -persists');
  const resNeg = retriever.retrieve(qNeg);

  check(
    'doc-storage excluded because it contains "persists"',
    !resNeg.candidates.some(c => c.documentId === 'doc-storage'),
  );
  check(
    'doc-search retained because it lacks "persists"',
    resNeg.candidates.some(c => c.documentId === 'doc-search'),
  );

  // 5. Quoted Exact Phrase Verification
  console.log(`\n${HEAD} 5. Quoted Exact Phrase Verification`);
  const qPhrase = parser.parse('"relevance scoring"');
  const resPhrase = retriever.retrieve(qPhrase);

  check('Phrase query retrieves document', resPhrase.candidates.length >= 1);
  const phraseDoc = resPhrase.candidates.find(c => c.documentId === 'doc-search');
  check(
    'phraseMatches flag is true for exact positional sequence',
    phraseDoc?.phraseMatches === true,
  );

  // 6. Edge Cases & Resilience
  console.log(`\n${HEAD} 6. Edge Cases & Resilience`);
  const qMissing = parser.parse('nonexistenttermxyz unknownkeyword');
  const resMissing = retriever.retrieve(qMissing);

  check('Missing terms return 0 candidates safely', resMissing.candidates.length === 0);
  check('Missing terms tracked in retrieval stats', resMissing.stats.missingTerms.length === 2);

  const qEmpty = parser.parse('');
  const resEmpty = retriever.retrieve(qEmpty);
  check('Empty query returns 0 candidates safely', resEmpty.candidates.length === 0);

  const qLimit = parser.parse('storage');
  const resLimit = retriever.retrieve(qLimit, { maxCandidates: 1 });
  check('Candidate result count clamped to maxCandidates (1)', resLimit.candidates.length === 1);

  await rm(testDir, { recursive: true, force: true });

  console.log('\n--------------------------------------------------');
  console.log(`Phase 13 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Unhandled error during Phase 13 verification:', err);
  process.exit(1);
});
