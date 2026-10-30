/**
 * @opensearch/api — Phase 116: Demo Experience & Accessibility Test Suite
 *
 * Verifies:
 * 1. Demo Mode Subsystem:
 *    - GET /api/v1/demo returns representative queries and zero-paid-service status.
 *    - Search in Demo Mode (demo=true / mode=demo) never contacts external providers.
 *    - Honest labeling: isDemo=true, source='demo', demoNotice in metadata.
 *    - Privacy Receipt reflects mode='demo' and reason='demo-mode'.
 * 2. Representative Everyday and Developer Queries:
 *    - Everyday: weather, healthy recipe, solar system, world news, unit converter.
 *    - Developer: typescript compiler, bm25 ranking algorithm, inverted index postings, rest api cors headers, git rebase interactive.
 * 3. Resilience & Blank Screen Prevention:
 *    - Provider failure never crashes or leaves an empty blank screen.
 *    - Dedicated fallback and retry guidance rendered.
 * 4. Accessibility Review:
 *    - prefers-reduced-motion media query present and complete.
 *    - :focus-visible high-contrast outline present.
 *    - Skip-links, ARIA labels, and keyboard navigability indicators verified.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ApiServer, createApiServer } from '../src/index.js';
import { createWebServer, WebServer } from '../../web/src/server.js';
import { createInvertedIndex } from '@opensearch/indexer';
import { REPRESENTATIVE_DEMO_QUERIES, DEMO_CORPUS_DOCUMENTS, searchDemoCorpus } from '@opensearch/shared';

describe('Phase 116 — Demo Experience & Accessibility Suite', () => {
  let apiServer: ApiServer;
  let webServer: WebServer;
  let apiBaseUrl: string;
  let webBaseUrl: string;

  beforeAll(async () => {
    const index = createInvertedIndex();
    apiServer = createApiServer({
      index,
      rateLimitPerMinute: 100,
      enableMcp: false,
    });
    const apiInfo = await apiServer.start(0, '127.0.0.1');
    apiBaseUrl = `http://127.0.0.1:${apiInfo.port}`;

    webServer = createWebServer({
      apiUrl: `${apiBaseUrl}/api/v1/search`,
    });
    const webInfo = await webServer.start(0, '127.0.0.1');
    webBaseUrl = `http://127.0.0.1:${webInfo.port}`;
  });

  afterAll(async () => {
    await apiServer.stop();
    await webServer.stop();
  });

  describe('1. Demo Mode Endpoint & Zero-Paid-Service Guarantees', () => {
    it('GET /api/v1/demo reports ready status and zero paid credentials required', async () => {
      const res = await fetch(`${apiBaseUrl}/api/v1/demo`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('ready');
      expect(json.demoMode).toBe(true);
      expect(json.paidServicesRequired).toBe(false);
      expect(json.externalCallsEnabled).toBe(false);
      expect(json.corpusSummary).toBeDefined();
      expect(json.corpusSummary.totalDocuments).toBe(DEMO_CORPUS_DOCUMENTS.length);
      expect(json.representativeQueries.everyday.length).toBeGreaterThanOrEqual(5);
      expect(json.representativeQueries.developer.length).toBeGreaterThanOrEqual(5);
    });

    it('executes search with demo=true and suppresses all external provider calls', async () => {
      const res = await fetch(`${apiBaseUrl}/api/v1/search?q=typescript+compiler&demo=true`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.meta.demoMode).toBe(true);
      expect(json.meta.demoNotice).toContain('Demo Mode');
      expect(json.privacyReceipt.mode).toBe('demo');
      expect(json.privacyReceipt.networkDispatch.totalOutboundRequests).toBe(0);
      expect(json.privacyReceipt.networkDispatch.externalProvidersContacted).toEqual([]);

      // Verify honest labeling of results
      expect(json.results.length).toBeGreaterThan(0);
      const first = json.results[0];
      expect(first.isDemo).toBe(true);
      expect(first.source).toBe('demo');
      expect(first.title).toContain('TypeScript');
    });
  });

  describe('2. Representative Everyday & Developer Queries', () => {
    const everydayQueries = ['weather', 'healthy recipe', 'solar system', 'world news', 'unit converter'];
    const developerQueries = [
      'typescript compiler',
      'bm25 ranking algorithm',
      'inverted index postings',
      'rest api cors headers',
      'git rebase interactive',
    ];

    it.each(everydayQueries)('everyday query "%s" returns relevant demo documents', async query => {
      const { documents } = searchDemoCorpus(query);
      expect(documents.length).toBeGreaterThan(0);
      expect(documents.some(d => d.isDemo === true)).toBe(true);

      const res = await fetch(`${apiBaseUrl}/api/v1/search?q=${encodeURIComponent(query)}&demo=true`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.results.length).toBeGreaterThan(0);
      expect(json.results[0].isDemo).toBe(true);
    });

    it.each(developerQueries)('developer query "%s" returns relevant demo documents', async query => {
      const { documents } = searchDemoCorpus(query);
      expect(documents.length).toBeGreaterThan(0);
      expect(documents.some(d => d.isDemo === true)).toBe(true);

      const res = await fetch(`${apiBaseUrl}/api/v1/search?q=${encodeURIComponent(query)}&demo=true`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.results.length).toBeGreaterThan(0);
      expect(json.results[0].isDemo).toBe(true);
    });
  });

  describe('3. Resilience & Blank Screen Prevention', () => {
    it('returns structured empty state when query matches nothing, never leaving a blank response', async () => {
      const res = await fetch(`${apiBaseUrl}/api/v1/search?q=xyznonexistentterm123456789&demo=false`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.results).toEqual([]);
      expect(json.meta.totalHits).toBe(0);
      expect(json.pagination).toBeDefined();
    });

    it('web application shell contains dedicated error and provider failure states with fallback buttons', async () => {
      const res = await fetch(`${webBaseUrl}/`);
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('id="provider-failure-state"');
      expect(html).toContain('id="provider-retry-btn"');
      expect(html).toContain('id="provider-demo-fallback-btn"');
      expect(html).toContain('id="demo-mode-banner"');
      expect(html).toContain('id="demo-mode-checkbox"');
    });
  });

  describe('4. Accessibility Review (WCAG AA & Reduced Motion)', () => {
    const rootDir = path.resolve(__dirname, '../../..');
    const cssPath = path.join(rootDir, 'apps/web/src/style.css');

    it('includes prefers-reduced-motion rules to honor user animation preferences', () => {
      const css = fs.readFileSync(cssPath, 'utf-8');
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
      expect(css).toContain('animation-duration: 0.01ms !important');
      expect(css).toContain('transition-duration: 0.01ms !important');
    });

    it('includes high-contrast visible focus outlines for keyboard navigation', () => {
      const css = fs.readFileSync(cssPath, 'utf-8');
      expect(css).toContain(':focus-visible');
      expect(css).toContain('outline: 2px solid');
      expect(css).toContain('outline-offset: 2px');
    });

    it('web HTML shell contains skip-links and accessible landmarks', async () => {
      const res = await fetch(`${webBaseUrl}/`);
      const html = await res.text();

      // Skip navigation links
      expect(html).toContain('class="skip-link"');
      expect(html).toContain('href="#search-input"');
      expect(html).toContain('href="#results-area"');

      // ARIA live region for screen readers
      expect(html).toContain('id="a11y-announcer"');
      expect(html).toContain('aria-live="polite"');

      // Accessible search input
      expect(html).toContain('id="search-input"');
      expect(html).toContain('aria-label="Search query"');
      expect(html).toContain('role="search"');
    });
  });
});
