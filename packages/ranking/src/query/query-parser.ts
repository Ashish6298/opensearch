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

    // 4. Operator extraction (site:, intitle:, filetype:, exact:) (Phase 37)
    const filters: { site?: string; intitle?: string[]; exact?: string[]; filetype?: string } = {};
    let textAfterOperators = normalized;

    // 4a. site:<domain>
    const siteMatch = /(?:^|\s)site:([a-z0-9.-]+)/i.exec(textAfterOperators);
    if (siteMatch && siteMatch[1]) {
      filters.site = siteMatch[1].toLowerCase().trim();
      textAfterOperators = textAfterOperators.replace(/(?:^|\s)site:[a-z0-9.-]+/gi, ' ');
    }

    // 4b. filetype:<ext>
    const filetypeMatch = /(?:^|\s)filetype:([a-z0-9]+)/i.exec(textAfterOperators);
    if (filetypeMatch && filetypeMatch[1]) {
      filters.filetype = filetypeMatch[1].toLowerCase().trim();
      textAfterOperators = textAfterOperators.replace(/(?:^|\s)filetype:[a-z0-9]+/gi, ' ');
    }

    // 4c. intitle:<word>
    const intitleMatches = textAfterOperators.matchAll(/(?:^|\s)intitle:([\p{L}\p{N}_-]+)/giu);
    const intitles: string[] = [];
    for (const match of intitleMatches) {
      if (match[1]) {
        intitles.push(match[1].toLowerCase().trim());
      }
    }
    if (intitles.length > 0) {
      filters.intitle = intitles;
      textAfterOperators = textAfterOperators.replace(/(?:^|\s)intitle:[\p{L}\p{N}_-]+/giu, ' ');
    }

    // 4d. exact:<word>
    const exactMatches = textAfterOperators.matchAll(/(?:^|\s)exact:([\p{L}\p{N}_-]+)/giu);
    const exacts: string[] = [];
    for (const match of exactMatches) {
      if (match[1]) {
        exacts.push(match[1].toLowerCase().trim());
      }
    }
    if (exacts.length > 0) {
      filters.exact = exacts;
      textAfterOperators = textAfterOperators.replace(/(?:^|\s)exact:[\p{L}\p{N}_-]+/giu, ' ');
    }

    // 5. Phrase extraction
    const phrases: ParsedPhrase[] = [];
    let textAfterPhrases = textAfterOperators;

    if (
      this.enablePhraseExtraction &&
      (textAfterPhrases.includes('"') || textAfterPhrases.includes("'"))
    ) {
      // Match paired quotes e.g. "phrase text" or 'phrase text'
      const phraseRegex = /["']([^"']+)["']/g;
      let phraseMatch: RegExpExecArray | null;

      while ((phraseMatch = phraseRegex.exec(textAfterPhrases)) !== null) {
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

    // 6. Tokenization & Negation handling
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

    // Include intitle and exact terms in terms list for index lookup
    if (filters.intitle) {
      for (const it of filters.intitle) {
        if (!terms.includes(it)) {
          terms.push(it);
        }
      }
    }
    if (filters.exact) {
      for (const ex of filters.exact) {
        if (!terms.includes(ex)) {
          terms.push(ex);
        }
      }
    }

    const uniqueTerms = Array.from(new Set(terms));
    const isEmpty =
      terms.length === 0 &&
      phrases.length === 0 &&
      !filters.site &&
      !filters.filetype &&
      (!filters.intitle || filters.intitle.length === 0);

    return {
      rawQuery: inputStr,
      normalizedQuery: normalized,
      terms,
      uniqueTerms,
      phrases,
      negatedTerms,
      filters,
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
      filters: {},
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
