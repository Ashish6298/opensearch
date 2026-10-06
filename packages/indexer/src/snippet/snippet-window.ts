/**
 * @opensearch/indexer — Snippet Windowing Extractor (Phase 47)
 *
 * Implements a high-precision sliding-window query term density algorithm:
 * 1. Computes term density across text spans to identify the most relevant context window.
 * 2. Enforces maximum 180 character limit per extracted snippet window.
 * 3. Respects clean sentence / word boundaries with ellipsis prefixing and suffixing.
 * 4. Provides dual decorators: HTML `<mark>` tags for Web UI and ANSI bold/highlight for CLI.
 */

export interface SnippetWindowOptions {
  /** Maximum length in characters (default: 180, strictly <= 180) */
  maxLength?: number;
  /** Fallback message when text is empty */
  fallbackText?: string;
  /** Target presentation format: 'html' | 'ansi' | 'plain' (default: 'html') */
  format?: 'html' | 'ansi' | 'plain';
}

export interface ExtractedSnippetWindow {
  /** Raw plain text snippet with clean word/sentence boundaries and ellipsis */
  plainText: string;
  /** Highlighted snippet ready for Web (HTML mark) or CLI (ANSI color) */
  highlightedText: string;
  /** Count of query term occurrences captured within the window */
  termDensity: number;
  /** Starting character index of the window in original text */
  startIndex: number;
  /** Ending character index of the window in original text */
  endIndex: number;
}

const ANSI_HIGHLIGHT = '\x1b[1m\x1b[33m'; // Bold Yellow
const ANSI_RESET = '\x1b[0m';

export class SnippetWindowExtractor {
  private readonly maxLength: number;
  private readonly fallbackText: string;
  private readonly defaultFormat: 'html' | 'ansi' | 'plain';

  constructor(options: SnippetWindowOptions = {}) {
    this.maxLength = Math.min(180, Math.max(40, options.maxLength ?? 180));
    this.fallbackText = options.fallbackText ?? 'No description available.';
    this.defaultFormat = options.format ?? 'html';
  }

  /**
   * Extracts the highest term-density window from document text for the given query terms.
   */
  extractWindow(
    text: string,
    queryTerms: string[],
    options?: SnippetWindowOptions,
  ): ExtractedSnippetWindow {
    const maxLen = Math.min(180, Math.max(40, options?.maxLength ?? this.maxLength));
    const fallback = options?.fallbackText ?? this.fallbackText;
    const format = options?.format ?? this.defaultFormat;

    const cleanText = this.sanitizeText(text || '');
    if (!cleanText || cleanText.length === 0) {
      return {
        plainText: fallback,
        highlightedText: this.decorate(fallback, [], format),
        termDensity: 0,
        startIndex: 0,
        endIndex: 0,
      };
    }

    // If entire text fits inside maximum length, decorate directly
    if (cleanText.length <= maxLen) {
      const validTerms = this.normalizeTerms(queryTerms);
      return {
        plainText: cleanText,
        highlightedText: this.decorate(cleanText, validTerms, format),
        termDensity: this.countOccurrences(cleanText, validTerms),
        startIndex: 0,
        endIndex: cleanText.length,
      };
    }

    const validTerms = this.normalizeTerms(queryTerms);
    const lowerText = cleanText.toLowerCase();

    // Collect positions of all term occurrences
    const termMatches: Array<{ index: number; length: number; term: string }> = [];
    for (const term of validTerms) {
      let startIndex = 0;
      while (startIndex < lowerText.length) {
        const found = lowerText.indexOf(term, startIndex);
        if (found === -1) break;
        termMatches.push({ index: found, length: term.length, term });
        startIndex = found + term.length;
      }
    }

    // If no terms matched in document text, return leading text truncated at word boundary
    if (termMatches.length === 0) {
      const { snippet, start, end } = this.truncateWindow(cleanText, 0, maxLen, false, true);
      return {
        plainText: snippet,
        highlightedText: this.decorate(snippet, [], format),
        termDensity: 0,
        startIndex: start,
        endIndex: end,
      };
    }

    termMatches.sort((a, b) => a.index - b.index);

    // Sliding window algorithm: find span of width maxLen with maximum term occurrences
    let bestStartIndex = termMatches[0]?.index ?? 0;
    let maxTermsInWindow = 1;

    for (let i = 0; i < termMatches.length; i++) {
      const currentPos = termMatches[i]?.index ?? 0;
      const windowEnd = currentPos + maxLen;
      let count = 0;
      for (let j = i; j < termMatches.length; j++) {
        if ((termMatches[j]?.index ?? 0) <= windowEnd) {
          count++;
        } else {
          break;
        }
      }
      if (count > maxTermsInWindow) {
        maxTermsInWindow = count;
        bestStartIndex = currentPos;
      }
    }

    // Center the window around the densest cluster
    const contextRadius = Math.floor((maxLen - 30) / 2);
    let targetStart = Math.max(0, bestStartIndex - contextRadius);
    let targetEnd = targetStart + maxLen;

    if (targetEnd > cleanText.length) {
      targetEnd = cleanText.length;
      targetStart = Math.max(0, targetEnd - maxLen);
    }

    const hasLeading = targetStart > 0;
    const hasTrailing = targetEnd < cleanText.length;

    const { snippet, start, end } = this.truncateWindow(
      cleanText,
      targetStart,
      targetEnd,
      hasLeading,
      hasTrailing,
    );

    const highlightedText = this.decorate(snippet, validTerms, format);

    return {
      plainText: snippet,
      highlightedText,
      termDensity: maxTermsInWindow,
      startIndex: start,
      endIndex: end,
    };
  }

