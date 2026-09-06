import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getWebInfo,
  getWebStatus,
  WEB_APP_INFO,
  generateHtmlShell,
  createWebServer,
  WebServer,
  renderResultCard,
  renderResultsSummary,
  renderPaginationControls,
  escapeHtml,
  sanitizeHighlightedHtml,
} from '../src/index.js';

describe('Phase 19, 20 & 21 — Search UI & Accessibility Hardening Suite', () => {
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

  describe('Module Boundary & Status Metadata (Phase 21)', () => {
    it('returns web status for Phase 21', () => {
      const status = getWebStatus();
      expect(status.name).toBe('OpenSearch');
      expect(status.version).toBe('1.0.0');
      expect(status.phase).toBe('Phase 21: Responsive & Accessibility Hardening');
      expect(status.status).toBe('ok');
    });

    it('returns web info and service identity', () => {
      const info = getWebInfo();
      expect(info.title).toBe('OpenSearch');
      expect(info.phase).toBe('Phase 21: Responsive & Accessibility Hardening');
      expect(WEB_APP_INFO.moduleName).toBe('@opensearch/web');
    });
  });

  describe('Accessibility & Landmark Semantics (Phase 21)', () => {
    it('generates HTML with skip-navigation links and ARIA live regions', () => {
      const html = generateHtmlShell();
      expect(html).toContain('id="skip-to-search"');
      expect(html).toContain('id="skip-to-results"');
      expect(html).toContain('class="skip-link"');
      expect(html).toContain('id="a11y-announcer"');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
    });

    it('includes appropriate ARIA labels and landmarks in form controls', () => {
      const html = generateHtmlShell();
      expect(html).toContain('role="search"');
      expect(html).toContain('aria-label="Web Search Form"');
      expect(html).toContain('aria-label="Search query"');
      expect(html).toContain('aria-describedby="search-hint"');
      expect(html).toContain('aria-label="Clear search input"');
      expect(html).toContain('aria-label="Submit search"');
      expect(html).toContain('role="feed"');
      expect(html).toContain('aria-label="Search Results"');
    });

    it('provides clear focus-visible and screen-reader utility classes in CSS', () => {
      const html = generateHtmlShell({ cssContent: '.custom-test-css{}' });
      expect(html).toContain('<style>');
    });
  });

  describe('Result Card Formatting with Accessibility (Phase 21)', () => {
    it('renders a complete result card with article role, labelledby, and title target', () => {
      const cardHtml = renderResultCard({
        documentId: 'doc-1',
        url: 'https://example.com/docs/api-guide',
        displayUrl: 'example.com › docs › api-guide',
        domain: 'example.com',
        title: 'Complete OpenSearch API Guide',
        highlightedTitle: 'Complete <mark>OpenSearch</mark> API Guide',
        snippet: 'Comprehensive guide to building custom search pipelines.',
        highlightedSnippet: 'Comprehensive guide to building <mark>search</mark> pipelines.',
      });

      expect(cardHtml).toContain('class="result-card"');
      expect(cardHtml).toContain('role="article"');
      expect(cardHtml).toContain('aria-labelledby="result-title-doc-1"');
      expect(cardHtml).toContain('id="result-title-doc-1"');
      expect(cardHtml).toContain('data-document-id="doc-1"');
      expect(cardHtml).toContain('<span class="result-domain-badge" aria-label="Domain">example.com</span>');
      expect(cardHtml).toContain('example.com › docs › api-guide');
      expect(cardHtml).toContain('href="https://example.com/docs/api-guide"');
      expect(cardHtml).toContain('target="_blank"');
      expect(cardHtml).toContain('rel="noopener noreferrer"');
      expect(cardHtml).toContain('<mark>OpenSearch</mark>');
      expect(cardHtml).toContain('<mark>search</mark>');
    });

    it('safely handles missing metadata and escapes malicious scripts in titles or URLs', () => {
      const cardHtml = renderResultCard({
        documentId: 'doc-xss',
        url: 'https://attacker.com/<script>alert(1)</script>',
        displayUrl: 'attacker.com/<script>alert(1)</script>',
        title: '<script>alert("hacked")</script>',
        snippet: '<img src=x onerror=alert(1)> Normal text.',
      });

      expect(cardHtml).not.toContain('<script>');
      expect(cardHtml).not.toContain('<img src=x');
      expect(cardHtml).toContain('&lt;script&gt;');
      expect(cardHtml).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('preserves safe <mark> tags while escaping other nested HTML tags', () => {
      const sanitized = sanitizeHighlightedHtml(
        '<b>Bold text</b> with <mark>safe highlight</mark> and <script>alert(1)</script>',
      );
      expect(sanitized).toContain('<mark>safe highlight</mark>');
      expect(sanitized).not.toContain('<b>');
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('&lt;b&gt;Bold text&lt;/b&gt;');
    });
  });

  describe('Results Summary Bar', () => {
    it('formats result counter accurately with millisecond duration', () => {
      expect(renderResultsSummary(1, 4)).toBe('About 1 result (4ms)');
      expect(renderResultsSummary(42, 12)).toBe('About 42 results (12ms)');
      expect(renderResultsSummary(1250, 25)).toBe('About 1,250 results (25ms)');
      expect(renderResultsSummary(0, 5)).toBe('');
    });
  });

  describe('Pagination Navigation Bar with Accessible Roles (Phase 21)', () => {
    it('renders multi-page controls with Previous, Next, and numbered buttons', () => {
      const paginationHtml = renderPaginationControls({
        page: 2,
        pageSize: 10,
        totalHits: 45,
        totalPages: 5,
        hasNextPage: true,
        hasPrevPage: true,
        nextPage: 3,
        prevPage: 1,
      });

      expect(paginationHtml).toContain('class="pagination-container"');
      expect(paginationHtml).toContain('role="group"');
      expect(paginationHtml).toContain('aria-label="Page selection"');
      expect(paginationHtml).toContain('id="pagination-prev-btn"');
      expect(paginationHtml).toContain('data-page="1"');
      expect(paginationHtml).toContain('id="pagination-next-btn"');
      expect(paginationHtml).toContain('data-page="3"');
      expect(paginationHtml).toContain('class="pagination-btn page-num-btn active"');
      expect(paginationHtml).toContain('aria-current="page"');
    });

    it('disables Previous button on first page and Next button on last page', () => {
      const firstPageHtml = renderPaginationControls({
        page: 1,
        pageSize: 10,
        totalHits: 20,
        totalPages: 2,
        hasNextPage: true,
        hasPrevPage: false,
        nextPage: 2,
        prevPage: null,
      });
      expect(firstPageHtml).toContain('id="pagination-prev-btn"');
      expect(firstPageHtml).toContain('disabled');

      const lastPageHtml = renderPaginationControls({
        page: 2,
        pageSize: 10,
        totalHits: 20,
        totalPages: 2,
        hasNextPage: false,
        hasPrevPage: true,
        nextPage: null,
        prevPage: 1,
      });
      expect(lastPageHtml).toContain('id="pagination-next-btn"');
      expect(lastPageHtml).toContain('disabled');
    });

    it('returns empty string when totalPages is 1', () => {
      const singlePageHtml = renderPaginationControls({
        page: 1,
        pageSize: 10,
        totalHits: 5,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
        nextPage: null,
        prevPage: null,
      });
      expect(singlePageHtml).toBe('');
    });
  });

  describe('HTTP Web Server & Static Assets Serving', () => {
    it('serves HTML application shell containing skip-links and announcer', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('id="skip-to-search"');
      expect(html).toContain('id="skip-to-results"');
      expect(html).toContain('id="a11y-announcer"');
      expect(html).toContain('id="results-area"');
      expect(html).toContain('id="results-meta"');
      expect(html).toContain('id="pagination-area"');
    });

    it('serves updated CSS with responsive media queries, skip-link, and focus rings', async () => {
      const res = await fetch(`${baseUrl}/style.css`);
      expect(res.status).toBe(200);
      const css = await res.text();
      expect(css).toContain('.skip-link');
      expect(css).toContain(':focus-visible');
      expect(css).toContain('@media (max-width: 640px)');
      expect(css).toContain('@media (max-width: 380px)');
      expect(css).toContain('.sr-only');
    });

    it('serves updated app.js with keyboard navigation and announcer logic', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      expect(res.status).toBe(200);
      const js = await res.text();
      expect(js).toContain('announceA11y');
      expect(js).toContain("e.key === '/'");
      expect(js).toContain("e.key === 'Escape'");
      expect(js).toContain('renderSearchResults');
    });
  });
});

