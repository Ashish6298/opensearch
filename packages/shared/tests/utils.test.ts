import { describe, it, expect } from 'vitest';
import {
  normalizeWhitespace,
  clamp,
  safeJsonParse,
  isNonEmptyString,
  sanitizeUrl,
  maskSecret,
  deepClone,
} from '../src/index.js';

describe('Common Utilities', () => {
  it('should normalize whitespace cleanly', () => {
    expect(normalizeWhitespace('   hello    world  \n  test  ')).toBe('hello world test');
    expect(normalizeWhitespace('')).toBe('');
    expect(normalizeWhitespace(null)).toBe('');
    expect(normalizeWhitespace(undefined)).toBe('');
  });

  it('should clamp numbers within specified bounds', () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(-5, 1, 10)).toBe(1);
    expect(clamp(15, 1, 10)).toBe(10);
    expect(clamp(NaN, 1, 10)).toBe(1);
  });

  it('should safely parse JSON with fallbacks on invalid syntax', () => {
    expect(safeJsonParse('{"a": 1}', { a: 0 })).toEqual({ a: 1 });
    expect(safeJsonParse('{invalid json}', { fallback: true })).toEqual({ fallback: true });
  });

  it('should validate non-empty strings with type guard', () => {
    expect(isNonEmptyString('hello')).toBe(true);
    expect(isNonEmptyString('   ')).toBe(false);
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString(123)).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
  });

  it('should validate and sanitize URLs properly', () => {
    expect(sanitizeUrl('https://example.com/search?q=test')).toBe(
      'https://example.com/search?q=test',
    );
    expect(sanitizeUrl('http://example.org')).toBe('http://example.org/');
    expect(sanitizeUrl('ftp://example.org')).toBeNull(); // Reject non-http(s)
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('not a url')).toBeNull();
  });

  it('should mask secrets appropriately', () => {
    expect(maskSecret('secret123456')).toBe('se****56');
    expect(maskSecret('abc')).toBe('****');
    expect(maskSecret('')).toBe('[EMPTY]');
  });

  it('should deep clone objects', () => {
    const original = { a: 1, b: { c: 2 } };
    const clone = deepClone(original);
    clone.b.c = 99;
    expect(original.b.c).toBe(2);
  });
});