  /**
   * Decorates text with HTML `<mark>` or ANSI styling depending on target format.
   */
  decorate(text: string, terms: string[], format: 'html' | 'ansi' | 'plain'): string {
    if (!text || terms.length === 0 || format === 'plain') {
      return format === 'html' ? this.escapeHtml(text) : text;
    }

    const validTerms = Array.from(new Set(terms.filter(Boolean)));
    if (validTerms.length === 0) {
      return format === 'html' ? this.escapeHtml(text) : text;
    }

    // Sort terms longest first to avoid substring collisions
    validTerms.sort((a, b) => b.length - a.length);

    if (format === 'ansi') {
      const escapedTerms = validTerms.map(t => this.escapeRegExp(t));
      const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
      return text.replace(regex, `${ANSI_HIGHLIGHT}$1${ANSI_RESET}`);
    }

    // HTML format: escape raw text first, then wrap matched terms with <mark>
    const safeText = this.escapeHtml(text);
    const escapedTerms = validTerms.map(t => this.escapeRegExp(this.escapeHtml(t)));
    const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
    return safeText.replace(regex, '<mark>$1</mark>');
  }

  private truncateWindow(
    text: string,
    start: number,
    end: number,
    hasLeading: boolean,
    hasTrailing: boolean,
  ): { snippet: string; start: number; end: number } {
    let actualStart = start;
    let actualEnd = end;

    if (hasLeading && actualStart > 0 && actualStart < text.length) {
      const nextSpace = text.indexOf(' ', actualStart);
      if (nextSpace !== -1 && nextSpace < actualStart + 15) {
        actualStart = nextSpace + 1;
      }
    }

    if (hasTrailing && actualEnd < text.length) {
      const prevSpace = text.lastIndexOf(' ', actualEnd);
      if (prevSpace !== -1 && prevSpace > actualEnd - 15) {
        actualEnd = prevSpace;
      }
    }

    let slice = text.slice(actualStart, actualEnd).trim();
    slice = slice.replace(/^[,;.\-—–\s]+/, '').replace(/[,;\-—–\s]+$/, '');

    if (hasLeading && actualStart > 0) {
      slice = `... ${slice}`;
    }
    if (hasTrailing && actualEnd < text.length) {
      slice = `${slice} ...`;
    }

    return { snippet: slice, start: actualStart, end: actualEnd };
  }

  private sanitizeText(raw: string): string {
    return raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeTerms(terms: string[]): string[] {
    return terms
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);
  }

  private countOccurrences(text: string, terms: string[]): number {
    const lower = text.toLowerCase();
    let count = 0;
    for (const t of terms) {
      let idx = 0;
      while ((idx = lower.indexOf(t, idx)) !== -1) {
        count++;
        idx += t.length;
      }
    }
    return count;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * Factory creating SnippetWindowExtractor instance.
 */
export function createSnippetWindowExtractor(
  options?: SnippetWindowOptions,
): SnippetWindowExtractor {
  return new SnippetWindowExtractor(options);
}
