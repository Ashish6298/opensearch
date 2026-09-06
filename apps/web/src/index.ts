/**
 * @opensearch/web
 * Public Search Web Application Boundary (Milestone 6 / Phase 20: Search Results UI)
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
    'Phase 20: Search Results UI — Result cards, titles, URLs/domains, snippets, highlighting, pagination, external links.',
};

export { generateHtmlShell } from './html-template.js';
export type { HtmlTemplateOptions } from './html-template.js';
export {
  renderResultCard,
  renderResultsSummary,
  renderPaginationControls,
  escapeHtml,
  sanitizeHighlightedHtml,
} from './result-formatter.js';
export type { FormattedResultItem, PaginationData } from './result-formatter.js';
export { WebServer, createWebServer } from './server.js';
export type { WebServerOptions } from './server.js';

export function getWebInfo(): { title: string; version: string; phase: string } {
  return {
    title: PROJECT_NAME,
    version: PROJECT_VERSION,
    phase: 'Phase 20: Search Results UI',
  };
}

export function getWebStatus(): SystemStatus {
  return {
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    phase: 'Phase 20: Search Results UI',
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}
