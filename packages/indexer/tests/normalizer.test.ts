import { describe, it, expect } from 'vitest';
import { normalizeText, foldDiacritics, stripPunctuation } from '../src/index.js';

describe('Text Normalizer (Phase 9)', () => {
  it('should fold uppercase to lowercase by default', () => {
    expect(normalizeText('Hello World!')).toBe('hello world!');
    expect(normalizeText('OPENSEARCH')).toBe('opensearch');
  });

  it('should fold diacritics and accents correctly', () => {
    expect(foldDiacritics('crème brûlée')).toBe('creme brulee');
    expect(foldDiacritics('München')).toBe('Munchen');
    expect(foldDiacritics('naïve')).toBe('naive');
    expect(foldDiacritics('résumé')).toBe('resume');
  });

  it('should remove control characters while preserving valid content', () => {
    const raw = 'Hello\u0000 World\u001F!';
    expect(normalizeText(raw)).toBe('hello world!');
  });

  it('should strip punctuation cleanly', () => {
    expect(stripPunctuation('Hello, world! How are you? #search-engine')).toBe(
      'Hello world How are you search engine',
    );
  });

  it('should handle multilingual / non-ASCII text without error', () => {
    expect(normalizeText('Привет мир')).toBe('привет мир'); // Russian Cyrillic
    expect(normalizeText('你好世界')).toBe('你好世界'); // Chinese Simplified
    expect(normalizeText('こんにちは世界')).toBe('こんにちは世界'); // Japanese
    expect(normalizeText('مرحبا بالعالم')).toBe('مرحبا بالعالم'); // Arabic
  });

  it('should handle empty or whitespace-only text safely', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText('   ')).toBe('   ');
    expect(stripPunctuation('')).toBe('');
    expect(foldDiacritics('')).toBe('');
  });
});
