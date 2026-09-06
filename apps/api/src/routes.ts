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

export const handleHealthCheck: RouteHandler = (_req, res, context) => {
  const uptimeSeconds = Math.floor((Date.now() - context.startTime) / 1000);
  const mem = process.memoryUsage();
  const memoryUsageMb = Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100;
  const totalDocumentsIndexed = context.services?.index.getStats().totalDocuments ?? 0;

  const response: HealthCheckResponse = {
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    phase: 'Phase 18: API Security, Limits & Reliability',
    status: 'ok',
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
  };

  res.status(200).json(response);
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
  res.status(200).json({
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    phase: 'Milestone 5 — Search API (Phase 18: Security & Reliability)',
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: {
      host: context.config.api.server.host,
      port: context.config.api.server.port,
    },
    index: {
      totalDocuments: context.services?.index.getStats().totalDocuments ?? 0,
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

  const responsePayload: SearchApiResponse = {
    query: {
      raw: rawQuery,
      normalized: parsedQuery.normalizedQuery,
      terms: parsedQuery.terms,
      phrases: parsedQuery.phrases.map(p => p.rawPhrase),
      negatedTerms: parsedQuery.negatedTerms,
    },
    results: searchResultSet.items,
    pagination: searchResultSet.pagination,
    meta: {
      totalHits: searchResultSet.pagination.totalHits,
      candidateCount: retrievalResult.candidates.length,
      durationMs: Date.now() - startMs,
      timestamp: new Date().toISOString(),
    },
  };

  res.status(HTTP_STATUS.OK).json(responsePayload);
};
