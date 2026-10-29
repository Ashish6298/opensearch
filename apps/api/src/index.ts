/**
 * @opensearch/api
 * Search API Application Boundary (Milestone 5 / Phase 18: API Security, Limits & Reliability)
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
  purpose:
    'Public HTTP Search API providing search endpoints, security limits, rate limiting, and health checks',
  currentPhaseScope:
    'Phase 18: API Security, Limits & Reliability — Rate limiting, timeouts, security headers, request size limits, safe errors.',
};

export type {
  ApiApplicationContext,
  ApiAppContext,
  ApiServerOptions,
  SearchServices,
  SearchApiResponse,
  ReadinessResponse,
  ServerLifecycleState,
} from './types.js';
export type {
  ApiRequest,
  ApiResponse,
  RouteHandler,
  MiddlewareHandler,
  HealthCheckResponse,
  HttpMethod,
} from './types.js';

export { Router, resolveClientIp } from './router.js';
export type { RouterOptions } from './router.js';
export {
  createCorsMiddleware,
  createSecurityHeadersMiddleware,
  createRateLimitMiddleware,
  createTimeoutMiddleware,
  createLoggingMiddleware,
  anonymizeIp,
} from './middlewares.js';
export {
  MemoryRateLimiter,
  createRateLimiter,
  MemoryRateLimitStore,
  FileBackedRateLimitStore,
} from './rate-limiter.js';
export type {
  RateLimiterOptions,
  RateLimitResult,
  RateLimitBucket,
  RateLimitStore,
  RouteRateLimitRule,
} from './rate-limiter.js';
export {
  handleApiDocs,
  handleApiRoot,
  handleHealthCheck,
  handleReadinessCheck,
  handleOpenApiSpec,
  handleSearch,
  handleSuggest,
  handleSystemStatus,
} from './routes.js';
export { generateOpenApiSpec } from './openapi-spec.js';
export { generateDocsHtml } from './docs-html.js';
export {
  generateOpenSearchDescriptor,
  OPENSEARCH_DESCRIPTOR_MIME_TYPE,
  DEFAULT_DESCRIPTOR_CONFIG,
  type OpenSearchDescriptorOptions,
} from './opensearch-descriptor.js';
export {
  OpenSearchMcpServer,
  runStdioMcpServer,
  handleMcpPost,
  handleMcpSse,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  JSONRPC_ERRORS,
  type McpServerOptions,
  type McpToolDefinition,
  type McpToolCallResult,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './mcp/index.js';
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
    phase: 'Phase 18: API Security, Limits & Reliability',
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}

// Auto-run if executed directly via node (e.g., in production or npm start)
if (
  process.argv[1] &&
  (process.argv[1].endsWith('api/dist/index.js') ||
    process.argv[1].endsWith('api\\dist\\index.js') ||
    process.argv[1].endsWith('api/src/index.ts') ||
    process.argv[1].endsWith('api\\src\\index.ts'))
) {
  const server = new (await import('./server.js')).ApiServer();
  server.start().catch(err => {
    console.error('Fatal API server error:', err);
    process.exit(1);
  });
}
