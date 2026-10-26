/**
 * @opensearch/web — Local-Only Mode UI & Controls Tests (Phase 83)
 *
 * Verifies that:
 * 1. A visible Local-only control is present before submitting a search query.
 * 2. Hosted service transparency is clearly explained in the UI.
 * 3. Local-only setting persists in localStorage under opensearch_local_only.
 * 4. Toggling synchronizes between the search bar chip and the settings modal.
 * 5. Search dispatches append &localOnly=true when active.
 * 6. Honest limited-results notices and one-click 'Search Web' buttons are provided.
 * 7. Reset preferences predictably restores default hybrid mode.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateHtmlShell } from '../src/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appJsContent = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');

describe('Phase 83 — Local-Only Mode Web UI & Controls Suite', () => {
  let html: string;

  beforeEach(() => {
    html = generateHtmlShell({ title: 'OpenSearch Local-Only Test' });
  });

  describe('1. Visible Search Page Controls & Hosted Transparency', () => {
    it('provides a visible Local-only control on the search form before query submission', () => {
      expect(html).toContain('id="local-only-checkbox"');
      expect(html).toContain('class="local-only-chip"');
      expect(html).toContain('Local-only');
    });

    it('renders hosted service transparency explanation in both search controls and settings', () => {
      // Visible hint/note on the search form
      expect(html).toContain('id="hosted-transparency-note"');
      expect(html).toContain('zero external providers');

      // Detailed notice in settings modal
      expect(html).toContain('hosted-transparency-hint');
      expect(html).toContain('Hosted service notice:');
      expect(html).toContain('the host server receives the query submitted to its endpoint over HTTPS');
      expect(html).toContain('guarantees the host will not contact external search engines');
    });

    it('includes dedicated limited-results banner and empty-state action button in HTML shell', () => {
      expect(html).toContain('id="local-only-notice-banner"');
      expect(html).toContain('id="disable-local-only-btn"');
      expect(html).toContain('id="empty-local-only-action"');
      expect(html).toContain('id="empty-disable-local-only-btn"');
    });
  });

  describe('2. Client Logic & Preference Synchronization', () => {
    it('initializes local-only state from localStorage key opensearch_local_only', () => {
      expect(appJsContent).toContain("PREFERENCE_KEYS = {");
      expect(appJsContent).toContain("LOCAL_ONLY: 'opensearch_local_only'");
      expect(appJsContent).toContain("localStorage.getItem(PREFERENCE_KEYS.LOCAL_ONLY) === 'true'");
    });

    it('synchronizes the visible search chip checkbox with the settings modal checkbox', () => {
      expect(appJsContent).toContain('if (settingLocalOnlyToggle) settingLocalOnlyToggle.checked = isLocalOnly;');
      expect(appJsContent).toContain('if (localOnlyCheckbox) localOnlyCheckbox.checked = isLocalOnly;');
    });

    it('appends &localOnly=true to the API search request URL when mode is enabled', () => {
      expect(appJsContent).toContain('if (isLocalOnly) {');
      expect(appJsContent).toContain("fetchUrl += '&localOnly=true';");
    });

    it('provides a one-click disableLocalOnlyAndSearch action to transition back to global search', () => {
      expect(appJsContent).toContain('function disableLocalOnlyAndSearch()');
      expect(appJsContent).toContain("localStorage.setItem(PREFERENCE_KEYS.LOCAL_ONLY, 'false')");
      expect(appJsContent).toContain("announceA11y('Local-only search mode disabled. Searching web.')");
      expect(appJsContent).toContain('performSearch(currentQuery, 1)');
    });

    it('predictably restores default hybrid mode when user resets preferences', () => {
      expect(appJsContent).toContain('function resetPreferences()');
      expect(appJsContent).toContain('isLocalOnly = false;');
      expect(appJsContent).toContain('if (localOnlyCheckbox) localOnlyCheckbox.checked = false;');
      expect(appJsContent).toContain("if (settingLocalOnlyToggle) settingLocalOnlyToggle.checked = false;");
    });
  });
});
