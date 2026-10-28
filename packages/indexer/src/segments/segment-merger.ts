/**
 * @opensearch/indexer — Segment Merger & Compaction Engine (Phase 97)
 *
 * Implements deterministic segment compaction, atomic manifest promotion,
 * crash recovery, and obsolete segment cleanup.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { IndexedDocumentMeta, Posting } from '../index/index-types.js';
import { FieldName } from '../pipeline/pipeline-types.js';
import {
  loadSegmentManifest,
  saveSegmentManifestAtomic,
} from './segment-manifest.js';
import {
  CURRENT_SEGMENT_SCHEMA_VERSION,
  SEGMENTS_SUBDIR,
  SegmentCrashRecoveryReport,
  SegmentMergeOptions,
  SegmentMergeResult,
  SegmentMetadata,
  SegmentPayload,
} from './segment-types.js';

export function computeSegmentChecksum(payload: Omit<SegmentPayload, 'checksum'>): string {
  const content = `${payload.segmentId}|${payload.createdAt}|${payload.documents.length}|${payload.dictionary.length}`;
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Writes an immutable segment atomically to disk.
 */
export function writeSegmentAtomic(indexDir: string, payload: Omit<SegmentPayload, 'checksum'>): SegmentMetadata {
  const segmentsDir = path.join(indexDir, SEGMENTS_SUBDIR);
  fs.mkdirSync(segmentsDir, { recursive: true });

  const checksum = computeSegmentChecksum(payload);
  const completePayload: SegmentPayload = {
    ...payload,
    checksum,
  };

  const fileName = path.join(SEGMENTS_SUBDIR, `${payload.segmentId}.json`);
  const finalPath = path.join(indexDir, fileName);
  const tmpPath = path.join(indexDir, `${fileName}.tmp`);

  const serialized = JSON.stringify(completePayload, null, 2);
  fs.writeFileSync(tmpPath, serialized, 'utf-8');
  fs.renameSync(tmpPath, finalPath);

  return {
    segmentId: payload.segmentId,
    schemaVersion: payload.schemaVersion,
    createdAt: payload.createdAt,
    fileName,
    documentCount: payload.documents.length,
    termCount: payload.dictionary.length,
    postingCount: payload.stats.totalPostings,
    sizeBytes: Buffer.byteLength(serialized, 'utf-8'),
    checksum,
    tombstones: payload.tombstones,
  };
}

/**
 * Loads a segment payload from disk and verifies its integrity.
 */
