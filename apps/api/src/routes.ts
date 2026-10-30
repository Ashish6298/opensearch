/**
 * @opensearch/api — Standard HTTP API Routes (Phase 16, 17 & 18)
 *
 * Implements core API endpoints:
 * - GET /: API index information and discovery links
 * - GET /health: Detailed service status, uptime, memory metrics, and document count
 * - GET /api/v1/status: System status endpoint
 * - GET /api/v1/search: Primary query search endpoint with pagination and parameter validation
 * - POST /api/v1/search: JSON body search endpoint for complex queries
 */

import {
  HTTP_STATUS,
  PROJECT_NAME,
  PROJECT_VERSION,
  PRODUCT_NAME,
  PRODUCT_FULL_NAME,
  PRODUCT_DISCLAIMER,
  TRADEMARK_NOTICE,
  ValidationError,
  createPrivacyReceipt,
  ContactedProviderRecord,
  SkippedProviderRecord,
  getProviderMetadataDefaults,
  ProviderExecutionStatus,
  DEFAULT_LATENCY_BUCKETS,
  DEFAULT_COUNT_BUCKETS,
  getDefaultRegistry,
  searchDemoCorpus,
  REPRESENTATIVE_DEMO_QUERIES,
  DEMO_CORPUS_DOCUMENTS,
} from '@opensearch/shared';
import {
  HealthCheckResponse,
  RouteHandler,
  SearchApiResponse,
  SuggestApiResponse,
} from './types.js';
import { fetchExternalWebWithTelemetry, getSharedProviderRegistry } from './external-search.js';
import {
  SafeSearchLevel,
  filterSafeSearchResults,
  getSafeSearchDisclosure,
  getDefaultLensRegistry,
  validateLensProfile,
  previewLensEffects,
  FocusLensProfile,
  getSharedQuickAnswerEngine,
  getSharedFeedbackService,
  getSharedFeedbackReviewQueue,
  RankingSafetyGuard,
  RankingSafetyViolationError,
  HeldOutContaminationError,
  CaseApprovalParams,
  RankingChangeProposal,
  ReviewStatus,
} from '@opensearch/ranking';
import { generateOpenApiSpec } from './openapi-spec.js';
import { generateDocsHtml } from './docs-html.js';
import { generateOpenSearchDescriptor, OPENSEARCH_DESCRIPTOR_MIME_TYPE } from './opensearch-descriptor.js';

export const handleHealthCheck: RouteHandler = (_req, res, context) => {
  const uptimeSeconds = Math.floor((Date.now() - context.startTime) / 1000);
  const mem = process.memoryUsage();
  const memoryUsageMb = Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100;
  const totalDocumentsIndexed = context.services?.index ? context.services.index.getStats().totalDocuments : 0;
  const totalTermsIndexed = context.services?.index ? context.services.index.getStats().totalTerms : 0;

  // Determine component readiness
  const isIndexReady = Boolean(context.services?.index);
  const isIndexEmpty = totalDocumentsIndexed === 0;

  const indexStatus: 'ok' | 'degraded' | 'error' = !isIndexReady
    ? 'error'
    : isIndexEmpty
      ? 'degraded'
      : 'ok';

  const rateLimiterStatus: 'ok' | 'degraded' | 'error' = context.rateLimiter ? 'ok' : 'degraded';
  const memoryStatus: 'ok' | 'degraded' | 'error' = memoryUsageMb > 512 ? 'degraded' : 'ok';
  const queryCacheStatus: 'ok' | 'degraded' | 'error' = context.queryCache ? 'ok' : 'degraded';

  // Provider health summary (Phase 112: never expose query text or user identifiers)
  const registeredProviders = context.services?.providerRegistry?.getAllProviders() ?? [];
  const enabledProviders = context.services?.providerRegistry?.getEnabledProviders() ?? [];
  const resilience = context.services?.providerRegistry?.getResilienceManager();
  const availableProviders = enabledProviders.filter(p => resilience ? resilience.canExecute(p.metadata.id).allowed : true);
  const providersStatus: 'ok' | 'degraded' | 'error' =
    registeredProviders.length === 0 || availableProviders.length > 0 ? 'ok' : 'degraded';

  let overallStatus: 'ok' | 'degraded' | 'error' = 'ok';
  if (indexStatus === 'error') {
    overallStatus = 'error';
  } else if (
    context.isShuttingDown ||
    indexStatus === 'degraded' ||
    rateLimiterStatus === 'degraded' ||
    memoryStatus === 'degraded' ||
    providersStatus === 'degraded'
  ) {
    overallStatus = 'degraded';
  }

  const response: HealthCheckResponse = {
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    phase:
      'Milestone 14 — Developer Platform & Zero-Dependency Documentation (Phase 43: OpenAPI 3.1 & /docs)',
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    memoryUsageMb,
    environment: context.config.env,
    totalDocumentsIndexed,
    routesAvailable: [
      'GET /',
      'GET /docs',
      'GET /health',
      'GET /healthz',
      'GET /ready',
      'GET /readyz',
      'GET /api/v1/status',
      'GET /api/v1/search',
      'POST /api/v1/search',
      'GET /api/v1/search/stream',
      'GET /api/v1/suggest',
      'GET /api/v1/lenses',
      'GET /api/v1/lenses/:id',
      'POST /api/v1/lenses/validate',
      'POST /api/v1/lenses/preview',
      'GET /api/v1/feedback',
      'POST /api/v1/feedback',
      'DELETE /api/v1/feedback',
      'GET /api/v1/feedback/privacy',
      'POST /api/v1/feedback/review/import',
      'GET /api/v1/feedback/review',
      'GET /api/v1/feedback/review/stats',
      'PATCH /api/v1/feedback/review/:id',
      'POST /api/v1/feedback/review/:id/approve-case',
      'POST /api/v1/feedback/review/ranking-check',
      'GET /opensearch.xml',
      'GET /opensearchdescription.xml',
      'GET /metrics',
      'GET /api/v1/openapi.json',
      'GET /openapi.json',
    ],
    components: {
      index: {
        status: indexStatus,
        details: {
          totalDocuments: totalDocumentsIndexed,
          totalTerms: totalTermsIndexed,
          empty: isIndexEmpty,
        },
      },
      rateLimiter: {
        status: rateLimiterStatus,
        details: {
          activeEntries: context.rateLimiter?.getStats().activeEntries ?? 0,
        },
      },
      queryCache: {
        status: queryCacheStatus,
        details: context.queryCache
          ? {
              size: context.queryCache.getStats().size,
              hits: context.queryCache.getStats().hits,
              misses: context.queryCache.getStats().misses,
              hitRatePercent: context.queryCache.getStats().hitRatePercent,
            }
          : {},
      },
      providers: {
        status: providersStatus,
        details: {
          totalRegistered: registeredProviders.length,
          availableCount: availableProviders.length,
        },
      },
      storage: {
        status: 'ok',
        details: {
          storageDir: context.config.storage.storageDir,
          deploymentModel: context.deploymentModel ?? 'standalone',
        },
      },
      memory: {
        status: memoryStatus,
        details: {
          heapUsedMb: memoryUsageMb,
          heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
          rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        },
      },
    },
  };

  // /health answers liveness: returns 200 as long as the process is alive (503 only on critical fatal state)
  const statusCode = indexStatus === 'error' ? 503 : 200;
  res.status(statusCode).json(response);
};

