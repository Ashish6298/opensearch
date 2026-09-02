/**
 * Shared Type Definitions for OpenSearch V1.0.0
 */

export interface SystemStatus {
  name: string;
  version: string;
  phase: string;
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
}

export interface ServiceBoundaryInfo {
  moduleName: string;
  purpose: string;
  currentPhaseScope: string;
}
