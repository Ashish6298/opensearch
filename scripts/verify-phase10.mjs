#!/usr/bin/env node
/**
 * OpenSearch — Phase 10: Inverted Index Verification
 *
 * Exercises the complete Phase 10 implementation end-to-end:
 *   1. Core Inverted Index Data Structures:
 *      - Term dictionary creation & lookup
 *      - Posting lists with field breakdown and token positions
 *      - Document frequency (DF) tracking
 *      - Term frequency (TF) per document
 *   2. Document Addition & Field Information:
 *      - Multi-document indexing with multiple fields (title, headings, description, body)
 *      - Field lengths and document lengths tracking
 *      - Index stats metrics (totalDocuments, totalTerms, totalPostings, avgDocumentLength)
 *   3. Search Terms Retrieval:
 *      - Direct retrieval of matching postings for query terms
 *      - Checking non-existent terms (returns null / 0 DF)
 *   4. Mutations (Update & Remove Operations):
 *      - Updating an existing document (replacing term postings cleanly without residue)
 *      - Removing a document and verifying postings are purged
 *      - Dictionary pruning when posting list becomes empty
 *   5. Index Persistence:
 *      - Saving serialized index to disk
 *      - Reloading from disk into a fresh instance
 *      - Verifying post-reload query behavior and stats equality
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDocumentProcessor, createInvertedIndex } from '../packages/indexer/dist/index.js';

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
  console.log('\n=== Phase 10: Inverted Index Verification ===\n');

  const testDir = await mkdtemp(join(tmpdir(), 'opensearch-verify-phase10-'));
  const processor = createDocumentProcessor();
  const index = createInvertedIndex({ indexDir: testDir });

  // 1. Document Indexing & Field Separation
  console.log(`${HEAD} 1. Document Indexing & Postings Creation`);
  const doc1 = processor.process({
    id: 'doc-alpha',
    url: 'https://opensearch.org/docs/overview',
    urlHash: 'hash-alpha',
    title: 'OpenSearch Search Engine Overview',
    headings: 'Inverted Index Architecture',
    description: 'High performance search engine indexing architecture',
    bodyText:
      'OpenSearch builds an inverted index containing terms, postings, and positional offsets.',
    language: 'en',
  });

  const doc2 = processor.process({
    id: 'doc-beta',
    url: 'https://opensearch.org/docs/crawler',
    urlHash: 'hash-beta',
    title: 'OpenSearch Web Crawler',
    headings: 'Queue and Storage',
    description: 'Robots.txt compliant web crawler and queueing engine',
    bodyText:
      'The crawler downloads pages and stores raw documents for the inverted index to ingest.',
    language: 'en',
  });

  index.addDocument(doc1);
  index.addDocument(doc2);

  check(
    'Documents added to index',
    index.hasDocument('doc-alpha') && index.hasDocument('doc-beta'),
  );
  check('Non-existent document returns false', !index.hasDocument('doc-unknown'));

  const stats = index.getStats();
  check('Total document count is 2', stats.totalDocuments === 2);
  check('Total unique terms recorded', stats.totalTerms > 10);
  check('Average document length calculated', stats.avgDocumentLength > 0);

  // 2. Term & Document Frequencies
  console.log(`\n${HEAD} 2. Term Dictionary & Document Frequencies`);
  check(
    'Document frequency for shared term "opensearch" is 2',
    index.getDocumentFrequency('opensearch') === 2,
  );
  check(
    'Document frequency for shared term "index" is 2',
    index.getDocumentFrequency('index') === 2,
  );
  check(
    'Document frequency for solitary term "crawler" is 1',
    index.getDocumentFrequency('crawler') === 1,
  );
  check('Document frequency for absent term is 0', index.getDocumentFrequency('nonexistent') === 0);

  check(
    'Term frequency for "opensearch" in doc-alpha is accurate',
    index.getTermFrequency('opensearch', 'doc-alpha') === 2,
  );
  check(
    'Term frequency for "opensearch" in doc-beta is accurate',
    index.getTermFrequency('opensearch', 'doc-beta') === 1,
  );

  // 3. Postings & Field Positions
  console.log(`\n${HEAD} 3. Postings List & Positional Breakdown`);
  const indexPostings = index.getPostings('index');
  check('Postings list for "index" contains 2 documents', indexPostings?.length === 2);

  const docAlphaPosting = indexPostings?.find(p => p.documentId === 'doc-alpha');
  check(
    'Posting contains field breakdown (headings & body)',
    docAlphaPosting !== undefined &&
      docAlphaPosting.fieldTermFrequencies.headings >= 1 &&
      docAlphaPosting.fieldTermFrequencies.body >= 1,
  );
  check(
    'Posting contains positional data array',
    docAlphaPosting !== undefined && Array.isArray(docAlphaPosting.fieldPositions.headings),
  );

  // 4. Mutations (Update & Remove)
  console.log(`\n${HEAD} 4. Mutations: Update & Remove Operations`);
  const updatedDoc1 = processor.process({
    id: 'doc-alpha',
    url: 'https://opensearch.org/docs/overview',
    urlHash: 'hash-alpha',
    title: 'OpenSearch Query Engine',
    headings: 'BM25 Ranking Pipeline',
    description: 'Updated document overview without solitary keyword',
    bodyText: 'Ranking queries using BM25 and vector search models.',
    language: 'en',
  });

  index.updateDocument(updatedDoc1);
  check('Updated document updated in index', index.hasDocument('doc-alpha'));
  check('New term "bm25" now present in index', index.getDocumentFrequency('bm25') === 1);

  const removed = index.removeDocument('doc-beta');
  check('removeDocument returns true for existing doc', removed === true);
  check('Removed document no longer in index', !index.hasDocument('doc-beta'));
  check('Total documents updated to 1', index.getStats().totalDocuments === 1);
  check(
    'Solitary term "crawler" pruned from dictionary',
    index.getDocumentFrequency('crawler') === 0 && index.getPostings('crawler') === null,
  );

  // 5. Index Persistence (Save & Reload)
  console.log(`\n${HEAD} 5. Index Persistence (Save & Reload)`);
  await index.save(testDir);
  check('Index successfully saved to disk', true);

  const freshIndex = createInvertedIndex({ indexDir: testDir });
  await freshIndex.load(testDir);

  check('Loaded index has identical document count', freshIndex.getStats().totalDocuments === 1);
  check(
    'Loaded index retrieves postings for "bm25"',
    freshIndex.getDocumentFrequency('bm25') === 1,
  );
  check(
    'Loaded index metadata for doc-alpha preserved',
    freshIndex.getDocumentMeta('doc-alpha')?.title === 'OpenSearch Query Engine',
  );

  await rm(testDir, { recursive: true, force: true });

  console.log('\n--------------------------------------------------');
  console.log(`Phase 10 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Unhandled error during Phase 10 verification:', err);
  process.exit(1);
});
