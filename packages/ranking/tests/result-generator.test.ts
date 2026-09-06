import { describe, it, expect } from 'vitest';
import { escapeHtml, unescapeHtml, stripHtmlTags } from '../src/results/html-escaper.js';
import { SnippetGenerator } from '../src/results/snippet-generator.js';
import { createResultGenerator } from '../src/results/result-generator.js';
import { ParsedQuery } from '../src/query/query-types.js';
import { ScoredDocument } from '../src/scorer/scorer-types.js';

describe('Phase 15 — Result Generation & Snippets Suite', () => {
  describe('HTML & Text Escaper', () => {
    it('escapes dangerous XSS characters correctly', () => {
      const unsafe = '<script>alert("XSS & danger")</script>';
      const escaped = escapeHtml(unsafe);
      expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS &amp; danger&quot;)&lt;/script&gt;');
    });

    it('unescapes encoded entities back to characters', () => {
      const encoded = 'AT&amp;T &quot;rock &#39;n&#39; roll&quot;';
      const unescaped = unescapeHtml(encoded);
      expect(unescaped).toBe('AT&T "rock \'n\' roll"');
    });

    it('strips HTML tags cleanly from dirty text', () => {
      const htmlText = '<p>Hello <b>world</b>! Visit <a href="https://example.com">here</a>.</p>';
      const plain = stripHtmlTags(htmlText);
      expect(plain).toBe('Hello world! Visit here.');
    });

    it('handles non-string / null / undefined gracefully', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
      expect(stripHtmlTags(null)).toBe('');
    });
  });

  describe('SnippetGenerator', () => {
    const generator = new SnippetGenerator();

    it('generates short text snippets intact without ellipsis', () => {
      const text = 'Fast inverted index for search.';
      const res = generator.generateSnippet(text, ['search']);
      expect(res.snippet).toBe('Fast inverted index for search.');
      expect(res.highlightedSnippet).toBe('Fast inverted index for <mark>search</mark>.');
    });

    it('centers snippet window around best keyword cluster in long text', () => {
      const longText =
        'Introduction to database architectures. Systems need persistence layers and storage engines. ' +
        'In the middle of the article we discover high speed candidate retrieval and BM25 ranking for optimal relevance. ' +
        'Conclusion summarizes the indexing principles and deployment strategies.';

      const res = generator.generateSnippet(longText, ['candidate', 'retrieval', 'bm25'], {
        maxSnippetLength: 120,
      });

      expect(res.snippet).toContain('candidate retrieval and BM25 ranking');
      expect(res.highlightedSnippet).toContain('<mark>candidate</mark>');
      expect(res.highlightedSnippet).toContain('<mark>retrieval</mark>');
      expect(res.highlightedSnippet).toContain('<mark>BM25</mark>');
    });

    it('injects highlight tags safely without executing embedded HTML', () => {
      const unsafeText = 'Search for <script>alert("hack")</script> in database.';
      const res = generator.highlightText(unsafeText, ['search', 'hack']);

      // Raw malicious tags must be escaped
      expect(res).not.toContain('<script>');
      expect(res).toContain('&lt;script&gt;');
      expect(res).toContain('&quot;');
      // Highlight tags must be present
      expect(res).toContain('<mark>Search</mark>');
      expect(res).toContain('<mark>hack</mark>');
    });

    it('provides fallback snippet on empty or missing text', () => {
      const res = generator.generateSnippet('', ['query']);
      expect(res.snippet).toBe('No preview available for this page.');
      expect(res.highlightedSnippet).toBe('No preview available for this page.');
    });
  });

  describe('DefaultResultGenerator', () => {
    const generator = createResultGenerator();

    const mockQuery: ParsedQuery = {
      rawQuery: 'rust concurrency',
      normalizedText: 'rust concurrency',
      terms: ['rust', 'concurrency'],
      uniqueTerms: ['rust', 'concurrency'],
      phrases: [],
      negatedTerms: [],
      isEmpty: false,
      hasPhrases: false,
      hasNegations: false,
    };

    const mockRankedDocs: ScoredDocument[] = [
      {
        documentId: 'doc-1',
        score: 4.5,
        rank: 1,
        documentMeta: {
          documentId: 'doc-1',
          url: 'https://rust-lang.org/guides/fearless-concurrency',
          urlHash: 'hash-1',
          title: 'Rust Fearless Concurrency Guide',
          description:
            'Complete tutorial exploring Rust threads, channels, mutexes, and concurrency primitives.',
          language: 'en',
          totalTerms: 120,
          fieldLengths: { title: 4, headings: 5, description: 10, body: 100 },
          indexedAt: '2026-09-06T10:00:00Z',
        },
        candidate: {
          documentId: 'doc-1',
          documentMeta: {
            documentId: 'doc-1',
            url: 'https://rust-lang.org/guides/fearless-concurrency',
            urlHash: 'hash-1',
            title: 'Rust Fearless Concurrency Guide',
            language: 'en',
            totalTerms: 120,
            fieldLengths: { title: 4, headings: 5, description: 10, body: 100 },
            indexedAt: '2026-09-06T10:00:00Z',
          },
          matchedTerms: ['rust', 'concurrency'],
          termPostings: new Map(),
          matchCount: 2,
          isFullMatch: true,
          phraseMatches: true,
        },
      },
      {
        documentId: 'doc-2',
        score: 2.1,
        rank: 2,
        documentMeta: {
          documentId: 'doc-2',
          url: 'https://cs.university.edu/courses/os/threads.html',
          urlHash: 'hash-2',
          title: '', // Missing title to test fallback
          description: 'Lecture notes discussing operating system concurrency models.',
          language: 'en',
          totalTerms: 80,
          fieldLengths: { title: 0, headings: 4, description: 8, body: 68 },
          indexedAt: '2026-09-06T11:00:00Z',
        },
        candidate: {
          documentId: 'doc-2',
          documentMeta: {
            documentId: 'doc-2',
            url: 'https://cs.university.edu/courses/os/threads.html',
            urlHash: 'hash-2',
            title: '',
            language: 'en',
            totalTerms: 80,
            fieldLengths: { title: 0, headings: 4, description: 8, body: 68 },
            indexedAt: '2026-09-06T11:00:00Z',
          },
          matchedTerms: ['concurrency'],
          termPostings: new Map(),
          matchCount: 1,
          isFullMatch: false,
          phraseMatches: false,
        },
      },
    ];

    it('generates paginated search results with highlights and breadcrumb URLs', () => {
      const resultSet = generator.generateResults(mockQuery, mockRankedDocs, {
        pagination: { page: 1, pageSize: 10 },
      });

      expect(resultSet.items.length).toBe(2);
      expect(resultSet.pagination.totalHits).toBe(2);
      expect(resultSet.pagination.totalPages).toBe(1);

      // Doc 1 checks
      const item1 = resultSet.items[0]!;
      expect(item1.documentId).toBe('doc-1');
      expect(item1.title).toBe('Rust Fearless Concurrency Guide');
      expect(item1.highlightedTitle).toContain('<mark>Rust</mark>');
      expect(item1.highlightedTitle).toContain('<mark>Concurrency</mark>');
      expect(item1.domain).toBe('rust-lang.org');
      expect(item1.displayUrl).toBe('rust-lang.org › guides › fearless-concurrency');
      expect(item1.highlightedSnippet).toContain('<mark>Rust</mark>');
      expect(item1.highlightedSnippet).toContain('<mark>concurrency</mark>');

      // Doc 2 fallback title check
      const item2 = resultSet.items[1]!;
      expect(item2.title).toBe('Threads');
      expect(item2.domain).toBe('cs.university.edu');
      expect(item2.displayUrl).toBe('cs.university.edu › courses › os › threads.html');
    });

    it('computes accurate pagination metadata for multi-page result sets', () => {
      const p1 = generator.computePagination(25, 1, 10);
      expect(p1.page).toBe(1);
      expect(p1.pageSize).toBe(10);
      expect(p1.totalHits).toBe(25);
      expect(p1.totalPages).toBe(3);
      expect(p1.hasNextPage).toBe(true);
      expect(p1.hasPrevPage).toBe(false);
      expect(p1.nextPage).toBe(2);
      expect(p1.prevPage).toBeNull();
      expect(p1.startIndex).toBe(0);
      expect(p1.endIndex).toBe(10);

      const p2 = generator.computePagination(25, 2, 10);
      expect(p2.page).toBe(2);
      expect(p2.hasNextPage).toBe(true);
      expect(p2.hasPrevPage).toBe(true);
      expect(p2.nextPage).toBe(3);
      expect(p2.prevPage).toBe(1);
      expect(p2.startIndex).toBe(10);
      expect(p2.endIndex).toBe(20);

      const p3 = generator.computePagination(25, 3, 10);
      expect(p3.page).toBe(3);
      expect(p3.hasNextPage).toBe(false);
      expect(p3.hasPrevPage).toBe(true);
      expect(p3.nextPage).toBeNull();
      expect(p3.startIndex).toBe(20);
      expect(p3.endIndex).toBe(25);
    });

    it('handles empty ranked document lists safely', () => {
      const emptySet = generator.generateResults(mockQuery, []);
      expect(emptySet.items).toEqual([]);
      expect(emptySet.pagination.totalHits).toBe(0);
      expect(emptySet.pagination.totalPages).toBe(1);
      expect(emptySet.pagination.hasNextPage).toBe(false);
    });
  });
});
