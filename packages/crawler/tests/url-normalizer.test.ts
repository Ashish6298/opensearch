/**
 * Phase 4 Tests — URL Normalizer
 */

import { describe, it, expect } from 'vitest';
import { normalizeUrl } from '../src/url/url-normalizer.js';

function norm(url: string): string {
  const r = normalizeUrl(url);
  if (!r.ok) throw new Error(`Normalization failed: ${r.reason}`);
  return r.normalized;
}

describe('URL Normalizer — scheme and host casing', () => {
  it('lowercases http scheme', () => {
    expect(norm('HTTP://example.com/')).toBe('http://example.com/');
  });

  it('lowercases https scheme', () => {
    expect(norm('HTTPS://Example.COM/')).toBe('https://example.com/');
  });

  it('lowercases hostname', () => {
    expect(norm('https://WWW.EXAMPLE.COM/')).toBe('https://www.example.com/');
  });
});

describe('URL Normalizer — default port removal', () => {
  it('removes default http port 80', () => {
    expect(norm('http://example.com:80/')).toBe('http://example.com/');
    expect(norm('http://example.com:80/path')).toBe('http://example.com/path');
  });

  it('removes default https port 443', () => {
    expect(norm('https://example.com:443/')).toBe('https://example.com/');
  });

  it('preserves non-default port', () => {
    expect(norm('http://example.com:8080/')).toBe('http://example.com:8080/');
    expect(norm('https://example.com:8443/app')).toBe('https://example.com:8443/app');
  });
});

describe('URL Normalizer — fragment removal', () => {
  it('removes fragment from URL with path', () => {
    expect(norm('https://example.com/page#section')).toBe('https://example.com/page');
  });

  it('removes fragment-only URL', () => {
    expect(norm('https://example.com/#top')).toBe('https://example.com/');
  });

  it('removes fragment from URL with query', () => {
    expect(norm('https://example.com/page?q=1#anchor')).toBe('https://example.com/page?q=1');
  });

  it('URL without fragment is unchanged by fragment removal', () => {
    expect(norm('https://example.com/page')).toBe('https://example.com/page');
  });
});

describe('URL Normalizer — path normalization', () => {
  it('adds root slash when path is missing', () => {
    expect(norm('https://example.com')).toBe('https://example.com/');
  });

  it('preserves root slash', () => {
    expect(norm('https://example.com/')).toBe('https://example.com/');
  });

  it('removes trailing slash on non-root path', () => {
    expect(norm('https://example.com/path/')).toBe('https://example.com/path');
    expect(norm('https://example.com/a/b/')).toBe('https://example.com/a/b');
  });

  it('resolves dot segments in path', () => {
    expect(norm('https://example.com/a/./b')).toBe('https://example.com/a/b');
    expect(norm('https://example.com/a/b/../c')).toBe('https://example.com/a/c');
  });

  it('collapses double slashes in path', () => {
    expect(norm('https://example.com//double//slash')).toBe('https://example.com/double/slash');
  });

  it('preserves legitimate path structure', () => {
    expect(norm('https://example.com/blog/2024/01/post-title')).toBe(
      'https://example.com/blog/2024/01/post-title',
    );
  });
});

describe('URL Normalizer — query string handling', () => {
  it('preserves query string', () => {
    expect(norm('https://example.com/search?q=hello')).toBe('https://example.com/search?q=hello');
  });

  it('sorts query parameters alphabetically by key', () => {
    expect(norm('https://example.com/?b=2&a=1')).toBe('https://example.com/?a=1&b=2');
    expect(norm('https://example.com/?z=last&a=first&m=mid')).toBe(
      'https://example.com/?a=first&m=mid&z=last',
    );
  });

  it('preserves distinct query values (different resources)', () => {
    const u1 = norm('https://example.com/page?id=1');
    const u2 = norm('https://example.com/page?id=2');
    expect(u1).not.toBe(u2);
  });

  it('removes bare ? with empty query', () => {
    expect(norm('https://example.com/page?')).toBe('https://example.com/page');
  });

  it('preserves duplicate keys in original order within key group', () => {
    const r = norm('https://example.com/?tag=b&tag=a');
    // Both tag params preserved
    expect(r).toContain('tag=b');
    expect(r).toContain('tag=a');
  });

  it('does NOT incorrectly merge URLs with different query values', () => {
    // Critical: pagination should not collapse
    const page1 = norm('https://example.com/articles?page=1');
    const page2 = norm('https://example.com/articles?page=2');
    expect(page1).not.toBe(page2);
  });
});

describe('URL Normalizer — equivalent URL detection', () => {
  it('two URLs with same path but different casing produce same result', () => {
    expect(norm('HTTP://EXAMPLE.COM/page')).toBe(norm('http://example.com/page'));
  });

  it('URLs with/without default port normalize identically', () => {
    expect(norm('https://example.com:443/page')).toBe(norm('https://example.com/page'));
    expect(norm('http://example.com:80/page')).toBe(norm('http://example.com/page'));
  });

  it('URLs with trailing slash and without normalize to same form', () => {
    // Non-root: trailing slash removed
    expect(norm('https://example.com/path/')).toBe(norm('https://example.com/path'));
  });

  it('URLs with fragment normalize to same form as no-fragment', () => {
    expect(norm('https://example.com/page#sec1')).toBe(norm('https://example.com/page'));
    expect(norm('https://example.com/page#sec2')).toBe(norm('https://example.com/page'));
  });

  it('query-sorted URLs produce same canonical form', () => {
    expect(norm('https://example.com/?a=1&b=2')).toBe(norm('https://example.com/?b=2&a=1'));
  });
});

describe('URL Normalizer — error handling', () => {
  it('returns ok:false for unparseable input', () => {
    const r = normalizeUrl('not a url');
    expect(r.ok).toBe(false);
  });

  it('returns reason string on failure', () => {
    const r = normalizeUrl(':::malformed:::');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.reason).toBe('string');
  });
});
