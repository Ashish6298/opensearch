/**
 * @opensearch/storage — Schema Migration & Upgrade Runner (Phase 120)
 *
 * Implements safe, resilient storage schema migrations:
 * 1. Automatic atomic pre-migration backup before destructive operations.
 * 2. Pre-flight and post-migration validation checks.
 * 3. Automatic rollback to pre-migration snapshot if an upgrade fails.
 * 4. Explicit version tracking in schema-version.json.
 * 5. Guarantees failed upgrades do not silently destroy existing search indexes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { StorageError, safeJsonParse } from '@opensearch/shared';
import {
  createStorageBackup,
  restoreStorageBackup,
  verifyStorageIntegrity,
} from '../backup/backup-manager.js';
import {
  MigrationOptions,
  MigrationResult,
  RollbackOptions,
  SchemaMigrationState,
  StorageMigrationRecord,
} from './types.js';

export const SCHEMA_VERSION_FILENAME = 'schema-version.json';
export const CURRENT_STORAGE_SCHEMA_VERSION = 1;

/**
 * Loads the current schema migration state from the storage directory.
 */
export function loadSchemaMigrationState(storageDir: string): SchemaMigrationState {
  const versionFile = path.join(storageDir, SCHEMA_VERSION_FILENAME);
  const defaultState: SchemaMigrationState = {
    schemaVersion: CURRENT_STORAGE_SCHEMA_VERSION,
    appliedMigrations: [],
    updatedAt: new Date().toISOString(),
  };

  if (!fs.existsSync(versionFile)) {
    return defaultState;
  }

  try {
    const raw = fs.readFileSync(versionFile, 'utf8');
    const parsed = safeJsonParse<SchemaMigrationState>(raw, defaultState);
    if (!parsed || typeof parsed.schemaVersion !== 'number') {
      return defaultState;
    }
    return parsed;
  } catch {
    return defaultState;
  }
}

/**
 * Saves updated schema migration state atomically.
 */
