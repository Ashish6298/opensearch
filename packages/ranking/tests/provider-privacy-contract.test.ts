/**
 * @opensearch/ranking — Provider Privacy Contract Verification Tests (Phase 86)
 *
 * Verifies that:
 * 1. All official search providers pass the strict OpenSearch Privacy Contract.
 * 2. Every future search provider is strictly bounded by the privacy contract.
 * 3. Prohibited behaviors (IP forwarding, cookie forwarding, SSRF, non-HTTPS endpoints)
 *    are immediately detected and rejected.
 */

import { describe, it, expect } from 'vitest';
import {
  WikimediaProvider,
  HackerNewsProvider,
  WikimediaImageProvider,
  MockSearchProvider,
  validateProviderPrivacyContract,
  assertProviderPrivacyContract,
  SearchProvider,
} from '../src/index.js';

describe('Phase 86 — Provider Privacy Contract & Invariant Enforcement', () => {
  it('validates that WikimediaProvider conforms 100% to privacy contract', () => {
    const provider = new WikimediaProvider();
    const result = validateProviderPrivacyContract(provider);

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(() => assertProviderPrivacyContract(provider)).not.toThrow();
  });

  it('validates that HackerNewsProvider conforms 100% to privacy contract', () => {
    const provider = new HackerNewsProvider();
    const result = validateProviderPrivacyContract(provider);

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(() => assertProviderPrivacyContract(provider)).not.toThrow();
  });

  it('validates that WikimediaImageProvider conforms 100% to privacy contract', () => {
    const provider = new WikimediaImageProvider();
    const result = validateProviderPrivacyContract(provider);

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(() => assertProviderPrivacyContract(provider)).not.toThrow();
  });

  it('validates that MockSearchProvider conforms 100% to privacy contract', () => {
    const provider = new MockSearchProvider();
    const result = validateProviderPrivacyContract(provider);

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(() => assertProviderPrivacyContract(provider)).not.toThrow();
  });

  it('detects and rejects any future provider that attempts to forward client IP addresses', () => {
    const nonCompliantProvider: SearchProvider = {
      metadata: {
        id: 'leaky-ip-provider',
        displayName: 'Leaky IP Provider',
        supportedCategories: ['general'],
        endpoint: 'https://leaky.example.com/search',
        attribution: { name: 'Leaky', url: 'https://leaky.example.com' },
        rateLimits: { maxRequestsPerMinute: 60 },
        timeoutMs: 2000,
        cachePolicy: { enabled: true, ttlSeconds: 300 },
        privacy: {
          querySentToOrigin: true,
          forwardClientIp: true as any, // VIOLATION
          forwardCookies: false,
          logsRetentionPolicy: 'none',
          requiresAuth: false,
        },
      },
      isEnabled: () => true,
      setEnabled: () => {},
      search: async () => ({ providerId: 'leaky', results: [], durationMs: 10 }),
    };

    const result = validateProviderPrivacyContract(nonCompliantProvider);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('forwardClientIp must be strictly false'))).toBe(true);
    expect(() => assertProviderPrivacyContract(nonCompliantProvider)).toThrowError(/forwardClientIp/);
  });

  it('detects and rejects any future provider that attempts to forward cookies/session tokens', () => {
    const cookieTrackingProvider: SearchProvider = {
      metadata: {
        id: 'cookie-tracking-provider',
        displayName: 'Cookie Tracking Provider',
        supportedCategories: ['general'],
        endpoint: 'https://tracking.example.com/search',
        attribution: { name: 'Tracker', url: 'https://tracking.example.com' },
        rateLimits: { maxRequestsPerMinute: 60 },
        timeoutMs: 2000,
        cachePolicy: { enabled: true, ttlSeconds: 300 },
        privacy: {
          querySentToOrigin: true,
          forwardClientIp: false,
          forwardCookies: true as any, // VIOLATION
          logsRetentionPolicy: 'none',
          requiresAuth: false,
        },
      },
      isEnabled: () => true,
      setEnabled: () => {},
      search: async () => ({ providerId: 'tracking', results: [], durationMs: 10 }),
    };

    const result = validateProviderPrivacyContract(cookieTrackingProvider);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('forwardCookies must be strictly false'))).toBe(true);
  });

  it('detects and rejects insecure HTTP endpoints and private network targets (SSRF prevention)', () => {
    const ssrfProvider: SearchProvider = {
      metadata: {
        id: 'ssrf-provider',
        displayName: 'SSRF Attack Provider',
        supportedCategories: ['general'],
        endpoint: 'http://169.254.169.254/latest/meta-data', // VIOLATION: insecure & cloud metadata
        attribution: { name: 'SSRF', url: 'http://ssrf.internal' },
        rateLimits: { maxRequestsPerMinute: 60 },
        timeoutMs: 2000,
        cachePolicy: { enabled: true, ttlSeconds: 300 },
        privacy: {
          querySentToOrigin: true,
          forwardClientIp: false,
          forwardCookies: false,
          logsRetentionPolicy: 'none',
          requiresAuth: false,
        },
      },
      isEnabled: () => true,
      setEnabled: () => {},
      search: async () => ({ providerId: 'ssrf', results: [], durationMs: 10 }),
    };

    const result = validateProviderPrivacyContract(ssrfProvider);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('secure HTTPS transport'))).toBe(true);
    expect(result.violations.some((v) => v.includes('SSRF risk'))).toBe(true);
  });
});
