import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import { loadConfig } from '@opensearch/shared';
import { createApiServer, ApiServer } from '../../../apps/api/src/server.js';
import { createWebServer, WebServer } from '../../../apps/web/src/server.js';
import { createStorageAdapter } from '@opensearch/storage';
import { createIndexBuilder } from '@opensearch/indexer';

describe('Phase 30 — Free Deployment Preparation Suite', () => {
  let tmpDir: string;
  let apiServer: ApiServer;
  let webServer: WebServer;
  let apiPort: number;
  let webPort: number;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-p30-test-'));
  });

  afterEach(async () => {
    if (apiServer) {
      await apiServer.stop().catch(() => {});
    }
    if (webServer) {
      await webServer.stop().catch(() => {});
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('correctly adapts to production PaaS environment with PORT and HOST injection', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      HOST: '0.0.0.0',
      CORS_ORIGIN: '*',
      STORAGE_DIR: path.join(tmpDir, 'storage'),
      INDEX_DIR: path.join(tmpDir, 'index'),
    });

    expect(config.isProduction).toBe(true);
    expect(config.api.server.port).toBe(8080);
    expect(config.api.server.host).toBe('0.0.0.0');
    expect(config.web.server.port).toBe(8080);
    expect(config.web.server.host).toBe('0.0.0.0');
    expect(config.api.corsOrigin).toBe('*');
  });

  it('serves responsive health check endpoint reporting memory, uptime, and index readiness', async () => {
    const storageDir = path.join(tmpDir, 'storage');
    const indexDir = path.join(tmpDir, 'index');

    // Create a mini index for deployment testing
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '0',
      HOST: '127.0.0.1',
      CORS_ORIGIN: '*',
      STORAGE_DIR: storageDir,
      INDEX_DIR: indexDir,
      LOG_LEVEL: 'silent',
    });

    const storage = createStorageAdapter({ config });
    await storage.initialize();

    await storage.documents.create({
      url: 'https://example.com/deploy-test',
      urlHash: 'hash-deploy-1',
      title: 'Deployment Test Document',
      description: 'Document used to verify zero-downtime health check in production',
      headings: 'Deployment Ready',
      bodyText: 'OpenSearch production deployment verification document.',
      language: 'en',
      contentType: 'text/html',
      contentLength: 100,
      httpStatus: 200,
      outboundLinks: [],
    });

    const builder = createIndexBuilder({ config, storage });
    await builder.build();

    const activeIndex = builder.getActiveIndex()!;
    apiServer = createApiServer({ config, index: activeIndex });
    const started = await apiServer.start(0, '127.0.0.1');
    apiPort = started.port;

    const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${apiPort}/health`, response => {
          let data = '';
          response.on('data', chunk => (data += chunk));
          response.on('end', () => {
            try {
              resolve({ status: response.statusCode || 500, body: JSON.parse(data) });
            } catch (e) {
              reject(e);
            }
          });
        })
        .on('error', reject);
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.environment).toBe('production');
    expect(res.body.totalDocumentsIndexed).toBe(1);
    expect(res.body.components.index.status).toBe('ok');
    expect(res.body.memoryUsageMb).toBeGreaterThan(0);
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);

    await storage.close();
  });

  it('handles web server production startup with static assets and health check', async () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '0',
      HOST: '127.0.0.1',
      CORS_ORIGIN: '*',
      LOG_LEVEL: 'silent',
    });

    webServer = createWebServer({ config });
    const started = await webServer.start(0, '127.0.0.1');
    webPort = started.port;

    // Check /health
    const healthRes = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${webPort}/health`, response => {
          let data = '';
          response.on('data', chunk => (data += chunk));
          response.on('end', () => {
            try {
              resolve({ status: response.statusCode || 500, body: JSON.parse(data) });
            } catch (e) {
              reject(e);
            }
          });
        })
        .on('error', reject);
    });

    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe('ok');
    expect(healthRes.body.service).toBe('@opensearch/web');

    // Check HTML shell response
    const htmlRes = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${webPort}/`, response => {
          let data = '';
          response.on('data', chunk => (data += chunk));
          response.on('end', () => resolve({ status: response.statusCode || 500, body: data }));
        })
        .on('error', reject);
    });

    expect(htmlRes.status).toBe(200);
    expect(htmlRes.body).toContain('OpenSearch');
    expect(htmlRes.body).toContain('<!DOCTYPE html>');
  });
});
