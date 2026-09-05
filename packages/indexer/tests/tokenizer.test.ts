import { describe, it, expect } from 'vitest';
import { tokenize, isStopWord } from '../src/index.js';

describe('Tokenizer & Stop Words (Phase 9)', () => {
  it('should tokenize simple English sentences into tokens with positions and offsets', () => {
    const text = 'Fast search engine';
    const tokens = tokenize(text, { removeStopWords: false });

    expect(tokens).toHaveLength(3);

    expect(tokens[0]).toEqual({
      term: 'fast',
      position: 0,
      startOffset: 0,
      endOffset: 4,
    });

    expect(tokens[1]).toEqual({
      term: 'search',
      position: 1,
      startOffset: 5,
      endOffset: 11,
    });

    expect(tokens[2]).toEqual({
      term: 'engine',
      position: 2,
      startOffset: 12,
      endOffset: 18,
    });
  });

  it('should remove default stop words when removeStopWords is true', () => {
    const text = 'This is a fast and scalable search engine for the web';
    const tokens = tokenize(text, { removeStopWords: true });

    const terms = tokens.map(t => t.term);
    expect(terms).toContain('fast');
    expect(terms).toContain('scalable');
    expect(terms).toContain('search');
    expect(terms).toContain('engine');
    expect(terms).toContain('web');

    expect(terms).not.toContain('this');
    expect(terms).not.toContain('is');
    expect(terms).not.toContain('a');
    expect(terms).not.toContain('and');
    expect(terms).not.toContain('for');
    expect(terms).not.toContain('the');
  });

  it('should correctly identify stop words via isStopWord helper', () => {
    expect(isStopWord('the')).toBe(true);
    expect(isStopWord('and')).toBe(true);
    expect(isStopWord('search')).toBe(false);
    expect(isStopWord('opensearch')).toBe(false);
  });

  it('should filter tokens outside minTokenLength and maxTokenLength bounds', () => {
    const text = 'I am an extraordinarilylongtokenthatshouldexceedthelimit coder';
    const tokens = tokenize(text, {
      minTokenLength: 2,
      maxTokenLength: 20,
      removeStopWords: false,
    });

    const terms = tokens.map(t => t.term);
    expect(terms).toContain('am');
    expect(terms).toContain('an');
    expect(terms).toContain('coder');
    expect(terms).not.toContain('i');
    expect(terms).not.toContain('extraordinarilylongtokenthatshouldexceedthelimit');
  });

  it('should tokenize non-ASCII/multilingual tokens with accented characters', () => {
    const text = 'Café crème in München';
    const tokens = tokenize(text, { removeStopWords: false, stripAccents: true });

    const terms = tokens.map(t => t.term);
    expect(terms).toEqual(['cafe', 'creme', 'in', 'munchen']);
  });

  it('should handle empty or punctuation-only input gracefully', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('!@#$%^&*()_+{}[]:";\'<>?,./')).toEqual([]);
  });
});
