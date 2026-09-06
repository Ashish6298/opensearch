import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig, createLogger } from '@opensearch/shared';
import { createInvertedIndex } from '@opensearch/indexer';
import { createApiServer, ApiServer } from '../src/index.js';

const silentLogger = createLogger('@opensearch/api:reliability-test', {
  level: 'silent',
  format: 'json',
});

describe('Phase 26 — Search/API Reliability & Resilience Suite', () => {
  let tempDir: string;
  let server: ApiServer;
  let port: number;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-api-reliability-'));
    const indexDir = path.join(tempDir, 'empty-index');

    const config = loadConfig({
      INDEX_DIR: indexDir,
      API_RATE_LIMIT_PER_MINUTE: '120',
      SEARCH_TIMEOUT_MS: '200',
    });

    // Create an API server instance with an empty index to test controlled degradation
    const emptyIndex = createInvertedIndex({ indexDir });
    server = createApiServer({
      config,
      logger: silentLogger,
      index: emptyIndex,
      searchTimeoutMs: 200,
    });

    const info = await server.start(0, '127.0.0.1');
    port = info.port;
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  describe('1. Controlled Degradation with Empty / Missing Index', () => {
    it('returns degraded health status with 200 OK when index is empty but operational', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('degraded');
      expect(data.components.index.status).toBe('degraded');
      expect(data.components.index.details.totalDocuments).toBe(0);
    });

    it('gracefully handles search queries against empty index returning 0 hits safely', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/search?q=test+query`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.results).toEqual([]);
      expect(data.meta.totalHits).toBe(0);
      expect(data.pagination.totalHits).toBe(0);
      expect(data.pagination.totalPages).toBe(1);
    });
  });

  describe('2. Request Validation & Exception Boundaries', () => {
    it('rejects invalid page numbers with structured 400 Bad Request error', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/search?q=test&page=0`);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('INVALID_PAGE_NUMBER');
    });

    it('rejects oversized queries exceeding 200 chars with 400 Bad Request', async () => {
      const longQuery = 'x'.repeat(250);
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/search?q=${longQuery}`);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('QUERY_TOO_LONG');
    });

    it('rejects malformed JSON body in POST requests with structured 400 Bad Request', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"invalidJson": true, broken',
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it('rejects oversized POST request bodies exceeding limit with 413 Payload Too Large', async () => {
      const giantBody = JSON.stringify({ q: 'a', padding: 'x'.repeat(100 * 1024) });
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: giantBody,
      });
      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('3. Startup Pre-flight Validation', () => {
    it('throws descriptive error on invalid port numbers', async () => {
      const badServer = createApiServer({ logger: silentLogger });
      await expect(badServer.start(-1, '127.0.0.1')).rejects.toThrow('Invalid server port');
      await expect(badServer.start(70000, '127.0.0.1')).rejects.toThrow('Invalid server port');
    });
  });
});
