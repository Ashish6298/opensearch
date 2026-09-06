import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApiServer, ApiServer, getApiStatus } from '../src/index.js';

describe('Phase 16 — Search API Foundation Suite', () => {
  let server: ApiServer;
  let baseUrl: string;

  beforeAll(async () => {
    // Start server on an ephemeral port (0 = OS assigns random open port)
    server = createApiServer();
    const info = await server.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('Server Lifecycle & Status', () => {
    it('returns system status matching Phase 16', () => {
      const status = getApiStatus();
      expect(status.name).toBe('OpenSearch');
      expect(status.version).toBe('1.0.0');
      expect(status.phase).toContain('Phase 16');
      expect(status.status).toBe('ok');
    });
  });

  describe('Health Check Endpoint (GET /health)', () => {
    it('returns 200 OK with system metrics and available routes', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const data = await res.json();
      expect(data.name).toBe('OpenSearch');
      expect(data.status).toBe('ok');
      expect(data.version).toBe('1.0.0');
      expect(typeof data.uptimeSeconds).toBe('number');
      expect(typeof data.memoryUsageMb).toBe('number');
      expect(Array.isArray(data.routesAvailable)).toBe(true);
      expect(data.routesAvailable).toContain('GET /health');
    });
  });

  describe('API Root Discovery Endpoint (GET /)', () => {
    it('returns 200 OK with navigation links', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.name).toBe('OpenSearch');
      expect(data.healthEndpoint).toBe('/health');
      expect(data.statusEndpoint).toBe('/api/v1/status');
    });
  });

  describe('System Status Endpoint (GET /api/v1/status)', () => {
    it('returns 200 OK with server configuration metadata', async () => {
      const res = await fetch(`${baseUrl}/api/v1/status`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.name).toBe('OpenSearch');
      expect(data.phase).toContain('Milestone 5');
      expect(data.server).toBeDefined();
    });
  });

  describe('Routing, Errors & Security Headers', () => {
    it('returns 404 Not Found for non-existent routes with structured error JSON', async () => {
      const res = await fetch(`${baseUrl}/non-existent-endpoint`);
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toContain('application/json');

      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('NOT_FOUND_ERROR');
      expect(data.error.statusCode).toBe(404);
    });

    it('returns 405 Method Not Allowed when path exists but method differs', async () => {
      const res = await fetch(`${baseUrl}/health`, { method: 'POST' });
      expect(res.status).toBe(405);

      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('METHOD_NOT_ALLOWED');
      expect(data.error.statusCode).toBe(405);
    });

    it('injects standard security and CORS headers', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.headers.get('access-control-allow-origin')).toBeDefined();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
    });

    it('handles CORS preflight OPTIONS requests with 204 No Content', async () => {
      const res = await fetch(`${baseUrl}/health`, { method: 'OPTIONS' });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    });
  });
});
