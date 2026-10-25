/**
 * Phase 77 — Search-First Responsive Home Page Tests
 *
 * Verifies:
 * 1. Prominent search field and clear submit action (approachable for everyday users).
 * 2. Mobile-first responsive design (phone, tablet, desktop layouts).
 * 3. Modern dark and light themes with clean sans-serif typography and high contrast.
 * 4. Preservation of optional retro terminal/CRT themes (matrix, amber, dracula, nord, monokai).
 * 5. Touch target dimensions (>= 44px) and visible focus indicators (WCAG AA).
 * 6. Keyboard accessibility, skip-links, ARIA landmarks, and screen reader announcements.
 * 7. Non-blocking onboarding (no intrusive popups or blocking flows).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createWebServer, WebServer, generateHtmlShell } from '../src/index.js';

describe('Phase 77 — Search-First Responsive Home Page Suite', () => {
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

  describe('Familiar Search Page & Prominent Search Field', () => {
    it('provides a prominent search field with friendly placeholder and clear submit button', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const html = await res.text();

      // Clear search input with accessible labels
      expect(html).toContain('id="search-input"');
      expect(html).toContain('placeholder="Search the web privately..."');
      expect(html).toContain('aria-label="Search query"');
      expect(html).toContain('required');

      // Clear submit action labeled 'Search'
      expect(html).toContain('id="search-submit-btn"');
      expect(html).toContain('aria-label="Submit search"');
      expect(html).toContain('>Search</button>');

      // Approachable brand wordmark header for nontechnical users
      expect(html).toContain('id="brand-header"');
      expect(html).toContain('class="brand-title"');
      expect(html).toContain('OpenSearch</h1>');
      expect(html).toContain('Privacy-first, independent web search</p>');

      // Privacy assurance badges
      expect(html).toContain('class="home-privacy-badge"');
      expect(html).toContain('No tracking');
      expect(html).toContain('No accounts');
      expect(html).toContain('Pure relevance');

      // Approachable quick suggestions
      expect(html).toContain('id="quick-topics"');
      expect(html).toContain('class="quick-topic-tag"');
    });

    it('does not contain blocking onboarding modals, paywalls, or forced tours', async () => {
      const html = generateHtmlShell();

      // Confirm clean, immediate search-first focus without gating modals
      expect(html).not.toContain('class="onboarding-modal"');
      expect(html).not.toContain('class="blocking-overlay"');
      expect(html).not.toContain('data-step="tutorial"');
    });
  });

  describe('Light, Dark, and Optional Retro Themes', () => {
    it('sets modern dark theme as the approachable default', () => {
      const html = generateHtmlShell();
      expect(html).toContain("localStorage.getItem('opensearch_theme') || 'dark'");
      expect(html).toContain('[theme: dark]');
    });

    it('defines modern dark and light theme styles in style.css', async () => {
      const res = await fetch(`${baseUrl}/style.css`);
      const css = await res.text();

      // Modern dark theme
      expect(css).toContain("html[data-theme='dark']");
      expect(css).toContain('--font-family-base: -apple-system, BlinkMacSystemFont');
      expect(css).toContain('--bg-page: #0b0f19');
      expect(css).toContain('--btn-bg: #2563eb');

      // Modern light theme
      expect(css).toContain("html[data-theme='light']");
      expect(css).toContain('--bg-page: #f8fafc');
      expect(css).toContain('--text-muted-70: #0f172a');

      // Visibility segregation: hide terminal clutter in modern themes
      expect(css).toContain("html[data-theme='dark'] .ascii-wrapper");
      expect(css).toContain("html[data-theme='light'] .status-section");
      expect(css).toContain('display: none !important;');
    });

    it('preserves all retro terminal/CRT themes as optional alternatives', async () => {
      const res = await fetch(`${baseUrl}/style.css`);
      const css = await res.text();

      // All 5 retro themes preserved
      expect(css).toContain("html[data-theme='matrix']");
      expect(css).toContain("html[data-theme='amber']");
      expect(css).toContain("html[data-theme='dracula']");
      expect(css).toContain("html[data-theme='nord']");
      expect(css).toContain("html[data-theme='monokai']");

      // In retro themes, modern header is hidden and ASCII logo is shown
      expect(css).toContain("html[data-theme='matrix'] .brand-wordmark-container");
      expect(css).toContain('display: none !important;');
      expect(css).toContain('--font-family-base: var(--font-mono);');
    });

    it('supports cycling between modern and retro themes in app.js', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      const js = await res.text();

      expect(js).toContain("const THEMES = ['dark', 'light', 'matrix', 'amber', 'dracula', 'nord', 'monokai']");
      expect(js).toContain("let currentTheme = 'dark';");
      expect(js).toContain('function cycleTheme');
      expect(js).toContain('applyTheme');
      expect(js).toContain('submitBtn.textContent = isRetro ? \'RUN\' : \'Search\'');
    });
  });

  describe('Mobile-First Responsive Layout & Touch Targets', () => {
    it('includes responsive viewport meta tag', () => {
      const html = generateHtmlShell();
      expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1.0"');
    });

    it('enforces touch targets >= 44px on mobile devices in CSS', async () => {
      const res = await fetch(`${baseUrl}/style.css`);
      const css = await res.text();

      expect(css).toContain('@media (max-width: 640px)');
      expect(css).toContain('min-height: 44px;');
      expect(css).toContain('min-width: 44px;');
      // Font size 16px to prevent iOS auto-zoom
      expect(css).toContain('font-size: 16px; /* Prevents auto-zoom in mobile Safari */');
    });

    it('provides multi-tier responsive breakpoints for phone, tablet, and desktop', async () => {
      const res = await fetch(`${baseUrl}/style.css`);
      const css = await res.text();

      // Phone breakpoint (< 640px)
      expect(css).toContain('@media (max-width: 640px)');
      // Tablet breakpoint (641px - 1023px)
      expect(css).toContain('@media (min-width: 641px) and (max-width: 1023px)');
      expect(css).toContain('max-width: 680px;');
      // Desktop breakpoint (>= 1024px)
      expect(css).toContain('@media (min-width: 1024px)');
      expect(css).toContain('max-width: 780px;');
    });
  });

  describe('Keyboard Navigation, Focus Indicators, and Screen Readers', () => {
    it('has high-visibility focus indicators (:focus-visible)', async () => {
      const res = await fetch(`${baseUrl}/style.css`);
      const css = await res.text();

      expect(css).toContain(':focus-visible');
      expect(css).toContain('outline: 2px solid var(--accent-green)');
      expect(css).toContain('outline-offset: 2px');
    });

    it('provides keyboard skip-navigation links', () => {
      const html = generateHtmlShell();
      expect(html).toContain('id="skip-to-search"');
      expect(html).toContain('id="skip-to-results"');
      expect(html).toContain('class="skip-link"');
    });

    it('includes ARIA landmarks and live regions for screen readers', () => {
      const html = generateHtmlShell();
      expect(html).toContain('role="search"');
      expect(html).toContain('role="main"');
      expect(html).toContain('id="a11y-announcer"');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
    });

    it('wires quick topic tags to trigger searches on click or enter in app.js', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      const js = await res.text();

      expect(js).toContain('.quick-topic-tag');
      expect(js).toContain('performSearch(query, 1)');
    });
  });
});
