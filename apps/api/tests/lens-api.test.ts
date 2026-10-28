import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDocumentProcessor, createInvertedIndex } from '@opensearch/indexer';
import { createApiServer, ApiServer } from '../src/index.js';

describe('Phase 102 — HTTP API Focus Lens Endpoints Suite', () => {
  let server: ApiServer;
  let baseUrl: string;

  beforeAll(async () => {
    const index = createInvertedIndex();
    const processor = createDocumentProcessor();

    index.addDocument(
      processor.process({
        id: 'doc-github',
        url: 'https://github.com/tokio-rs/tokio',
        title: 'Tokio Async Rust Runtime',
        bodyText: 'Asynchronous event driven network runtime in Rust.',
      }),
    );

    index.addDocument(
      processor.process({
        id: 'doc-stanford',
        url: 'https://cs.stanford.edu/algorithms',
        title: 'Stanford Algorithms Course',
        bodyText: 'Introduction to computer science algorithms and data structures.',
      }),
    );

    server = createApiServer({
      index,
      rateLimitPerMinute: 200,
      searchTimeoutMs: 5000,
    });

    const info = await server.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  it('GET /api/v1/lenses lists all available focus lenses', async () => {
    const res = await fetch(`${baseUrl}/api/v1/lenses`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.defaultLens).toBe('general');
    expect(body.total).toBeGreaterThanOrEqual(6);
    expect(Array.isArray(body.lenses)).toBe(true);

    const ids = body.lenses.map((l: any) => l.id);
    expect(ids).toContain('general');
    expect(ids).toContain('developer');
    expect(ids).toContain('trusted-health');
  });

  it('GET /api/v1/lenses/:id retrieves a specific lens profile', async () => {
    const res = await fetch(`${baseUrl}/api/v1/lenses/developer`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lens.id).toBe('developer');
    expect(body.lens.name).toBe('Developer');
    expect(body.lens.boostDomains.some((d: any) => d.pattern === 'github.com')).toBe(true);
  });

  it('GET /api/v1/lenses/:id returns 404 for unknown lens', async () => {
    const res = await fetch(`${baseUrl}/api/v1/lenses/non-existent-lens`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('LENS_NOT_FOUND');
  });

  it('POST /api/v1/lenses/validate validates a valid profile definition', async () => {
    const res = await fetch(`${baseUrl}/api/v1/lenses/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        id: 'valid-lens',
        name: 'Valid Lens',
        description: 'Test validation',
        boostDomains: [{ pattern: 'rust-lang.org', multiplier: 2.1 }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.errors).toHaveLength(0);
    expect(body.profile.id).toBe('valid-lens');
  });

  it('POST /api/v1/lenses/validate rejects invalid profiles safely', async () => {
    const res = await fetch(`${baseUrl}/api/v1/lenses/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        id: 'bad-lens',
        name: 'Bad Multiplier',
        description: 'Out of range',
        boostDomains: [{ pattern: 'bad.com', multiplier: 99.0 }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('POST /api/v1/lenses/preview runs preview effects on sample queries', async () => {
    const res = await fetch(`${baseUrl}/api/v1/lenses/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lensId: 'developer' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lensId).toBe('developer');
    expect(body.indexImmutabilityVerified).toBe(true);
    expect(Array.isArray(body.summaries)).toBe(true);
    expect(body.summaries.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/search?q=tokio&lens=developer passes lens to ranking engine and includes lens in meta', async () => {
    const res = await fetch(`${baseUrl}/api/v1/search?q=tokio&lens=developer&localOnly=true`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.lens).toBeDefined();
    expect(body.meta.lens.id).toBe('developer');
    expect(body.meta.lens.name).toBe('Developer');
    expect(body.meta.lens.isMedicalEndorsement).toBe(false);
  });
});
