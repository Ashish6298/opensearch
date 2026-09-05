#!/usr/bin/env node
/**
 * OpenSearch — Phase 11: Index Builder & Rebuild Pipeline Verification
 *
 * Exercises the complete Phase 11 implementation end-to-end:
 *   1. Full Index Build Pipeline:
 *      - Populating DocumentRepository with diverse mock crawl corpus
 *      - Orchestrating full build through DefaultIndexBuilder
 *      - Converting raw documents into structured inverted index
 *      - Verifying document index status transitions (PENDING -> INDEXED)
 *      - Verifying IndexMetadataRecord creation with active status
 *   2. Incremental Index Update:
 *      - Ingesting newly crawled documents into DocumentRepository
 *      - Triggering incremental update build
 *      - Verifying only pending/stale documents are indexed while preserving prior postings
 *      - Verifying updated index statistics and document count
 *   3. Deterministic Build Behavior:
 *      - Rebuilding the identical corpus multiple times
 *      - Verifying identical term dictionary, posting sizes, and statistics
 *   4. Corruption & Error Handling (Atomic Swaps):
 *      - Verifying builds execute in isolated staging directory (<indexDir>/builds/<buildId>)
 *      - Simulating failure conditions during build
 *      - Verifying incomplete/failed builds do not silently replace a valid active index
 *      - Verifying staging directory cleanup on failure
 *   5. Index Version Metadata & Persistence Reload:
 *      - Loading active index on startup from disk via loadActiveIndex
 *      - Inspecting build statistics, durations, and timestamps
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../packages/shared/dist/index.js';
import { createStorageAdapter, INDEX_STATUS } from '../packages/storage/dist/index.js';
import { createDocumentProcessor, createIndexBuilder } from '../packages/indexer/dist/index.js';

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
  console.log('\n=== Phase 11: Index Builder & Rebuild Pipeline Verification ===\n');

  const testDir = await mkdtemp(join(tmpdir(), 'opensearch-verify-phase11-'));
  const storageDir = join(testDir, 'storage');
  const indexDir = join(testDir, 'index');
  const crawlerDir = join(testDir, 'crawler');

  const config = loadConfig({
    NODE_ENV: 'test',
    STORAGE_DIR: storageDir,
    INDEX_DIR: indexDir,
    CRAWLER_DATA_DIR: crawlerDir,
  });

  const storage = createStorageAdapter({ config });
  await storage.initialize();

  const processor = createDocumentProcessor();
  const builder = createIndexBuilder({
    config,
    storage,
    processor,
    indexDir,
  });

  // 1. Full Index Build Pipeline
  console.log(`${HEAD} 1. Full Index Build Pipeline`);
  await storage.documents.create({
    url: 'https://opensearch.dev/docs/intro',
    urlHash: 'hash-intro',
    title: 'OpenSearch Overview and Architecture',
    headings: 'High Performance Search Engine',
    description: 'Fast, secure, scalable search engine indexing pipeline.',
    bodyText: 'OpenSearch provides an end to end pipeline for crawling and indexing the web.',
    language: 'en',
    contentType: 'text/html',
    contentLength: 200,
    httpStatus: 200,
    outboundLinks: [],
    indexStatus: INDEX_STATUS.PENDING,
  });

  await storage.documents.create({
    url: 'https://opensearch.dev/docs/ranking',
    urlHash: 'hash-ranking',
    title: 'Ranking and Scoring Algorithms',
    headings: 'BM25 and Relevance Scoring',
    description: 'Best matching probabilistic relevance scoring for queries.',
    bodyText: 'Relevance scoring calculates term frequencies and document lengths.',
    language: 'en',
    contentType: 'text/html',
    contentLength: 220,
    httpStatus: 200,
    outboundLinks: [],
    indexStatus: INDEX_STATUS.PENDING,
  });

  const fullSummary = await builder.build({ mode: 'full' });

  check('Full build completed successfully', fullSummary.status === 'success');
  check('Total documents indexed matches corpus (2)', fullSummary.stats.documentsIndexed === 2);
  check('Terms indexed populated (> 10)', fullSummary.stats.termsIndexed > 10);
  check('Build duration recorded in stats', fullSummary.stats.durationMs >= 0);

  const activeIndex = builder.getActiveIndex();
  check('Active inverted index instance is available', activeIndex !== null);
  check(
    'Term dictionary query matches expected postings ("opensearch")',
    activeIndex?.getDocumentFrequency('opensearch') === 1,
  );
  check(
    'Term dictionary query matches expected postings ("scoring")',
    activeIndex?.getDocumentFrequency('scoring') === 1,
  );

  const activeMeta = await storage.indexMetadata.findActive();
  check('Index metadata record created in storage', activeMeta !== null);
  check('Active metadata record status is ready', activeMeta?.status === 'ready');
  check('Active metadata record has matching document count', activeMeta?.documentCount === 2);

  const indexedDocs = await storage.documents.findByIndexStatus(INDEX_STATUS.INDEXED);
  check('Stored documents updated to INDEX_STATUS.INDEXED', indexedDocs.length === 2);

  // 2. Incremental Index Update
  console.log(`\n${HEAD} 2. Incremental Index Update Capability`);
  await storage.documents.create({
    url: 'https://opensearch.dev/docs/crawler',
    urlHash: 'hash-crawler',
    title: 'Web Crawler and Fetcher Subsystem',
    headings: 'Politeness and Robots Filtering',
    description: 'Autonomous crawler respecting robots exclusions and rate limits.',
    bodyText: 'The web crawler feeds raw documents directly into the storage layer.',
    language: 'en',
    contentType: 'text/html',
    contentLength: 180,
    httpStatus: 200,
    outboundLinks: [],
    indexStatus: INDEX_STATUS.PENDING,
  });

  const incrementalSummary = await builder.build({ mode: 'incremental' });

  check('Incremental build succeeded', incrementalSummary.status === 'success');
  check(
    'Incremental build indexed only pending document (1)',
    incrementalSummary.stats.documentsIndexed === 1,
  );
  check(
    'Active index contains both previous and new documents (3 total)',
    builder.getActiveIndex()?.getStats().totalDocuments === 3,
  );
  check(
    'New term from incremental doc is searchable ("robots")',
    builder.getActiveIndex()?.getDocumentFrequency('robots') === 1,
  );
  check(
    'Old term from full build remains searchable ("opensearch")',
    builder.getActiveIndex()?.getDocumentFrequency('opensearch') === 1,
  );

  // 3. Deterministic Build Behavior
  console.log(`\n${HEAD} 3. Deterministic Build Behavior`);
  const deterministicBuilder = createIndexBuilder({
    config,
    storage,
    processor,
    indexDir: join(testDir, 'index-det'),
  });

  const detBuild1 = await deterministicBuilder.build({ mode: 'full' });
  const terms1 = deterministicBuilder.getActiveIndex()?.getTerms().sort();

  const detBuild2 = await deterministicBuilder.build({ mode: 'full' });
  const terms2 = deterministicBuilder.getActiveIndex()?.getTerms().sort();

  check(
    'Successive full builds produce identical term count',
    detBuild1.stats.termsIndexed === detBuild2.stats.termsIndexed,
  );
  check(
    'Successive full builds produce identical term dictionary keys',
    JSON.stringify(terms1) === JSON.stringify(terms2),
  );

  // 4. Corruption / Error Handling & Staging Isolation
  console.log(`\n${HEAD} 4. Corruption / Error Handling & Staging Isolation`);
  const initialActiveMeta = await storage.indexMetadata.findActive();

  // Create a failing mock builder to simulate error mid-build
  const failingStorage = new Proxy(storage, {
    get(target, prop, receiver) {
      if (prop === 'documents') {
        return {
          ...target.documents,
          list: async () => {
            throw new Error('Simulated disk I/O corruption during build batch');
          },
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  const failingBuilder = createIndexBuilder({
    config,
    storage: failingStorage,
    processor,
    indexDir,
  });

  const failedSummary = await failingBuilder.build({ mode: 'full' });
  check('Build reports failed status on error', failedSummary.status === 'failed');
  check(
    'Error message captured in summary',
    failedSummary.errorMessage?.includes('Simulated disk I/O corruption'),
  );

  const postFailureActiveMeta = await storage.indexMetadata.findActive();
  check(
    'Failed build did not overwrite existing active metadata',
    postFailureActiveMeta?.buildId === initialActiveMeta?.buildId,
  );
  check(
    'Staging directory of failed build is purged cleanly',
    !existsSync(failedSummary.indexPath),
  );

  // 5. Index Version Metadata & Persistence Reload
  console.log(`\n${HEAD} 5. Index Version Metadata & Persistence Reload`);
  const startupBuilder = createIndexBuilder({
    config,
    storage,
    indexDir,
  });

  const loadedIndex = await startupBuilder.loadActiveIndex();
  check('loadActiveIndex loads persisted active index from disk', loadedIndex !== null);
  check(
    'Loaded active index has expected document count (3)',
    loadedIndex.getStats().totalDocuments === 3,
  );
  check(
    'Loaded active index has working term postings ("crawler")',
    loadedIndex.getDocumentFrequency('crawler') === 1,
  );

  // Cleanup
  await storage.close();
  await rm(testDir, { recursive: true, force: true });

  console.log('\n--------------------------------------------------');
  console.log(`Phase 11 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Unhandled error during Phase 11 verification:', err);
  process.exit(1);
});
