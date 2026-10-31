#!/usr/bin/env node
/**
 * @opensearch/scripts — Production Server Launcher (Phase 119)
 *
 * Coordinates the unified production container runtime:
 * 1. Validates storage durability and bootstrapping.
 * 2. Initializes persistent index (or seeds initial curated corpus if database is fresh).
 * 3. Hosts both the Public Search Web Interface and REST API Gateway on a unified port.
 * 4. Listens for SIGTERM / SIGINT and coordinates graceful draining and persistent state flush.
 * 5. Requires zero external secrets, zero paid services, and zero paid domains.
 */

import { createServer } from 'node:http';
import { loadConfig, createLogger } from '../packages/shared/dist/index.js';
import { createStorageAdapter } from '../packages/storage/dist/index.js';
import { createIndexBuilder } from '../packages/indexer/dist/index.js';
import { CURATED_SEED_CORPUS } from '../packages/crawler/dist/index.js';
import { ApiServer } from '../apps/api/dist/server.js';
import { WebServer } from '../apps/web/dist/server.js';

const config = loadConfig({
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'production',
  DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE || 'self-hosted',
});

const logger = createLogger('@opensearch/production', {
  level: config.logging.level,
  format: config.logging.format,
});

async function bootstrapPersistentCorpusIfEmpty(storage) {
  try {
    const docCount = await storage.documents.count();
    if (docCount === 0) {
      logger.info('Storage directory is empty; seeding curated initial corpus...');
      let seeded = 0;
      for (const category of CURATED_SEED_CORPUS) {
        for (const seed of category.seeds) {
          await storage.documents.create({
            url: seed.url,
            urlHash: `seed-${category.id}-${seeded}`,
            title: seed.title,
            description: seed.description,
            headings: `${category.name} ${seed.tags.join(' ')}`,
            bodyText: `${seed.title}. ${seed.description}. Tags: ${seed.tags.join(', ')}. Category: ${category.description}`,
            language: 'en',
            contentType: 'text/html',
            contentLength: seed.description.length + 150,
            httpStatus: 200,
            outboundLinks: [],
          });
          seeded++;
        }
      }
      logger.info(`Successfully seeded ${seeded} documents into persistent storage.`);

      const builder = createIndexBuilder({ config, storage });
      const buildResult = await builder.build();
      logger.info(`Initial index build completed with status: ${buildResult.status}`);
    } else {
      logger.info(`Persistent storage contains ${docCount} documents.`);
    }
  } catch (err) {
    logger.warn('Corpus bootstrap note: ' + (err instanceof Error ? err.message : String(err)));
  }
}

async function main() {
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  logger.info('Initializing OpenSearch Web production runtime...', {
    port,
    host,
    mode: config.isProduction ? 'production' : 'development',
    storageDir: config.storage.storageDir,
  });

  // 1. Initialize persistent storage adapter
  const storage = createStorageAdapter({ config });
  try {
    await storage.initialize();
    await bootstrapPersistentCorpusIfEmpty(storage);
  } catch (err) {
    logger.warn('Storage initialization fallback: ' + (err instanceof Error ? err.message : String(err)));
  }

  // 2. Initialize ApiServer and WebServer instances
  const apiServer = new ApiServer({
    config,
    deploymentModel: 'self-hosted',
  });

  const webServer = new WebServer({
    config,
    apiUrl: '/api/v1/search',
  });

  // Pre-load active index in ApiServer
  await apiServer.loadActiveIndex();

  let isDraining = false;

  // 3. Create unified gateway HTTP server
  const server = createServer(async (req, res) => {
    try {
      if (isDraining) {
        const url = (req.url || '').split('?')[0];
        // Allow health & readiness probes during draining
        if (url !== '/health' && url !== '/healthz' && url !== '/ready' && url !== '/readyz') {
          res.setHeader('Connection', 'close');
          res.setHeader('Retry-After', '5');
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Server is draining' } }));
          return;
        }
      }

      const hostHeader = req.headers.host || 'localhost';
      const parsedUrl = new URL(req.url || '/', `http://${hostHeader}`);
      const pathname = parsedUrl.pathname;

      // API routes & service discovery endpoints -> ApiServer Router
      if (
        pathname.startsWith('/api/') ||
        pathname === '/health' ||
        pathname === '/healthz' ||
        pathname === '/ready' ||
        pathname === '/readyz' ||
        pathname === '/metrics' ||
        pathname === '/openapi.json' ||
        pathname === '/api/v1/openapi.json' ||
        pathname === '/opensearch.xml' ||
        pathname === '/opensearchdescription.xml'
      ) {
        await apiServer.getRouter().handleRequest(req, res, apiServer.getContext());
        return;
      }

      // Documentation -> ApiServer or WebServer docs
      if (pathname === '/docs' || pathname === '/docs/') {
        await apiServer.getRouter().handleRequest(req, res, apiServer.getContext());
        return;
      }

      // Web Interface & static assets -> WebServer
      await webServer.handleRequest(req, res);
    } catch (err) {
      logger.error('Unhandled request error in gateway', {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('500 Internal Server Error');
      }
    }
  });

  // 4. Start HTTP Server
  server.listen(port, host, () => {
    logger.info(`OpenSearch Web container is ready and listening on http://${host}:${port}`);
    logger.info('Persistent volume: mounted at ' + config.storage.storageDir);
    logger.info('Zero secrets required. Zero paid services required.');
  });

  // 5. Graceful Shutdown Handlers (SIGTERM & SIGINT)
  const shutdown = async (signal) => {
    if (isDraining) return;
    isDraining = true;
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    const forceTimer = setTimeout(() => {
      logger.error('Graceful shutdown timeout exceeded; forcing process exit.');
      process.exit(1);
    }, 15000);
    forceTimer.unref();

    try {
      await apiServer.drain(2000);
      await new Promise(resolve => server.close(resolve));
      await storage.close();
      logger.info('Graceful shutdown completed successfully. Clean exit.');
      clearTimeout(forceTimer);
      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful shutdown', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
  logger.error('Fatal initialization error in production launcher', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
