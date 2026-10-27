/**
 * @opensearch/indexer — Segment Manifest Controller (Phase 97)
 *
 * Coordinates atomic publication, checksum verification, and crash recovery
 * for index segment manifests.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  CURRENT_MANIFEST_SCHEMA_VERSION,
  MANIFEST_FILE_NAME,
  MANIFEST_TMP_FILE_NAME,
  SegmentManifest,
  SegmentMetadata,
} from './segment-types.js';

/**
 * Computes deterministic SHA-256 checksum for a manifest.
 */
export function computeManifestChecksum(
  generation: number,
  activeSegments: SegmentMetadata[],
  updatedAt: string,
): string {
  const content = `${generation}|${updatedAt}|${activeSegments.map(s => `${s.segmentId}:${s.checksum}`).join(';')}`;
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Loads the active segment manifest from the index directory.
 * Returns null if no manifest exists (fresh index).
 */
export function loadSegmentManifest(indexDir: string): SegmentManifest | null {
  const manifestPath = path.join(indexDir, MANIFEST_FILE_NAME);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw) as SegmentManifest;

    if (manifest.schemaVersion !== CURRENT_MANIFEST_SCHEMA_VERSION) {
      throw new Error(`Incompatible manifest schema version ${manifest.schemaVersion}`);
    }

    const expectedChecksum = computeManifestChecksum(
      manifest.generation,
      manifest.activeSegments,
      manifest.updatedAt,
    );

    if (manifest.checksum !== expectedChecksum) {
      throw new Error(`Manifest checksum mismatch (expected: ${expectedChecksum}, got: ${manifest.checksum})`);
    }

    return manifest;
  } catch (err: any) {
    throw new Error(`Failed to load valid manifest from "${manifestPath}": ${err.message}`);
  }
}

/**
 * Atomically writes a new segment manifest generation.
 * Writes to manifest.json.tmp first, flushes, and atomically renames.
 */
export function saveSegmentManifestAtomic(
  indexDir: string,
  manifest: Omit<SegmentManifest, 'checksum'>,
): SegmentManifest {
  fs.mkdirSync(indexDir, { recursive: true });

  const checksum = computeManifestChecksum(
    manifest.generation,
    manifest.activeSegments,
    manifest.updatedAt,
  );

  const completeManifest: SegmentManifest = {
    ...manifest,
    checksum,
  };

  const tmpPath = path.join(indexDir, MANIFEST_TMP_FILE_NAME);
  const finalPath = path.join(indexDir, MANIFEST_FILE_NAME);

  const serialized = JSON.stringify(completeManifest, null, 2);
  fs.writeFileSync(tmpPath, serialized, 'utf-8');
  fs.renameSync(tmpPath, finalPath);

  return completeManifest;
}
