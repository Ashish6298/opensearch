import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDocumentProcessor,
  createInvertedIndex,
  InvertedIndex,
  DocumentProcessor,
} from '@opensearch/indexer';
import {
  createQueryParser,
  createCandidateRetriever,
  CandidateRetriever,
  QueryParser,
} from '../src/index.js';

describe('Candidate Retrieval (Phase 13)', () => {
  let testDir: string;
  let index: InvertedIndex;
  let processor: DocumentProcessor;
  let queryParser: QueryParser;
  let retriever: CandidateRetriever;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'opensearch-retrieval-test-'));
    index = createInvertedIndex({ indexDir: testDir });
    processor = createDocumentProcessor();
    queryParser = createQueryParser();
    retriever = createCandidateRetriever(index);

    // Populate test corpus
    // Doc 1: OpenSearch Search Engine Architecture
    index.addDocument(
      processor.process({
        id: 'doc-arch',
        url: 'https://opensearch.dev/docs/architecture',
        title: 'OpenSearch Search Engine Architecture',
        headings: 'Inverted Index and Ranking Engine',
        description: 'Comprehensive guide to OpenSearch crawler and indexing pipelines.',
        bodyText:
          'OpenSearch is a fast open source search engine with BM25 relevance scoring and document storage.',
      }),
    );

    // Doc 2: Web Crawler and Robots Policy
    index.addDocument(
      processor.process({
        id: 'doc-crawl',
        url: 'https://opensearch.dev/docs/crawler',
        title: 'OpenSearch Web Crawler Engine',
        headings: 'Politeness and Robots Exclusion',
        description: 'Autonomous web crawler respecting robots.txt directives.',
        bodyText: 'The crawler discovers links and downloads raw HTML documents for indexing.',
      }),
    );

    // Doc 3: Database Storage and Persistence
    index.addDocument(
      processor.process({
        id: 'doc-storage',
        url: 'https://opensearch.dev/docs/storage',
        title: 'JSON and SQLite Storage Repositories',
        headings: 'ACID Storage Layer',
        description: 'Persistence layer for URLs, crawl state, and index metadata.',
        bodyText:
          'Storage engine implements locking and atomic updates on disk without sql servers.',
      }),
    );
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('should retrieve candidate documents for single exact search term', () => {
    const query = queryParser.parse('architecture');
    const result = retriever.retrieve(query);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.documentId).toBe('doc-arch');
    expect(result.candidates[0]?.matchedTerms).toEqual(['architecture']);
    expect(result.candidates[0]?.matchCount).toBe(1);
    expect(result.candidates[0]?.isFullMatch).toBe(true);
    expect(result.stats.missingTerms).toHaveLength(0);
  });

  it('should retrieve candidates for multi-term queries and merge postings', () => {
    const query = queryParser.parse('opensearch storage');
    const result = retriever.retrieve(query);

    // 'opensearch' is in doc-arch & doc-crawl; 'storage' is in doc-arch, doc-crawl, & doc-storage
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);

    const docArch = result.candidates.find(c => c.documentId === 'doc-arch');
    expect(docArch).toBeDefined();
    expect(docArch?.matchedTerms).toContain('opensearch');
    expect(docArch?.matchedTerms).toContain('storage');
    expect(docArch?.matchCount).toBe(2);
    expect(docArch?.isFullMatch).toBe(true);

    const docStorage = result.candidates.find(c => c.documentId === 'doc-storage');
    expect(docStorage).toBeDefined();
    expect(docStorage?.matchedTerms).toContain('storage');
  });

  it('should respect intersection mode (AND matching only)', () => {
    const query = queryParser.parse('opensearch storage');
    const result = retriever.retrieve(query, { mode: 'intersection' });

    // Only doc-arch contains BOTH 'opensearch' and 'storage'
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.documentId).toBe('doc-arch');
    expect(result.stats.effectiveMode).toBe('intersection');
  });

  it('should respect union mode (OR matching)', () => {
    const query = queryParser.parse('crawler storage');
    const result = retriever.retrieve(query, { mode: 'union' });

    // doc-crawl matches 'crawler' (and 'storage' in metadata), doc-storage matches 'storage', doc-arch matches 'crawler'
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.stats.effectiveMode).toBe('union');
  });

  it('should exclude candidates matching negative terms (-term)', () => {
    // Search for opensearch documents, but exclude crawler
    const query = queryParser.parse('opensearch -crawler');
    const result = retriever.retrieve(query);

    const docIds = result.candidates.map(c => c.documentId);
    expect(docIds).not.toContain('doc-crawl');
  });

  it('should verify exact phrase match in candidate documents', () => {
    const queryWithPhrase = queryParser.parse('"open source"');
    const result = retriever.retrieve(queryWithPhrase);

    // doc-arch body contains "open source search engine"
    const docArch = result.candidates.find(c => c.documentId === 'doc-arch');
    expect(docArch).toBeDefined();
    expect(docArch?.phraseMatches).toBe(true);
  });

  it('should return safe empty result for terms missing in the index dictionary', () => {
    const query = queryParser.parse('quantum teleportation supercomputing');
    const result = retriever.retrieve(query);

    expect(result.candidates).toHaveLength(0);
    expect(result.stats.candidateCount).toBe(0);
    expect(result.stats.missingTerms).toEqual(['quantum', 'teleportation', 'supercomputing']);
  });

  it('should return safe empty result for empty query input', () => {
    const emptyQuery = queryParser.parse('');
    const result = retriever.retrieve(emptyQuery);

    expect(result.candidates).toHaveLength(0);
    expect(result.stats.candidateCount).toBe(0);
  });

  it('should enforce maxCandidates limit', () => {
    const query = queryParser.parse('engine');
    const result = retriever.retrieve(query, { maxCandidates: 1 });

    expect(result.candidates).toHaveLength(1);
  });
});
