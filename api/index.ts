/**
 * OpenSearch — Vercel Serverless Function Entrypoint
 *
 * Dispatches:
 * - /api/* & /health -> OpenSearch Search API Server
 * - /, /search, /about, /privacy, /style.css, /app.js -> OpenSearch Terminal Web Server
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { ApiServer } from '../apps/api/dist/server.js';
import { WebServer } from '../apps/web/dist/server.js';
import { loadConfig } from '@opensearch/shared';
import { CURATED_SEED_CORPUS } from '../packages/crawler/dist/orchestrator/seed-corpus.js';
import {
  createDocumentProcessor,
  createInvertedIndex,
  InvertedIndex,
} from '../packages/indexer/dist/index.js';

let apiServerInstance: ApiServer | null = null;
let webServerInstance: WebServer | null = null;

function warmInMemoryIndex(): InvertedIndex {
  const processor = createDocumentProcessor();
  const index = createInvertedIndex();

  for (const category of CURATED_SEED_CORPUS) {
    for (const seed of category.seeds) {
      const processed = processor.process({
        url: seed.url,
        title: seed.title,
        headings: category.name,
        description: seed.description,
        bodyText: `${seed.tags.join(' ')} ${seed.description} ${category.description}`,
      });
      index.addDocument(processed);
    }
  }

  return index;
}

function getOrInitServers(): { apiServer: ApiServer; webServer: WebServer } {
  if (!apiServerInstance || !webServerInstance) {
    const memoryIndex = warmInMemoryIndex();
    const config = loadConfig({
      ...process.env,
      CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',
    });

    apiServerInstance = new ApiServer({
      config,
      index: memoryIndex,
    });

    webServerInstance = new WebServer({
      config,
      apiUrl: '/api/v1/search',
    });
  }

  return {
    apiServer: apiServerInstance,
    webServer: webServerInstance,
  };
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { apiServer, webServer } = getOrInitServers();
  const host = req.headers.host || 'localhost';
  const parsedUrl = new URL(req.url || '/', `http://${host}`);
  const pathname = parsedUrl.pathname;

  // Route API requests to ApiServer Router
  if (pathname.startsWith('/api/') || pathname === '/health' || pathname === '/status') {
    await apiServer.getRouter().handleRequest(req, res, apiServer.getContext());
    return;
  }

  // Route frontend / web requests to WebServer
  await webServer.handleRequest(req, res);
}
