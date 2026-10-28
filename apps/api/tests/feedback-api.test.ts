import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { ApiServer } from '../src/server.js';
import { createInvertedIndex } from '@opensearch/indexer';
import { loadConfig } from '@opensearch/shared';

describe('Phase 105 — Feedback API Endpoints Suite', () => {
  let server: ApiServer;
  let baseUrl: string;

  beforeAll(async () => {
    const config = loadConfig();
    const index = createInvertedIndex();

    server = new ApiServer({
      config,
      index,
    });

    const info = await server.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  function httpRequest<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ statusCode: number; data: T }> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const req = http.request(
        url,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
        },
        res => {
          let raw = '';
          res.on('data', chunk => (raw += chunk));
          res.on('end', () => {
            try {
              resolve({
                statusCode: res.statusCode || 500,
                data: raw ? JSON.parse(raw) : null,
              });
            } catch (e) {
              reject(e);
            }
          });
          res.on('error', reject);
        },
      );

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  it('submits valid search feedback successfully with 201 Created', async () => {
    const validFeedback = {
      rating: 'helpful',
      category: 'developer',
      resultCountBucket: '6-10',
      reasonCode: 'accurate_answer',
      consent: {
        explicitConsentGranted: true,
        consentTimestamp: new Date().toISOString(),
        mode: 'consented_aggregate',
        disclosureVersion: '1.0.0',
      },
    };

    const res = await httpRequest<{ success: boolean; recordId: string }>(
      'POST',
      '/api/v1/feedback',
      validFeedback,
    );

    expect(res.statusCode).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.recordId).toBeDefined();
  });

  it('acceptance criterion: rejects feedback without explicit user consent (400 Bad Request)', async () => {
    const unconsented = {
      rating: 'helpful',
      category: 'general',
      resultCountBucket: '1-5',
    };

    const res = await httpRequest<{ error: { code: string; message: string } }>(
      'POST',
      '/api/v1/feedback',
      unconsented,
    );

    expect(res.statusCode).toBe(400);
    expect(res.data.error.code).toBe('FEEDBACK_VALIDATION_FAILED');
    expect(res.data.error.message).toContain('explicit user consent');
  });

  it('rejects feedback containing forbidden queries or IP addresses (400 Bad Request)', async () => {
    const invasiveFeedback = {
      rating: 'not_helpful',
      query: 'confidential payroll documents',
      ip: '10.0.0.1',
      resultCountBucket: '0',
      consent: {
        explicitConsentGranted: true,
        consentTimestamp: new Date().toISOString(),
        mode: 'consented_aggregate',
        disclosureVersion: '1.0.0',
      },
    };

    const res = await httpRequest<{ error: { code: string; message: string } }>(
      'POST',
      '/api/v1/feedback',
      invasiveFeedback,
    );

    expect(res.statusCode).toBe(400);
    expect(res.data.error.code).toBe('FEEDBACK_VALIDATION_FAILED');
    expect(res.data.error.message).toContain('Forbidden field');
  });

  it('returns documented privacy notice and network metadata limitations (GET /api/v1/feedback/privacy)', async () => {
    const res = await httpRequest<{ policy: { maxRetentionDays: number; networkMetadataDisclosure: string } }>(
      'GET',
      '/api/v1/feedback/privacy',
    );

    expect(res.statusCode).toBe(200);
    expect(res.data.policy.maxRetentionDays).toBe(30);
    expect(res.data.policy.networkMetadataDisclosure).toContain('Notice on Network Metadata');
  });

  it('retrieves exported aggregate feedback records and stats (GET /api/v1/feedback)', async () => {
    const res = await httpRequest<{ totalRecords: number; records: unknown[]; stats: { totalSubmissions: number } }>(
      'GET',
      '/api/v1/feedback',
    );

    expect(res.statusCode).toBe(200);
    expect(res.data.totalRecords).toBeGreaterThanOrEqual(1);
    expect(res.data.stats.totalSubmissions).toBeGreaterThanOrEqual(1);
  });

  it('purges all feedback records on request (DELETE /api/v1/feedback)', async () => {
    const deleteRes = await httpRequest<{ success: boolean; purgedCount: number }>(
      'DELETE',
      '/api/v1/feedback',
    );

    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.data.success).toBe(true);
    expect(deleteRes.data.purgedCount).toBeGreaterThanOrEqual(1);

    const getRes = await httpRequest<{ totalRecords: number; records: unknown[] }>(
      'GET',
      '/api/v1/feedback',
    );
    expect(getRes.statusCode).toBe(200);
    expect(getRes.data.totalRecords).toBe(0);
  });
});
