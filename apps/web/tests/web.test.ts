import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getWebInfo,
  getWebStatus,
  WEB_APP_INFO,
  generateHtmlShell,
  createWebServer,
  WebServer,
} from '../src/index.js';

describe('Phase 19 — Search UI Foundation Suite', () => {
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

  describe('Module Boundary & Status Metadata', () => {
    it('returns web status for Phase 19', () => {
      const status = getWebStatus();
      expect(status.name).toBe('OpenSearch');
      expect(status.version).toBe('1.0.0');
      expect(status.phase).toBe('Phase 19: Search UI Foundation');
      expect(status.status).toBe('ok');
    });

    it('returns web info and service identity', () => {
      const info = getWebInfo();
      expect(info.title).toBe('OpenSearch');
      expect(info.phase).toBe('Phase 19: Search UI Foundation');
      expect(WEB_APP_INFO.moduleName).toBe('@opensearch/web');
    });
  });

  describe('HTML Shell & Component Structure', () => {
    it('generates semantic HTML shell with all essential search landmarks', () => {
      const html = generateHtmlShell({
        title: 'OpenSearch Test',
        apiUrl: 'http://localhost:3000/api/v1/search',
      });

      // Semantic structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<header class="app-header"');
      expect(html).toContain('<main class="main-content center-mode"');
      expect(html).toContain('<footer class="app-footer"');

      // Search input & button
      expect(html).toContain('<input');
      expect(html).toContain('id="search-input"');
      expect(html).toContain('type="search"');
      expect(html).toContain('maxlength="200"');
      expect(html).toContain('id="search-submit-btn"');
      expect(html).toContain('Search');
      expect(html).toContain('id="search-clear-btn"');

      // UI States
      expect(html).toContain('id="loading-indicator"');
      expect(html).toContain('class="skeleton-card"');
      expect(html).toContain('id="empty-state"');
      expect(html).toContain('No search results found');
      expect(html).toContain('id="error-state"');
      expect(html).toContain('Search Request Error');
      expect(html).toContain('id="error-retry-btn"');

      // Privacy badges & features
      expect(html).toContain('Privacy First');
      expect(html).toContain('No Accounts Required');
      expect(html).toContain('Zero Tracking & Profiling');
      expect(html).toContain('Lexical BM25 Ranking');
    });
  });

  describe('HTTP Web Server & Static Asset Serving', () => {
    it('serves HTML application shell on GET / with 200 OK and security headers', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');

      const body = await res.text();
      expect(body).toContain('OpenSearch');
      expect(body).toContain('id="search-input"');
      expect(body).toContain('id="search-submit-btn"');
    });

    it('serves CSS stylesheet on GET /style.css', async () => {
      const res = await fetch(`${baseUrl}/style.css`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/css');
      const css = await res.text();
      expect(css).toContain('--bg-primary');
      expect(css).toContain('.search-input-wrapper');
    });

    it('serves client JS on GET /app.js', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/javascript');
      const js = await res.text();
      expect(js).toContain('performSearch');
      expect(js).toContain('search-form');
    });

    it('serves health status on GET /health', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.service).toBe('@opensearch/web');
    });

    it('returns 404 for non-existent static paths', async () => {
      const res = await fetch(`${baseUrl}/not-found-file.txt`);
      expect(res.status).toBe(404);
    });
  });
});
