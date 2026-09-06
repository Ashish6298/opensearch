/**
 * @opensearch/api
 * Search API Application Boundary (Milestone 5 / Phase 16 & 17: Search Endpoint)
 * Consumes typed configuration and structured logger from @opensearch/shared.
 */

import {
  createLogger,
  loadConfig,
  PROJECT_NAME,
  PROJECT_VERSION,
  ServiceBoundaryInfo,
  SystemStatus,
} from '@opensearch/shared';
import { ApiAppContext } from './types.js';

export const API_SERVICE_INFO: ServiceBoundaryInfo = {
  moduleName: '@opensearch/api',
  purpose: 'Public HTTP Search API providing search endpoints, validation, and health checks',
  currentPhaseScope:
    'Phase 17: Search Endpoint — Query parsing, candidate retrieval, BM25 ranking, snippets, pagination.',
};

export type {
  ApiApplicationContext,
  ApiAppContext,
  ApiServerOptions,
  SearchServices,
  SearchApiResponse,
} from './types.js';
export type {
  ApiRequest,
  ApiResponse,
  RouteHandler,
  MiddlewareHandler,
  HealthCheckResponse,
  HttpMethod,
} from './types.js';

export { Router } from './router.js';
export {
  createCorsMiddleware,
  createSecurityHeadersMiddleware,
  createLoggingMiddleware,
} from './middlewares.js';
export { handleApiRoot, handleHealthCheck, handleSystemStatus, handleSearch } from './routes.js';
export { ApiServer, createApiServer } from './server.js';

export function createApiContext(overrides?: Record<string, string | undefined>): ApiAppContext {
  const config = loadConfig(overrides);
  const logger = createLogger('@opensearch/api', {
    level: config.logging.level,
    format: config.logging.format,
  });

  return { config, logger, startTime: Date.now() };
}

export function getApiStatus(): SystemStatus {
  return {
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    phase: 'Phase 17: Search Endpoint',
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}
