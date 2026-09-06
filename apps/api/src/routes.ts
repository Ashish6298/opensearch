/**
 * @opensearch/api — Standard HTTP API Routes (Phase 16)
 *
 * Implements core API endpoints:
 * - GET /health: Detailed service status, uptime, memory metrics, and routing availability
 * - GET /: API index information and discovery links
 * - GET /api/v1/status: System status endpoint
 */

import { PROJECT_NAME, PROJECT_VERSION } from '@opensearch/shared';
import { HealthCheckResponse, RouteHandler } from './types.js';

export const handleHealthCheck: RouteHandler = (_req, res, context) => {
  const uptimeSeconds = Math.floor((Date.now() - context.startTime) / 1000);
  const mem = process.memoryUsage();
  const memoryUsageMb = Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100;

  const response: HealthCheckResponse = {
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    phase: 'Phase 16: Search API Foundation',
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    memoryUsageMb,
    environment: context.config.env,
    routesAvailable: ['GET /', 'GET /health', 'GET /api/v1/status'],
  };

  res.status(200).json(response);
};

export const handleApiRoot: RouteHandler = (_req, res, context) => {
  res.status(200).json({
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    description: 'OpenSearch Public HTTP Search API',
    documentation: '/docs',
    healthEndpoint: '/health',
    statusEndpoint: '/api/v1/status',
    timestamp: new Date().toISOString(),
    environment: context.config.env,
  });
};

export const handleSystemStatus: RouteHandler = (_req, res, context) => {
  res.status(200).json({
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    phase: 'Milestone 5 — Search API',
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: {
      host: context.config.api.server.host,
      port: context.config.api.server.port,
    },
  });
};