/**
 * Readiness probe endpoint (GET /ready and /readyz - Phase 112).
 * Answers: Is this server instance ready to receive search traffic right now?
 * Returns 503 if shutting down or if core index is not ready.
 */
export const handleReadinessCheck: RouteHandler = (_req, res, context) => {
  const uptimeSeconds = Math.floor((Date.now() - context.startTime) / 1000);
  const totalDocumentsIndexed = context.services?.index ? context.services.index.getStats().totalDocuments : 0;
  const totalTermsIndexed = context.services?.index ? context.services.index.getStats().totalTerms : 0;
  const isIndexReady = Boolean(context.services?.index);

  const registeredProviders = context.services?.providerRegistry?.getAllProviders() ?? [];
  const enabledProviders = context.services?.providerRegistry?.getEnabledProviders() ?? [];
  const resilience = context.services?.providerRegistry?.getResilienceManager();
  const availableProviders = enabledProviders.filter(p => resilience ? resilience.canExecute(p.metadata.id).allowed : true);

  if (context.isShuttingDown) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      status: 'shutting_down',
      ready: false,
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      deploymentModel: context.deploymentModel ?? 'standalone',
      reason: 'Server is currently shutting down and draining active connections.',
    });
    return;
  }

  if (!isIndexReady) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      status: 'not_ready',
      ready: false,
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      deploymentModel: context.deploymentModel ?? 'standalone',
      reason: 'Search index subsystem is not initialized or in an error state.',
    });
    return;
  }

  res.status(HTTP_STATUS.OK).json({
    status: 'ready',
    ready: true,
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    deploymentModel: context.deploymentModel ?? 'standalone',
    index: {
      status: totalDocumentsIndexed === 0 ? 'degraded' : 'ok',
      documentsIndexed: totalDocumentsIndexed,
      termsIndexed: totalTermsIndexed,
    },
    providers: {
      availableCount: availableProviders.length,
      totalRegistered: registeredProviders.length,
    },
  });
};

export const handleApiRoot: RouteHandler = (_req, res, context) => {
  res.status(200).json({
    name: PROJECT_NAME,
    product: PRODUCT_NAME,
    fullName: PRODUCT_FULL_NAME,
    version: PROJECT_VERSION,
    description: 'OpenSearch Web Public HTTP Search API',
    documentation: '/docs',
    openapi: '/api/v1/openapi.json',
    endpoints: {
      health: '/health',
      status: '/api/v1/status',
      search: '/api/v1/search',
      stream: '/api/v1/search/stream',
      suggest: '/api/v1/suggest',
      lenses: '/api/v1/lenses',
      feedback: '/api/v1/feedback',
      feedbackReview: '/api/v1/feedback/review',
      mcp: '/api/v1/mcp',
      metrics: '/metrics',
      opensearch: '/opensearch.xml',
      openapi: '/api/v1/openapi.json',
      docs: '/docs',
    },
    legal: {
      disclaimer: PRODUCT_DISCLAIMER,
      trademarkNotice: TRADEMARK_NOTICE,
      notAffiliatedWith: 'Amazon Web Services or Amazon OpenSearch Project',
    },
    timestamp: new Date().toISOString(),
    environment: context.config.env,
  });
};

export const handleOpenApiSpec: RouteHandler = (_req, res, _context) => {
  const spec = generateOpenApiSpec();
  res.status(200).json(spec);
};

export const handleOpenSearchDescriptor: RouteHandler = (req, res, context) => {
  const hostHeader = (req.headers['x-forwarded-host'] as string) || (req.headers['host'] as string) || `${context.config.api.server.host}:${context.config.api.server.port}`;
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
  const baseUrl = `${proto}://${hostHeader}`;

  const xml = generateOpenSearchDescriptor({
    baseUrl,
  });

  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(HTTP_STATUS.OK).text(xml, OPENSEARCH_DESCRIPTOR_MIME_TYPE);
};

export const handleApiDocs: RouteHandler = (_req, res, _context) => {
  const html = generateDocsHtml();
  res.status(200).text(html, 'text/html; charset=utf-8');
};

export const handleSuggest: RouteHandler = (req, res, context) => {
  const startMs = Date.now();
  const qParam = req.query['q'] ?? req.query['query'];
  const rawQuery = Array.isArray(qParam) ? (qParam[0] ?? '') : (qParam ?? '');

  let limit = 5;
  const limitParam = req.query['limit'] ?? req.query['size'];
  if (limitParam) {
    const parsed = parseInt(Array.isArray(limitParam) ? limitParam[0]! : limitParam, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 10);
    }
  }

  const prefixTrie = context.services?.prefixTrie;
  const suggestions = prefixTrie ? prefixTrie.suggest(rawQuery, limit) : [];

  // OpenSearch 1.1 JSON suggestion format for browser address bars: ["query", ["s1", "s2", ...]]
  if (req.query['format'] === 'opensearch') {
    const suggestionTexts = suggestions.map(s => s.text);
    res.status(HTTP_STATUS.OK).text(JSON.stringify([rawQuery, suggestionTexts]), 'application/x-suggestions+json; charset=utf-8');
    return;
  }

  const payload: SuggestApiResponse = {
    query: rawQuery,
    suggestions,
    meta: {
      count: suggestions.length,
      durationMs: Date.now() - startMs,
      timestamp: new Date().toISOString(),
    },
  };

  res.status(HTTP_STATUS.OK).json(payload);
};

