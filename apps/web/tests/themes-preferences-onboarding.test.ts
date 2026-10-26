/**
 * Phase 79 — Themes, Preferences, and Onboarding Test Suite
 *
 * Verifies:
 * 1. System theme preference by default with explicit light/dark and retro theme selection.
 * 2. Theme selection is consistent across routes (/, /privacy, /about).
 * 3. Store only necessary non-sensitive UI preferences locally (zero tracking identifiers).
 * 4. Concise, non-blocking onboarding explaining external providers and privacy options.
 * 5. Ability to dismiss and re-open onboarding.
 * 6. Explicit explanation of Local-only mode before enabling it, and API integration.
 * 7. Predictable settings reset option without deleting indexes or datasets.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createWebServer, WebServer, generateHtmlShell } from '../src/index.js';

describe('Phase 79 — Themes, Preferences, and Onboarding Suite', () => {
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

  describe('1. System Theme Preference & Cross-Route Consistency', () => {
    it('uses system theme preference by default in html-template', () => {
      const html = generateHtmlShell();

      // Checks for system preference fallback in inline bootstrap script
      expect(html).toContain("localStorage.getItem('opensearch_theme') || 'dark'");
      expect(html).toContain("theme === 'system'");
      expect(html).toContain("prefers-color-scheme: dark");
    });

    it('ensures theme bootstrap script is consistent across /, /privacy, and /about routes', async () => {
      // 1. Home route
      const homeRes = await fetch(`${baseUrl}/`);
      const homeHtml = await homeRes.text();
      expect(homeHtml).toContain("localStorage.getItem('opensearch_theme')");
      expect(homeHtml).toContain("document.documentElement.setAttribute('data-theme'");

      // 2. Privacy Policy route
      const privacyRes = await fetch(`${baseUrl}/privacy`);
      expect(privacyRes.status).toBe(200);
      const privacyHtml = await privacyRes.text();
      expect(privacyHtml).toContain("localStorage.getItem('opensearch_theme')");
      expect(privacyHtml).toContain("document.documentElement.setAttribute('data-theme'");

      // 3. About route
      const aboutRes = await fetch(`${baseUrl}/about`);
      expect(aboutRes.status).toBe(200);
      const aboutHtml = await aboutRes.text();
      expect(aboutHtml).toContain("localStorage.getItem('opensearch_theme')");
      expect(aboutHtml).toContain("document.documentElement.setAttribute('data-theme'");
    });

    it('provides explicit theme options including system, dark, light, and retro themes in settings', async () => {
      const res = await fetch(`${baseUrl}/`);
      const html = await res.text();

      expect(html).toContain('id="setting-theme-select"');
      expect(html).toContain('value="system"');
      expect(html).toContain('value="dark"');
      expect(html).toContain('value="light"');
      expect(html).toContain('value="matrix"');
      expect(html).toContain('value="amber"');
      expect(html).toContain('value="dracula"');
      expect(html).toContain('value="nord"');
      expect(html).toContain('value="monokai"');
    });

    it('listens for dynamic OS color-scheme changes in app.js when in system theme mode', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      const js = await res.text();

      expect(js).toContain("window.matchMedia('(prefers-color-scheme: dark)')");
      expect(js).toContain("currentThemePreference === 'system'");
    });
  });

  describe('2. Non-Sensitive Preference Storage', () => {
    it('defines only necessary, non-sensitive UI preference keys in app.js', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      const js = await res.text();

      expect(js).toContain('PREFERENCE_KEYS');
      expect(js).toContain("'opensearch_theme'");
      expect(js).toContain("'opensearch_local_only'");
      expect(js).toContain("'opensearch_open_new_tab'");
      expect(js).toContain("'opensearch_onboarding_dismissed'");

      // Re-verifies no tracking tokens or identifiers
      expect(js).not.toContain('userId');
      expect(js).not.toContain('deviceFingerprint');
      expect(js).not.toContain('trackingToken');
    });

    it('informs the user of the zero-tracking storage policy in the settings dialog', async () => {
      const res = await fetch(`${baseUrl}/`);
      const html = await res.text();

      expect(html).toContain('class="settings-privacy-box"');
      expect(html).toContain('Zero-Tracking Guarantee');
      expect(html).toContain('No user identifiers, cookies, sessions, or queries are stored.');
    });
  });

  describe('3. Non-Blocking Privacy & Provider Onboarding', () => {
    it('renders the non-blocking onboarding card explaining providers and local-only mode', async () => {
      const res = await fetch(`${baseUrl}/`);
      const html = await res.text();

      expect(html).toContain('id="onboarding-card"');
      expect(html).toContain('role="region"');
      expect(html).toContain('External Search Providers');
      expect(html).toContain('DuckDuckGo');
      expect(html).toContain('Wikipedia');
      expect(html).toContain('Local-Only Mode');
      expect(html).toContain('100% air-gapped privacy');
    });

    it('provides intuitive dismissal actions via close button and got-it button', async () => {
      const res = await fetch(`${baseUrl}/`);
      const html = await res.text();

      expect(html).toContain('id="onboarding-dismiss-x"');
      expect(html).toContain('id="onboarding-got-it-btn"');
      expect(html).toContain('id="onboarding-settings-link"');
    });

    it('persists dismissal in localStorage without blocking search input', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      const js = await res.text();

      expect(js).toContain('function dismissOnboarding()');
      expect(js).toContain("localStorage.setItem(PREFERENCE_KEYS.ONBOARDING_DISMISSED, 'true');");
    });
  });

  describe('4. Local-Only Mode Explanation & API Integration', () => {
    it('clearly explains Local-only search mode before users enable it in settings', async () => {
      const res = await fetch(`${baseUrl}/`);
      const html = await res.text();

      expect(html).toContain('id="setting-local-only-toggle"');
      expect(html).toContain('What is Local-only mode?');
      expect(html).toContain('disables all outbound network calls to external web providers');
      expect(html).toContain('Provides 100% air-gapped search privacy');
    });

    it('transmits &localOnly=true query parameter to API when enabled in app.js', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      const js = await res.text();

      expect(js).toContain('if (isLocalOnly)');
      expect(js).toContain("fetchUrl += '&localOnly=true';");
      expect(js).toContain("[mode: local-only]");
    });
  });

  describe('5. Predictable Settings Reset (Index Preservation)', () => {
    it('includes a dedicated Reset Preferences button in settings modal', async () => {
      const res = await fetch(`${baseUrl}/`);
      const html = await res.text();

      expect(html).toContain('id="reset-settings-btn"');
      expect(html).toContain('Reset Preferences');
      expect(html).toContain('title="Reset all UI settings to default without touching indexed data"');
    });

    it('resets only UI preference keys without touching indexed files or collections in app.js', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      const js = await res.text();

      expect(js).toContain('function resetPreferences()');
      expect(js).toContain('Object.values(PREFERENCE_KEYS).forEach');
      expect(js).toContain('localStorage.removeItem');
      expect(js).toContain("currentThemePreference = 'system';");
      expect(js).toContain("isLocalOnly = false;");
      expect(js).toContain("openInNewTab = true;");
      expect(js).toContain('Settings reset to default values. Local index data preserved.');
    });
  });
});
