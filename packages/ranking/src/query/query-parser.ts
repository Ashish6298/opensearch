/**
 * @opensearch/ranking — Query Parser Implementation (Phase 12)
 *
 * Implements full query processing pipeline:
 * 1. Safe input validation & type-checking (handles null, undefined, objects, numbers, etc.)
 * 2. Length limits & boundary clamping (SEARCH_LIMITS.MAX_QUERY_LENGTH = 200)
 * 3. Normalization (Unicode NFC, case-folding, accent-folding, whitespace collapsing)
 * 4. Special character & phrase extraction (handles quoted strings `"exact match"`, unclosed quotes, malformed punctuation)
 * 5. Negation handling (e.g. `-spam`, `NOT junk`)
 * 6. Tokenization into clean search terms with length filters
 * 7. Empty & malformed query safety (returns well-formed empty ParsedQuery without crashing)
 */

import { SEARCH_LIMITS } from '@opensearch/shared';
import { ParsedPhrase, ParsedQuery, QueryParser, QueryParserOptions } from './query-types.js';
import { normalizeQueryText, foldDiacritics } from './query-normalizer.js';

export class DefaultQueryParser implements QueryParser {
  private readonly maxQueryLength: number;
  private readonly minTokenLength: number;
  private readonly maxTokenLength: number;
  private readonly removeStopWords: boolean;
  private readonly customStopWords?: ReadonlySet<string> | Set<string>;
  private readonly stripAccents: boolean;
  private readonly lowercase: boolean;
  private readonly enablePhraseExtraction: boolean;
  private readonly enableNegation: boolean;

  constructor(options: QueryParserOptions = {}) {
    this.maxQueryLength = options.maxQueryLength ?? SEARCH_LIMITS.MAX_QUERY_LENGTH;
    this.minTokenLength = options.minTokenLength ?? 1;
    this.maxTokenLength = options.maxTokenLength ?? 64;
    this.removeStopWords = options.removeStopWords ?? false;
    this.customStopWords = options.customStopWords;
    this.stripAccents = options.stripAccents ?? true;
    this.lowercase = options.lowercase ?? true;
    this.enablePhraseExtraction = options.enablePhraseExtraction ?? true;
    this.enableNegation = options.enableNegation ?? true;
  }