export const handleSystemStatus: RouteHandler = (_req, res, context) => {
  const totalDocs = context.services?.index ? context.services.index.getStats().totalDocuments : 0;
  const totalTerms = context.services?.index ? context.services.index.getStats().totalTerms : 0;
  const uptimeSeconds = Math.floor((Date.now() - context.startTime) / 1000);
  const mem = process.memoryUsage();
  const heapUsedMb = Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100;

  const registeredProviders = context.services?.providerRegistry?.getAllProviders() ?? [];
  const resilience = context.services?.providerRegistry?.getResilienceManager();

  const providerList = registeredProviders.map(p => {
    const can = resilience?.canExecute(p.metadata.id) ?? { allowed: true };
    const circuit = resilience?.getCircuitStatus(p.metadata.id);
    return {
      id: p.metadata.id,
      displayName: p.metadata.displayName,
      enabled: p.isEnabled(),
      available: can.allowed,
      circuitState: circuit?.state ?? 'CLOSED',
      reason: can.reason,
    };
  });
  const availableProviders = providerList.filter(p => p.available && p.enabled);

  let status = 'ok';
  if (context.isShuttingDown) {
    status = 'shutting_down';
  } else if (!context.services) {
    status = 'error';
  } else if (totalDocs === 0 || (registeredProviders.length > 0 && availableProviders.length === 0)) {
    status = 'degraded';
  }

  res.status(status === 'error' ? 503 : 200).json({
    name: PROJECT_NAME,
    product: PRODUCT_NAME,
    version: PROJECT_VERSION,
    phase: 'Milestone 39 — Documentation, Repository Hygiene & Demo (Phase 114: Product Identity)',
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    environment: context.config.env,
    deploymentModel: context.deploymentModel ?? 'standalone',
    server: {
      host: context.config.api.server.host,
      port: context.config.api.server.port,
      lifecycleState: context.lifecycleState ?? (context.isShuttingDown ? 'shutting_down' : 'ready'),
    },
    index: {
      status: totalDocs === 0 ? 'degraded' : 'ok',
      totalDocuments: totalDocs,
      totalTerms,
    },
    providers: {
      totalRegistered: registeredProviders.length,
      availableCount: availableProviders.length,
      list: providerList,
    },
    memory: {
      heapUsedMb,
    },
    privacy: {
      zeroTracking: true,
      zeroCookies: true,
      noQueryStorage: true,
    },
    legal: {
      disclaimer: PRODUCT_DISCLAIMER,
      trademarkNotice: TRADEMARK_NOTICE,
    },
  });
};

/**
 * Prometheus operational metrics endpoint (GET /metrics - Phase 113).
 * Exposes low-cardinality, privacy-safe metrics in standard Prometheus text exposition format (0.0.4)
 * or JSON snapshot (when requested via Accept: application/json).
 * Strictly guarantees zero collection of raw user queries, user IDs, or IPs.
 */
export const handleMetrics: RouteHandler = async (req, res, context) => {
  const registry = context.metrics || getDefaultRegistry();

  // 1. Process runtime metrics
  registry
    .gauge('opensearch_process_uptime_seconds', 'Process uptime in seconds')
    .set(process.uptime());

  const mem = process.memoryUsage();
  registry
    .gauge('opensearch_memory_heap_used_bytes', 'Process heap memory used in bytes')
    .set(mem.heapUsed);
  registry
    .gauge('opensearch_memory_heap_total_bytes', 'Process heap memory total in bytes')
    .set(mem.heapTotal);
  registry
    .gauge('opensearch_memory_rss_bytes', 'Process resident set size in bytes')
    .set(mem.rss);

  // 2. Index metrics
  if (context.services?.index) {
    try {
      const stats = context.services.index.getStats();
      registry
        .gauge('opensearch_index_documents_total', 'Total number of documents indexed')
        .set(stats.totalDocuments);
      registry
        .gauge('opensearch_index_terms_total', 'Total number of unique terms indexed')
        .set(stats.totalTerms || 0);
      registry
        .gauge('opensearch_index_segments_total', 'Total number of active index segments')
        .set(1);
    } catch {
      // Non-fatal if index is not loaded
    }
  }

  // 3. Provider circuit breaker state metrics
  const activeRegistry = context.services?.providerRegistry || context.providerRegistry;
  if (activeRegistry) {
    try {
      const statuses = activeRegistry.getAllProviderStatuses();
      const breakerGauge = registry.gauge(
        'opensearch_provider_circuit_breaker_state',
        'Current circuit breaker state per provider (0=closed/healthy, 1=half-open, 2=open/tripped)',
        ['provider'],
      );
      for (const p of statuses) {
        const stateVal = p.circuitState === 'OPEN' ? 2 : p.circuitState === 'HALF_OPEN' ? 1 : 0;
        breakerGauge.set({ provider: p.id }, stateVal);
      }
    } catch {
      // Non-fatal
    }
  }

  // 4. Queue depth metrics
  const reviewQueue = context.services?.feedbackReviewQueue || context.feedbackReviewQueue;
  if (reviewQueue) {
    try {
      const stats = reviewQueue.getStats();
      registry
        .gauge(
          'opensearch_queue_depth',
          'Current pending queue depth for asynchronous background processing',
          ['queue'],
        )
        .set({ queue: 'feedback_review' }, stats.pendingCount);
    } catch {
      // Non-fatal
    }
  }

  // 5. Check Accept header: return JSON snapshot or standard Prometheus text format
  const accept = (req.headers['accept'] as string) || '';
  if (accept.includes('application/json')) {
    res.status(HTTP_STATUS.OK).json(registry.getSnapshot());
    return;
  }

  const output = registry.toPrometheusFormat();
  res.raw.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.raw.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.raw.statusCode = HTTP_STATUS.OK;
  res.raw.end(output);
};

