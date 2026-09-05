/**
 * Phase 4 Tests — URL Fingerprint
 */

import { describe, it, expect } from 'vitest';
import { computeUrlHash, computeRawUrlHash } from '../src/url/url-fingerprint.js';

describe('URL Fingerprint — computeUrlHash', () => {
  it('returns a 64-character hex string', () => {
    const h = computeUrlHash('https://example.com/page');
    expect(h).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(h)).toBe(true);
  });

  it('is deterministic — same input always produces same output', () => {
    const url = 'https://example.com/article?id=42';
    expect(computeUrlHash(url)).toBe(computeUrlHash(url));
  });

  it('different normalized URLs produce different hashes', () => {
    const h1 = computeUrlHash('https://example.com/page1');
    const h2 = computeUrlHash('https://example.com/page2');
    expect(h1).not.toBe(h2);
  });

  it('semantically different URLs produce different hashes', () => {
    const h1 = computeUrlHash('https://example.com/page?id=1');
    const h2 = computeUrlHash('https://example.com/page?id=2');
    expect(h1).not.toBe(h2);
  });

  it('hash is lowercase hex', () => {
    const h = computeUrlHash('https://example.com/');
    expect(h).toBe(h.toLowerCase());
  });
});

describe('URL Fingerprint — computeRawUrlHash', () => {
  it('returns hash for valid http URL', () => {
    const h = computeRawUrlHash('http://example.com/');
    expect(h).not.toBeNull();
    expect(h).toHaveLength(64);
  });

  it('returns null for malformed URL', () => {
    expect(computeRawUrlHash('not a url')).toBeNull();
  });

  it('canonically equivalent raw URLs produce same hash', () => {
    // Default port stripped → same hash
    const h1 = computeRawUrlHash('http://example.com:80/');
    const h2 = computeRawUrlHash('http://example.com/');
    expect(h1).toBe(h2);
  });
});
