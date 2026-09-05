import { describe, it, expect } from 'vitest';
import { DocumentRecord, INDEX_STATUS } from '@opensearch/storage';
import { createDocumentProcessor, DEFAULT_FIELD_WEIGHTS, getFieldWeight } from '../src/index.js';

describe('Document Processor Pipeline (Phase 9)', () => {
  it('should process a full DocumentRecord and extract field-level weighting & tokens', () => {
    const processor = createDocumentProcessor();

    const mockDoc: DocumentRecord = {
      id: 'doc-uuid-123',
      url: 'https://opensearch.org/docs/architecture',
      urlHash: 'hash-12345',
      title: 'OpenSearch Architecture',
      description: 'Overview of the crawler and indexing engine',
      headings: 'Architecture Overview Pipeline Design',
      bodyText:
        'OpenSearch uses a distributed crawler and inverted index pipeline for fast full-text searching.',
      language: 'en',
      contentType: 'text/html; charset=utf-8',
      contentLength: 1024,
      httpStatus: 200,
      outboundLinks: ['https://opensearch.org/docs/quickstart'],
      crawledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      indexStatus: INDEX_STATUS.PENDING,
      lastIndexedAt: null,
      indexBuildId: null,
    };

    const processed = processor.process(mockDoc);

    expect(processed.documentId).toBe('doc-uuid-123');
    expect(processed.url).toBe('https://opensearch.org/docs/architecture');
    expect(processed.urlHash).toBe('hash-12345');
    expect(processed.title).toBe('OpenSearch Architecture');
    expect(processed.language).toBe('en');

    // Fields verification
    expect(processed.fields.has('title')).toBe(true);
    expect(processed.fields.has('headings')).toBe(true);
    expect(processed.fields.has('description')).toBe(true);
    expect(processed.fields.has('body')).toBe(true);

    const titleField = processed.fields.get('title');
    expect(titleField?.weight).toBe(DEFAULT_FIELD_WEIGHTS.title);
    expect(titleField?.termFrequencies.get('opensearch')).toBe(1);
    expect(titleField?.termFrequencies.get('architecture')).toBe(1);

    // Terms aggregation verification
    const opensearchTerm = processed.terms.get('opensearch');
    expect(opensearchTerm).toBeDefined();
    // 'opensearch' appears in title and body
    expect(opensearchTerm?.totalFrequency).toBeGreaterThanOrEqual(2);
    expect(opensearchTerm?.fieldCounts.get('title')).toBe(1);
    expect(opensearchTerm?.fieldCounts.get('body')).toBe(1);

    // Title has 3.0 weight, body has 1.0 weight -> total weightedScore >= 4.0
    expect(opensearchTerm?.weightedScore).toBe(
      DEFAULT_FIELD_WEIGHTS.title + DEFAULT_FIELD_WEIGHTS.body,
    );

    expect(processed.totalTokens).toBeGreaterThan(0);
    expect(processed.uniqueTerms).toBe(processed.terms.size);
  });

  it('should produce identical tokens deterministically for identical content', () => {
    const processor = createDocumentProcessor();
    const input = {
      url: 'https://example.com/test',
      title: 'Deterministic Tokenization Test',
      bodyText: 'Consistent hashing and tokenization ensure idempotent index builds.',
    };

    const run1 = processor.process(input);
    const run2 = processor.process(input);

    expect(run1.uniqueTerms).toBe(run2.uniqueTerms);
    expect(run1.totalTokens).toBe(run2.totalTokens);

    const terms1 = Array.from(run1.terms.keys()).sort();
    const terms2 = Array.from(run2.terms.keys()).sort();
    expect(terms1).toEqual(terms2);
  });

  it('should handle completely empty documents without errors', () => {
    const processor = createDocumentProcessor();
    const emptyDoc = {
      url: 'https://example.com/empty',
      title: '',
      headings: '',
      description: '',
      bodyText: '',
    };

    const processed = processor.process(emptyDoc);

    expect(processed.totalTokens).toBe(0);
    expect(processed.uniqueTerms).toBe(0);
    expect(processed.terms.size).toBe(0);
    expect(processed.fields.get('title')?.totalTokens).toBe(0);
  });

  it('should assign a valid document ID if none provided in raw input', () => {
    const processor = createDocumentProcessor();
    const raw = {
      url: 'https://example.com/page',
      title: 'Page Title',
    };

    const processed = processor.process(raw);
    expect(typeof processed.documentId).toBe('string');
    expect(processed.documentId.length).toBeGreaterThan(0);
  });

  it('should resolve correct field weights via getFieldWeight helper', () => {
    expect(getFieldWeight('title')).toBe(3.0);
    expect(getFieldWeight('headings')).toBe(2.0);
    expect(getFieldWeight('description')).toBe(1.5);
    expect(getFieldWeight('body')).toBe(1.0);
    expect(getFieldWeight('custom_metadata')).toBe(1.0);
  });
});
