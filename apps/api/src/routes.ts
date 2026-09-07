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

import { HTTP_STATUS, PROJECT_NAME, PROJECT_VERSION, ValidationError } from '@opensearch/shared';
import { HealthCheckResponse, RouteHandler, SearchApiResponse } from './types.js';
import { fetchExternalWebResults } from './external-search.js';

export const handleHealthCheck: RouteHandler = (_req, res, context) => {
  const uptimeSeconds = Math.floor((Date.now() - context.startTime) / 1000);
  const mem = process.memoryUsage();
  const memoryUsageMb = Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100;
  const totalDocumentsIndexed = context.services?.index.getStats().totalDocuments ?? 0;
  const totalTermsIndexed = context.services?.index.getStats().totalTerms ?? 0;

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

  let overallStatus: 'ok' | 'degraded' | 'error' = 'ok';
  if (indexStatus === 'error') {
    overallStatus = 'error';
  } else if (
    indexStatus === 'degraded' ||
    rateLimiterStatus === 'degraded' ||
    memoryStatus === 'degraded'
  ) {
    overallStatus = 'degraded';
  }

  const response: HealthCheckResponse = {
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    phase: 'Milestone 9 — Performance & Free Infrastructure (Phase 28: Performance)',
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    memoryUsageMb,
    environment: context.config.env,
    totalDocumentsIndexed,
    routesAvailable: [
      'GET /',
      'GET /health',
      'GET /api/v1/status',
      'GET /api/v1/search',
      'POST /api/v1/search',
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

  const statusCode = overallStatus === 'error' ? 503 : 200;
  res.status(statusCode).json(response);
};

export const handleApiRoot: RouteHandler = (_req, res, context) => {
  res.status(200).json({
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    description: 'OpenSearch Public HTTP Search API',
    documentation: '/docs',
    endpoints: {
      health: '/health',
      status: '/api/v1/status',
      search: '/api/v1/search',
    },
    timestamp: new Date().toISOString(),
    environment: context.config.env,
  });
};

export const handleSystemStatus: RouteHandler = (_req, res, context) => {
  const totalDocs = context.services?.index.getStats().totalDocuments ?? 0;
  const status = !context.services ? 'error' : totalDocs === 0 ? 'degraded' : 'ok';

  res.status(200).json({
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    phase: 'Milestone 8 — Security, Reliability & Privacy (Phase 26: Reliability)',
    status,
    timestamp: new Date().toISOString(),
    server: {
      host: context.config.api.server.host,
      port: context.config.api.server.port,
    },
    index: {
      totalDocuments: totalDocs,
      totalTerms: context.services?.index.getStats().totalTerms ?? 0,
    },
  });
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
  const cacheKey = `q:${parsedQuery.normalizedQuery}|p:${page}|s:${pageSize}`;
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

  // Query live web search when local indexed results are insufficient
  if (page === 1 && process.env.NODE_ENV !== 'test' && finalResults.length < pageSize) {
    try {
      const liveItems = await fetchExternalWebResults(rawQuery, pageSize - finalResults.length);
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
      // Fallback gracefully to local results
    }
  }

  const responsePayload: SearchApiResponse = {
    query: {
      raw: rawQuery,
      normalized: parsedQuery.normalizedQuery,
      terms: parsedQuery.terms,
      phrases: parsedQuery.phrases.map(p => p.rawPhrase),
      negatedTerms: parsedQuery.negatedTerms,
    },
    results: finalResults,
    pagination: {
      ...searchResultSet.pagination,
      totalHits,
      totalPages: Math.max(1, Math.ceil(totalHits / pageSize)),
    },
    meta: {
      totalHits,
      candidateCount: retrievalResult.candidates.length,
      durationMs: Date.now() - startMs,
      timestamp: new Date().toISOString(),
    },
  };

  // Populate cache for subsequent identical requests
  if (queryCache) {
    queryCache.set(cacheKey, responsePayload);
  }

  res.setHeader('X-Cache', 'MISS');
  res.status(HTTP_STATUS.OK).json(responsePayload);
};
