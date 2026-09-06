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
      title: 'OpenSearch — Privacy-First Web Search',
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

    if (pathname === '/' || pathname === '/index.html' || pathname === '/search') {
      const html = this.renderIndexHtml();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(html));
      res.end(html);
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
