/**
 * @opensearch/web
 * Web Application Frontend Boundary (Phase 1)
 * Search UI, result rendering, and accessibility features
 * are scheduled for Milestone 6 (Phases 19-21).
 */

import { PROJECT_NAME, PROJECT_VERSION, ServiceBoundaryInfo } from '@opensearch/shared';

export const WEB_APP_INFO: ServiceBoundaryInfo = {
  moduleName: '@opensearch/web',
  purpose: 'Public search web interface (clean, accessible, responsive)',
  currentPhaseScope: 'Phase 1: Boundary initialization only. Implementation starts in Milestone 6.',
};

export function getWebInfo(): { title: string; version: string } {
  return {
    title: PROJECT_NAME,
    version: PROJECT_VERSION,
  };
}