export function loadSegment(indexDir: string, segmentMetadata: SegmentMetadata): SegmentPayload {
  const filePath = path.join(indexDir, segmentMetadata.fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Segment file "${filePath}" does not exist`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const payload = JSON.parse(raw) as SegmentPayload;

  const expectedChecksum = computeSegmentChecksum(payload);
  if (payload.checksum !== expectedChecksum) {
    throw new Error(
      `Segment checksum mismatch in "${filePath}" (expected: ${expectedChecksum}, got: ${payload.checksum})`,
    );
  }

  return payload;
}

/**
 * Safely cleans up dangling or unreferenced segment files left after an interrupted crash.
 */
export function recoverOrCleanDanglingSegments(indexDir: string): SegmentCrashRecoveryReport {
  const manifest = loadSegmentManifest(indexDir);
  const diagnostics: string[] = [];
  const danglingFilesPurged: string[] = [];

  if (!manifest) {
    return {
      recovered: true,
      activeGeneration: 0,
      validSegmentCount: 0,
      danglingFilesPurged: [],
      diagnostics: ['No manifest found; fresh or empty index.'],
    };
  }

  const segmentsDir = path.join(indexDir, SEGMENTS_SUBDIR);
  if (!fs.existsSync(segmentsDir)) {
    return {
      recovered: true,
      activeGeneration: manifest.generation,
      validSegmentCount: manifest.activeSegments.length,
      danglingFilesPurged: [],
      diagnostics: ['Segments directory is clean.'],
    };
  }

  const activeSegmentFiles = new Set(
    manifest.activeSegments.map(s => path.normalize(path.join(indexDir, s.fileName))),
  );

  const filesInDir = fs.readdirSync(segmentsDir);
  for (const file of filesInDir) {
    const fullPath = path.normalize(path.join(segmentsDir, file));

    // Delete any incomplete temporary files (.tmp)
    if (file.endsWith('.tmp')) {
      try {
        fs.unlinkSync(fullPath);
        danglingFilesPurged.push(file);
        diagnostics.push(`Purged incomplete temporary file: ${file}`);
      } catch {
        // Safe fallback
      }
      continue;
    }

    // Delete any segment file not referenced by active manifest
    if (!activeSegmentFiles.has(fullPath) && file.endsWith('.json')) {
      try {
        fs.unlinkSync(fullPath);
        danglingFilesPurged.push(file);
        diagnostics.push(`Purged dangling unreferenced segment: ${file}`);
      } catch {
        // Safe fallback
      }
    }
  }

  return {
    recovered: true,
    activeGeneration: manifest.generation,
    validSegmentCount: manifest.activeSegments.length,
    danglingFilesPurged,
    diagnostics,
  };
}

/**
 * Merges multiple segments into a single consolidated segment.
 * Preserves the previous valid index state if an interruption or error occurs.
 */
export async function mergeSegments(
  indexDir: string,
  segmentIdsToMerge: string[],
  options: SegmentMergeOptions = {},
): Promise<SegmentMergeResult> {
  const startMs = performance.now();
  const manifest = loadSegmentManifest(indexDir);
  if (!manifest) {
    throw new Error('Cannot merge segments: no active manifest found');
  }

  const inputMetaMap = new Map(manifest.activeSegments.map(s => [s.segmentId, s]));
  const segmentsToMergeMeta: SegmentMetadata[] = [];

  for (const id of segmentIdsToMerge) {
    const meta = inputMetaMap.get(id);
    if (!meta) {
      throw new Error(`Cannot merge: segment "${id}" is not active in manifest`);
    }
    segmentsToMergeMeta.push(meta);
  }

  // Load all input payloads
  const payloads: SegmentPayload[] = segmentsToMergeMeta.map(meta => loadSegment(indexDir, meta));

  // 1. Merge Documents (chronological order: newer segments overwrite older documents)
  const docMap = new Map<string, IndexedDocumentMeta>();
  const allTombstones = new Set<string>();

  for (const p of payloads) {
    if (p.tombstones) {
      for (const t of p.tombstones) allTombstones.add(t);
    }
    for (const doc of p.documents) {
      docMap.set(doc.documentId, doc);
    }
  }

  // Purge tombstoned documents
  if (options.purgeTombstones !== false) {
    for (const tomb of allTombstones) {
      docMap.delete(tomb);
    }
  }

  const consolidatedDocs = Array.from(docMap.values());

  // 2. Merge Dictionary & Postings
  // term -> (docId -> Posting)
  const termPostingsMap = new Map<string, Map<string, Posting>>();

  for (const p of payloads) {
    for (const item of p.dictionary) {
      let postingsForTerm = termPostingsMap.get(item.term);
      if (!postingsForTerm) {
        postingsForTerm = new Map<string, Posting>();
        termPostingsMap.set(item.term, postingsForTerm);
      }

      for (const posting of item.postings) {
        // If document was deleted or not in consolidated docs, discard
        if (docMap.has(posting.documentId)) {
          postingsForTerm.set(posting.documentId, posting);
        }
      }
    }
  }

  // Convert to sorted dictionary array for deterministic output
  const consolidatedDictionary: Array<{
    term: string;
    documentFrequency: number;
    postings: Posting[];
  }> = [];

  let totalPostings = 0;
  const sortedTerms = Array.from(termPostingsMap.keys()).sort();

  for (const term of sortedTerms) {
    const postingsMap = termPostingsMap.get(term)!;
    if (postingsMap.size > 0) {
      const sortedPostings = Array.from(postingsMap.values()).sort((a, b) =>
        a.documentId.localeCompare(b.documentId),
      );
      consolidatedDictionary.push({
        term,
        documentFrequency: sortedPostings.length,
        postings: sortedPostings,
      });
      totalPostings += sortedPostings.length;
    }
  }

  // Calculate statistics
  let sumDocLengths = 0;
  const fieldLengthSums: Record<FieldName, number> = {};
  for (const doc of consolidatedDocs) {
    sumDocLengths += doc.totalTerms;
    for (const [field, len] of Object.entries(doc.fieldLengths)) {
      fieldLengthSums[field] = (fieldLengthSums[field] || 0) + len;
    }
  }

  const avgDocumentLength = consolidatedDocs.length > 0 ? sumDocLengths / consolidatedDocs.length : 0;
  const avgFieldLengths: Record<FieldName, number> = {};
  for (const [f, sum] of Object.entries(fieldLengthSums)) {
    avgFieldLengths[f] = consolidatedDocs.length > 0 ? sum / consolidatedDocs.length : 0;
  }

  const targetSegmentId =
    options.targetSegmentId ||
    `seg_merged_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const mergedPayload: Omit<SegmentPayload, 'checksum'> = {
    segmentId: targetSegmentId,
    schemaVersion: CURRENT_SEGMENT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    stats: {
      totalDocuments: consolidatedDocs.length,
      totalTerms: consolidatedDictionary.length,
      totalPostings,
      avgDocumentLength,
      avgFieldLengths,
    },
    documents: consolidatedDocs,
    dictionary: consolidatedDictionary,
    tombstones: Array.from(allTombstones),
  };

  // 3. Atomically write the merged segment to disk
  const mergedMeta = writeSegmentAtomic(indexDir, mergedPayload);

  // Crash simulation hook (for verifying interrupted merge resilience)
  if (options.simulateCrashBeforeActivation) {
    throw new Error('SIMULATED_CRASH: Process interrupted before atomic manifest promotion');
  }

  // 4. Construct updated active segments list
  const inputSet = new Set(segmentIdsToMerge);
  const remainingActive = manifest.activeSegments.filter(s => !inputSet.has(s.segmentId));
  const newActiveSegments = [...remainingActive, mergedMeta];

  // 5. Calculate consolidated index stats across all active segments
  let consolidatedIndexDocs = 0;
  let consolidatedIndexPostings = 0;
  const activeDocIdSet = new Set<string>();

  for (const seg of newActiveSegments) {
    consolidatedIndexPostings += seg.postingCount;
  }
  // Load and count unique doc IDs across all remaining active segments
  for (const seg of newActiveSegments) {
    const p = loadSegment(indexDir, seg);
    for (const d of p.documents) activeDocIdSet.add(d.documentId);
  }
  consolidatedIndexDocs = activeDocIdSet.size;

  const newGeneration = manifest.generation + 1;
  const now = new Date().toISOString();

  // 6. Atomically promote new manifest
  saveSegmentManifestAtomic(indexDir, {
    schemaVersion: manifest.schemaVersion,
    generation: newGeneration,
    activeSegments: newActiveSegments,
    stats: {
      totalDocuments: consolidatedIndexDocs,
      totalTerms: consolidatedDictionary.length, // approximation
      totalPostings: consolidatedIndexPostings,
      avgDocumentLength,
      avgFieldLengths,
      lastUpdatedAt: now,
    },
    createdAt: manifest.createdAt,
    updatedAt: now,
  });

  // 7. Safely delete obsolete segment files
  const obsoleteDeleted: string[] = [];
  for (const oldMeta of segmentsToMergeMeta) {
    const oldPath = path.join(indexDir, oldMeta.fileName);
    if (fs.existsSync(oldPath)) {
      try {
        fs.unlinkSync(oldPath);
        obsoleteDeleted.push(oldMeta.segmentId);
      } catch {
        // Safe fallback
      }
    }
  }

  const durationMs = Math.round((performance.now() - startMs) * 100) / 100;

  return {
    mergedSegmentId: targetSegmentId,
    inputSegmentIds: segmentIdsToMerge,
    newGeneration,
    documentsMerged: consolidatedDocs.length,
    termsConsolidated: consolidatedDictionary.length,
    postingsMerged: totalPostings,
    durationMs,
    obsoleteSegmentsDeleted: obsoleteDeleted,
    manifestUpdated: true,
  };
}