export const handleSearch: RouteHandler = async (req, res, context) => {
  const startMs = Date.now();

  if (!context.services) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      error: {
        message: 'Search engine subsystem is initializing or unavailable.',
        code: 'SERVICE_UNAVAILABLE',
        category: 'INTERNAL',
        statusCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  const { queryParser, candidateRetriever, rankingEngine, resultGenerator } = context.services;

  // 1. Extract query parameters from GET query string or POST JSON body
  let rawQuery = '';
  let page = 1;
  let pageSize = context.config.search.defaultPageSize;

  if (req.method === 'POST' && req.body && typeof req.body === 'object') {
    const bodyObj = req.body as Record<string, unknown>;
    rawQuery =
      typeof bodyObj['q'] === 'string'
        ? bodyObj['q']
        : typeof bodyObj['query'] === 'string'
          ? bodyObj['query']
          : '';
    if (typeof bodyObj['page'] === 'number') {
      page = Math.floor(bodyObj['page']);
    } else if (typeof bodyObj['page'] === 'string') {
      page = parseInt(bodyObj['page'], 10) || 1;
    }
    if (typeof bodyObj['pageSize'] === 'number') {
      pageSize = Math.floor(bodyObj['pageSize']);
    } else if (typeof bodyObj['pageSize'] === 'string') {
      pageSize = parseInt(bodyObj['pageSize'], 10) || pageSize;
    }
  } else {
    const qParam = req.query['q'] ?? req.query['query'];
    rawQuery = Array.isArray(qParam) ? (qParam[0] ?? '') : (qParam ?? '');

    const pageParam = req.query['page'];
    if (pageParam) {
      const parsedPage = parseInt(Array.isArray(pageParam) ? pageParam[0]! : pageParam, 10);
      if (!isNaN(parsedPage)) page = parsedPage;
    }

    const sizeParam = req.query['pageSize'] ?? req.query['size'];
    if (sizeParam) {
      const parsedSize = parseInt(Array.isArray(sizeParam) ? sizeParam[0]! : sizeParam, 10);
      if (!isNaN(parsedSize)) pageSize = parsedSize;
    }
  }

  const rawLens = (req.query['lens'] as string) ?? (typeof (req.body as Record<string, unknown>)?.['lens'] === 'string' ? (req.body as Record<string, unknown>)['lens'] as string : undefined);
  const activeLens = rawLens ? getDefaultLensRegistry().resolveLens(rawLens) : undefined;

  const explainParam = req.query['explain'];
  const explain = explainParam === 'true' || explainParam === '1';

  const rawMode = ((req.query['mode'] as string) || ((req.body as Record<string, unknown>)?.['mode'] as string) || '').toLowerCase().trim();
  const isLocalOnly = req.query['localOnly'] === 'true' || rawMode === 'local' || rawMode === 'local-only';
  const isDemo =
    req.query['demo'] === 'true' ||
    req.query['demo_mode'] === 'true' ||
    rawMode === 'demo' ||
    req.headers['x-demo-mode'] === 'true' ||
    Boolean(context.isDemoMode);

  // 2. Validate input constraints
  if (page < 1) {
    throw new ValidationError(
      'Query parameter "page" must be a positive integer greater than or equal to 1.',
      {
        code: 'INVALID_PAGE_NUMBER',
      },
    );
  }

  const maxAllowedPageSize = context.config.search.maxPageSize || 100;
  if (pageSize < 1 || pageSize > maxAllowedPageSize) {
    throw new ValidationError(
      `Query parameter "pageSize" must be between 1 and ${maxAllowedPageSize}.`,
      {
        code: 'INVALID_PAGE_SIZE',
      },
    );
  }

  const maxQueryLength = context.config.search.maxQueryLength || 200;
  if (rawQuery.length > maxQueryLength) {
    throw new ValidationError(
      `Search query exceeds maximum allowed length of ${maxQueryLength} characters.`,
      {
        code: 'QUERY_TOO_LONG',
      },
    );
  }

  // 3. Query Parsing & Normalization
  const parsedQuery = queryParser.parse(rawQuery);

  // Fast-path: empty query
  if (parsedQuery.isEmpty) {
    const emptyResponse: SearchApiResponse = {
      query: {
        raw: rawQuery,
        normalized: '',
        terms: [],
        phrases: [],
        negatedTerms: [],
      },
      results: [],
      pagination: resultGenerator.computePagination(0, page, pageSize),
      meta: {
        totalHits: 0,
        candidateCount: 0,
        durationMs: Date.now() - startMs,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(HTTP_STATUS.OK).json(emptyResponse);
    return;
  }

  // Check LRU Query Cache (Phase 28 performance optimization)
  const cacheKey = `q:${parsedQuery.normalizedQuery}|p:${page}|s:${pageSize}|l:${activeLens?.id ?? 'default'}`;
  const queryCache = context.services.queryCache || context.queryCache;

  if (queryCache) {
    const cached = queryCache.get(cacheKey);
    if (cached) {
      // Return cached results with updated duration header / response
      const cachedResponse: SearchApiResponse = {
        ...cached,
        meta: {
          ...cached.meta,
          durationMs: Date.now() - startMs,
          timestamp: new Date().toISOString(),
        },
      };
      res.setHeader('X-Cache', 'HIT');
      if (context.metrics) {
        const mode = isLocalOnly ? 'local_only' : 'standard';
        context.metrics
          .counter('opensearch_search_queries_total', 'Total search queries executed partitioned by privacy mode', ['mode'])
          .inc({ mode });
        context.metrics
          .histogram(
            'opensearch_search_pipeline_duration_seconds',
            'Search query execution latency in seconds from start to result generation',
            ['mode'],
            DEFAULT_LATENCY_BUCKETS,
          )
          .observe({ mode }, (Date.now() - startMs) / 1000);
        context.metrics
          .histogram('opensearch_search_results_count', 'Distribution of search result item counts returned to clients', [], DEFAULT_COUNT_BUCKETS)
          .observe(cached.results.length);
      }
      res.status(HTTP_STATUS.OK).json(cachedResponse);
      return;
    }
  }

  // 4. Candidate Retrieval
  const retrievalResult = candidateRetriever.retrieve(parsedQuery, {
    maxCandidates: context.config.search.maxCandidates,
  });

  // 5. Multi-Signal Relevance Ranking
  const rankingResult = rankingEngine.rank(parsedQuery, retrievalResult.candidates, {
    topK: Math.max(100, page * pageSize),
    enableDuplicatePenalty: true,
    lens: activeLens,
  });

  // 6. Result Generation, Snippets & Pagination
  const searchResultSet = resultGenerator.generateResults(parsedQuery, rankingResult.hits, {
    pagination: {
      page,
      pageSize,
    },
  });

  let finalResults = [...searchResultSet.items];
  let totalHits = searchResultSet.pagination.totalHits;

  const requestedCategory = (
    (req.query['category'] as string) ||
    (req.query['filter'] as string) ||
    'all'
  ).toLowerCase().trim();

  // Phase 80 — Category Filtering & Non-Relabeling Enforcement:
  // Do not relabel general results as images or news.
  if (requestedCategory === 'images' || requestedCategory === 'multimedia' || requestedCategory === 'image') {
    finalResults = finalResults.filter(item => {
      return (item.contentType === 'image' || item.contentType === 'multimedia') ||
        Boolean(item.thumbnailUrl && item.thumbnailUrl.startsWith('http'));
    });
    totalHits = finalResults.length;
  } else if (requestedCategory === 'news') {
    finalResults = finalResults.filter(item => {
      return item.source === 'hackernews' ||
        (item.contentType === 'article' && Boolean(item.publishedAt));
    });
    totalHits = finalResults.length;
  }

  // Phase 81 — Safe Search and Content Controls:
  const rawSafeSearch = ((req.query['safeSearch'] as string) || (req.query['safe'] as string) || 'moderate').toLowerCase().trim();
  const safeSearchLevel: SafeSearchLevel = rawSafeSearch === 'strict' || rawSafeSearch === 'off' ? rawSafeSearch : 'moderate';

  // Query live web search when local indexed results are insufficient (unless in local-only mode)
  // In Local-Only mode: query planner strictly suppresses external search providers
  const providerRegistry = context.services.providerRegistry ?? context.providerRegistry;
  const canFetchExternal = !isLocalOnly && !isDemo && (process.env.NODE_ENV !== 'test' || Boolean(providerRegistry));

  // Phase 84 — Privacy Receipt Telemetry Collection:
  const contactedProviders: ContactedProviderRecord[] = [];
  const skippedProviders: SkippedProviderRecord[] = [];
  let isPartialResult = false;
  let searchDeadlineExceeded = false;
  let liveExecution: Awaited<ReturnType<typeof fetchExternalWebWithTelemetry>> | undefined;

  const activeRegistry = providerRegistry ?? getSharedProviderRegistry();

  if (isDemo) {
    if (activeRegistry) {
      for (const p of activeRegistry.getAllProviders()) {
        skippedProviders.push({
          providerId: p.metadata.id,
          reason: 'demo-mode',
          details: 'External search provider suppressed because Demo mode is active.',
        });
      }
    }
  } else if (isLocalOnly) {
    if (activeRegistry) {
      for (const p of activeRegistry.getAllProviders()) {
        skippedProviders.push({
          providerId: p.metadata.id,
          reason: 'local-only-mode',
          details: 'External search provider suppressed because Local-only search mode is active.',
        });
      }
    }
  } else if (finalResults.length >= pageSize) {
    if (activeRegistry) {
      for (const p of activeRegistry.getAllProviders()) {
        skippedProviders.push({
          providerId: p.metadata.id,
          reason: 'sufficient-local-results',
          details: 'Local index provided sufficient results without outbound queries.',
        });
      }
    }
  } else if (canFetchExternal && page === 1 && finalResults.length < pageSize) {
    try {
      liveExecution = await fetchExternalWebWithTelemetry(
        rawQuery,
        pageSize - finalResults.length,
        providerRegistry,
        requestedCategory,
        safeSearchLevel,
      );

      isPartialResult = liveExecution.summary.isPartial || liveExecution.summary.failedProviders > 0;
      searchDeadlineExceeded = Boolean(liveExecution.summary.searchDeadlineExceeded);

      for (const pResult of liveExecution.summary.providerResults) {
        const defaults = getProviderMetadataDefaults(pResult.providerId);
        const provObj = activeRegistry?.getProvider(pResult.providerId);
        const endpoint = provObj?.metadata.endpoint || defaults.endpoint;
        const purpose = defaults.purpose;

        let status: ProviderExecutionStatus = 'success';
        let statusCode = 200;

        if (pResult.cached) {
          status = 'cached';
          statusCode = 200;
        } else if (pResult.errorCode === 'TIMEOUT') {
          status = 'timeout';
          statusCode = 504;
        } else if (pResult.errorCode === 'RATE_LIMITED') {
          status = 'rate-limited';
          statusCode = 429;
        } else if (pResult.errorCode === 'CIRCUIT_OPEN') {
          status = 'circuit-breaker-open';
          statusCode = 503;
        } else if (pResult.error || pResult.errorCode) {
          status = 'failed';
          statusCode = 502;
        }

        contactedProviders.push({
          providerId: pResult.providerId,
          endpoint,
          purpose,
          statusCode,
          latencyMs: pResult.durationMs,
          queryTransmitted: true,
          clientIpForwarded: false,
          status,
          ...(pResult.cached ? { cached: true } : {}),
          ...(pResult.errorCode ? { errorCategory: pResult.errorCode } : {}),
        });
      }

      if (activeRegistry) {
        const contactedSet = new Set(liveExecution.summary.providerResults.map((p) => p.providerId));
        for (const prov of activeRegistry.getAllProviders()) {
          if (!contactedSet.has(prov.metadata.id)) {
            if (!prov.isEnabled()) {
              skippedProviders.push({
                providerId: prov.metadata.id,
                reason: 'disabled-by-configuration',
                details: 'Provider is disabled in configuration.',
              });
            } else {
              skippedProviders.push({
                providerId: prov.metadata.id,
                reason: 'category-mismatch',
                details: `Provider does not support requested category "${requestedCategory}".`,
              });
            }
          }
        }
      }

      const liveItems = liveExecution.items;
      if (liveItems.length > 0) {
        const existingUrls = new Set(finalResults.map(r => r.url.toLowerCase()));
        const uniqueLive = liveItems.filter(item => !existingUrls.has(item.url.toLowerCase()));

        finalResults = [...finalResults, ...uniqueLive].slice(0, pageSize);
        finalResults.forEach((item, idx) => {
          item.rank = idx + 1;
        });
        totalHits = Math.max(totalHits, finalResults.length);
      }
    } catch {
      isPartialResult = true;
    }
  }

  // Apply consistent local Safe Search filtering to both local index and provider results
  // Phase 116: Offline Curated Demo Corpus Fallback
  if (isDemo && finalResults.length === 0) {
    const demoMatches = searchDemoCorpus(rawQuery, { limit: pageSize, category: requestedCategory });
    finalResults = demoMatches.documents.map((doc, idx) => ({
      documentId: doc.id,
      score: 1.0 - idx * 0.05,
      rank: idx + 1,
      title: doc.title,
      highlightedTitle: doc.title,
      url: doc.url,
      displayUrl: doc.displayUrl,
      domain: doc.domain,
      snippet: doc.snippet,
      highlightedSnippet: doc.snippet,
      language: 'en',
      indexedAt: doc.publishedAt,
      source: 'demo',
      isDemo: true as const,
      contentType: doc.contentType,
      publishedAt: doc.publishedAt,
      attribution: 'Curated OpenSearch Demo Corpus',
    }));
    totalHits = finalResults.length;
  } else if (isDemo && finalResults.length > 0) {
    finalResults.forEach(item => {
      item.isDemo = true;
    });
  }
  const safeFilterResult = filterSafeSearchResults(finalResults, safeSearchLevel);
  finalResults = safeFilterResult.filtered;
  totalHits = Math.max(0, totalHits - safeFilterResult.excludedCount);
  const safeSearchDisclosure = getSafeSearchDisclosure(safeSearchLevel);

  // 7. Instant Answers & Bang Shortcuts Evaluation (Phase 38)
  const instantAnswerEngine = context.services.instantAnswerEngine;
  const instantAnswer = instantAnswerEngine
    ? await instantAnswerEngine.evaluateAsync(rawQuery, {
        isLocalOnly,
        privacyMode: isLocalOnly || isDemo ? 'local-only' : 'standard',
        timeoutMs: 2000,
      })
    : null;
  const bang =
    instantAnswer && instantAnswer.type === 'bang'
      ? {
          isBang: true as const,
          bangKey:
            instantAnswer.secondaryDetails?.['Bang Trigger']?.toString().replace('!', '') || '',
          matchedTrigger:
            instantAnswer.secondaryDetails?.['Bang Trigger']?.toString().replace('!', '') || '',
          serviceName: instantAnswer.secondaryDetails?.['Target Service']?.toString() || '',
          category: 'developer',
          searchQuery: instantAnswer.secondaryDetails?.['Search Target']?.toString() || '',
          redirectUrl: instantAnswer.redirectUrl || '',
        }
      : null;

  // 8. Typo Tolerance & Did You Mean Evaluation (Phase 36)
  let didYouMean = null;
  const typoEngine = context.services.typoEngine;
  if (typoEngine && (totalHits === 0 || totalHits < pageSize / 2) && !instantAnswer) {
    didYouMean = typoEngine.suggestCorrection(rawQuery);
  }

  // Phase 104 — Quick Answer Extractive Summarizer from Retrieved Results
  const quickAnswerEngine = context.services.quickAnswerEngine ?? getSharedQuickAnswerEngine();
  const quickAnswer = quickAnswerEngine
    ? quickAnswerEngine.generate(rawQuery, finalResults, {
        isLocalOnly,
        maxInputDocuments: 5,
        maxOutputSentences: 3,
        minRelevanceThreshold: 0.20,
      })
    : null;

  // Phase 84 — Generate Verifiable Privacy Receipt from Real Execution Telemetry
  const clientIp = (req.ip as string) || (req.raw?.socket?.remoteAddress as string) || '127.0.0.1';
  const hasThumbnails = finalResults.some(r => Boolean(r.thumbnailUrl));
  const rawIpString = typeof clientIp === 'string' ? clientIp : '127.0.0.1';
  const firstIp = rawIpString.split(',')[0]?.trim() || '127.0.0.1';

  const privacyReceipt = createPrivacyReceipt({
    mode: isDemo ? 'demo' : (isLocalOnly ? 'local-only' : 'standard'),
    clientIp: firstIp,
    category: requestedCategory,
    contactedProviders,
    skippedProviders,
    isPartialResult,
    searchDeadlineExceeded,
    hasThumbnails,
    referrerPolicy: 'strict-origin-when-cross-origin',
  });

  const responsePayload: SearchApiResponse = {
    query: {
      raw: rawQuery,
      normalized: parsedQuery.normalizedQuery,
      terms: parsedQuery.terms,
      phrases: parsedQuery.phrases.map(p => p.rawPhrase),
      negatedTerms: parsedQuery.negatedTerms,
      filters: parsedQuery.filters,
    },
    instantAnswer,
    quickAnswer,
    bang,
    didYouMean,
    results: explain
      ? finalResults.map(r => {
          const matchedScoredDoc = rankingResult.hits.find(h => h.documentId === r.documentId);
          return {
            ...r,
            explanation: matchedScoredDoc?.explanation,
          };
        })
      : finalResults,
    pagination: {
      ...searchResultSet.pagination,
      totalHits,
      totalPages: Math.max(1, Math.ceil(totalHits / pageSize)),
    },
    privacyReceipt,
    meta: {
      totalHits,
      candidateCount: retrievalResult.candidates.length,
      durationMs: Date.now() - startMs,
      timestamp: new Date().toISOString(),
      explainPlan: explain,
      category: requestedCategory,
      lens: activeLens ? { id: activeLens.id, name: activeLens.name, disclaimer: activeLens.disclaimer, isMedicalEndorsement: false } : undefined,
      categoryAvailable: isLocalOnly && (requestedCategory === 'images' || requestedCategory === 'news') && finalResults.length === 0
        ? false
        : true,
      localOnly: isLocalOnly,
      demoMode: isDemo,
      demoNotice: isDemo
        ? 'OpenSearch Web Demo Mode: Results served from offline curated demo corpus without external network calls.'
        : undefined,
      privacyReceipt,
      limitedResultsNotice: isLocalOnly && finalResults.length < pageSize
        ? finalResults.length === 0
          ? 'Local-only mode active: No matching documents found in the local index. External search providers are disabled for privacy.'
          : `Local-only mode active: Displaying ${finalResults.length} local document(s). External search providers are disabled for privacy.`
        : undefined,
      safeSearch: {
        level: safeSearchLevel,
        filteredCount: safeFilterResult.excludedCount,
        explanation: safeSearchDisclosure.summaryExplanation,
        whatItCovers: safeSearchDisclosure.whatItCovers,
        whatItDoesNotCover: safeSearchDisclosure.whatItDoesNotCover,
      },
    },
  };

  // Populate cache for subsequent identical requests
  if (queryCache) {
    queryCache.set(cacheKey, responsePayload);
  }

  // Operational metrics without query surveillance (Phase 113)
  if (context.metrics) {
    const mode = isLocalOnly ? 'local_only' : 'standard';
    const durationSeconds = (Date.now() - startMs) / 1000;

    context.metrics
      .counter('opensearch_search_queries_total', 'Total search queries executed partitioned by privacy mode', ['mode'])
      .inc({ mode });

    context.metrics
      .histogram(
        'opensearch_search_pipeline_duration_seconds',
        'Search query execution latency in seconds from start to result generation',
        ['mode'],
        DEFAULT_LATENCY_BUCKETS,
      )
      .observe({ mode }, durationSeconds);

    context.metrics
      .histogram(
        'opensearch_search_results_count',
        'Distribution of search result item counts returned to clients',
        [],
        DEFAULT_COUNT_BUCKETS,
      )
      .observe(finalResults.length);

    if (liveExecution?.summary?.providerResults) {
      for (const pResult of liveExecution.summary.providerResults) {
        const provStatus = pResult.cached ? 'cached' : pResult.error || pResult.errorCode ? 'failure' : 'success';
        context.metrics
          .counter(
            'opensearch_provider_requests_total',
            'Total outbound requests made to search providers by provider ID and result status',
            ['provider', 'status'],
          )
          .inc({ provider: pResult.providerId, status: provStatus });

        context.metrics
          .histogram(
            'opensearch_provider_request_duration_seconds',
            'Outbound search provider response latency in seconds',
            ['provider'],
            DEFAULT_LATENCY_BUCKETS,
          )
          .observe({ provider: pResult.providerId }, (pResult.durationMs || 0) / 1000);
      }
    }
  }

  res.setHeader('X-Cache', 'MISS');
  res.status(HTTP_STATUS.OK).json(responsePayload);
};

export const handleSearchStream: RouteHandler = async (req, res, context) => {
  const startMs = Date.now();

  const qParam = req.query['q'] ?? req.query['query'];
  const rawQuery = Array.isArray(qParam) ? (qParam[0] ?? '') : (qParam ?? '');
  const limitParam = req.query['limit'] ?? req.query['pageSize'];
  const limit = Math.min(50, Math.max(1, parseInt(Array.isArray(limitParam) ? limitParam[0]! : (limitParam ?? '10'), 10) || 10));

  // Set SSE Streaming Headers
  res.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  const sendEvent = (event: string, data: unknown) => {
    if (!res.raw.writableEnded && !res.raw.destroyed) {
      res.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  req.raw.on('close', () => {
    if (!res.raw.writableEnded) {
      res.raw.end();
    }
  });

  if (!rawQuery.trim() || !context.services) {
    sendEvent('error', { message: 'Query is empty or search services are initializing.' });
    sendEvent('done', { durationMs: Date.now() - startMs });
    res.raw.end();
    return;
  }

  const { queryParser, candidateRetriever, rankingEngine, resultGenerator, instantAnswerEngine } = context.services;

  const rawMode = ((req.query['mode'] as string) || '').toLowerCase().trim();
  const isLocalOnly = req.query['localOnly'] === 'true' || rawMode === 'local' || rawMode === 'local-only';
  const isDemo =
    req.query['demo'] === 'true' ||
    req.query['demo_mode'] === 'true' ||
    rawMode === 'demo' ||
    req.headers['x-demo-mode'] === 'true' ||
    Boolean(context.isDemoMode);

  // 1. Instant Answer evaluation & streaming (first event)
  if (instantAnswerEngine) {
    const instantAnswer = await instantAnswerEngine.evaluateAsync(rawQuery, {
      isLocalOnly,
      privacyMode: isLocalOnly || isDemo ? 'local-only' : 'standard',
      timeoutMs: 2000,
    });
    if (instantAnswer) {
      sendEvent('answer', instantAnswer);
    }
  }

  // 2. Candidate Retrieval
  const parsedQuery = queryParser.parse(rawQuery);
  const retrievalResult = candidateRetriever.retrieve(parsedQuery, {
    maxCandidates: context.config.search.maxCandidates,
  });

  // 3. Multi-Signal Relevance Ranking
  const rankingResult = rankingEngine.rank(parsedQuery, retrievalResult.candidates, {
    topK: limit,
    enableDuplicatePenalty: true,
  });

  // 4. Result Generation & Snippets
  const searchResultSet = resultGenerator.generateResults(parsedQuery, rankingResult.hits, {
    pagination: {
      page: 1,
      pageSize: limit,
    },
  });

  // 5. Stream scored document chunks
  sendEvent('results', {
    items: searchResultSet.items,
    totalHits: searchResultSet.pagination.totalHits,
  });

  // 5.5. Stream extractive quick answer if evidence is sufficient (Phase 104)
  const quickAnswerEngine = context.services.quickAnswerEngine ?? getSharedQuickAnswerEngine();
  if (quickAnswerEngine && searchResultSet.items.length > 0) {
    const quickAnswer = quickAnswerEngine.generate(rawQuery, searchResultSet.items, {
      isLocalOnly: false,
    });
    if (quickAnswer && quickAnswer.hasSufficientEvidence) {
      sendEvent('quick_answer', quickAnswer);
    }
  }

  // 6. Complete SSE Stream
  sendEvent('done', {
    totalHits: searchResultSet.pagination.totalHits,
    candidateCount: retrievalResult.candidates.length,
    durationMs: Date.now() - startMs,
    timestamp: new Date().toISOString(),
  });

  res.raw.end();
};


export const handleListLenses: RouteHandler = (_req, res) => {
  const registry = getDefaultLensRegistry();
  const lenses = registry.listLenses();
  res.status(HTTP_STATUS.OK).json({
    total: lenses.length,
    defaultLens: 'general',
    lenses,
  });
};

export const handleGetLens: RouteHandler = (req, res) => {
  const lensId = req.params['id'];
  if (!lensId) {
    throw new ValidationError('Lens id parameter is required.');
  }
  const registry = getDefaultLensRegistry();
  const lens = registry.getLens(lensId);
  if (!lens) {
    res.status(HTTP_STATUS.NOT_FOUND).json({
      error: {
        message: `Focus Lens with id "${lensId}" was not found.`,
        code: 'LENS_NOT_FOUND',
        statusCode: HTTP_STATUS.NOT_FOUND,
      },
    });
    return;
  }
  res.status(HTTP_STATUS.OK).json({ lens });
};

export const handleValidateLens: RouteHandler = (req, res) => {
  const rawBody = req.body;
  if (!rawBody || typeof rawBody !== 'object') {
    throw new ValidationError('Request body must be a JSON object containing the Lens profile.');
  }
  const result = validateLensProfile(rawBody);
  res.status(HTTP_STATUS.OK).json(result);
};

export const handlePreviewLens: RouteHandler = (req, res) => {
  const rawBody = req.body as Record<string, unknown> | undefined;
  const registry = getDefaultLensRegistry();
  let lensProfile: FocusLensProfile | undefined;

  if (typeof rawBody?.['lensId'] === 'string') {
    lensProfile = registry.resolveLens(rawBody['lensId'] as string);
  } else if (typeof rawBody?.['lens'] === 'string') {
    lensProfile = registry.resolveLens(rawBody['lens'] as string);
  } else if (rawBody?.['profile'] && typeof rawBody['profile'] === 'object') {
    const val = validateLensProfile(rawBody['profile']);
    if (!val.valid || !val.profile) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: {
          message: 'Invalid Focus Lens profile definition.',
          errors: val.errors,
          code: 'INVALID_LENS_PROFILE',
        },
      });
      return;
    }
    lensProfile = val.profile;
  } else if (rawBody && typeof rawBody === 'object' && ('id' in rawBody || 'schemaVersion' in rawBody)) {
    const val = validateLensProfile(rawBody);
    if (!val.valid || !val.profile) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: {
          message: 'Invalid Focus Lens profile definition.',
          errors: val.errors,
          code: 'INVALID_LENS_PROFILE',
        },
      });
      return;
    }
    lensProfile = val.profile;
  } else {
    lensProfile = registry.resolveLens('general');
  }

  const previewReport = previewLensEffects(lensProfile);
  res.status(HTTP_STATUS.OK).json(previewReport);
};