  parse(rawQuery: unknown): ParsedQuery {
    // 1. Safe input validation
    if (rawQuery === null || rawQuery === undefined) {
      return this.createEmptyParsedQuery('');
    }

    let inputStr: string;
    if (typeof rawQuery === 'string') {
      inputStr = rawQuery;
    } else if (
      typeof rawQuery === 'number' ||
      typeof rawQuery === 'boolean' ||
      typeof rawQuery === 'bigint'
    ) {
      inputStr = String(rawQuery);
    } else {
      // Objects, arrays, functions, symbols
      inputStr = '';
    }

    if (!inputStr.trim()) {
      return this.createEmptyParsedQuery(inputStr);
    }

    // 2. Length limits and clamping
    let isClamped = false;
    let clampedStr = inputStr;
    if (inputStr.length > this.maxQueryLength) {
      clampedStr = inputStr.slice(0, this.maxQueryLength);
      isClamped = true;
    }

    // 3. Normalization
    const normalized = normalizeQueryText(clampedStr, {
      stripAccents: this.stripAccents,
      lowercase: this.lowercase,
      preserveSyntaxChars: true,
    });

    if (!normalized) {
      return this.createEmptyParsedQuery(inputStr, isClamped);
    }

    // 4. Phrase extraction
    const phrases: ParsedPhrase[] = [];
    let textAfterPhrases = normalized;

    if (
      this.enablePhraseExtraction &&
      (textAfterPhrases.includes('"') || textAfterPhrases.includes("'"))
    ) {
      // Match paired quotes e.g. "phrase text" or 'phrase text'
      const phraseRegex = /["']([^"']+)["']/g;
      let phraseMatch: RegExpExecArray | null;

      while ((phraseMatch = phraseRegex.exec(normalized)) !== null) {
        const matchedGroup = phraseMatch[1];
        if (matchedGroup) {
          const rawPhraseText = matchedGroup.trim();
          if (rawPhraseText) {
            const phraseTerms = this.tokenize(rawPhraseText);
            if (phraseTerms.length > 0) {
              phrases.push({
                rawPhrase: rawPhraseText,
                terms: phraseTerms,
              });
            }
          }
        }
      }

      // Remove matched phrases from remaining text
      textAfterPhrases = textAfterPhrases.replace(/["']([^"']+)["']/g, ' ');
    }

    // 5. Tokenization & Negation handling
    const terms: string[] = [];
    const negatedTerms: string[] = [];

    // Split on whitespace or punctuation, checking negation prefixes
    // Word pattern matches tokens or tokens with leading minus e.g. -spam, NOT spam
    const tokenRegex = /(?:^|[^\p{L}\p{N}_-])(?:(not\s+)|(-))?([\p{L}\p{N}]+)/giu;
    let tokenMatch: RegExpExecArray | null;

    while ((tokenMatch = tokenRegex.exec(textAfterPhrases)) !== null) {
      const isNot = Boolean(tokenMatch[1]);
      const isMinus = Boolean(tokenMatch[2]);
      const rawTerm = tokenMatch[3];
      if (!rawTerm) {
        continue;
      }

      let term: string = rawTerm;
      if (this.stripAccents) {
        term = foldDiacritics(term);
      }
      if (this.lowercase) {
        term = term.toLowerCase();
      }

      if (term.length < this.minTokenLength || term.length > this.maxTokenLength) {
        continue;
      }

      if (this.removeStopWords && this.customStopWords && this.customStopWords.has(term)) {
        continue;
      }

      if (this.enableNegation && (isNot || isMinus)) {
        if (!negatedTerms.includes(term)) {
          negatedTerms.push(term);
        }
      } else {
        terms.push(term);
      }
    }

    // Also include any phrase terms in terms if not already present, or keep primary terms
    for (const phrase of phrases) {
      for (const phraseTerm of phrase.terms) {
        if (!terms.includes(phraseTerm)) {
          terms.push(phraseTerm);
        }
      }
    }

    const uniqueTerms = Array.from(new Set(terms));
    const isEmpty = terms.length === 0 && phrases.length === 0;

    return {
      rawQuery: inputStr,
      normalizedQuery: normalized,
      terms,
      uniqueTerms,
      phrases,
      negatedTerms,
      isEmpty,
      isClamped,
      termCount: terms.length,
    };
  }

  normalize(text: string): string {
    return normalizeQueryText(text, {
      stripAccents: this.stripAccents,
      lowercase: this.lowercase,
      preserveSyntaxChars: false,
    });
  }

  tokenize(text: string): string[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const wordRegex = /[\p{L}\p{N}]+/gu;
    const tokens: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = wordRegex.exec(text)) !== null) {
      let term = match[0];
      if (this.stripAccents) {
        term = foldDiacritics(term);
      }
      if (this.lowercase) {
        term = term.toLowerCase();
      }

      if (term.length >= this.minTokenLength && term.length <= this.maxTokenLength) {
        if (!this.removeStopWords || !this.customStopWords || !this.customStopWords.has(term)) {
          tokens.push(term);
        }
      }
    }

    return tokens;
  }

  private createEmptyParsedQuery(rawQuery: string, isClamped = false): ParsedQuery {
    return {
      rawQuery,
      normalizedQuery: '',
      terms: [],
      uniqueTerms: [],
      phrases: [],
      negatedTerms: [],
      isEmpty: true,
      isClamped,
      termCount: 0,
    };
  }
}

/**
 * Factory creating a configured QueryParser instance.
 */
export function createQueryParser(options?: QueryParserOptions): QueryParser {
  return new DefaultQueryParser(options);
}
