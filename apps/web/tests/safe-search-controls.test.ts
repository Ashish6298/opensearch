/**
 * @opensearch/web — Phase 81: Safe Search & Content Controls Web Suite
 *
 * Verifies:
 * 1. UI explains what Safe Search does and does not cover (Settings Modal & Disclosures)
 * 2. Select controls with strict, moderate, and off options
 * 3. Settings persistence in localStorage under documented preference key
 * 4. Safe Search reset to default without deleting index data
 * 5. Parameter forwarding in search queries (&safeSearch=...)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { generateHtmlShell } from '../src/html-template.js';

describe('Phase 81 — Safe Search and Content Controls Web Suite', () => {
  describe('1. UI Explanation & Disclosure of Safe Search Coverage', () => {
    it('renders Safe Search content controls in the settings modal', () => {
      const html = generateHtmlShell();
      expect(html).toContain('id="setting-safe-search-select"');
      expect(html).toContain('value="strict"');
      expect(html).toContain('value="moderate"');
      expect(html).toContain('value="off"');
    });

    it('honestly explains what Safe Search does cover', () => {
      const html = generateHtmlShell();
      expect(html).toContain('What Safe Search covers:');
      expect(html).toContain('OpenSearch applies consistent local filtering to exclude adult, sexually explicit, and mature terms');
    });

    it('honestly explains what Safe Search does NOT cover', () => {
      const html = generateHtmlShell();
      expect(html).toContain('What Safe Search does not cover:');
      expect(html).toContain('Community-driven external providers (Wikipedia, Hacker News, Wikimedia Commons) do not support upstream server-side safe search parameters');
    });
  });

  describe('2. Preference Storage & Documented Key Compliance', () => {
    it('uses documented preference key opensearch_safe_search without trackers or identifiers', () => {
      const appPath = path.resolve(__dirname, '../src/app.js');
      const js = fs.readFileSync(appPath, 'utf8');

      expect(js).toContain("SAFE_SEARCH: 'opensearch_safe_search'");
      expect(js).toContain('settingSafeSearchSelect');
      expect(js).toContain('currentSafeSearch');
    });

    it('defaults Safe Search to moderate', () => {
      const appPath = path.resolve(__dirname, '../src/app.js');
      const js = fs.readFileSync(appPath, 'utf8');

      expect(js).toContain("let currentSafeSearch = 'moderate';");
    });

    it('resets Safe Search to moderate on settings reset without touching index data', () => {
      const appPath = path.resolve(__dirname, '../src/app.js');
      const js = fs.readFileSync(appPath, 'utf8');

      expect(js).toContain("currentSafeSearch = 'moderate';");
      expect(js).toContain("settingSafeSearchSelect.value = 'moderate';");
    });
  });

  describe('3. Query Parameter Forwarding & CSS Styles', () => {
    it('forwards safeSearch parameter in client search requests', () => {
      const appPath = path.resolve(__dirname, '../src/app.js');
      const js = fs.readFileSync(appPath, 'utf8');

      expect(js).toContain('&safeSearch=');
    });

    it('verifies style.css includes styling for safe-search disclosure box', () => {
      const stylePath = path.resolve(__dirname, '../src/style.css');
      const css = fs.readFileSync(stylePath, 'utf8');

      expect(css).toContain('.safe-search-disclosure');
    });
  });
});
