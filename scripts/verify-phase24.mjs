/**
 * OpenSearch — Phase 24 Verification Gate Runner
 *
 * Validates Search Quality Evaluation:
 * 1. Benchmark Dataset: Validates multi-category query catalog (informational, navigational,
 *    technical, multi-word, exact-title, no-result, duplicate-content).
 * 2. SearchQualityEvaluator Engine: End-to-end scoring calculation and assertion runner.
 * 3. Relevance & Ordering: Mean Reciprocal Rank (MRR >= 0.85), Precision@1.
 * 4. Exact-Title Rank-1 Accuracy: Verbatim title queries place correct document at position 1.
 * 5. Zero-Result False Positives: Ensures out-of-vocabulary terms safely return 0 hits.
 * 6. Highlighting Quality: Ensures snippets contain <mark> tags centered on relevant keywords.
 * 7. Duplicate Content Handling: Validates domain dampening and duplicate suppression.
 * 8. Performance & Latency: Validates query response times remain under low-latency thresholds.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig } from '@opensearch/shared';
import { createStorageAdapter } from '@opensearch/storage';
import { createIndexBuilder } from '@opensearch/indexer';
import {
  createQueryParser,
  createCandidateRetriever,
  createRankingEngine,
  createResultGenerator,
  SearchQualityEvaluator,
  SEARCH_QUALITY_DATASET,
} from '@opensearch/ranking';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runVerification() {
  console.log('\n=== Phase 24: Search Quality Evaluation Verification ===\n');

  // 1. Dataset Coverage & Structure Validation
  console.log('► 1. Evaluation Dataset Validation');
  assert(
    SEARCH_QUALITY_DATASET.length >= 7,
    `Evaluation dataset contains ${SEARCH_QUALITY_DATASET.length} benchmark queries (>= 7)`,
  );

  const categories = new Set(SEARCH_QUALITY_DATASET.map(q => q.category));
  assert(categories.has('informational'), 'Includes informational queries');
  assert(categories.has('navigational'), 'Includes navigational queries');
  assert(categories.has('technical'), 'Includes technical queries');
  assert(categories.has('multi_word'), 'Includes multi-word queries');
  assert(categories.has('exact_title'), 'Includes exact-title queries');
  assert(categories.has('no_result'), 'Includes no-result queries');
  assert(categories.has('duplicate_content'), 'Includes duplicate-content cases');

  // 2. Controlled Corpus Setup & Index Construction
  console.log('\n► 2. Controlled Multi-Domain Corpus Setup & Indexing');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-verify-p24-'));
  const storageDir = path.join(tempDir, 'storage');
  const indexDir = path.join(tempDir, 'index');

  try {
    const config = loadConfig({
      STORAGE_DIR: storageDir,
      INDEX_DIR: indexDir,
    });

    const storage = createStorageAdapter({ config });
    await storage.initialize();

    const corpusDocs = [
      {
        url: 'https://opensearch.local/index.html',
        urlHash: 'vhash-001',
        title: 'OpenSearch Public Knowledge Base Documentation Portal Home',
        description: 'A curated open source web knowledge portal and documentation repository.',
        headings: 'OpenSearch Public Knowledge Base Search System',
        bodyText:
          'OpenSearch is a privacy-first web search engine that indexes open knowledge and technical specifications directly without user profiling.',
        language: 'en',
        contentType: 'text/html',
        contentLength: 450,
        httpStatus: 200,
        outboundLinks: [],
      },
      {
        url: 'https://opensearch.local/crawler',
        urlHash: 'vhash-002',
        title: 'Crawler Subsystem Details and Policies',
        description: 'How the web crawler respects robots.txt policies, rates, and limits.',
        headings: 'Crawler Subsystem Details Architecture',
        bodyText:
          'The crawler subsystem manages fetch queues, politeness delays, and network isolation with SSRF guards for polite crawling.',
        language: 'en',
        contentType: 'text/html',
        contentLength: 400,
        httpStatus: 200,
        outboundLinks: [],
      },
      {
        url: 'https://opensearch.local/algorithms',
        urlHash: 'vhash-003',
        title: 'Information Retrieval and BM25 Ranking',
        description:
          'Mathematical formulation of BM25 lexical ranking relevance and term frequency.',
        headings: 'Information Retrieval and Ranking Algorithms BM25',
        bodyText:
          'BM25 lexical ranking relevance calculates term frequency, document length normalization, and inverse document frequency scoring.',
        language: 'en',
        contentType: 'text/html',
        contentLength: 480,
        httpStatus: 200,
        outboundLinks: [],
      },
      {
        url: 'https://opensearch.local/http-guide',
        urlHash: 'vhash-004',
        title: 'HTTP Protocols and Standards',
        description: 'Complete technical documentation of HTTP methods, headers, and status codes.',
        headings: 'HTTP Protocols and Web Standards',
        bodyText:
          'Hypertext Transfer Protocol is the foundation of data communication. HTTP is an application layer protocol with status codes GET POST.',
        language: 'en',
        contentType: 'text/html',
        contentLength: 490,
        httpStatus: 200,
        outboundLinks: [],
      },
      {
        url: 'https://opensearch.local/privacy-rights',
        urlHash: 'vhash-005',
        title: 'Digital Privacy and User Rights',
        description:
          'Why privacy-first search engines protect civil liberties and avoid profiling.',
        headings: 'Digital Privacy and User Rights Tracking Protection',
        bodyText:
          'Privacy-first search engines do not track users, log identifiable search history, or create behavioral profiling databases. Zero-tracking search guarantees privacy rights.',
        language: 'en',
        contentType: 'text/html',
        contentLength: 440,
        httpStatus: 200,
        outboundLinks: [],
      },
      {
        url: 'https://duplicate.local/privacy-copy',
        urlHash: 'vhash-006',
        title: 'Digital Privacy and User Rights Copy',
        description: 'Copy of privacy article to test domain duplicate penalty dampening.',
        headings: 'Digital Privacy and User Rights',
        bodyText:
          'Privacy-first search engines do not track users, log identifiable search history, or create behavioral profiling databases. Zero-tracking search guarantees privacy rights.',
        language: 'en',
        contentType: 'text/html',
        contentLength: 440,
        httpStatus: 200,
        outboundLinks: [],
      },
    ];

    for (const doc of corpusDocs) {
      await storage.documents.create(doc);
    }
    assert(true, `Stored ${corpusDocs.length} representative test documents in DocumentRepository`);

    const indexBuilder = createIndexBuilder({ storage, indexDir });
    const buildSummary = await indexBuilder.build({ mode: 'full' });
    assert(buildSummary.status === 'success', 'Built on-disk inverted index successfully');

    const activeIndex = indexBuilder.getActiveIndex();
    assert(activeIndex !== null, 'Active index loaded into memory');

    // 3. Search Quality Evaluator Execution
    console.log('\n► 3. Search Quality Evaluator Execution');
    const evaluator = new SearchQualityEvaluator({
      queryParser: createQueryParser(),
      candidateRetriever: createCandidateRetriever(activeIndex),
      rankingEngine: createRankingEngine(activeIndex),
      resultGenerator: createResultGenerator(),
    });

    const report = await evaluator.evaluateDataset(SEARCH_QUALITY_DATASET);

    assert(
      report.totalQueries === SEARCH_QUALITY_DATASET.length,
      `Executed all ${report.totalQueries} benchmark queries`,
    );
    assert(
      report.passedQueries === report.totalQueries,
      `All ${report.passedQueries} queries satisfied quality assertions (0 failures)`,
    );
    assert(report.passRate === 1.0, 'Search quality benchmark pass rate: 100%');
    assert(
      report.meanReciprocalRank >= 0.85,
      `Mean Reciprocal Rank (MRR): ${report.meanReciprocalRank} (>= 0.85)`,
    );
    assert(report.precisionAt1 >= 0.85, `Precision@1: ${report.precisionAt1} (>= 0.85)`);
    assert(
      report.noResultFalsePositiveCount === 0,
      'Zero false positive hits for out-of-vocabulary queries',
    );
    assert(
      report.averageLatencyMs < 50,
      `Average evaluation latency: ${report.averageLatencyMs}ms (< 50ms)`,
    );

    // 4. Category-Specific Quality Verification
    console.log('\n► 4. Category-Specific Quality Breakdown');
    for (const summary of report.categorySummaries) {
      assert(
        summary.passRate === 1.0,
        `Category '${summary.category}' pass rate: 100% (MRR: ${summary.meanReciprocalRank})`,
      );
    }

    // 5. Duplicate Suppression Verification
    console.log('\n► 5. Duplicate Suppression Verification');
    const dupQuery = SEARCH_QUALITY_DATASET.find(q => q.id === 'dup-01');
    assert(Boolean(dupQuery), 'Duplicate content evaluation query present');
    const dupResult = await evaluator.evaluateQuery(dupQuery);
    assert(dupResult.passed, 'Duplicate query passed rank evaluation');
    assert(
      dupResult.topRankUrl.includes('/privacy-rights'),
      'Primary domain document outranked duplicate copy',
    );
    assert(
      dupResult.results.items.length >= 2,
      `Retrieved ${dupResult.results.items.length} candidate documents`,
    );
    const doc1 = dupResult.results.items[0];
    const doc2 = dupResult.results.items[1];
    assert(
      doc1.score >= doc2.score,
      `Primary doc score (${doc1.score}) >= Duplicate doc score (${doc2.score})`,
    );

    // 6. Snippet & Highlighting Verification
    console.log('\n► 6. Snippet & Highlighting Quality');
    const techResult = await evaluator.evaluateQuery(
      SEARCH_QUALITY_DATASET.find(q => q.id === 'tech-01'),
    );
    assert(techResult.snippetHighlightsFound, 'Technical snippet contains keyword highlights');
    assert(
      techResult.results.items[0].highlightedSnippet.includes('<mark>'),
      'Snippet formatting injected HTML <mark> tags properly',
    );
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  console.log('\n--------------------------------------------------');
  console.log(`Phase 24 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Fatal error during Phase 24 verification:', err);
  process.exit(1);
});
