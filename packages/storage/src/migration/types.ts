/**
 * @opensearch/storage — Schema Migration & Upgrade Contracts (Phase 120)
 *
 * Defines models, migration interfaces, state tracking, and rollback records
 * for safe, repeatable schema version upgrades.
 */

export interface StorageMigrationRecord {
  version: number;
  description: string;
  appliedAt: string;
  backupSnapshotPath: string;
}

export interface SchemaMigrationState {
  schemaVersion: number;
  appliedMigrations: StorageMigrationRecord[];
  lastBackupSnapshot?: string;
  updatedAt: string;
}

export interface StorageMigration {
  /** Target schema version */
  version: number;
  /** Human-readable description of changes */
  description: string;
  /** Forward migration logic */
  up: (storageDir: string) => Promise<void> | void;
  /** Optional rollback logic */
  down?: (storageDir: string) => Promise<void> | void;
  /** Optional post-migration validation logic */
  validate?: (storageDir: string) => Promise<boolean> | boolean;
}

export interface MigrationOptions {
  storageDir: string;
  targetVersion?: number;
  migrations: StorageMigration[];
  /** Whether to automatically create atomic backup snapshot before migrating (default: true) */
  autoBackup?: boolean;
}

export interface MigrationResult {
  success: boolean;
  previousVersion: number;
  currentVersion: number;
  appliedCount: number;
  backupSnapshotPath?: string;
  rolledBack: boolean;
  error?: string;
}

export interface RollbackOptions {
  storageDir: string;
  targetVersion: number;
  backupSnapshotPath?: string;
}
