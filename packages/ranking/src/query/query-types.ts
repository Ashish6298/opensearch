/**
 * @opensearch/ranking — Query Processing Types (Phase 12)
 *
 * Defines contracts, models, and options for validating, parsing,
 * normalizing, and tokenizing user search queries into structured
 * query representations (terms, phrases, filter tokens, negation).
 */

export interface ParsedPhrase {
  /** The normalized phrase text (e.g., 'open search') */
  rawPhrase: string;
  /** Ordered array of constituent normalized terms in the phrase */
  terms: string[];
}

export interface ParsedQuery {
  /** The original raw query string submitted by the user */
  rawQuery: string;
  /** Cleaned, normalized query string */
  normalizedQuery: string;
  /** Ordered list of individual search terms */
  terms: string[];
  /** Unique deduplicated set of search terms */
  uniqueTerms: string[];
  /** Exact match phrases extracted from quotation marks */
  phrases: ParsedPhrase[];
  /** Negated terms (prefixed with '-' or 'NOT') to exclude */
  negatedTerms: string[];
  /** Whether the query was completely empty or blank */
  isEmpty: boolean;
  /** Whether the query was clamped due to exceeding maximum allowed length */
  isClamped: boolean;
  /** Total count of searchable terms (including phrase terms) */
  termCount: number;
}

export interface QueryParserOptions {
  /** Maximum length of raw query in characters (default: 200 from SEARCH_LIMITS) */
  maxQueryLength?: number;
  /** Minimum length of a token in characters (default: 1) */
  minTokenLength?: number;
  /** Maximum length of an individual token in characters (default: 64) */
  maxTokenLength?: number;
  /** Whether to filter out stop words (default: false for query to preserve user intent, but configurable) */
  removeStopWords?: boolean;
  /** Custom stop words set */
  customStopWords?: ReadonlySet<string> | Set<string>;
  /** Whether to strip/fold diacritics and accents (default: true) */
  stripAccents?: boolean;
  /** Whether to convert query terms to lowercase (default: true) */
  lowercase?: boolean;
  /** Whether to extract quoted phrases e.g. "open source" (default: true) */
  enablePhraseExtraction?: boolean;
  /** Whether to extract negated terms e.g. -spam or NOT spam (default: true) */
  enableNegation?: boolean;
}

export interface QueryParser {
  /**
   * Parses, validates, and tokenizes a raw query string into a structured ParsedQuery.
   * Never throws on malformed, oversized, or empty input.
   */
  parse(rawQuery: unknown): ParsedQuery;

  /**
   * Normalizes a query string or term according to query normalization rules.
   */
  normalize(text: string): string;

  /**
   * Tokenizes a normalized query string into terms.
   */
  tokenize(text: string): string[];
}
