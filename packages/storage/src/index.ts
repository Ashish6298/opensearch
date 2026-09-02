/**
 * @opensearch/storage
 * Storage Boundary Scaffolding (Phase 1)
 * Actual document/URL persistence implementation is scheduled for Phase 3.
 */

import { ServiceBoundaryInfo } from '@opensearch/shared';

export const STORAGE_MODULE_INFO: ServiceBoundaryInfo = {
  moduleName: '@opensearch/storage',
  purpose: 'Persistent storage for crawled documents and search metadata',
  currentPhaseScope: 'Phase 1: Boundary initialization only. Implementation starts in Phase 3.',
};

export function getStorageModuleInfo(): ServiceBoundaryInfo {
  return STORAGE_MODULE_INFO;
}
