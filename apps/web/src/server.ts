/**
 * @opensearch/web — Web Application Server (Phase 19)
 *
 * Lightweight, zero-external-dependency HTTP server hosting the OpenSearch
 * public search web application. Serves the semantic HTML shell, assets,
 * and handles frontend routing.
 */

import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AppConfig, createLogger, loadConfig, Logger } from '@opensearch/shared';
import { generateDocsHtml, generateOpenApiSpec } from '@opensearch/api';
import { generateOpenSearchDescriptor, OPENSEARCH_DESCRIPTOR_MIME_TYPE } from '@opensearch/api';
import { generateHtmlShell } from './html-template.js';

export interface WebServerOptions {
  config?: AppConfig;
  logger?: Logger;
  port?: number;
  host?: string;
  apiUrl?: string;
}

export class WebServer {
  private readonly config: AppConfig;
  private readonly logger: Logger;
  private readonly apiUrl: string;
  private server: Server | null = null;
  private cssCache = '';
  private jsCache = '';

  constructor(options: WebServerOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.logger =
      options.logger ??
      createLogger('@opensearch/web', {
        level: this.config.logging.level,
        format: this.config.logging.format,
      });
    this.apiUrl = options.apiUrl ?? this.config.web.apiUrl ?? 'http://localhost:3000/api/v1/search';
    this.loadStaticAssets();
  }

  private loadStaticAssets(): void {
    try {
      const currentDir = dirname(fileURLToPath(import.meta.url));
      // In TS source mode or compiled dist mode
      const cssPath = join(currentDir, 'style.css');
      const jsPath = join(currentDir, 'app.js');

      this.cssCache = readFileSync(cssPath, 'utf-8');
      this.jsCache = readFileSync(jsPath, 'utf-8');
    } catch {
      // Fallbacks if running in varied packaging environments
      this.cssCache = '/* OpenSearch Style */';
      this.jsCache = '/* OpenSearch App */';
    }
  }

  /**
   * Generates the current HTML index page.
   */
  renderIndexHtml(): string {
    return generateHtmlShell({
      title: 'OpenSearch Web — Privacy-First Web Search',
      apiUrl: this.apiUrl,
      cssContent: this.cssCache,
      jsContent: this.jsCache,
    });
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const hostHeader = req.headers.host || 'localhost';
    const parsedUrl = new URL(req.url || '/', `http://${hostHeader}`);
    const pathname = parsedUrl.pathname;

    // Security Headers for frontend
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://upload.wikimedia.org https://commons.wikimedia.org; connect-src 'self' http://localhost:* http://127.0.0.1:* https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );

    // Phase 31: Add HSTS header when accessed over HTTPS / TLS reverse proxy
    const isHttps =
      req.headers['x-forwarded-proto'] === 'https' ||
      (req.socket as unknown as { encrypted?: boolean }).encrypted === true ||
      process.env.NODE_ENV === 'production';
    if (isHttps) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    if (pathname === '/' || pathname === '/index.html' || pathname === '/search') {
      const html = this.renderIndexHtml();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(html));
      res.end(html);
      return;
    }

    if (pathname === '/docs' || pathname === '/docs/') {
      const docsHtml = generateDocsHtml({
        apiUrl: this.apiUrl,
        openapiUrl: '/api/v1/openapi.json',
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(docsHtml));
      res.end(docsHtml);
      return;
    }

    if (pathname === '/api/v1/openapi.json' || pathname === '/openapi.json') {
      const spec = generateOpenApiSpec();
      const specPayload = JSON.stringify(spec, null, 2);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(specPayload));
      res.end(specPayload);
      return;
    }

    if (pathname === '/opensearch.xml' || pathname === '/opensearchdescription.xml') {
      const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || `${this.config.web.server.host}:${this.config.web.server.port}`;
      const baseUrl = `${proto}://${host}`;
      const xml = generateOpenSearchDescriptor({ baseUrl });

      res.statusCode = 200;
      res.setHeader('Content-Type', OPENSEARCH_DESCRIPTOR_MIME_TYPE);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Content-Length', Buffer.byteLength(xml));
      res.end(xml);
      return;
    }

