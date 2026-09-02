/**
 * @opensearch/storage
 * Phase 3: Storage Foundation — Complete Implementation
 */

// Domain Models
export * from './models.js';

// Repository Abstractions (interfaces)
export * from './repositories.js';

// Validation
export { STORAGE_LIMITS } from './validation.js';

// Concrete Adapters
export { JsonStorageAdapter } from './adapters/json-adapter.js';
export type { JsonStorageAdapterOptions } from './adapters/json-adapter.js';

// Factory (preferred usage for application code)
export { createStorageAdapter } from './factory.js';
export type { StorageFactoryOptions } from './factory.js';