// ── Phase 105: Privacy-Conscious Feedback Endpoints (Milestone 36) ────────

export const handlePostFeedback: RouteHandler = (req, res, context) => {
  const feedbackService = context.services?.feedbackService ?? context.feedbackService ?? getSharedFeedbackService();
  const rawBody = req.body;

  if (!rawBody || typeof rawBody !== 'object') {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: {
        code: 'INVALID_FEEDBACK_PAYLOAD',
        message: 'Request body must be a JSON object containing the feedback submission and consent.',
        statusCode: HTTP_STATUS.BAD_REQUEST,
      },
    });
    return;
  }

  const result = feedbackService.submitFeedback(rawBody);

  if (!result.success || !result.record) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: {
        code: 'FEEDBACK_VALIDATION_FAILED',
        message: (result.errors || ['Invalid feedback payload']).join('; '),
        statusCode: HTTP_STATUS.BAD_REQUEST,
      },
    });
    return;
  }

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'Feedback recorded successfully under privacy-conscious retention policy.',
    recordId: result.record.feedbackId,
    timestamp: result.record.timestamp,
    expiresAt: result.record.expiresAt,
  });
};

export const handleGetFeedback: RouteHandler = (_req, res, context) => {
  const feedbackService = context.services?.feedbackService ?? context.feedbackService ?? getSharedFeedbackService();
  const exported = feedbackService.exportFeedback();
  const stats = feedbackService.getStats();

  res.status(HTTP_STATUS.OK).json({
    ...exported,
    stats,
  });
};

