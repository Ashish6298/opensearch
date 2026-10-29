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

// ── Phase 74: Backup, Restore & Integrity Audit (V1.5.0) ──────────────────
export {
  STORAGE_COLLECTION_FILES,
  computeFileChecksum,
  createStorageBackup,
  restoreStorageBackup,
  verifyStorageIntegrity,
} from './backup/backup-manager.js';
export type {
  BackupCollectionMeta,
  BackupManifest,
} from './backup/backup-manager.js';

// ── Phase 53: Variable-Byte & Delta Index Compression (V1.3.0) ────────────
export type {
  CompactPostingRecord,
} from './compression/vbyte-compression.js';
export {
  VByteCompressor,
  calculateCompressionRatio,
} from './compression/vbyte-compression.js';

// ── Phase 111: Storage Persistence & Hosting Compatibility (V1.5.0) ────────
export {
  auditStoragePersistence,
  isEphemeralPath,
  verifyStorageWritable,
} from './persistence-audit.js';
export type {
  DeploymentModel,
  StoragePersistenceAudit,
} from './persistence-audit.js';

