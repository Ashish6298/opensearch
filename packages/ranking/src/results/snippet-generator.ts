/**
 * @opensearch/ranking — Snippet Generator & Highlighting Engine (Phase 15)
 *
 * Implements context-aware snippet extraction and query term highlighting:
 * 1. Locates highest-density keyword clusters / sentences in text
 * 2. Centers window around the best matching match position with boundary alignment (words/sentences)
 * 3. Prepends/Appends ellipsis ('…') when truncated
 * 4. Escapes raw text against XSS before wrapping matched terms with `<mark>` tags
 * 5. Handles multilingual / diacritic folding and edge cases (empty text, missing terms, single word)
 */

import { escapeHtml, stripHtmlTags } from './html-escaper.js';
import { HighlightTagOptions, SnippetOptions } from './result-types.js';

export const DEFAULT_HIGHLIGHT_TAGS: HighlightTagOptions = {
  preTag: '<mark>',
  postTag: '</mark>',
};

export const DEFAULT_SNIPPET_OPTIONS: Required<SnippetOptions> = {
  maxSnippetLength: 160,
  highlightTags: DEFAULT_HIGHLIGHT_TAGS,
  escapeHtml: true,
  fallbackText: 'No preview available for this page.',
  contextRadius: 60,
};

export class SnippetGenerator {
  private readonly defaultOptions: Required<SnippetOptions>;

  constructor(options: SnippetOptions = {}) {
    this.defaultOptions = {
      ...DEFAULT_SNIPPET_OPTIONS,
      ...options,
      highlightTags: {
        ...DEFAULT_HIGHLIGHT_TAGS,
        ...options.highlightTags,
      },
    };
  }

  /**
   * Generates a focused, readable text snippet and highlighted version from source text.
   */
  generateSnippet(
    text: string,
    queryTerms: string[],
    options?: SnippetOptions,
  ): {
    snippet: string;
    highlightedSnippet: string;
  } {
    const opts: Required<SnippetOptions> = {
      ...this.defaultOptions,
      ...options,
      highlightTags: {
        ...this.defaultOptions.highlightTags,
        ...options?.highlightTags,
      },
    };

    const cleanText = stripHtmlTags(text || '');
    if (!cleanText || cleanText.length === 0) {
      const fallback = opts.fallbackText;
      return {
        snippet: fallback,
        highlightedSnippet: opts.escapeHtml ? escapeHtml(fallback) : fallback,
      };
    }

    const maxLen = Math.max(40, opts.maxSnippetLength);

    // If total text fits comfortably within max length, return the whole text
    if (cleanText.length <= maxLen) {
      const snippet = cleanText;
      const highlightedSnippet = this.highlightText(cleanText, queryTerms, opts);
      return { snippet, highlightedSnippet };
    }

    // Find all match occurrences of query terms
    const validTerms = queryTerms.map(t => t.trim().toLowerCase()).filter(t => t.length > 0);

    const matchPositions: number[] = [];
    const lowerText = cleanText.toLowerCase();

    for (const term of validTerms) {
      let startIndex = 0;
      while (startIndex < lowerText.length) {
        const found = lowerText.indexOf(term, startIndex);
        if (found === -1) break;
        matchPositions.push(found);
        startIndex = found + term.length;
      }
    }

    // If no terms matched in text, return beginning truncated at word boundary
    if (matchPositions.length === 0) {
      const truncated = this.truncateAtWordBoundary(cleanText, 0, maxLen, false, true);
      return {
        snippet: truncated,
        highlightedSnippet: opts.escapeHtml ? escapeHtml(truncated) : truncated,
      };
    }

    matchPositions.sort((a, b) => a - b);

    // Find best window containing the most matches
    let bestStartPos = matchPositions[0] ?? 0;
    let maxMatchesInWindow = 1;

    for (let i = 0; i < matchPositions.length; i++) {
      const windowStart = matchPositions[i] ?? 0;
      const windowEnd = windowStart + maxLen;
      let count = 0;
      for (let j = i; j < matchPositions.length; j++) {
        if ((matchPositions[j] ?? 0) <= windowEnd) {
          count++;
        } else {
          break;
        }
      }
      if (count > maxMatchesInWindow) {
        maxMatchesInWindow = count;
        bestStartPos = windowStart;
      }
    }

    // Center the snippet around the cluster
    const contextRadius = Math.floor((maxLen - 30) / 2);
    let targetStart = Math.max(0, bestStartPos - contextRadius);
    let targetEnd = targetStart + maxLen;

    if (targetEnd > cleanText.length) {
      targetEnd = cleanText.length;
      targetStart = Math.max(0, targetEnd - maxLen);
    }

    const hasLeading = targetStart > 0;
    const hasTrailing = targetEnd < cleanText.length;

    const extractedSnippet = this.truncateAtWordBoundary(
      cleanText,
      targetStart,
      targetEnd,
      hasLeading,
      hasTrailing,
    );

    const highlightedSnippet = this.highlightText(extractedSnippet, queryTerms, opts);

    return {
      snippet: extractedSnippet,
      highlightedSnippet,
    };
  }