export const handleDeleteFeedback: RouteHandler = (_req, res, context) => {
  const feedbackService = context.services?.feedbackService ?? context.feedbackService ?? getSharedFeedbackService();
  const purgedCount = feedbackService.purgeAllRecords();

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: `Successfully purged ${purgedCount} feedback record(s).`,
    purgedCount,
  });
};

export const handleGetFeedbackPrivacy: RouteHandler = (_req, res, context) => {
  const feedbackService = context.services?.feedbackService ?? context.feedbackService ?? getSharedFeedbackService();
  const policy = feedbackService.getPrivacyNotice();

  res.status(HTTP_STATUS.OK).json({
    policy,
    disclaimer: 'Feedback collection is strictly optional. OpenSearch never collects raw queries, IP addresses, accounts, or click histories.',
  });
};

// ── Phase 106: Feedback Review Workflow Endpoints (Milestone 36) ──────────

export const handleImportFeedbackReview: RouteHandler = (req, res, context) => {
  const queue = context.services?.feedbackReviewQueue ?? context.feedbackReviewQueue ?? getSharedFeedbackReviewQueue();
  const rawBody = req.body as Record<string, unknown> | undefined;

  let recordsToImport: any[] = [];
  if (rawBody && Array.isArray(rawBody['records'])) {
    recordsToImport = rawBody['records'];
  } else {
    const feedbackService = context.services?.feedbackService ?? context.feedbackService ?? getSharedFeedbackService();
    recordsToImport = feedbackService.getRecords();
  }

  const result = queue.importRecords(recordsToImport);
  res.status(HTTP_STATUS.OK).json({
    success: true,
    importedCount: result.importedCount,
    skippedCount: result.skippedCount,
    totalQueueItems: queue.getStats().totalItems,
  });
};

