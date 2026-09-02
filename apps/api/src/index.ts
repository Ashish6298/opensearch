/**
 * @opensearch/api
 * Search API Application Boundary (Phase 1 & Phase 2)
 * Consumes typed configuration and structured logger from @opensearch/shared.
 */

import {
  AppConfig,
  createLogger,
  loadConfig,
  Logger,
  PROJECT_NAME,
  PROJECT_VERSION,
  ServiceBoundaryInfo,
  SystemStatus,
} from '@opensearch/shared';

export const API_SERVICE_INFO: ServiceBoundaryInfo = {
  moduleName: '@opensearch/api',
  purpose: 'Public HTTP Search API providing search endpoints, validation, and health checks',
  currentPhaseScope: 'Phase 2: Configuration & shared infrastructure integration.',
};

export interface ApiApplicationContext {
  config: AppConfig;
  logger: Logger;
}

export function createApiContext(
  overrides?: Record<string, string | undefined>,
): ApiApplicationContext {
  const config = loadConfig(overrides);
  const logger = createLogger('@opensearch/api', {
    level: config.logging.level,
    format: config.logging.format,
  });

  return { config, logger };
}

export function getApiStatus(): SystemStatus {
  return {
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    phase: 'Phase 2: Configuration & Shared Infrastructure',
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}