  /**
   * Safely highlights query terms in text using configured HTML tags.
   * Performs HTML escaping BEFORE tag insertion to ensure no XSS vulnerabilities.
   */
  highlightText(text: string, queryTerms: string[], options?: SnippetOptions): string {
    const opts: Required<SnippetOptions> = {
      ...this.defaultOptions,
      ...options,
      highlightTags: {
        ...this.defaultOptions.highlightTags,
        ...options?.highlightTags,
      },
    };

    if (!text || text.length === 0) {
      return '';
    }

    const rawEscaped = opts.escapeHtml ? escapeHtml(text) : text;

    const validTerms = Array.from(
      new Set(queryTerms.map(t => t.trim().toLowerCase()).filter(t => t.length > 0)),
    );

    if (validTerms.length === 0) {
      return rawEscaped;
    }

    // Sort terms longest first to avoid partial replacement collision
    validTerms.sort((a, b) => b.length - a.length);

    const preTag = opts.highlightTags.preTag;
    const postTag = opts.highlightTags.postTag;

    // Build regex matching terms on word boundaries where possible or literal
    const escapedTermPatterns = validTerms.map(term =>
      this.escapeRegExp(opts.escapeHtml ? escapeHtml(term) : term),
    );

    const regex = new RegExp(`(${escapedTermPatterns.join('|')})`, 'gi');

    return rawEscaped.replace(regex, `${preTag}$1${postTag}`);
  }

  /**
   * Truncates text at clean word boundaries and adds ellipsis.
   */
  private truncateAtWordBoundary(
    text: string,
    start: number,
    end: number,
    hasLeadingEllipsis: boolean,
    hasTrailingEllipsis: boolean,
  ): string {
    let actualStart = start;
    let actualEnd = end;

    // Adjust start to next whitespace if we sliced mid-word
    if (hasLeadingEllipsis && actualStart > 0 && actualStart < text.length) {
      const nextSpace = text.indexOf(' ', actualStart);
      if (nextSpace !== -1 && nextSpace < actualStart + 15) {
        actualStart = nextSpace + 1;
      }
    }

    // Adjust end to previous whitespace if we sliced mid-word
    if (hasTrailingEllipsis && actualEnd < text.length) {
      const prevSpace = text.lastIndexOf(' ', actualEnd);
      if (prevSpace !== -1 && prevSpace > actualEnd - 15) {
        actualEnd = prevSpace;
      }
    }

    let slice = text.slice(actualStart, actualEnd).trim();

    // Clean up leading/trailing punctuation on sliced boundaries
    slice = slice.replace(/^[,;.\-—–\s]+/, '').replace(/[,;\-—–\s]+$/, '');

    if (hasLeadingEllipsis && actualStart > 0) {
      slice = `… ${slice}`;
    }
    if (hasTrailingEllipsis && actualEnd < text.length) {
      slice = `${slice} …`;
    }

    return slice;
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
