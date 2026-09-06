import { describe, it, expect } from 'vitest';
import { createQueryParser, normalizeQueryText, foldQueryDiacritics } from '../src/index.js';

describe('Query Processing Pipeline (Phase 12)', () => {
  const parser = createQueryParser();

  describe('1. Validation & Input Types Safety', () => {
    it('should parse standard text queries into structured tokens', () => {
      const parsed = parser.parse('opensearch fast search engine');

      expect(parsed.rawQuery).toBe('opensearch fast search engine');
      expect(parsed.normalizedQuery).toBe('opensearch fast search engine');
      expect(parsed.terms).toEqual(['opensearch', 'fast', 'search', 'engine']);
      expect(parsed.uniqueTerms).toEqual(['opensearch', 'fast', 'search', 'engine']);
      expect(parsed.phrases).toHaveLength(0);
      expect(parsed.negatedTerms).toHaveLength(0);
      expect(parsed.isEmpty).toBe(false);
      expect(parsed.isClamped).toBe(false);
      expect(parsed.termCount).toBe(4);
    });

    it('should safely handle null, undefined, and non-string inputs without throwing', () => {
      expect(parser.parse(null)).toMatchObject({
        isEmpty: true,
        terms: [],
        phrases: [],
        negatedTerms: [],
        termCount: 0,
      });

      expect(parser.parse(undefined)).toMatchObject({
        isEmpty: true,
        terms: [],
      });

      expect(parser.parse(12345)).toMatchObject({
        isEmpty: false,
        terms: ['12345'],
      });

      expect(parser.parse(true)).toMatchObject({
        isEmpty: false,
        terms: ['true'],
      });

      expect(parser.parse({})).toMatchObject({
        isEmpty: true,
        terms: [],
      });

      expect(parser.parse([])).toMatchObject({
        isEmpty: true,
        terms: [],
      });
    });

    it('should handle empty string, whitespace only, and punctuation only queries', () => {
      const empty1 = parser.parse('');
      expect(empty1.isEmpty).toBe(true);
      expect(empty1.terms).toHaveLength(0);

      const empty2 = parser.parse('     \t\n  ');
      expect(empty2.isEmpty).toBe(true);
      expect(empty2.terms).toHaveLength(0);

      const empty3 = parser.parse('!@#$%^&*()_+{}|:"<>?[];\',./`~');
      expect(empty3.isEmpty).toBe(true);
      expect(empty3.terms).toHaveLength(0);
    });
  });

  describe('2. Length Limits & Boundary Clamping', () => {
    it('should clamp queries exceeding maximum allowed character limit', () => {
      const customParser = createQueryParser({ maxQueryLength: 30 });
      const longQuery =
        'this is an extraordinarily long query string designed to exceed thirty chars';

      const parsed = customParser.parse(longQuery);

      expect(parsed.isClamped).toBe(true);
      expect(parsed.normalizedQuery.length).toBeLessThanOrEqual(30);
      expect(parsed.terms.length).toBeGreaterThan(0);
    });

    it('should respect default SEARCH_LIMITS (200 characters)', () => {
      const longQuery = 'a '.repeat(150); // 300 chars
      const parsed = parser.parse(longQuery);

      expect(parsed.isClamped).toBe(true);
      expect(parsed.normalizedQuery.length).toBeLessThanOrEqual(200);
    });

    it('should filter out tokens exceeding maxTokenLength or under minTokenLength', () => {
      const customParser = createQueryParser({ minTokenLength: 2, maxTokenLength: 10 });
      const parsed = customParser.parse('a valid supercalifragilisticexpialidocious term');

      expect(parsed.terms).toContain('valid');
      expect(parsed.terms).toContain('term');
      expect(parsed.terms).not.toContain('a'); // < 2
      expect(parsed.terms).not.toContain('supercalifragilisticexpialidocious'); // > 10
    });
  });

  describe('3. Normalization & Multilingual / Non-ASCII Handling', () => {
    it('should normalize case folding, accents, and whitespace', () => {
      const parsed = parser.parse('  Crème   BRÛLÉE   München  ');

      expect(parsed.terms).toEqual(['creme', 'brulee', 'munchen']);
      expect(parsed.normalizedQuery).toBe('creme brulee munchen');
    });

    it('should strip null bytes and non-printable control characters safely', () => {
      const dirty = 'search\u0000term\u001Fwith\u007Fcontrol';
      const parsed = parser.parse(dirty);

      expect(parsed.terms).toContain('search');
      expect(parsed.terms).toContain('term');
    });

    it('should support non-Latin scripts (Cyrillic, CJK, Arabic, etc.) without crashing', () => {
      const cyrillic = parser.parse('поисковая система');
      expect(cyrillic.terms).toEqual(['поисковая', 'система']);

      const chinese = parser.parse('搜索引擎');
      expect(chinese.terms).toEqual(['搜索引擎']);

      const arabic = parser.parse('محرك بحث');
      expect(arabic.terms).toEqual(['محرك', 'بحث']);
    });
  });

  describe('4. Phrase Extraction (Quoted Search)', () => {
    it('should extract double-quoted exact match phrases and constituent terms', () => {
      const parsed = parser.parse('opensearch "open source search engine" tutorial');

      expect(parsed.phrases).toHaveLength(1);
      expect(parsed.phrases[0]?.rawPhrase).toBe('open source search engine');
      expect(parsed.phrases[0]?.terms).toEqual(['open', 'source', 'search', 'engine']);

      // Terms include free terms and phrase terms
      expect(parsed.terms).toContain('opensearch');
      expect(parsed.terms).toContain('tutorial');
      expect(parsed.terms).toContain('open');
      expect(parsed.terms).toContain('source');
    });

    it('should extract single-quoted phrases', () => {
      const parsed = parser.parse("'machine learning' algorithms");

      expect(parsed.phrases).toHaveLength(1);
      expect(parsed.phrases[0]?.rawPhrase).toBe('machine learning');
      expect(parsed.phrases[0]?.terms).toEqual(['machine', 'learning']);
    });

    it('should handle unclosed quotes gracefully without crashing', () => {
      const parsed = parser.parse('search "unclosed quote tutorial');

      expect(parsed.terms).toContain('search');
      expect(parsed.terms).toContain('unclosed');
      expect(parsed.terms).toContain('quote');
      expect(parsed.terms).toContain('tutorial');
    });
  });

  describe('5. Negation Handling (-term and NOT term)', () => {
    it('should parse minus-prefixed negated terms', () => {
      const parsed = parser.parse('javascript framework -angular -react vue');

      expect(parsed.terms).toContain('javascript');
      expect(parsed.terms).toContain('framework');
      expect(parsed.terms).toContain('vue');

      expect(parsed.negatedTerms).toContain('angular');
      expect(parsed.negatedTerms).toContain('react');
      expect(parsed.terms).not.toContain('angular');
      expect(parsed.terms).not.toContain('react');
    });

    it('should parse NOT keyword negated terms', () => {
      const parsed = parser.parse('database NOT sql nosql');

      expect(parsed.terms).toContain('database');
      expect(parsed.terms).toContain('nosql');
      expect(parsed.negatedTerms).toContain('sql');
      expect(parsed.terms).not.toContain('sql');
    });
  });

  describe('6. Standalone Normalizer & Tokenizer Utilities', () => {
    it('should expose normalizeQueryText and foldQueryDiacritics', () => {
      expect(normalizeQueryText('  FOO   BAR  ')).toBe('foo bar');
      expect(foldQueryDiacritics('café')).toBe('cafe');
    });

    it('should allow custom stop words configuration if enabled', () => {
      const customStopWords = new Set(['the', 'is', 'for']);
      const stopWordParser = createQueryParser({
        removeStopWords: true,
        customStopWords,
      });

      const parsed = stopWordParser.parse('the search engine for web is fast');
      expect(parsed.terms).toEqual(['search', 'engine', 'web', 'fast']);
    });
  });
});
