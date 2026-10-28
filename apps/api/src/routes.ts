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
  ValidationError,
  createPrivacyReceipt,
  ContactedProviderRecord,
  SkippedProviderRecord,
  getProviderMetadataDefaults,
  ProviderExecutionStatus,
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
} from '@opensearch/ranking';
import { generateOpenApiSpec } from './openapi-spec.js';
import { generateDocsHtml } from './docs-html.js';

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
      'GET /api/v1/status',
      'GET /api/v1/search',
      'POST /api/v1/search',
      'GET /api/v1/suggest',
      'GET /api/v1/lenses',
      'GET /api/v1/lenses/:id',
      'POST /api/v1/lenses/validate',
      'POST /api/v1/lenses/preview',
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
    openapi: '/api/v1/openapi.json',
    endpoints: {
      health: '/health',
      status: '/api/v1/status',
      search: '/api/v1/search',
      suggest: '/api/v1/suggest',
      openapi: '/api/v1/openapi.json',
      docs: '/docs',
    },
    timestamp: new Date().toISOString(),
    environment: context.config.env,
  });
};

export const handleOpenApiSpec: RouteHandler = (_req, res, _context) => {
  const spec = generateOpenApiSpec();
  res.status(200).json(spec);
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

  const rawLens = (req.query['lens'] as string) ?? (typeof (req.body as Record<string, unknown>)?.['lens'] === 'string' ? (req.body as Record<string, unknown>)['lens'] as string : undefined);
  const activeLens = rawLens ? getDefaultLensRegistry().resolveLens(rawLens) : undefined;

  const explainParam = req.query['explain'];
  const explain = explainParam === 'true' || explainParam === '1';

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

  const isLocalOnly = req.query['localOnly'] === 'true' || req.query['mode'] === 'local';

  // Query live web search when local indexed results are insufficient (unless in local-only mode)
  // In Local-Only mode: query planner strictly suppresses external search providers
  const providerRegistry = context.services.providerRegistry ?? context.providerRegistry;
  const canFetchExternal = !isLocalOnly && (process.env.NODE_ENV !== 'test' || Boolean(providerRegistry));

  // Phase 84 — Privacy Receipt Telemetry Collection:
  const contactedProviders: ContactedProviderRecord[] = [];
  const skippedProviders: SkippedProviderRecord[] = [];
  let isPartialResult = false;
  let searchDeadlineExceeded = false;

  const activeRegistry = providerRegistry ?? getSharedProviderRegistry();

  if (isLocalOnly) {
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
      const liveExecution = await fetchExternalWebWithTelemetry(
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
  const safeFilterResult = filterSafeSearchResults(finalResults, safeSearchLevel);
  finalResults = safeFilterResult.filtered;
  totalHits = Math.max(0, totalHits - safeFilterResult.excludedCount);
  const safeSearchDisclosure = getSafeSearchDisclosure(safeSearchLevel);

  // 7. Instant Answers & Bang Shortcuts Evaluation (Phase 38)
  const instantAnswerEngine = context.services.instantAnswerEngine;
  const instantAnswer = instantAnswerEngine ? instantAnswerEngine.evaluate(rawQuery) : null;
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

  // Phase 84 — Generate Verifiable Privacy Receipt from Real Execution Telemetry
  const clientIp = (req.ip as string) || (req.raw?.socket?.remoteAddress as string) || '127.0.0.1';
  const hasThumbnails = finalResults.some(r => Boolean(r.thumbnailUrl));
  const rawIpString = typeof clientIp === 'string' ? clientIp : '127.0.0.1';
  const firstIp = rawIpString.split(',')[0]?.trim() || '127.0.0.1';

  const privacyReceipt = createPrivacyReceipt({
    mode: isLocalOnly ? 'local-only' : 'standard',
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

  // 1. Instant Answer evaluation & streaming (first event)
  if (instantAnswerEngine) {
    const instantAnswer = instantAnswerEngine.evaluate(rawQuery);
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
