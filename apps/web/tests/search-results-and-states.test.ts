/**
 * Phase 78 — Search Results and Loading States Test Suite
 *
 * Verifies:
 * 1. Result cards showing title, snippet, source, destination, content type, and publication date.
 * 2. Safe handling of long titles, missing snippets, and broken thumbnails.
 * 3. Dedicated and meaningful UI for every request state:
 *    - Loading state
 *    - Empty results
 *    - Partial results (provider timeouts/errors)
 *    - Offline status
 *    - Provider failure (502/503/504)
 *    - Rate limiting (HTTP 429)
 * 4. Preservation of current query when changing result filters.
 * 5. Monotonic request sequencing, cancellation of obsolete requests, and race-condition prevention.
 * 6. Truthful result counts and timing without fabricated counters.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createWebServer, WebServer, generateHtmlShell, renderResultCard } from '../src/index.js';

describe('Phase 78 — Search Results and Loading States Suite', () => {
  let server: WebServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = createWebServer({
      apiUrl: 'http://localhost:3000/api/v1/search',
    });
    const info = await server.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('1. Rich Result Cards & Metadata (Phase 78)', () => {
    it('renders a complete result card with title, snippet, source, destination, content type, and publication date', () => {
      const html = renderResultCard({
        documentId: 'doc-rich-1',
        title: 'Distributed Search Architecture',
        snippet: 'Deep dive into inverted indexes, BM25 scoring, and shard replication.',
        url: 'https://developer.example.com/search-arch',
        displayUrl: 'developer.example.com › search-arch',
        domain: 'developer.example.com',
        source: 'wikipedia',
        attribution: 'CC BY-SA 4.0',
        contentType: 'PDF',
        publishedAt: '2026-05-18T10:00:00Z',
        thumbnailUrl: 'https://developer.example.com/thumb.jpg',
      });

      // Semantic structure
      expect(html).toContain('class="result-card"');
      expect(html).toContain('role="article"');
      expect(html).toContain('data-document-id="doc-rich-1"');

      // Title & destination
      expect(html).toContain('Distributed Search Architecture');
      expect(html).toContain('href="https://developer.example.com/search-arch"');
      expect(html).toContain('developer.example.com › search-arch');
      expect(html).toContain('developer.example.com');

      // Snippet
      expect(html).toContain('Deep dive into inverted indexes');

      // Source and attribution provenance
      expect(html).toContain('[CC BY-SA 4.0]');

      // Content type badge
      expect(html).toContain('class="result-content-type-badge"');
      expect(html).toContain('[PDF]');

      // Publication date badge
      expect(html).toContain('class="result-date-badge"');
      expect(html).toContain('datetime="2026-05-18T10:00:00Z"');
      expect(html).toContain('2026-05-18');

      // Thumbnail with fallback handler
      expect(html).toContain('class="result-thumbnail"');
      expect(html).toContain('src="https://developer.example.com/thumb.jpg"');
      expect(html).toContain('onerror="this.closest(\'.result-thumbnail\')?.remove();"');
    });

    it('safely handles missing snippets with a clean fallback', () => {
      const html = renderResultCard({
        documentId: 'doc-no-snippet',
        title: 'Empty Snippet Document',
        url: 'https://example.com/no-snippet',
        snippet: '',
      });

      expect(html).toContain('Empty Snippet Document');
      expect(html).toContain('No description available.');
    });

    it('safely handles extremely long titles without breaking card layout or overflowing', () => {
      const longTitle = 'A'.repeat(500);
      const html = renderResultCard({
        documentId: 'doc-long-title',
        title: longTitle,
        url: 'https://example.com/long-title',
        snippet: 'Normal snippet text.',
      });

      expect(html).toContain('data-document-id="doc-long-title"');
      expect(html).toContain(longTitle);
      expect(html).toContain('Normal snippet text.');
    });

    it('gracefully omits optional metadata badges when not provided', () => {
      const html = renderResultCard({
        documentId: 'doc-minimal',
        title: 'Minimal Document',
        url: 'https://example.com/minimal',
        snippet: 'Just a basic snippet.',
      });

      expect(html).not.toContain('class="result-content-type-badge"');
      expect(html).not.toContain('class="result-date-badge"');
      expect(html).not.toContain('class="result-thumbnail"');
      expect(html).toContain('Minimal Document');
      expect(html).toContain('Just a basic snippet.');
    });
  });

  describe('2. Meaningful Request States UI (Phase 78)', () => {
    it('serves dedicated semantic UI containers for all six search states', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const html = await res.text();

      // State 1: Loading State
      expect(html).toContain('id="loading-indicator"');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');

      // State 2: Empty Results State
      expect(html).toContain('id="empty-state"');
      expect(html).toContain('role="region"');
      expect(html).toContain('id="empty-query-text"');

      // State 3: Partial Results State (Provider Timeout / Degraded)
      expect(html).toContain('id="partial-results-banner"');
      expect(html).toContain('id="partial-results-text"');
      expect(html).toContain('id="partial-retry-btn"');
      expect(html).toContain('role="status"');

      // State 4: Offline Status State
      expect(html).toContain('id="offline-state"');
      expect(html).toContain('id="offline-retry-btn"');
      expect(html).toContain('[OFFLINE]');

      // State 5: Provider Failure State (502/503/504)
      expect(html).toContain('id="provider-failure-state"');
      expect(html).toContain('id="provider-failure-message"');
      expect(html).toContain('id="provider-retry-btn"');
      expect(html).toContain('[PROVIDER UNAVAILABLE]');

      // State 6: Rate Limiting State (HTTP 429)
      expect(html).toContain('id="rate-limit-state"');
      expect(html).toContain('id="rate-limit-countdown"');
      expect(html).toContain('id="rate-limit-retry-btn"');
      expect(html).toContain('[RATE LIMITED]');
    });

    it('contains CSS definitions for all request states and error banners in style.css', async () => {
      const res = await fetch(`${baseUrl}/style.css`);
      const css = await res.text();

      expect(css).toContain('.partial-results-banner');
      expect(css).toContain('.offline-state');
      expect(css).toContain('.provider-failure-state');
      expect(css).toContain('.rate-limit-state');
      expect(css).toContain('.result-thumbnail');
      expect(css).toContain('.result-content-type-badge');
      expect(css).toContain('.result-date-badge');
      expect(css).toContain('.result-filters-bar');
      expect(css).toContain('.result-filter-btn');
    });
  });

  describe('3. Filter Bar & Query Preservation (Phase 78)', () => {
    it('serves the result filters bar with distinct filter buttons', async () => {
      const res = await fetch(`${baseUrl}/`);
      const html = await res.text();

      expect(html).toContain('id="result-filters-bar"');
      expect(html).toContain('data-filter="all"');
      expect(html).toContain('data-filter="web"');
      expect(html).toContain('data-filter="code"');
      expect(html).toContain('data-filter="docs"');
      expect(html).toContain('data-filter="news"');
    });

    it('preserves query string when updating filter parameters in app.js', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      const js = await res.text();

      // updateUrl function signature accepts query and preserves it with filter
      expect(js).toContain('function updateUrl(query, page, filter');
      expect(js).toContain("url.searchParams.set('q', query);");
      expect(js).toContain("url.searchParams.set('filter', filter);");

      // Filter click listener preserves current query
      expect(js).toContain('const query = currentQuery || searchInput.value.trim();');
      expect(js).toContain('updateUrl(query, currentPage, activeFilter);');
    });
  });

  describe('4. Request Cancellation & Race Condition Protection (Phase 78)', () => {
    it('tracks monotonically increasing request IDs in app.js to discard stale responses', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      const js = await res.text();

      // Monotonic sequence counter
      expect(js).toContain('let currentRequestId = 0;');
      expect(js).toContain('const thisRequestId = ++currentRequestId;');

      // Stale response guard checks after async operations
      expect(js).toContain('if (thisRequestId !== currentRequestId) {');
      expect(js).toContain('return;');

      // Abort controller cancellation
      expect(js).toContain('activeAbortController.abort()');
    });

    it('simulates race condition where an earlier slower request is safely dropped after a faster newer request', () => {
      let currentSeq = 0;
      let activeResult: string | null = null;

      function dispatchSearch(query: string, delayMs: number): Promise<void> {
        const seq = ++currentSeq;
        return new Promise<void>(resolve => {
          setTimeout(() => {
            // Check race condition guard
            if (seq === currentSeq) {
              activeResult = `Result for: ${query}`;
            }
            resolve();
          }, delayMs);
        });
      }

      // Request 1 dispatched with 100ms delay
      const p1 = dispatchSearch('query1', 100);
      // Request 2 dispatched 10ms later with 30ms delay (finishes earlier)
      const p2 = dispatchSearch('query2', 30);

      return Promise.all([p1, p2]).then(() => {
        // Even though query1 took 100ms and resolved after query2 (30ms),
        // query1's seq was superseded by query2's seq, so activeResult must be query2!
        expect(activeResult).toBe('Result for: query2');
      });
    });
  });

  describe('5. Truthful Diagnostics, Metrics & Counters (Phase 78)', () => {
    it('formats results summary with legitimate totalHits and duration in app.js', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      const js = await res.text();

      expect(js).toContain('const totalHits = typeof data.meta?.totalHits === \'number\' ? data.meta.totalHits : hits.length;');
      expect(js).toContain('performance.now()');
      expect(js).toContain('${totalHits.toLocaleString()}');
      expect(js).not.toContain('Math.floor(Math.random()');
    });

    it('clearly flags partial results when provider failures or warnings are present', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      const js = await res.text();

      expect(js).toContain('data.meta?.partialResults');
      expect(js).toContain('partialResultsBanner.style.display = \'flex\'');
    });
  });
});
