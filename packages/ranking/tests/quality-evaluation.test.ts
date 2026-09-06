import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig } from '@opensearch/shared';
import { createStorageAdapter } from '@opensearch/storage';
import { createIndexBuilder, InvertedIndex } from '@opensearch/indexer';
import {
  createQueryParser,
  createCandidateRetriever,
  createRankingEngine,
  createResultGenerator,
  SearchQualityEvaluator,
  SEARCH_QUALITY_DATASET,
} from '../src/index.js';

describe('Phase 24 — Search Quality Evaluation Benchmark Suite', () => {
  let tempDir: string;
  let activeIndex: InvertedIndex;
  let evaluator: SearchQualityEvaluator;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-p24-test-'));
    const storageDir = path.join(tempDir, 'storage');
    const indexDir = path.join(tempDir, 'index');

    const config = loadConfig({
      STORAGE_DIR: storageDir,
      INDEX_DIR: indexDir,
    });

    const storage = createStorageAdapter({ config });
    await storage.initialize();

    // Populate representative documents
    const docData = [
      {
        url: 'https://opensearch.local/index.html',
        urlHash: 'hash-001',
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
        urlHash: 'hash-002',
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
        urlHash: 'hash-003',
        title: 'Information Retrieval and BM25 Ranking',
        description: 'Mathematical formulation of BM25 lexical ranking relevance and term frequency.',
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
        urlHash: 'hash-004',
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
        urlHash: 'hash-005',
        title: 'Digital Privacy and User Rights',
        description: 'Why privacy-first search engines protect civil liberties and avoid profiling.',
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
        urlHash: 'hash-006',
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

    for (const doc of docData) {
      await storage.documents.create(doc);
    }

    const indexBuilder = createIndexBuilder({
      storage,
      indexDir,
    });
    const buildSummary = await indexBuilder.build({ mode: 'full' });
    expect(buildSummary.status).toBe('success');

    activeIndex = indexBuilder.getActiveIndex()!;
    expect(activeIndex).not.toBeNull();

    evaluator = new SearchQualityEvaluator({
      queryParser: createQueryParser(),
      candidateRetriever: createCandidateRetriever(activeIndex),
      rankingEngine: createRankingEngine(activeIndex),
      resultGenerator: createResultGenerator(),
    });
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  });

  it('evaluates entire benchmark dataset and achieves high Mean Reciprocal Rank (MRR >= 0.85)', async () => {
    const report = await evaluator.evaluateDataset(SEARCH_QUALITY_DATASET);

    expect(report.totalQueries).toBe(SEARCH_QUALITY_DATASET.length);
    expect(report.passedQueries).toBe(SEARCH_QUALITY_DATASET.length);
    expect(report.failedQueries).toBe(0);
    expect(report.passRate).toBe(1.0);
    expect(report.meanReciprocalRank).toBeGreaterThanOrEqual(0.85);
    expect(report.noResultFalsePositiveCount).toBe(0);
    expect(report.averageLatencyMs).toBeLessThan(50);
  });

  it('correctly handles exact-title queries placing the target document at rank 1', async () => {
    const titleQueries = SEARCH_QUALITY_DATASET.filter(q => q.category === 'exact_title');
    for (const query of titleQueries) {
      const res = await evaluator.evaluateQuery(query);
      expect(res.passed).toBe(true);
      expect(res.reciprocalRank).toBe(1.0);
      expect(res.topRankUrl).toContain(query.expectedTopUrlMatch!);
    }
  });

  it('ensures no-result queries produce exactly 0 hits without false positive matches', async () => {
    const noResQueries = SEARCH_QUALITY_DATASET.filter(q => q.category === 'no_result');
    for (const query of noResQueries) {
      const res = await evaluator.evaluateQuery(query);
      expect(res.passed).toBe(true);
      expect(res.totalHits).toBe(0);
      expect(res.results.items.length).toBe(0);
    }
  });

  it('validates snippet generation highlights query terms with <mark> tags', async () => {
    const techQuery = SEARCH_QUALITY_DATASET.find(q => q.id === 'tech-01')!;
    const res = await evaluator.evaluateQuery(techQuery);
    expect(res.passed).toBe(true);
    const topItem = res.results.items[0];
    expect(topItem).toBeDefined();
    expect(topItem.highlightedSnippet).toContain('<mark>');
    expect(topItem.highlightedSnippet).toContain('</mark>');
  });

  it('evaluates category summaries across all 7 benchmark dimensions', async () => {
    const report = await evaluator.evaluateDataset(SEARCH_QUALITY_DATASET);
    expect(report.categorySummaries.length).toBe(7);
    for (const cat of report.categorySummaries) {
      expect(cat.passRate).toBe(1.0);
      expect(cat.meanReciprocalRank).toBeGreaterThanOrEqual(0.5);
    }
  });
});