export const handleListFeedbackReview: RouteHandler = (req, res, context) => {
  const queue = context.services?.feedbackReviewQueue ?? context.feedbackReviewQueue ?? getSharedFeedbackReviewQueue();

  const status = typeof req.query['status'] === 'string' ? (req.query['status'] as ReviewStatus) : undefined;
  const clusterKey = typeof req.query['clusterKey'] === 'string' ? req.query['clusterKey'] : undefined;
  const burstQuery = req.query['isSuspiciousBurst'];
  const isSuspiciousBurst = burstQuery === 'true' ? true : burstQuery === 'false' ? false : undefined;

  const rawLimit = Number(req.query['limit']);
  const limit = !isNaN(rawLimit) && rawLimit > 0 ? rawLimit : 50;

  const rawOffset = Number(req.query['offset']);
  const offset = !isNaN(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const { items, total } = queue.listItems({
    status,
    clusterKey,
    isSuspiciousBurst,
    limit,
    offset,
  });

  res.status(HTTP_STATUS.OK).json({
    items,
    total,
    limit,
    offset,
  });
};

export const handleGetFeedbackReviewStats: RouteHandler = (_req, res, context) => {
  const queue = context.services?.feedbackReviewQueue ?? context.feedbackReviewQueue ?? getSharedFeedbackReviewQueue();
  const stats = queue.getStats();
  const clusters = queue.getClusters();

  res.status(HTTP_STATUS.OK).json({
    stats,
    clusters,
  });
};

export const handleUpdateFeedbackReviewItem: RouteHandler = (req, res, context) => {
  const queue = context.services?.feedbackReviewQueue ?? context.feedbackReviewQueue ?? getSharedFeedbackReviewQueue();
  const id = req.params['id'];

  if (!id) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: {
        code: 'MISSING_QUEUE_ID',
        message: 'Review queue item ID must be specified in the URL path.',
        statusCode: HTTP_STATUS.BAD_REQUEST,
      },
    });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  const status = body?.['status'] as ReviewStatus | undefined;
  if (!status) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: {
        code: 'MISSING_STATUS',
        message: 'A valid review status must be provided in the request body.',
        statusCode: HTTP_STATUS.BAD_REQUEST,
      },
    });
    return;
  }

  const curatorId = typeof body?.['curatorId'] === 'string' ? body['curatorId'] : undefined;
  const curatorNotes = typeof body?.['curatorNotes'] === 'string' ? body['curatorNotes'] : undefined;

  try {
    const updated = queue.updateStatus(id, status, curatorId, curatorNotes);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      item: updated,
    });
  } catch (err) {
    res.status(HTTP_STATUS.NOT_FOUND).json({
      error: {
        code: 'ITEM_NOT_FOUND',
        message: (err as Error).message,
        statusCode: HTTP_STATUS.NOT_FOUND,
      },
    });
  }
};