    if (pathname === '/browser-search' || pathname === '/browser-search/') {
      const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || `${this.config.web.server.host}:${this.config.web.server.port}`;
      const baseUrl = `${proto}://${host}`;
      const browserSearchHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="How to add OpenSearch Web as your default browser search engine in Firefox, Chrome, Brave, Edge, and Safari.">
  <link rel="search" type="application/opensearchdescription+xml" title="OpenSearch Web" href="/opensearch.xml">
  <title>Add to Browser — OpenSearch Web</title>
  <style>
    ${this.cssCache}
    .guide-content { max-width: 820px; margin: 2rem auto; padding: 1.5rem; line-height: 1.6; }
    .guide-content h1, .guide-content h2, .guide-content h3 { color: var(--accent-primary, #38bdf8); }
    .guide-step { background: rgba(30, 41, 59, 0.7); border: 1px solid #334155; border-radius: 8px; padding: 1.25rem; margin: 1.25rem 0; }
    .guide-step h3 { margin-top: 0; }
    .guide-code { background: #0f172a; padding: 0.4rem 0.6rem; border-radius: 4px; font-family: monospace; color: #38bdf8; display: inline-block; }
    .back-btn { display: inline-block; margin-bottom: 1rem; color: #38bdf8; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="guide-content">
    <a href="/" class="back-btn">← Back to Search</a>
    <h1>Add OpenSearch Web to Your Browser</h1>
    <p>OpenSearch Web is an independent, privacy-first web search engine. You can configure it as your default search engine in any modern browser without installing any extensions.</p>

    <div class="guide-step">
      <h3>🦊 Mozilla Firefox (Desktop &amp; Mobile)</h3>
      <ol>
        <li>Visit the OpenSearch home page (<a href="/">/</a>).</li>
        <li>Right-click the address bar (or click the three-dot action menu in the URL bar).</li>
        <li>Select <strong>Add "OpenSearch Web"</strong>.</li>
        <li>To make it default: Open <code>Settings &gt; Search &gt; Default Search Engine</code> and select <strong>OpenSearch Web</strong>.</li>
      </ol>
    </div>

    <div class="guide-step">
      <h3>🌐 Google Chrome &amp; Chromium</h3>
      <ol>
        <li>Open <code>Settings &gt; Search engine &gt; Manage search engines and site search</code>.</li>
        <li>Under <strong>Site search</strong>, click <strong>Add</strong>:
          <ul>
            <li><strong>Name:</strong> OpenSearch Web</li>
            <li><strong>Shortcut:</strong> <code>@os</code> or <code>os</code></li>
            <li><strong>URL with %s in place of query:</strong> <span class="guide-code">${baseUrl}/?q=%s</span></li>
          </ul>
        </li>
        <li>Click the three dots next to OpenSearch Web and select <strong>Make default</strong>.</li>
      </ol>
    </div>

    <div class="guide-step">
      <h3>🦁 Brave Browser</h3>
      <ol>
        <li>Open <code>Settings &gt; Search engine &gt; Manage search engines and site search</code>.</li>
        <li>Under <strong>Site search</strong>, add OpenSearch Web with URL: <span class="guide-code">${baseUrl}/?q=%s</span>.</li>
        <li>Set OpenSearch Web as default search provider.</li>
      </ol>
    </div>

    <div class="guide-step">
      <h3>🌊 Microsoft Edge</h3>
      <ol>
        <li>Open <code>Settings &gt; Privacy, search, and services &gt; Address bar and search</code>.</li>
        <li>Click <strong>Manage search engines</strong>, add OpenSearch Web with search URL: <span class="guide-code">${baseUrl}/?q=%s</span>.</li>
        <li>Choose OpenSearch Web in the "Search engine used in the address bar" dropdown.</li>
      </ol>
    </div>

    <div class="guide-step">
      <h3>🧭 Apple Safari &amp; iOS</h3>
      <ol>
        <li>Add a custom bookmark or use a Safari search engine shortcut extension configured with URL: <span class="guide-code">${baseUrl}/?q=%s</span>.</li>
      </ol>
    </div>

    <div class="guide-step">
      <h3>⚡ Vivaldi</h3>
      <ol>
        <li>Right-click the search input on the OpenSearch homepage and select <strong>Add as Search Engine...</strong>.</li>
        <li>Or configure manually in <code>Settings &gt; Search</code> using URL: <span class="guide-code">${baseUrl}/?q=%s</span>.</li>
      </ol>
    </div>

    <div class="guide-step">
      <h3>📜 OpenSearch Description Document (OSDD)</h3>
      <p>Standard XML descriptor available at: <a href="/opensearch.xml" target="_blank"><code>/opensearch.xml</code></a></p>
    </div>

    <div class="guide-step">
      <h3>ℹ️ Distinct Product Identity</h3>
      <p>OpenSearch Web is an independent privacy-first search project. Not affiliated with Amazon Web Services or Amazon OpenSearch Service.</p>
    </div>
  </div>
</body>
</html>`;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(browserSearchHtml));
      res.end(browserSearchHtml);
      return;
    }

    if (pathname === '/privacy') {
      const privacyHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="OpenSearch Privacy & Data Minimization Policy. Zero tracking, zero cookies, zero user profiling.">
  <title>Privacy Policy — OpenSearch</title>
  <style>
    ${this.cssCache}
    .privacy-content { max-width: 780px; margin: 2rem auto; padding: 1rem; line-height: 1.6; }
    .privacy-content h1, .privacy-content h2 { color: var(--accent-primary, #38bdf8); }
    .privacy-content table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }
    .privacy-content th, .privacy-content td { border: 1px solid #334155; padding: 0.75rem; text-align: left; }
    .privacy-content th { background: #1e293b; }
    .back-btn { display: inline-block; margin-bottom: 1rem; color: #38bdf8; text-decoration: none; font-weight: 600; }
  </style>
  <script>
    (function () {
      try {
        var theme = localStorage.getItem('opensearch_theme') || 'dark';
        if (theme === 'system' || !localStorage.getItem('opensearch_theme')) {
          theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        }
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {}
    })();
  </script>
</head>
<body>
  <div class="privacy-content">
    <a href="/" class="back-btn">← Back to Search</a>
    <h1>OpenSearch Privacy & Data-Minimization Policy</h1>
    <p>OpenSearch is designed from first principles as an independent, privacy-respecting search engine. We operate under a strict <strong>Zero-Tracking, Zero-Profiling, and Data-Minimization Policy</strong>.</p>
    
    <h2>Our Core Privacy Guarantees</h2>
    <table>
      <thead>
        <tr><th>Principle</th><th>Our Commitment</th></tr>
      </thead>
      <tbody>
        <tr><td><strong>No User Accounts</strong></td><td>Zero account system. No registration, login, or identity tracking.</td></tr>
        <tr><td><strong>Zero Search History Retention</strong></td><td>Queries are processed strictly in-memory and never stored with user identifiers.</td></tr>
        <tr><td><strong>Zero Cookies</strong></td><td>No HTTP cookies, session tokens, or local storage tracking.</td></tr>
        <tr><td><strong>IP Anonymization</strong></td><td>IP addresses in operational logs are immediately truncated (IPv4 /24 mask, IPv6 /48 mask).</td></tr>
        <tr><td><strong>Zero Third-Party Telemetry</strong></td><td>No Google Analytics, tracking pixels, or external scripts.</td></tr>
        <tr><td><strong>Zero Referrer Leakage</strong></td><td>Outbound result links are protected with rel="noopener noreferrer".</td></tr>
      </tbody>
    </table>
    <p><small>OpenSearch V1.0.0 — Public Independent Search Engine</small></p>
  </div>
</body>
</html>`;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(privacyHtml));
      res.end(privacyHtml);
      return;
    }

    if (pathname === '/about') {
      const aboutHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="About OpenSearch — An independent, privacy-first web search engine.">
  <title>About — OpenSearch</title>
  <style>
    ${this.cssCache}
    .about-content { max-width: 780px; margin: 2rem auto; padding: 1rem; line-height: 1.6; }
    .about-content h1, .about-content h2 { color: var(--accent-primary, #38bdf8); }
    .back-btn { display: inline-block; margin-bottom: 1rem; color: #38bdf8; text-decoration: none; font-weight: 600; }
  </style>
  <script>
    (function () {
      try {
        var theme = localStorage.getItem('opensearch_theme') || 'dark';
        if (theme === 'system' || !localStorage.getItem('opensearch_theme')) {
          theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        }
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {}
    })();
  </script>
</head>
<body>
  <div class="about-content">
    <a href="/" class="back-btn">← Back to Search</a>
    <h1>About OpenSearch</h1>
    <p>OpenSearch is a completely independent, open-source web search engine engineered with a single principle: <strong>your search queries belong to you, not to a corporation</strong>.</p>
    <h2>Key Principles</h2>
    <ul>
      <li><strong>Independent Indexing:</strong> Inverted index with BM25 lexical relevance scoring.</li>
      <li><strong>Polite Autonomous Crawler:</strong> Honors robots.txt directives and domain-specific delays.</li>
      <li><strong>Zero Tracking:</strong> No tracking scripts, cookies, or user profile generation.</li>
      <li><strong>Open Source:</strong> Transparent, inspectable codebase released under the MIT License.</li>
    </ul>
    <p><small>OpenSearch V1.0.0 — Built by <a href="https://github.com/Ashish6298" target="_blank" rel="noopener noreferrer">Ashish6298</a></small></p>
  </div>
</body>
</html>`;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(aboutHtml));
      res.end(aboutHtml);
      return;
    }

    if (pathname === '/style.css') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(this.cssCache));
      res.end(this.cssCache);
      return;
    }

    if (pathname === '/app.js') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(this.jsCache));
      res.end(this.jsCache);
      return;
    }

    if (pathname === '/health') {
      const payload = JSON.stringify({
        status: 'ok',
        service: '@opensearch/web',
        phase: 'Phase 19: Search UI Foundation',
        timestamp: new Date().toISOString(),
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(payload);
      return;
    }

    // 404 Not Found
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('404 Not Found');
  }

  async start(
    portOverride?: number,
    hostOverride?: string,
  ): Promise<{ port: number; host: string }> {
    const port = portOverride ?? this.config.web.server.port;
    const host = hostOverride ?? this.config.web.server.host;

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch(err => {
          this.logger.error('Error handling web request', { error: err.message });
          res.statusCode = 500;
          res.end('500 Internal Server Error');
        });
      });

      this.server.on('error', err => {
        this.logger.error('Failed to start Web server', { error: err.message });
        reject(err);
      });

      this.server.listen(port, host, () => {
        const address = this.server?.address();
        const actualPort = typeof address === 'object' && address ? address.port : port;
        this.logger.info('Web application server listening', {
          host,
          port: actualPort,
          apiUrl: this.apiUrl,
        });
        resolve({ port: actualPort, host });
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;

    return new Promise((resolve, reject) => {
      this.server?.close(err => {
        if (err) {
          this.logger.error('Error stopping web server', { error: err.message });
          reject(err);
        } else {
          this.logger.info('Web server stopped successfully');
          this.server = null;
          resolve();
        }
      });
    });
  }
}

export function createWebServer(options?: WebServerOptions): WebServer {
  return new WebServer(options);
}
