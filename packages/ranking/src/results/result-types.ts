/**
 * @opensearch/ranking — Result Generation & Snippet Types (Phase 15)
 *
 * Defines domain models, interfaces, options, and metadata structures for:
 * - Sanitized search result presentation
 * - Snippet generation & window extraction
 * - Query-term highlighting with safe HTML escaping
 * - Pagination metadata calculation
 * - Fallbacks for missing document metadata
 */

import { ParsedQuery } from '../query/query-types.js';
import { ScoredDocument } from '../scorer/scorer-types.js';

export interface HighlightTagOptions {
  /** Opening highlight tag (default: '<mark>') */
  preTag: string;
  /** Closing highlight tag (default: '</mark>') */
  postTag: string;
}

export interface SnippetOptions {
  /** Maximum length in characters for generated snippet (default: 160) */
  maxSnippetLength?: number;
  /** Custom highlight tags */
  highlightTags?: Partial<HighlightTagOptions>;
  /** Whether to apply HTML escaping before injecting highlight tags (default: true) */
  escapeHtml?: boolean;
  /** Fallback snippet text if document content/description is completely empty */
  fallbackText?: string;
  /** Number of context characters surrounding the best matching window (default: 60) */
  contextRadius?: number;
}

export interface PaginationOptions {
  /** Current page index (1-based, default: 1) */
  page?: number;
  /** Number of results per page (default: 10, max: 100) */
  pageSize?: number;
}

export interface PaginationMeta {
  /** Current page number (1-based) */
  page: number;
  /** Results per page */
  pageSize: number;
  /** Total matching ranked documents found */
  totalHits: number;
  /** Total number of pages available */
  totalPages: number;
  /** Whether there is a subsequent page available */
  hasNextPage: boolean;
  /** Whether there is a preceding page available */
  hasPrevPage: boolean;
  /** Next page number if available, null otherwise */
  nextPage: number | null;
  /** Previous page number if available, null otherwise */
  prevPage: number | null;
  /** 0-based start index of results in current page */
  startIndex: number;
  /** 0-based end index of results in current page */
  endIndex: number;
}

export interface SearchResultItem {
  /** Unique document identifier */
  documentId: string;
  /** Document relevance score from ranking engine */
  score: number;
  /** Rank position in overall query result set (1-based) */
  rank: number;
  /** Escaped, formatted display title (with fallbacks) */
  title: string;
  /** Title with query term highlights injected (e.g., <mark>term</mark>) */
  highlightedTitle: string;
  /** Normalized canonical URL */
  url: string;
  /** Human-friendly display URL (e.g., 'example.com › docs › search') */
  displayUrl: string;
  /** Extracted domain / hostname */
  domain: string;
  /** Text snippet extracted from best matching content window (plain text, escaped) */
  snippet: string;
  /** Snippet with query term highlights injected */
  highlightedSnippet: string;
  /** Detected or declared document language */
  language: string | null;
  /** ISO timestamp when page was indexed or crawled */
  indexedAt: string;
}

export interface SearchResultSet {
  /** The parsed query that produced these results */
  query: ParsedQuery;
  /** Formatted, paginated search results */
  items: SearchResultItem[];
  /** Pagination calculations and navigation state */
  pagination: PaginationMeta;
  /** Execution diagnostics and timing in milliseconds */
  durationMs: number;
}

export interface ResultGeneratorOptions {
  /** Snippet generation options */
  snippet?: SnippetOptions;
  /** Default pagination options */
  pagination?: PaginationOptions;
}

export interface ResultGenerator {
  /**
   * Transforms ranked documents into a formatted, safe, paginated search result set.
   * Never throws on empty, missing, or malformed inputs.
   */
  generateResults(
    query: ParsedQuery,
    rankedDocs: ScoredDocument[],
    options?: ResultGeneratorOptions,
  ): SearchResultSet;

  /**
   * Generates a readable, query-focused snippet and highlighted snippet
   * from raw source text or document metadata.
   */
  generateSnippet(
    text: string,
    queryTerms: string[],
    options?: SnippetOptions,
  ): {
    snippet: string;
    highlightedSnippet: string;
  };

  /**
   * Injects safe highlight tags around query terms in text.
   */
  highlightText(text: string, queryTerms: string[], options?: SnippetOptions): string;

  /**
   * Computes pagination metadata given total results, page, and pageSize.
   */
  computePagination(totalHits: number, page?: number, pageSize?: number): PaginationMeta;
}
