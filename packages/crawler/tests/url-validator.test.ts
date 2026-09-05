/**
 * Phase 4 Tests — URL Validator
 */

import { describe, it, expect } from 'vitest';
import { validateUrl } from '../src/url/url-validator.js';

describe('URL Validator — accepted URLs', () => {
  it('accepts plain http URL', () => {
    const r = validateUrl('http://example.com/page');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.parsed.protocol).toBe('http:');
  });

  it('accepts plain https URL', () => {
    const r = validateUrl('https://example.com/');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.parsed.protocol).toBe('https:');
  });

  it('accepts https URL with path and query', () => {
    const r = validateUrl('https://example.com/search?q=hello&page=2');
    expect(r.ok).toBe(true);
  });

  it('accepts URL with non-default port', () => {
    const r = validateUrl('http://example.com:8080/api');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.parsed.port).toBe('8080');
  });

  it('accepts URL with subdomains', () => {
    const r = validateUrl('https://blog.example.co.uk/article');
    expect(r.ok).toBe(true);
  });

  it('accepts URL with uppercase letters (normalizes to lowercase)', () => {
    const r = validateUrl('HTTPS://EXAMPLE.COM/Page');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.protocol).toBe('https:');
      expect(r.parsed.hostname).toBe('example.com');
    }
  });

  it('accepts URL with encoded characters', () => {
    const r = validateUrl('https://example.com/path%20with%20spaces');
    expect(r.ok).toBe(true);
  });

  it('accepts URL with fragment (fragment will be stripped in normalized form)', () => {
    const r = validateUrl('https://example.com/page#section');
    expect(r.ok).toBe(true);
    // normalized href should have no fragment
    if (r.ok) expect(r.parsed.href).not.toContain('#');
  });

  it('accepts URL with default http port (80 stripped from href)', () => {
    const r = validateUrl('http://example.com:80/page');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.href).not.toContain(':80');
      expect(r.parsed.port).toBe('');
    }
  });

  it('accepts URL with default https port (443 stripped from href)', () => {
    const r = validateUrl('https://example.com:443/page');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.href).not.toContain(':443');
    }
  });
});

describe('URL Validator — rejected schemes', () => {
  const unsupportedSchemes = [
    'javascript:alert(1)',
    'data:text/html,<h1>hi</h1>',
    'file:///etc/passwd',
    'ftp://files.example.com/pub/data.zip',
    'blob:https://example.com/uuid',
    'mailto:test@example.com',
    'tel:+1234567890',
    'about:blank',
    'chrome://settings',
    'ws://example.com/socket',
    'wss://example.com/socket',
  ];

  for (const url of unsupportedSchemes) {
    it(`rejects "${url.slice(0, 30)}..."`, () => {
      const r = validateUrl(url);
      expect(r.ok).toBe(false);
    });
  }
});

describe('URL Validator — malformed URLs', () => {
  it('rejects empty string', () => {
    expect(validateUrl('').ok).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(validateUrl('   ').ok).toBe(false);
  });

  it('rejects non-string (null)', () => {
    expect(validateUrl(null as unknown as string).ok).toBe(false);
  });

  it('rejects non-string (number)', () => {
    expect(validateUrl(42 as unknown as string).ok).toBe(false);
  });

  it('rejects non-string (undefined)', () => {
    expect(validateUrl(undefined as unknown as string).ok).toBe(false);
  });

  it('rejects URL with empty host (only scheme and path, no authority)', () => {
    // WHATWG URL: "https:///path" actually parses as hostname="path"
    // A truly hostless URL like "https:///" gives hostname=""
    // We test with a scheme-only string that fails WHATWG parse
    expect(validateUrl('https://').ok).toBe(false);
  });

  it('rejects completely malformed string', () => {
    expect(validateUrl('not a url at all !!!').ok).toBe(false);
  });

  it('rejects URL that is too long', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2048);
    expect(validateUrl(longUrl).ok).toBe(false);
  });

  it('provides reason string on rejection', () => {
    const r = validateUrl('ftp://example.com');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.reason).toBe('string');
  });
});

describe('URL Validator — private/loopback hosts', () => {
  const privateHosts = [
    'http://127.0.0.1/',
    'http://127.0.0.2/page',
    'http://10.0.0.1/',
    'http://10.255.255.255/admin',
    'http://192.168.1.1/',
    'http://172.16.0.1/',
    'http://172.31.255.255/',
    'http://169.254.1.1/',
    'http://localhost/',
  ];

  for (const url of privateHosts) {
    it(`rejects private host: ${url}`, () => {
      expect(validateUrl(url).ok).toBe(false);
    });
  }
});