export const handleApproveEvaluationCase: RouteHandler = (req, res, context) => {
  const queue = context.services?.feedbackReviewQueue ?? context.feedbackReviewQueue ?? getSharedFeedbackReviewQueue();
  const id = req.params['id'];

  if (!id) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: {
        code: 'MISSING_QUEUE_ID',
        message: 'Review queue item ID must be specified in the URL path.',
        statusCode: HTTP_STATUS.BAD_REQUEST,
      },
    });
    return;
  }

  const body = req.body as unknown as CaseApprovalParams | undefined;
  if (!body || typeof body !== 'object') {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: {
        code: 'INVALID_APPROVAL_PAYLOAD',
        message: 'Request body must contain curator approval parameters.',
        statusCode: HTTP_STATUS.BAD_REQUEST,
      },
    });
    return;
  }

  try {
    const candidateCase = queue.approveCandidateEvaluationCase(id, body);
    const item = queue.getItem(id);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      candidateCase,
      item,
    });
  } catch (err) {
    if (err instanceof HeldOutContaminationError) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: {
          code: 'HELD_OUT_CONTAMINATION_ERROR',
          message: err.message,
          statusCode: HTTP_STATUS.BAD_REQUEST,
        },
      });
      return;
    }

    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: {
        code: 'CASE_APPROVAL_FAILED',
        message: (err as Error).message,
        statusCode: HTTP_STATUS.BAD_REQUEST,
      },
    });
  }
};

export const handleRankingSafetyCheck: RouteHandler = (req, res) => {
  const body = req.body as unknown as RankingChangeProposal | undefined;
  if (!body || typeof body !== 'object') {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      passed: false,
      error: {
        code: 'INVALID_PROPOSAL_PAYLOAD',
        message: 'Request body must contain a ranking change proposal.',
        statusCode: HTTP_STATUS.BAD_REQUEST,
      },
    });
    return;
  }

  try {
    const record = RankingSafetyGuard.assertSafeRankingModification(body);
    res.status(HTTP_STATUS.OK).json({
      passed: true,
      record,
    });
  } catch (err) {
    if (err instanceof RankingSafetyViolationError) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        passed: false,
        error: {
          code: 'RANKING_SAFETY_VIOLATION',
          message: err.message,
          statusCode: HTTP_STATUS.BAD_REQUEST,
        },
      });
      return;
    }

    res.status(HTTP_STATUS.BAD_REQUEST).json({
      passed: false,
      error: {
        code: 'SAFETY_CHECK_ERROR',
        message: (err as Error).message,
        statusCode: HTTP_STATUS.BAD_REQUEST,
      },
    });
  }
};

export { handleMcpPost, handleMcpSse } from './mcp/index.js';

/**
 * GET /api/v1/demo
 * Returns representative demo queries and offline demo dataset metadata (Phase 116).
 */
export const handleDemoInfo: RouteHandler = (_req, res) => {
  res.status(HTTP_STATUS.OK).json({
    status: 'ready',
    demoMode: true,
    paidServicesRequired: false,
    externalCallsEnabled: false,
    representativeQueries: REPRESENTATIVE_DEMO_QUERIES,
    corpusSummary: {
      totalDocuments: DEMO_CORPUS_DOCUMENTS.length,
      categories: ['everyday', 'developer'],
      description: 'Zero-credential, self-contained offline demo dataset with truthful labeling.',
    },
    privacy: {
      outboundRequests: 0,
      tracking: 'disabled',
      guarantee: 'Demo mode never silently invokes third-party providers or transmits query text.',
    },
    timestamp: new Date().toISOString(),
  });
};


