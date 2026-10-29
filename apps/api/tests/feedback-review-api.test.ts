import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { ApiServer } from '../src/server.js';
import { createInvertedIndex } from '@opensearch/indexer';
import { loadConfig } from '@opensearch/shared';

describe('Phase 106 — Feedback Review API Endpoints Suite', () => {
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

  it('imports submitted feedback into the review queue via POST /api/v1/feedback/review/import', async () => {
    // 1. Submit a valid feedback item first
    const submitRes = await httpRequest<{ success: boolean; recordId: string }>(
      'POST',
      '/api/v1/feedback',
      {
        rating: 'not_helpful',
        category: 'developer',
        resultCountBucket: '0',
        reasonCode: 'poor_relevance',
        consent: {
          explicitConsentGranted: true,
          consentTimestamp: new Date().toISOString(),
          mode: 'consented_aggregate',
          disclosureVersion: '1.0.0',
        },
      },
    );
    expect(submitRes.statusCode).toBe(201);
    expect(submitRes.data.recordId).toBeDefined();

    // 2. Trigger auto-import into review queue
    const importRes = await httpRequest<{
      success: boolean;
      importedCount: number;
      skippedCount: number;
      totalQueueItems: number;
    }>('POST', '/api/v1/feedback/review/import', {});

    expect(importRes.statusCode).toBe(200);
    expect(importRes.data.success).toBe(true);
    expect(importRes.data.importedCount).toBeGreaterThanOrEqual(1);
    expect(importRes.data.totalQueueItems).toBeGreaterThanOrEqual(1);
  });

  it('lists review items and supports filtering via GET /api/v1/feedback/review', async () => {
    const listRes = await httpRequest<{
      items: Array<{ queueId: string; status: string; feedback: { rating: string } }>;
      total: number;
    }>('GET', '/api/v1/feedback/review?limit=10');

    expect(listRes.statusCode).toBe(200);
    expect(listRes.data.items).toBeInstanceOf(Array);
    expect(listRes.data.total).toBeGreaterThanOrEqual(1);
    expect(listRes.data.items[0]?.status).toBe('pending');
  });

  it('retrieves review queue stats and cluster summaries via GET /api/v1/feedback/review/stats', async () => {
    const statsRes = await httpRequest<{
      stats: { totalItems: number; pendingCount: number };
      clusters: Array<{ clusterKey: string; totalVotes: number; signalConfidence: number }>;
    }>('GET', '/api/v1/feedback/review/stats');

    expect(statsRes.statusCode).toBe(200);
    expect(statsRes.data.stats.totalItems).toBeGreaterThanOrEqual(1);
    expect(statsRes.data.clusters).toBeInstanceOf(Array);
    expect(statsRes.data.clusters.length).toBeGreaterThanOrEqual(1);
  });

  it('updates review queue item status and curator notes via PATCH /api/v1/feedback/review/:id', async () => {
    const listRes = await httpRequest<{ items: Array<{ queueId: string }> }>(
      'GET',
      '/api/v1/feedback/review',
    );
    const queueId = listRes.data.items[0]!.queueId;

    const patchRes = await httpRequest<{
      success: boolean;
      item: { queueId: string; status: string; curatorId: string; curatorNotes: string };
    }>('PATCH', `/api/v1/feedback/review/${queueId}`, {
      status: 'under_investigation',
      curatorId: 'curator_dev',
      curatorNotes: 'Investigating missing documentation for developer zero-result search.',
    });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.data.success).toBe(true);
    expect(patchRes.data.item.status).toBe('under_investigation');
    expect(patchRes.data.item.curatorId).toBe('curator_dev');
  });

  it('returns 404 when updating non-existent review queue item', async () => {
    const patchRes = await httpRequest<{ error: { code: string } }>(
      'PATCH',
      '/api/v1/feedback/review/non_existent_id',
      {
        status: 'archived',
      },
    );

    expect(patchRes.statusCode).toBe(404);
    expect(patchRes.data.error.code).toBe('ITEM_NOT_FOUND');
  });

  it('strictly rejects any attempt to contaminate held-out evaluation dataset via POST /approve-case', async () => {
    const listRes = await httpRequest<{ items: Array<{ queueId: string }> }>(
      'GET',
      '/api/v1/feedback/review',
    );
    const queueId = listRes.data.items[0]!.queueId;

    const approveRes = await httpRequest<{ error: { code: string; message: string } }>(
      'POST',
      `/api/v1/feedback/review/${queueId}/approve-case`,
      {
        curatorId: 'rogue_curator',
        curatorRationale: 'Attempting to contaminate held-out split with feedback',
        syntheticQuery: 'search query',
        category: 'code',
        intent: 'Test intent',
        judgments: [],
        targetSplit: 'held_out',
      },
    );

    expect(approveRes.statusCode).toBe(400);
    expect(approveRes.data.error.code).toBe('HELD_OUT_CONTAMINATION_ERROR');
    expect(approveRes.data.error.message).toContain('cannot contaminate the held-out evaluation dataset');
  });

  it('approves candidate evaluation case into tuning dataset via POST /approve-case', async () => {
    const listRes = await httpRequest<{ items: Array<{ queueId: string }> }>(
      'GET',
      '/api/v1/feedback/review',
    );
    const queueId = listRes.data.items[0]!.queueId;

    const approveRes = await httpRequest<{
      success: boolean;
      candidateCase: { caseId: string; split: string; query: string };
      item: { status: string };
    }>('POST', `/api/v1/feedback/review/${queueId}/approve-case`, {
      curatorId: 'curator_alice',
      curatorRationale: 'Manually synthesized test case for developer relevance improvements.',
      syntheticQuery: 'typescript strict null checks configuration',
      category: 'code',
      intent: 'Search for TypeScript compilerOptions strictNullChecks',
      judgments: [
        { docId: 'doc_ts_compiler_opts', grade: 3, rationale: 'Official TS handbook' },
      ],
    });

    expect(approveRes.statusCode).toBe(201);
    expect(approveRes.data.success).toBe(true);
    expect(approveRes.data.candidateCase.split).toBe('tuning');
    expect(approveRes.data.candidateCase.query).toBe('typescript strict null checks configuration');
    expect(approveRes.data.item.status).toBe('approved_for_evaluation');
  });

  it('evaluates ranking modification proposals with RankingSafetyGuard via POST /ranking-check', async () => {
    // 1. Rejected if no approver or reproducible benchmark
    const failRes = await httpRequest<{ passed: boolean; error: { code: string } }>(
      'POST',
      '/api/v1/feedback/review/ranking-check',
      {
        proposedBy: 'auto_system',
        description: 'Auto ranking weight update',
        parameterDiff: { k1: { before: 1.2, after: 1.5 } },
      },
    );
    expect(failRes.statusCode).toBe(400);
    expect(failRes.data.passed).toBe(false);
    expect(failRes.data.error.code).toBe('RANKING_SAFETY_VIOLATION');

    // 2. Rejected if held-out evaluation regresses
    const regressRes = await httpRequest<{ passed: boolean; error: { code: string } }>(
      'POST',
      '/api/v1/feedback/review/ranking-check',
      {
        proposedBy: 'dev_alex',
        approvedBy: 'lead_curator',
        description: 'Update with held-out regression',
        parameterDiff: { b: { before: 0.75, after: 0.9 } },
        reproducibleBenchmark: {
          runId: 'bench-regression',
          tuningNdcgDelta: 0.08,
          heldOutNdcgDelta: -0.02, // Regression
          regressionDetected: true,
          verificationDate: new Date().toISOString(),
        },
      },
    );
    expect(regressRes.statusCode).toBe(400);
    expect(regressRes.data.passed).toBe(false);
    expect(regressRes.data.error.code).toBe('RANKING_SAFETY_VIOLATION');

    // 3. Accepted if human reviewer approved and no held-out regression
    const passRes = await httpRequest<{
      passed: boolean;
      record: { changeId: string; safetyGatePassed: boolean; approvedBy: string };
    }>('POST', '/api/v1/feedback/review/ranking-check', {
      proposedBy: 'dev_alex',
      approvedBy: 'lead_curator_emma',
      description: 'Carefully tuned BM25 parameters validated on benchmark',
      parameterDiff: { b: { before: 0.75, after: 0.78 } },
      reproducibleBenchmark: {
        runId: 'bench-2026-pass',
        tuningNdcgDelta: 0.04,
        heldOutNdcgDelta: 0.01,
        regressionDetected: false,
        verificationDate: new Date().toISOString(),
      },
    });
    expect(passRes.statusCode).toBe(200);
    expect(passRes.data.passed).toBe(true);
    expect(passRes.data.record.safetyGatePassed).toBe(true);
    expect(passRes.data.record.approvedBy).toBe('lead_curator_emma');
  });
});
