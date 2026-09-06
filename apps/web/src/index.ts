/**
 * @opensearch/web
 * Public Search Web Application Boundary (Milestone 6 / Phase 19: Search UI Foundation)
 * Consumes typed configuration and structured logger from @opensearch/shared.
 */

import {
  PROJECT_NAME,
  PROJECT_VERSION,
  ServiceBoundaryInfo,
  SystemStatus,
} from '@opensearch/shared';

export const WEB_APP_INFO: ServiceBoundaryInfo = {
  moduleName: '@opensearch/web',
  purpose:
    'Public search web interface (clean, accessible, responsive, zero-tracking, privacy-first)',
  currentPhaseScope:
    'Phase 19: Search UI Foundation — Application shell, search input, button, responsive layout, loading, empty, and error states.',
};

export { generateHtmlShell } from './html-template.js';
export type { HtmlTemplateOptions } from './html-template.js';
export { WebServer, createWebServer } from './server.js';
export type { WebServerOptions } from './server.js';

export function getWebInfo(): { title: string; version: string; phase: string } {
  return {
    title: PROJECT_NAME,
    version: PROJECT_VERSION,
    phase: 'Phase 19: Search UI Foundation',
  };
}

export function getWebStatus(): SystemStatus {
  return {
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    phase: 'Phase 19: Search UI Foundation',
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}
