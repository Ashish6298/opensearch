/**
 * @opensearch/ranking — Search Quality Evaluation Dataset (Phase 24)
 *
 * Defines test queries and expectations across 7 key query categories:
 * 1. Informational: Open knowledge & concept queries
 * 2. Navigational: Targeted site / section searches
 * 3. Technical: Exact terminology & algorithmic queries
 * 4. Multi-Word: Broad combinatorial queries
 * 5. Exact-Title: Queries matching document titles verbatim
 * 6. No-Result: Out-of-vocabulary queries (must return 0 hits safely)
 * 7. Duplicate-Content: Testing duplicate suppression & domain dampening
 */

export type QueryCategory =
  | 'informational'
  | 'navigational'
  | 'technical'
  | 'multi_word'
  | 'exact_title'
  | 'no_result'
  | 'duplicate_content';

export interface EvaluationQuery {
  id: string;
  category: QueryCategory;
  rawQuery: string;
  description: string;
  expectedTopUrlMatch?: string; // Partial or exact URL expected at rank 1
  expectedTitleKeywords?: string[]; // Keywords expected in rank 1 title
  expectedMinHits?: number;
  expectedMaxHits?: number;
  expectZeroHits?: boolean;
  expectSnippetsContaining?: string[];
  maxAcceptableRank?: number; // Highest acceptable rank for target document (default 1)
}

export const SEARCH_QUALITY_DATASET: EvaluationQuery[] = [
  // 1. Informational Queries
  {
    id: 'info-01',
    category: 'informational',
    rawQuery: 'privacy rights tracking',
    description: 'General informational query about online user privacy and anti-tracking',
    expectedTopUrlMatch: '/privacy-rights',
    expectedTitleKeywords: ['privacy', 'rights'],
    expectedMinHits: 1,
    expectSnippetsContaining: ['privacy'],
    maxAcceptableRank: 2,
  },
  {
    id: 'info-02',
    category: 'informational',
    rawQuery: 'open source web knowledge',
    description: 'Informational query on open knowledge and documentation portals',
    expectedTopUrlMatch: '/index.html',
    expectedTitleKeywords: ['opensearch'],
    expectedMinHits: 1,
  },

  // 2. Navigational Queries
  {
    id: 'nav-01',
    category: 'navigational',
    rawQuery: 'opensearch documentation portal home',
    description: 'Navigational query targeting the main index home page',
    expectedTopUrlMatch: '/index.html',
    expectedTitleKeywords: ['opensearch'],
    expectedMinHits: 1,
    maxAcceptableRank: 1,
  },
  {
    id: 'nav-02',
    category: 'navigational',
    rawQuery: 'crawler subsystem details',
    description: 'Navigational query targeting the crawler subsystem documentation',
    expectedTopUrlMatch: '/crawler',
    expectedTitleKeywords: ['crawler'],
    expectedMinHits: 1,
    maxAcceptableRank: 1,
  },

  // 3. Technical Queries
  {
    id: 'tech-01',
    category: 'technical',
    rawQuery: 'BM25 lexical ranking relevance',
    description: 'Technical query on search engine scoring and term frequency',
    expectedTopUrlMatch: '/algorithms',
    expectedTitleKeywords: ['bm25', 'ranking'],
    expectedMinHits: 1,
    expectSnippetsContaining: ['bm25', 'ranking'],
    maxAcceptableRank: 1,
  },
  {
    id: 'tech-02',
    category: 'technical',
    rawQuery: 'HTTP protocol status codes GET POST',
    description: 'Technical query on HTTP communication standards',
    expectedTopUrlMatch: '/http-guide',
    expectedTitleKeywords: ['http'],
    expectedMinHits: 1,
    expectSnippetsContaining: ['http'],
    maxAcceptableRank: 1,
  },

  // 4. Multi-Word Queries
  {
    id: 'multi-01',
    category: 'multi_word',
    rawQuery: 'zero tracking search engine user liberties',
    description: 'Broad multi-word search requiring term aggregation and title weighting',
    expectedTopUrlMatch: '/privacy-rights',
    expectedTitleKeywords: ['privacy'],
    expectedMinHits: 1,
    maxAcceptableRank: 2,
  },
  {
    id: 'multi-02',
    category: 'multi_word',
    rawQuery: 'hypertext transfer protocol application layer standards',
    description: 'Multi-word technical specification query',
    expectedTopUrlMatch: '/http-guide',
    expectedTitleKeywords: ['http'],
    expectedMinHits: 1,
    maxAcceptableRank: 1,
  },

  // 5. Exact-Title Queries
  {
    id: 'title-01',
    category: 'exact_title',
    rawQuery: 'HTTP Protocols and Standards',
    description: 'Verbatim match of document title',
    expectedTopUrlMatch: '/http-guide',
    expectedTitleKeywords: ['http', 'protocols'],
    expectedMinHits: 1,
    maxAcceptableRank: 1,
  },
  {
    id: 'title-02',
    category: 'exact_title',
    rawQuery: 'Information Retrieval and BM25 Ranking',
    description: 'Verbatim match of algorithms document title',
    expectedTopUrlMatch: '/algorithms',
    expectedTitleKeywords: ['information', 'retrieval'],
    expectedMinHits: 1,
    maxAcceptableRank: 1,
  },

  // 6. No-Result Queries
  {
    id: 'nores-01',
    category: 'no_result',
    rawQuery: 'quantum gravitational singularity teleportation 999xyz',
    description: 'Out-of-vocabulary query with terms absent from index',
    expectZeroHits: true,
    expectedMaxHits: 0,
  },
  {
    id: 'nores-02',
    category: 'no_result',
    rawQuery: 'zyxwvutsrqponmlkjihgfedcba',
    description: 'Synthetic gibberish query',
    expectZeroHits: true,
    expectedMaxHits: 0,
  },

  // 7. Duplicate Content & Diversity Cases
  {
    id: 'dup-01',
    category: 'duplicate_content',
    rawQuery: 'digital privacy and user rights',
    description:
      'Query where a primary document and an exact duplicate exist; primary should rank 1st',
    expectedTopUrlMatch: '/privacy-rights',
    expectedMinHits: 1,
    maxAcceptableRank: 1,
  },
];
