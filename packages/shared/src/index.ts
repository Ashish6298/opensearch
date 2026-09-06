/**
 * @opensearch/shared
 * Central entry point for common constants, types, utilities, config, logger, and errors.
 */

export * from './constants.js';
export * from './types.js';
export * from './errors/index.js';
export * from './utils/index.js';
export * from './logger/index.js';
export * from './config/index.js';
export * from './privacy/index.js';

export function getProjectIdentity(): { name: string; version: string } {
  return {
    name: 'OpenSearch',
    version: '1.0.0',
  };
}