export function saveSchemaMigrationState(
  storageDir: string,
  state: SchemaMigrationState,
): void {
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  const versionFile = path.join(storageDir, SCHEMA_VERSION_FILENAME);
  const tmpFile = `${versionFile}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpFile, versionFile);
}

/**
 * Executes pending migrations with automated pre-migration backup and failure rollback.
 */
export async function runSchemaMigrations(
  options: MigrationOptions,
): Promise<MigrationResult> {
  const { storageDir, migrations, autoBackup = true } = options;
  const targetVersion = options.targetVersion ?? Math.max(...migrations.map(m => m.version), 1);

  // 1. Load active migration state
  const currentState = loadSchemaMigrationState(storageDir);
  const previousVersion = currentState.schemaVersion;

  // 2. Identify pending migrations sorted ascending
  const pending = migrations
    .filter(m => m.version > previousVersion && m.version <= targetVersion)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) {
    return {
      success: true,
      previousVersion,
      currentVersion: previousVersion,
      appliedCount: 0,
      rolledBack: false,
    };
  }

  // 3. Pre-flight integrity verification of existing storage
  if (fs.existsSync(storageDir)) {
    const preIntegrity = await verifyStorageIntegrity(storageDir);
    if (!preIntegrity.valid) {
      throw new StorageError(
        `Pre-migration integrity check failed: Storage directory contains corrupted files: ${preIntegrity.errors.join(', ')}. Aborting migration to protect data.`,
      );
    }
  }

  // 4. Pre-migration automated backup snapshot
  let backupSnapshotPath: string | undefined;
  if (autoBackup && fs.existsSync(storageDir)) {
    const backupDir = path.join(
      storageDir,
      'backups',
      `pre-migration-v${targetVersion}-${Date.now()}`,
    );
    try {
      const backupResult = await createStorageBackup(storageDir, backupDir);
      backupSnapshotPath = backupResult.backupDir;
    } catch (err) {
      throw new StorageError(
        `Automated pre-migration backup failed: ${err instanceof Error ? err.message : String(err)}. Migration aborted before modifying state.`,
      );
    }
  }

  // 5. Apply migrations sequentially within safe recovery boundary
  const appliedRecords: StorageMigrationRecord[] = [];
  let currentVersion = previousVersion;

  for (const migration of pending) {
    try {
      // Execute forward migration logic
      await migration.up(storageDir);

      // Execute post-migration validation if defined
      if (migration.validate) {
        const isValid = await migration.validate(storageDir);
        if (!isValid) {
          throw new Error(
            `Migration post-validation returned false for version ${migration.version} (${migration.description}).`,
          );
        }
      }

      currentVersion = migration.version;
      appliedRecords.push({
        version: migration.version,
        description: migration.description,
        appliedAt: new Date().toISOString(),
        backupSnapshotPath: backupSnapshotPath ?? '',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Automated rollback if backup snapshot exists
      if (backupSnapshotPath && fs.existsSync(backupSnapshotPath)) {
        try {
          await restoreStorageBackup(backupSnapshotPath, storageDir);
          return {
            success: false,
            previousVersion,
            currentVersion: previousVersion,
            appliedCount: appliedRecords.length,
            backupSnapshotPath,
            rolledBack: true,
            error: `Migration to version ${migration.version} failed: ${errorMessage}. Storage successfully rolled back to pre-migration snapshot.`,
          };
        } catch (rollbackErr) {
          throw new StorageError(
            `CRITICAL: Migration to version ${migration.version} failed (${errorMessage}), and automated rollback also failed: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`,
          );
        }
      }

      return {
        success: false,
        previousVersion,
        currentVersion,
        appliedCount: appliedRecords.length,
        rolledBack: false,
        error: `Migration failed without backup snapshot: ${errorMessage}`,
      };
    }
  }

  // 6. Update schema state
  const updatedState: SchemaMigrationState = {
    schemaVersion: currentVersion,
    appliedMigrations: [...currentState.appliedMigrations, ...appliedRecords],
    lastBackupSnapshot: backupSnapshotPath,
    updatedAt: new Date().toISOString(),
  };
  saveSchemaMigrationState(storageDir, updatedState);

  return {
    success: true,
    previousVersion,
    currentVersion,
    appliedCount: appliedRecords.length,
    backupSnapshotPath,
    rolledBack: false,
  };
}

/**
 * Rolls back storage to a previous schema version using a pre-migration snapshot.
 */
export async function rollbackSchemaMigration(
  options: RollbackOptions,
): Promise<MigrationResult> {
  const { storageDir, targetVersion } = options;
  const currentState = loadSchemaMigrationState(storageDir);
  const previousVersion = currentState.schemaVersion;

  if (targetVersion >= previousVersion) {
    throw new StorageError(
      `Cannot rollback to target version ${targetVersion}: Current schema version is ${previousVersion}. Target must be strictly lower.`,
    );
  }

  // Find candidate backup snapshot
  let snapshotPath = options.backupSnapshotPath;
  if (!snapshotPath) {
    // Look through applied migration records in reverse
    const matching = currentState.appliedMigrations
      .filter(m => m.version > targetVersion && m.backupSnapshotPath)
      .reverse();

    if (matching.length > 0 && matching[0] && fs.existsSync(matching[0].backupSnapshotPath)) {
      snapshotPath = matching[0].backupSnapshotPath;
    }
  }

  if (!snapshotPath || !fs.existsSync(snapshotPath)) {
    throw new StorageError(
      `Rollback failed: No valid pre-migration snapshot found for target version ${targetVersion}.`,
    );
  }

  // Restore snapshot to target directory
  try {
    await restoreStorageBackup(snapshotPath, storageDir);
  } catch (err) {
    throw new StorageError(
      `Rollback restore operation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Update schema state to target version
  const updatedState: SchemaMigrationState = {
    schemaVersion: targetVersion,
    appliedMigrations: currentState.appliedMigrations.filter(
      m => m.version <= targetVersion,
    ),
    lastBackupSnapshot: snapshotPath,
    updatedAt: new Date().toISOString(),
  };
  saveSchemaMigrationState(storageDir, updatedState);

  return {
    success: true,
    previousVersion,
    currentVersion: targetVersion,
    appliedCount: 0,
    backupSnapshotPath: snapshotPath,
    rolledBack: true,
  };
}
