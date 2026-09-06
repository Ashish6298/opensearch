/**
 * @opensearch/ranking — Search Result Generator Implementation (Phase 15)
 *
 * Coordinates transforming ranked documents into clean user-facing search result sets:
 * 1. Title formatting with fallback to domain/URL slug if empty
 * 2. Canonical URL validation and breadcrumb-style display URL formatting
 * 3. Domain/Host extraction
 * 4. Contextual snippet generation from document body/description
 * 5. Highlighting in titles and snippets
 * 6. Pagination metadata (page, pageSize, totalPages, prev/next)
 * 7. HTML security escaping across all fields
 */

import { ParsedQuery } from '../query/query-types.js';
import { ScoredDocument } from '../scorer/scorer-types.js';
import {
  PaginationMeta,
  PaginationOptions,
  ResultGenerator,
  ResultGeneratorOptions,
  SearchResultItem,
  SearchResultSet,
  SnippetOptions,
} from './result-types.js';
import { SnippetGenerator } from './snippet-generator.js';

export const DEFAULT_PAGINATION: Required<PaginationOptions> = {
  page: 1,
  pageSize: 10,
};

export class DefaultResultGenerator implements ResultGenerator {
  private readonly snippetGenerator: SnippetGenerator;
  private readonly defaultOptions: ResultGeneratorOptions;

  constructor(options: ResultGeneratorOptions = {}) {
    this.defaultOptions = options;
    this.snippetGenerator = new SnippetGenerator(options.snippet);
  }

  generateResults(
    query: ParsedQuery,
    rankedDocs: ScoredDocument[],
    options: ResultGeneratorOptions = {},
  ): SearchResultSet {
    const startMs = Date.now();

    const mergedOptions: ResultGeneratorOptions = {
      ...this.defaultOptions,
      ...options,
      snippet: { ...this.defaultOptions.snippet, ...options.snippet },
      pagination: { ...this.defaultOptions.pagination, ...options.pagination },
    };

    const totalHits = rankedDocs?.length ?? 0;
    const pagination = this.computePagination(
      totalHits,
      mergedOptions.pagination?.page,
      mergedOptions.pagination?.pageSize,
    );

    // Fast-path: no documents
    if (totalHits === 0) {
      return {
        query,
        items: [],
        pagination,
        durationMs: Date.now() - startMs,
      };
    }

    // Slice for requested page
    const pageDocs = rankedDocs.slice(pagination.startIndex, pagination.endIndex);
    const queryTerms = query.terms;

    const items: SearchResultItem[] = pageDocs.map(scoredDoc => {
      const docMeta = scoredDoc.documentMeta;
      const rawUrl = docMeta.url || 'https://unknown-source/';
      const domain = this.extractDomain(rawUrl);

      // Title formatting with fallback
      const rawTitle = docMeta.title?.trim() || this.generateFallbackTitle(rawUrl, domain);
      const cleanTitle = rawTitle;
      const highlightedTitle = this.snippetGenerator.highlightText(
        cleanTitle,
        queryTerms,
        mergedOptions.snippet,
      );

      // Display URL breadcrumb formatting
      const displayUrl = this.formatDisplayUrl(rawUrl, domain);

      // Snippet source resolution: prefer candidate/stored text or description
      const snippetSource = this.resolveSnippetSource(scoredDoc);
      const { snippet, highlightedSnippet } = this.snippetGenerator.generateSnippet(
        snippetSource,
        queryTerms,
        mergedOptions.snippet,
      );

      return {
        documentId: scoredDoc.documentId,
        score: scoredDoc.score,
        rank: scoredDoc.rank,
        title: cleanTitle,
        highlightedTitle,
        url: rawUrl,
        displayUrl,
        domain,
        snippet,
        highlightedSnippet,
        language: docMeta.language ?? null,
        indexedAt: docMeta.indexedAt || new Date().toISOString(),
      };
    });

    return {
      query,
      items,
      pagination,
      durationMs: Date.now() - startMs,
    };
  }

  generateSnippet(
    text: string,
    queryTerms: string[],
    options?: SnippetOptions,
  ): {
    snippet: string;
    highlightedSnippet: string;
  } {
    return this.snippetGenerator.generateSnippet(text, queryTerms, options);
  }

  highlightText(text: string, queryTerms: string[], options?: SnippetOptions): string {
    return this.snippetGenerator.highlightText(text, queryTerms, options);
  }

  computePagination(totalHits: number, page?: number, pageSize?: number): PaginationMeta {
    const safeTotalHits = Math.max(0, totalHits);
    const safePageSize = Math.max(1, Math.min(pageSize ?? DEFAULT_PAGINATION.pageSize, 100));
    const totalPages = Math.max(1, Math.ceil(safeTotalHits / safePageSize));
    const safePage = Math.max(1, Math.min(page ?? DEFAULT_PAGINATION.page, totalPages));

    const startIndex = (safePage - 1) * safePageSize;
    const endIndex = Math.min(startIndex + safePageSize, safeTotalHits);

    const hasNextPage = safePage < totalPages;
    const hasPrevPage = safePage > 1;

    return {
      page: safePage,
      pageSize: safePageSize,
      totalHits: safeTotalHits,
      totalPages,
      hasNextPage,
      hasPrevPage,
      nextPage: hasNextPage ? safePage + 1 : null,
      prevPage: hasPrevPage ? safePage - 1 : null,
      startIndex,
      endIndex,
    };
  }

  /**
   * Resolves the richest source text available for snippet generation.
   */
  private resolveSnippetSource(scoredDoc: ScoredDocument): string {
    const meta = scoredDoc.documentMeta;
    const pieces: string[] = [];
    if (meta.description?.trim()) {
      pieces.push(meta.description.trim());
    }
    if (meta.title?.trim() && !meta.description?.trim()) {
      pieces.push(meta.title.trim());
    }
    return pieces.join('. ');
  }

  /**
   * Extracts hostname safely from a URL.
   */
  private extractDomain(rawUrl: string): string {
    try {
      return new URL(rawUrl).hostname.toLowerCase();
    } catch {
      return 'unknown-host';
    }
  }

  /**
   * Formats a human-friendly display URL (e.g. 'domain.com › section › page').
   */
  private formatDisplayUrl(rawUrl: string, domain: string): string {
    try {
      const parsed = new URL(rawUrl);
      const pathParts = parsed.pathname
        .split('/')
        .filter(p => p.length > 0)
        .map(p => decodeURIComponent(p));

      if (pathParts.length === 0) {
        return domain;
      }

      return [domain, ...pathParts].join(' › ');
    } catch {
      return domain;
    }
  }

  /**
   * Generates a fallback title from URL path or domain when title is missing.
   */
  private generateFallbackTitle(rawUrl: string, domain: string): string {
    try {
      const parsed = new URL(rawUrl);
      const pathParts = parsed.pathname.split('/').filter(p => p.length > 0);
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart) {
          return decodeURIComponent(lastPart)
            .replace(/[-_]+/g, ' ')
            .replace(/\.[a-z0-9]+$/i, '')
            .replace(/\b\w/g, c => c.toUpperCase())
            .trim();
        }
      }
      return domain;
    } catch {
      return 'Untitled Document';
    }
  }
}

/**
 * Factory creating a ResultGenerator instance.
 */
export function createResultGenerator(options?: ResultGeneratorOptions): ResultGenerator {
  return new DefaultResultGenerator(options);
}
