/**
 * @opensearch/api — Phase 113: Observability without Query Surveillance Test Suite
 *
 * Verifies:
 * 1. Low-cardinality label enforcers & privacy guards:
 *    - Rejection of forbidden labels (q, query, raw_query, ip, user_id, email, token, url).
 *    - Label value truncation & redaction of URLs, query strings, and emails.
 *    - Canonical route normalization (preventing cardinality explosion).
 *    - Sensitive URL parameter redaction.
 * 2. Prometheus exposition endpoint (GET /metrics):
 *    - Compliant Prometheus text exposition format (version 0.0.4).
 *    - Presence of latency, provider health, index status, queue depth, and error metrics.
 *    - Strict privacy guarantee: zero search query text, zero IPs, zero user IDs in labels.
 *    - JSON snapshot support when requested via Accept: application/json.
 * 3. Search pipeline & error telemetry under live operations:
 *    - Increments opensearch_http_requests_total and observes opensearch_http_request_duration_seconds.
 *    - Increments opensearch_search_queries_total and records opensearch_search_results_count.
 *    - Captures operational errors in opensearch_errors_total without leaking error stacks or parameters.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MetricsRegistry,
  validateMetricLabels,
  normalizeRoutePath,
  redactSensitiveUrl,
  stripQueryParams,
  getDefaultRegistry,
  resetDefaultRegistry,
} from '@opensearch/shared';
import { ApiServer } from '../src/server.js';
import { createInvertedIndex, createDocumentProcessor } from '@opensearch/indexer';
import { createProviderRegistry, MockSearchProvider } from '@opensearch/ranking';

describe('Phase 113 — Observability without Query Surveillance Suite', () => {
  describe('1. Privacy Guards & Low-Cardinality Label Enforcement', () => {
    it('strictly prohibits forbidden label keys (query, q, ip, user, token, etc.)', () => {
      const forbiddenKeys = ['q', 'query', 'raw_query', 'ip', 'client_ip', 'user', 'user_id', 'token', 'secret', 'password', 'url'];
      for (const key of forbiddenKeys) {
        expect(() => {
          validateMetricLabels({ [key]: 'malicious_leak' }, 'test_metric');
        }).toThrow(/Privacy Violation/i);
      }
    });

    it('rejects unapproved high-cardinality label keys', () => {
      expect(() => {
        validateMetricLabels({ arbitrary_random_param: 'value123' }, 'test_metric');
      }).toThrow(/Cardinality Violation/i);
    });

    it('permits approved low-cardinality labels (method, path, status, provider, mode, code, queue)', () => {
      const valid = validateMetricLabels(
        {
          method: 'GET',
          path: '/api/v1/search',
          status: '200',
          provider: 'wikimedia',
          mode: 'standard',
          code: 'RATE_LIMITED',
          queue: 'feedback_review',
        },
        'test_metric',
      );
      expect(valid.method).toBe('GET');
      expect(valid.path).toBe('/api/v1/search');
      expect(valid.provider).toBe('wikimedia');
    });

    it('sanitizes label values containing URLs, queries, emails, or excess length', () => {
      const sanitized = validateMetricLabels(
        {
          path: '/search?q=private_sensitive_query',
          code: 'admin@company.org',
          provider: 'a'.repeat(80),
        },
        'test_metric',
      );
      expect(sanitized.path).toBe('[REDACTED_URL_OR_QUERY]');
      expect(sanitized.code).toBe('[REDACTED_EMAIL]');
      expect(sanitized.provider.toString().length).toBeLessThanOrEqual(63);
    });

    it('normalizes dynamic and unknown paths to canonical route templates', () => {
      expect(normalizeRoutePath('/api/v1/search?q=secret&page=2')).toBe('/api/v1/search');
      expect(normalizeRoutePath('/api/v1/lenses/custom_profile_xyz')).toBe('/api/v1/lenses/:id');
      expect(normalizeRoutePath('/api/v1/feedback/review/case_9999/approve-case')).toBe(
        '/api/v1/feedback/review/:id/approve-case',
      );
      expect(normalizeRoutePath('/api/v1/feedback/review/case_9999')).toBe(
        '/api/v1/feedback/review/:id',
      );
      expect(normalizeRoutePath('/health')).toBe('/health');
      expect(normalizeRoutePath('/metrics')).toBe('/metrics');
      expect(normalizeRoutePath('/some/arbitrary/random/endpoint/attack')).toBe('/other');
    });

    it('redacts sensitive query parameters from URLs while keeping protocol/host structure', () => {
      const redacted = redactSensitiveUrl(
        'https://example.com/api/v1/search?q=confidential+search&token=secret123&page=1',
      );
      expect(redacted).not.toContain('confidential+search');
      expect(redacted).not.toContain('secret123');
      expect(redacted).toContain('q=%5BREDACTED%5D');
      expect(redacted).toContain('token=%5BREDACTED%5D');
      expect(redacted).toContain('page=1');

      expect(stripQueryParams('https://example.com/search?q=hello&token=abc#section')).toBe(
        'https://example.com/search',
      );
    });
  });

  describe('2. In-Memory Prometheus Metrics Registry & Formatting', () => {
    let registry: MetricsRegistry;

    beforeEach(() => {
      registry = new MetricsRegistry();
    });

    it('increments counters and formats to Prometheus 0.0.4 text', () => {
      const counter = registry.counter(
        'opensearch_http_requests_total',
        'Total number of HTTP requests processed',
        ['method', 'path', 'status'],
      );
      counter.inc({ method: 'GET', path: '/api/v1/search', status: '200' }, 5);
      counter.inc({ method: 'POST', path: '/api/v1/search', status: '200' }, 2);

      const output = registry.toPrometheusFormat();
      expect(output).toContain('# HELP opensearch_http_requests_total Total number of HTTP requests processed');
      expect(output).toContain('# TYPE opensearch_http_requests_total counter');
      expect(output).toContain('opensearch_http_requests_total{method="GET",path="/api/v1/search",status="200"} 5');
      expect(output).toContain('opensearch_http_requests_total{method="POST",path="/api/v1/search",status="200"} 2');
    });

    it('updates gauges and exports current values', () => {
      const gauge = registry.gauge('opensearch_index_documents_total', 'Total number of documents indexed');
      gauge.set(113);

      const output = registry.toPrometheusFormat();
      expect(output).toContain('# HELP opensearch_index_documents_total Total number of documents indexed');
      expect(output).toContain('# TYPE opensearch_index_documents_total gauge');
      expect(output).toContain('opensearch_index_documents_total 113');
    });

    it('observes histogram values and calculates cumulative buckets, sum, and count', () => {
      const hist = registry.histogram(
        'opensearch_search_pipeline_duration_seconds',
        'Search query execution latency in seconds',
        ['mode'],
        [0.01, 0.05, 0.1, 0.5, 1.0],
      );

      hist.observe({ mode: 'standard' }, 0.02);
      hist.observe({ mode: 'standard' }, 0.08);
      hist.observe({ mode: 'standard' }, 0.35);

      const output = registry.toPrometheusFormat();
      expect(output).toContain('# HELP opensearch_search_pipeline_duration_seconds Search query execution latency in seconds');
      expect(output).toContain('# TYPE opensearch_search_pipeline_duration_seconds histogram');
      expect(output).toContain('opensearch_search_pipeline_duration_seconds_bucket{mode="standard",le="0.01"} 0');
      expect(output).toContain('opensearch_search_pipeline_duration_seconds_bucket{mode="standard",le="0.05"} 1');
      expect(output).toContain('opensearch_search_pipeline_duration_seconds_bucket{mode="standard",le="0.1"} 2');
      expect(output).toContain('opensearch_search_pipeline_duration_seconds_bucket{mode="standard",le="0.5"} 3');
      expect(output).toContain('opensearch_search_pipeline_duration_seconds_bucket{mode="standard",le="+Inf"} 3');
      expect(output).toContain('opensearch_search_pipeline_duration_seconds_count{mode="standard"} 3');
    });

    it('generates a structured JSON snapshot for programmatic auditing', () => {
      const counter = registry.counter('opensearch_errors_total', 'Total errors', ['code']);
      counter.inc({ code: 'RATE_LIMITED' }, 3);

      const snapshot = registry.getSnapshot();
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.counters['opensearch_errors_total']).toBeDefined();
      expect(snapshot.counters['opensearch_errors_total']?.[0]?.value).toBe(3);
      expect(snapshot.counters['opensearch_errors_total']?.[0]?.labels.code).toBe('RATE_LIMITED');
    });
  });

  describe('3. Live Server Endpoint & Privacy Invariants', () => {
    let server: ApiServer;
    let baseUrl: string;
    let customRegistry: MetricsRegistry;

    beforeEach(async () => {
      customRegistry = new MetricsRegistry();
      const index = createInvertedIndex();
      const processor = createDocumentProcessor();
      index.addDocument(
        processor.process({
          id: 'doc-observability-1',
          url: 'https://example.com/observability',
          title: 'Observability and Privacy',
          headings: 'Observability Guide',
          description: 'Metrics without query surveillance',
          bodyText: 'Distributed tracing, metrics and logging without query surveillance.',
          language: 'en',
        }),
      );

      const mockProvider = new MockSearchProvider({
        metadata: {
          id: 'mock-provider',
          displayName: 'Mock Provider',
          version: '1.0.0',
          supportedCategories: ['general'],
          cachePolicy: { enabled: true, ttlMs: 60000, maxEntries: 100 },
          rateLimit: { maxRequestsPerMinute: 60, retryAfterSeconds: 5 },
          circuitBreaker: { failureThreshold: 3, recoveryTimeMs: 10000, halfOpenSuccessThreshold: 2 },
          privacyPolicy: {
            loggingAllowed: false,
            piiHandling: 'strictly-prohibited',
            dataRetentionDays: 0,
            privacyAudited: true,
          },
        },
      });

      const providerRegistry = createProviderRegistry();
      providerRegistry.registerProvider(mockProvider);

      server = new ApiServer({
        index,
        providerRegistry,
        metrics: customRegistry,
        enableMcp: false,
      });

      const { port } = await server.start(0, '127.0.0.1');
      baseUrl = `http://127.0.0.1:${port}`;
    });

    afterEach(async () => {
      await server.stop(200);
      resetDefaultRegistry();
    });

    it('GET /metrics returns 200 with standard Prometheus text/plain format', async () => {
      const res = await fetch(`${baseUrl}/metrics`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/plain');
      expect(res.headers.get('content-type')).toContain('version=0.0.4');

      const body = await res.text();
      expect(body).toContain('opensearch_process_uptime_seconds');
      expect(body).toContain('opensearch_memory_heap_used_bytes');
      expect(body).toContain('opensearch_index_documents_total 1');
      expect(body).toContain('opensearch_index_segments_total 1');
      expect(body).toContain('opensearch_provider_circuit_breaker_state{provider="mock-provider"} 0');
    });

    it('GET /metrics with Accept: application/json returns valid JSON snapshot', async () => {
      const res = await fetch(`${baseUrl}/metrics`, {
        headers: { Accept: 'application/json' },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const json = await res.json();
      expect(json.timestamp).toBeDefined();
      expect(json.gauges['opensearch_index_documents_total']).toBeDefined();
      expect(json.gauges['opensearch_index_documents_total'][0].value).toBe(1);
    });

    it('records search metrics without leaking query text or IP address in labels', async () => {
      const sensitiveQuery = 'secret_patient_data_cancer_diagnosis_98765';
      const searchRes = await fetch(`${baseUrl}/api/v1/search?q=${encodeURIComponent(sensitiveQuery)}`);
      expect(searchRes.status).toBe(200);

      const metricsRes = await fetch(`${baseUrl}/metrics`);
      const body = await metricsRes.text();

      // Invariant: The sensitive query text must NEVER appear anywhere in metrics
      expect(body).not.toContain('secret_patient_data');
      expect(body).not.toContain('cancer_diagnosis');
      expect(body).not.toContain('98765');

      // Invariant: Raw IP addresses must NEVER appear as metric label values
      expect(body).not.toMatch(/\{[^}]*ip="[^"]+"/);

      // Operational metrics must be accurately updated
      expect(body).toContain('opensearch_http_requests_total{method="GET",path="/api/v1/search",status="200"} 1');
      expect(body).toContain('opensearch_search_queries_total{mode="standard"} 1');
      expect(body).toContain('opensearch_search_pipeline_duration_seconds_count{mode="standard"} 1');
      expect(body).toContain('opensearch_search_results_count_count 1');
    });

    it('records error metrics with low-cardinality codes for 404 and 400 responses', async () => {
      // 1. Trigger 404
      const notFoundRes = await fetch(`${baseUrl}/unmatched/path/attack?param=123`);
      expect(notFoundRes.status).toBe(404);

      // 2. Trigger 400 Validation Error
      const badReqRes = await fetch(`${baseUrl}/api/v1/search?page=-5`);
      expect(badReqRes.status).toBe(400);

      const metricsRes = await fetch(`${baseUrl}/metrics`);
      const body = await metricsRes.text();

      // Confirms errors recorded with normalized paths and standard error types
      expect(body).toContain('opensearch_errors_total{code="NOT_FOUND",path="/other"} 1');
      expect(body).toContain('opensearch_errors_total{code="VALIDATION_ERROR",path="/api/v1/search"} 1');

      // Confirms parameters or malicious paths are never in labels
      expect(body).not.toContain('param=123');
      expect(body).not.toContain('/unmatched/path/attack');
    });
  });
});
