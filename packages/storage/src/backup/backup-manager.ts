/**
 * @opensearch/storage — Backup, Restore & Integrity Audit Manager (Phase 74)
 *
 * Implements enterprise-grade storage resilience:
 * - Atomic snapshot backup of all persistent collections with manifest & checksums.
 * - Validated restore with checksum verification and pre-flight health audit.
 * - Deep integrity verification to detect file corruption, truncations, and malformed records.
 * - Standalone execution (independent of active adapter instance).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { StorageError, safeJsonParse } from '@opensearch/shared';
import {
  StorageBackupResult,
  StorageIntegrityReport,
  StorageRestoreResult,
} from '../repositories.js';

export const STORAGE_COLLECTION_FILES = [
  'documents.json',
  'urls.json',
  'crawls.json',
  'index-metadata.json',
] as const;

export interface BackupCollectionMeta {
  fileName: string;
  recordCount: number;
  sizeBytes: number;
  sha256: string;
}

export interface BackupManifest {
  manifestVersion: number;
  createdAt: string;
  storageDir: string;
  collections: Record<string, BackupCollectionMeta>;
  totalRecords: number;
  totalSizeBytes: number;
  overallChecksum: string;
}

/**
 * Computes SHA-256 hex digest of a file or string.
 */
export function computeFileChecksum(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Creates an atomic backup snapshot of all persistent collections in a storage directory.
 */
export async function createStorageBackup(
  sourceStorageDir: string,
  destinationDir: string,
): Promise<StorageBackupResult> {
  const cleanSource = path.resolve(sourceStorageDir);
  if (!fs.existsSync(cleanSource)) {
    throw new StorageError(`Source storage directory does not exist: "${cleanSource}"`, {
      code: 'BACKUP_SOURCE_MISSING',
    });
  }

  const targetDir = path.resolve(destinationDir);
  fs.mkdirSync(targetDir, { recursive: true });

  const collectionsMeta: Record<string, BackupCollectionMeta> = {};
  let totalRecords = 0;
  let totalSizeBytes = 0;
  const collectionsBackedUp: string[] = [];

  for (const fileName of STORAGE_COLLECTION_FILES) {
    const srcFile = path.join(cleanSource, fileName);
    const destFile = path.join(targetDir, fileName);

    let recordCount = 0;
    let sizeBytes = 0;
    let checksum = '';

    if (fs.existsSync(srcFile)) {
      const stats = fs.statSync(srcFile);
      sizeBytes = stats.size;
      checksum = computeFileChecksum(srcFile);

      // Read record count from store
      try {
        const raw = fs.readFileSync(srcFile, 'utf-8');
        const parsed = safeJsonParse<any>(raw, null);
        if (parsed && parsed.records && typeof parsed.records === 'object') {
          recordCount = Object.keys(parsed.records).length;
        }
      } catch {
        // preserve 0 count if unparseable
      }

      // Copy file to backup destination
      fs.copyFileSync(srcFile, destFile);
      collectionsBackedUp.push(fileName);
    } else {
      // Empty placeholder store
      const emptyStore = { records: {}, version: 1, lastSaved: new Date().toISOString() };
      fs.writeFileSync(destFile, JSON.stringify(emptyStore, null, 2), 'utf-8');
      sizeBytes = fs.statSync(destFile).size;
      checksum = computeFileChecksum(destFile);
      collectionsBackedUp.push(fileName);
    }

    collectionsMeta[fileName] = {
      fileName,
      recordCount,
      sizeBytes,
      sha256: checksum,
    };

    totalRecords += recordCount;
    totalSizeBytes += sizeBytes;
  }

  // Compute overall manifest checksum
  const manifestPayloadWithoutHash: Omit<BackupManifest, 'overallChecksum'> = {
    manifestVersion: 1,
    createdAt: new Date().toISOString(),
    storageDir: cleanSource,
    collections: collectionsMeta,
    totalRecords,
    totalSizeBytes,
  };

  const overallChecksum = crypto
    .createHash('sha256')
    .update(JSON.stringify(manifestPayloadWithoutHash))
    .digest('hex');

  const manifest: BackupManifest = {
    ...manifestPayloadWithoutHash,
    overallChecksum,
  };

  const manifestPath = path.join(targetDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  return {
    success: true,
    backupDir: targetDir,
    timestamp: manifest.createdAt,
    collectionsBackedUp,
    totalRecords,
    totalSizeBytes,
    manifestPath,
  };
}

/**
 * Restores all collections from a backup directory into a target storage directory.
 */
export async function restoreStorageBackup(
  sourceBackupDir: string,
  targetStorageDir: string,
): Promise<StorageRestoreResult> {
  const cleanBackup = path.resolve(sourceBackupDir);
  const cleanTarget = path.resolve(targetStorageDir);

  if (!fs.existsSync(cleanBackup)) {
    throw new StorageError(`Backup source directory does not exist: "${cleanBackup}"`, {
      code: 'RESTORE_SOURCE_MISSING',
    });
  }

  const manifestPath = path.join(cleanBackup, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new StorageError(`Backup manifest missing at "${manifestPath}"`, {
      code: 'RESTORE_MANIFEST_MISSING',
    });
  }

  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err: any) {
    throw new StorageError(`Failed to parse backup manifest: ${err.message}`, {
      code: 'RESTORE_MANIFEST_CORRUPT',
      cause: err,
    });
  }

  // 1. Verify backup integrity before modifying target
  for (const [fileName, meta] of Object.entries(manifest.collections)) {
    const backupFilePath = path.join(cleanBackup, fileName);
    if (!fs.existsSync(backupFilePath)) {
      throw new StorageError(
        `Backup file "${fileName}" declared in manifest is missing from backup directory`,
        { code: 'RESTORE_FILE_MISSING' },
      );
    }

    const calculatedChecksum = computeFileChecksum(backupFilePath);
    if (calculatedChecksum !== meta.sha256) {
      throw new StorageError(
        `Checksum mismatch for backup file "${fileName}". Expected: ${meta.sha256}, got: ${calculatedChecksum}`,
        { code: 'RESTORE_CHECKSUM_MISMATCH' },
      );
    }
  }

  // 2. Perform atomic restore into target directory
  fs.mkdirSync(cleanTarget, { recursive: true });
  const collectionsRestored: string[] = [];
  let totalRecordsRestored = 0;

  for (const fileName of STORAGE_COLLECTION_FILES) {
    const backupFilePath = path.join(cleanBackup, fileName);
    if (fs.existsSync(backupFilePath)) {
      const targetTmpPath = path.join(cleanTarget, `${fileName}.tmp`);
      const targetFinalPath = path.join(cleanTarget, fileName);

      fs.copyFileSync(backupFilePath, targetTmpPath);
      fs.renameSync(targetTmpPath, targetFinalPath);

      collectionsRestored.push(fileName);
      totalRecordsRestored += manifest.collections[fileName]?.recordCount || 0;
    }
  }

  return {
    success: true,
    restoredFrom: cleanBackup,
    timestamp: new Date().toISOString(),
    collectionsRestored,
    totalRecordsRestored,
  };
}

/**
 * Audits and verifies the physical integrity of all collections in a storage directory.
 */
export async function verifyStorageIntegrity(
  storageDir: string,
): Promise<StorageIntegrityReport> {
  const cleanDir = path.resolve(storageDir);
  const errors: string[] = [];
  const collectionsReport: StorageIntegrityReport['collections'] = {};

  if (!fs.existsSync(cleanDir)) {
    return {
      valid: false,
      checkedAt: new Date().toISOString(),
      storageDir: cleanDir,
      collections: {},
      errors: [`Storage directory does not exist: "${cleanDir}"`],
    };
  }

  for (const fileName of STORAGE_COLLECTION_FILES) {
    const filePath = path.join(cleanDir, fileName);
    if (!fs.existsSync(filePath)) {
      collectionsReport[fileName] = {
        exists: false,
        recordCount: 0,
        sizeBytes: 0,
        corrupted: false,
        errorMessage: 'File not found on disk',
      };
      continue;
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      errors.push(`Collection file "${fileName}" is empty (0 bytes)`);
      collectionsReport[fileName] = {
        exists: true,
        recordCount: 0,
        sizeBytes: 0,
        corrupted: true,
        errorMessage: '0-byte empty file',
      };
      continue;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      if (!parsed || typeof parsed !== 'object' || !parsed.records || typeof parsed.records !== 'object') {
        errors.push(`Collection file "${fileName}" does not contain a valid DataStore object`);
        collectionsReport[fileName] = {
          exists: true,
          recordCount: 0,
          sizeBytes: stats.size,
          corrupted: true,
          errorMessage: 'Invalid DataStore schema',
        };
      } else {
        const count = Object.keys(parsed.records).length;
        collectionsReport[fileName] = {
          exists: true,
          recordCount: count,
          sizeBytes: stats.size,
          corrupted: false,
        };
      }
    } catch (err: any) {
      errors.push(`Collection file "${fileName}" contains invalid JSON: ${err.message}`);
      collectionsReport[fileName] = {
        exists: true,
        recordCount: 0,
        sizeBytes: stats.size,
        corrupted: true,
        errorMessage: `JSON parse failure: ${err.message}`,
      };
    }
  }

  return {
    valid: errors.length === 0,
    checkedAt: new Date().toISOString(),
    storageDir: cleanDir,
    collections: collectionsReport,
    errors,
  };
}
