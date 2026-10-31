/**
 * @opensearch/storage — Storage Persistence & Hosting Compatibility Auditor (Phase 111)
 *
 * Verifies that the configured storage directory offers durable, persistent storage
 * when the application owns its index, and warns against ephemeral file systems
 * (e.g. /tmp, container scratch spaces, or unmounted serverless environments).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { SupportedDeploymentMode } from '@opensearch/shared';

export type DeploymentModel = SupportedDeploymentMode | 'standalone';

export interface StoragePersistenceAudit {
  /** Whether the storage path is evaluated as durable persistent storage */
  isDurable: boolean;
  /** Whether the storage path is located on an ephemeral temporary filesystem */
  isEphemeral: boolean;
  /** Resolved absolute path of the storage directory */
  resolvedPath: string;
  /** Active deployment model */
  deploymentModel: DeploymentModel;
  /** Active warning messages */
  warnings: string[];
  /** Actionable deployment recommendations */
  recommendations: string[];
}

/**
 * Known ephemeral directory prefixes across Linux, macOS, and Windows.
 */
function getKnownEphemeralPrefixes(): string[] {
  const prefixes = ['/tmp', '/var/tmp', '/dev/shm'];
  try {
    const tmp = os.tmpdir();
    if (tmp) {
      prefixes.push(path.resolve(tmp));
    }
  } catch {
    // Ignore fallback
  }
  return prefixes;
}

/**
 * Checks whether a given directory path is located in an ephemeral temporary filesystem.
 */
export function isEphemeralPath(storageDir: string): boolean {
  if (!storageDir) return true;
  const rawNormalized = storageDir.toLowerCase().replace(/\\/g, '/');
  const resolved = path.resolve(storageDir);
  const normalized = resolved.toLowerCase().replace(/\\/g, '/');

  // Direct Unix/POSIX ephemeral mount points (even when resolved on Windows with drive letters)
  const posixEphemeral = ['/tmp', '/var/tmp', '/dev/shm'];
  for (const p of posixEphemeral) {
    if (
      rawNormalized === p ||
      rawNormalized.startsWith(`${p}/`) ||
      normalized.includes(p)
    ) {
      return true;
    }
  }

  const ephemeralPrefixes = getKnownEphemeralPrefixes().map(p =>
    p.toLowerCase().replace(/\\/g, '/'),
  );

  for (const prefix of ephemeralPrefixes) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  // Check pattern heuristic (e.g. /temp/ or /tmp/ anywhere in path)
  if (normalized.includes('/temp/') || normalized.includes('/tmp/')) {
    return true;
  }

  return false;
}

/**
 * Verifies that the storage directory can be created and written to.
 */
export function verifyStorageWritable(storageDir: string): boolean {
  try {
    const resolved = path.resolve(storageDir);
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
    const probeFile = path.join(resolved, `.persistence-probe-${Date.now()}`);
    fs.writeFileSync(probeFile, 'opensearch-durability-probe', 'utf8');
    const readBack = fs.readFileSync(probeFile, 'utf8');
    fs.unlinkSync(probeFile);
    return readBack === 'opensearch-durability-probe';
  } catch {
    return false;
  }
}

/**
 * Audits the storage configuration against hosting and deployment model requirements.
 */
export function auditStoragePersistence(
  storageDir: string,
  deploymentModel: DeploymentModel = 'standalone',
  isProduction: boolean = false,
): StoragePersistenceAudit {
  const resolvedPath = path.resolve(storageDir || './data/storage');
  const isEphemeral = isEphemeralPath(resolvedPath);
  const isDurable = !isEphemeral;
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (isEphemeral) {
    const msg = `Storage directory "${resolvedPath}" is located in an ephemeral temporary filesystem.`;
    warnings.push(msg);

    if (isProduction) {
      warnings.push(
        'CRITICAL: Running in production with ephemeral storage will cause total data and index loss upon process restart or container redeployment.',
      );
    }

    recommendations.push(
      'Configure STORAGE_DIR to a durable persistent volume mount (e.g. Docker -v /host/path:/app/data or persistent cloud volume).',
    );
  }

  if (deploymentModel === 'serverless') {
    warnings.push(
      'Serverless hosting environments (e.g. AWS Lambda, Google Cloud Run) have ephemeral local filesystems.',
    );
    recommendations.push(
      'Deploy OpenSearch on a persistent container or VPS (e.g. Docker, systemd) where the application owns and persists its index locally without paid cloud database dependencies.',
    );
  } else if (deploymentModel === 'cluster') {
    recommendations.push(
      'For multi-instance clusters, ensure each instance has access to a shared persistent volume or run instances as dedicated read-replicas pointing to a synchronized durable index.',
    );
  }

  if (isDurable) {
    recommendations.push(
      'Storage is located on a durable filesystem path. Regular snapshots/backups are recommended via createStorageBackup().',
    );
  }

  return {
    isDurable,
    isEphemeral,
    resolvedPath,
    deploymentModel,
    warnings,
    recommendations,
  };
}
