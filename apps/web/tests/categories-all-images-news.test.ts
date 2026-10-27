/**
 * @opensearch/web — Phase 80: All, Images, and News Categories Test Suite
 *
 * Verifies:
 * 1. Category tabs presence in HTML (All, Images, News)
 * 2. Dedicated image result card rendering with safe thumbnail, attribution, and license
 * 3. News card rendering with authentic publication timestamp and recency vs. staleness badges
 * 4. Publication timestamp non-fabrication guarantee
 * 5. Category-specific empty states (images unavailable in local-only, no news articles)
 * 6. CSS styles for image grids, cards, recency badges, and category empty states
 * 7. Category query parameter forwarding and query preservation
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { generateHtmlShell } from '../src/html-template.js';
import {
  renderResultCard,
  renderImageCard,
  renderCategoryEmptyState,
  validateSafeImageUrl,
  evaluateNewsRecency,
} from '../src/result-formatter.js';

describe('Phase 80 — All, Images, and News Categories Web Suite', () => {
  describe('1. Category Tabs & UI Elements in Shell', () => {
    it('renders All, Images, and News category tabs in the filter bar', () => {
      const html = generateHtmlShell();
      expect(html).toContain('id="result-filters-bar"');
      expect(html).toContain('data-filter="all"');
      expect(html).toContain('data-filter="images"');
      expect(html).toContain('data-filter="news"');
    });

    it('renders the dedicated category empty state container in HTML', () => {
      const html = generateHtmlShell();
      expect(html).toContain('id="category-empty-state-container"');
      expect(html).toContain('class="category-empty-state-container"');
    });
  });

  describe('2. Image Results & Safe Thumbnail Enforcement', () => {
    it('renders an image card with thumbnail, dimensions, source attribution, and license', () => {
      const cardHtml = renderImageCard({
        documentId: 'img-101',
        title: 'Distributed System Diagram',
        url: 'https://commons.wikimedia.org/wiki/File:Distributed_sys.png',
        thumbnailUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/dist.png',
        source: 'wikimedia-images',
        attribution: 'OpenSearch Core Team · Wikimedia Commons (CC BY-SA 4.0)',
        license: 'CC BY-SA 4.0',
        domain: 'commons.wikimedia.org',
        imageWidth: 1200,
        imageHeight: 900,
      });

      expect(cardHtml).toContain('class="image-card"');
      expect(cardHtml).toContain('src="https://upload.wikimedia.org/wikipedia/commons/thumb/dist.png"');
      expect(cardHtml).toContain('1200×900');
      expect(cardHtml).toContain('Distributed System Diagram');
      expect(cardHtml).toContain('[OpenSearch Core Team · Wikimedia Commons (CC BY-SA 4.0)]');
      expect(cardHtml).toContain('[CC BY-SA 4.0]');
      expect(cardHtml).toContain('commons.wikimedia.org');
    });

    it('rejects image cards with unsafe or malicious thumbnail URLs (javascript:)', () => {
      const unsafeCardHtml = renderImageCard({
        documentId: 'img-malicious',
        title: 'Exploit Vector',
        url: 'https://example.com/exploit',
        thumbnailUrl: 'javascript:alert(1)',
        source: 'external',
      });

      expect(unsafeCardHtml).toBe('');
    });

    it('sanitizes and validates URLs properly with validateSafeImageUrl', () => {
      expect(validateSafeImageUrl('https://example.com/pic.webp')).toBe('https://example.com/pic.webp');
      expect(validateSafeImageUrl('javascript:alert(1)')).toBeNull();
      expect(validateSafeImageUrl('file:///etc/passwd')).toBeNull();
      expect(validateSafeImageUrl(undefined)).toBeNull();
    });
  });

  describe('3. News Results & Publication Timestamp Authenticity', () => {
    it('renders recent news cards with authentic timestamp and recent badge (< 24 hours)', () => {
      const recentDate = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

      const cardHtml = renderResultCard({
        documentId: 'news-1',
        title: 'OpenSearch Engine V1.5.0 Released',
        url: 'https://news.ycombinator.com/item?id=45001',
        source: 'hackernews',
        publishedAt: recentDate,
        domain: 'news.ycombinator.com',
        snippet: 'Discussion of the new OpenSearch release with decentralized indexing.',
      });

      expect(cardHtml).toContain('class="result-date-badge"');
      expect(cardHtml).toContain(recentDate.slice(0, 10));
      expect(cardHtml).toContain('class="news-recency-badge recent"');
      expect(cardHtml).toMatch(/\d+h ago/);
      expect(cardHtml).toContain('[source: hackernews]');
    });

    it('distinguishes stale news from recent information (> 30 days)', () => {
      const staleDate = new Date('2024-01-10T12:00:00Z').toISOString();

      const cardHtml = renderResultCard({
        documentId: 'news-stale',
        title: 'Historical Search Architecture Post',
        url: 'https://news.ycombinator.com/item?id=20001',
        source: 'hackernews',
        publishedAt: staleDate,
        domain: 'news.ycombinator.com',
        snippet: 'Archived technical discussion.',
      });

      expect(cardHtml).toContain('class="news-recency-badge stale"');
      expect(cardHtml).toContain('[stale:');
      expect(cardHtml).toContain('2024-01-10');
    });

    it('never fabricates publication timestamps when date is missing', () => {
      const cardHtml = renderResultCard({
        documentId: 'doc-undated',
        title: 'Undated Standard Webpage',
        url: 'https://example.com/guide',
        source: 'local-index',
        snippet: 'A general documentation page without published date.',
      });

      expect(cardHtml).not.toContain('class="result-date-badge"');
      expect(cardHtml).not.toContain('class="news-recency-badge"');
      expect(cardHtml).not.toContain('<time');
    });

    it('accurately evaluates news recency ranges via evaluateNewsRecency', () => {
      const now = new Date('2026-10-26T12:00:00Z').getTime();

      // Today
      const recent = evaluateNewsRecency(new Date('2026-10-26T11:30:00Z').toISOString(), now);
      expect(recent?.isRecent).toBe(true);
      expect(recent?.label).toBe('30m ago');

      // 3 days ago
      const daysAgo = evaluateNewsRecency(new Date('2026-10-23T12:00:00Z').toISOString(), now);
      expect(daysAgo?.isRecent).toBe(true);
      expect(daysAgo?.label).toBe('3d ago');

      // Missing
      expect(evaluateNewsRecency(undefined)).toBeNull();
    });
  });

  describe('4. Useful Empty States for Unavailable Categories', () => {
    it('provides a useful empty state for Images in Local-only mode', () => {
      const emptyHtml = renderCategoryEmptyState('images', 'quantum computing', true);
      expect(emptyHtml).toContain('[0 image results]');
      expect(emptyHtml).toContain('unavailable in Local-only mode');
      expect(emptyHtml).toContain('switching to the "All" tab');
    });

    it('provides a useful empty state for Images when no verified hits exist', () => {
      const emptyHtml = renderCategoryEmptyState('images', 'xyznonexistent123', false);
      expect(emptyHtml).toContain('[0 image results]');
      expect(emptyHtml).toContain('Only authenticated sources with verified licenses');
    });

    it('provides a useful empty state for News when no news articles exist', () => {
      const emptyHtml = renderCategoryEmptyState('news', 'obscure keyword', false);
      expect(emptyHtml).toContain('[0 news articles]');
      expect(emptyHtml).toContain('Results are restricted strictly to verified news sources');
    });
  });

  describe('5. CSS Styles & Application Logic Verification', () => {
    it('verifies style.css contains Phase 80 selectors for image grid and recency badges', () => {
      const stylePath = path.resolve(__dirname, '../src/style.css');
      const css = fs.readFileSync(stylePath, 'utf8');

      expect(css).toContain('.image-results-grid');
      expect(css).toContain('.image-card');
      expect(css).toContain('.image-card-thumb-container');
      expect(css).toContain('.image-card-dimensions');
      expect(css).toContain('.news-recency-badge.recent');
      expect(css).toContain('.news-recency-badge.stale');
      expect(css).toContain('.category-empty-state');
    });

    it('verifies app.js includes category handling and non-relabeling guards', () => {
      const appPath = path.resolve(__dirname, '../src/app.js');
      const js = fs.readFileSync(appPath, 'utf8');

      expect(js).toContain('categoryEmptyStateContainer');
      expect(js).toContain('&category=');
      expect(js).toContain('image-results-grid');
      expect(js).toContain('news-recency-badge');
      expect(js).toContain('validateSafeImageUrl');
      expect(js).toContain('renderCategoryEmptyStateHtml');
    });
  });
});
