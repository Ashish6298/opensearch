/**
 * @opensearch/indexer — Segment-Based Indexing Types (Phase 97)
 *
 * Defines domain models, manifest schema, and merge contracts for
 * immutable index segments, atomic publication, and crash recovery.
 */

import { IndexedDocumentMeta, IndexStats, Posting } from '../index/index-types.js';
import { FieldName } from '../pipeline/pipeline-types.js';

export const CURRENT_SEGMENT_SCHEMA_VERSION = 1;
export const CURRENT_MANIFEST_SCHEMA_VERSION = 1;
export const MANIFEST_FILE_NAME = 'manifest.json';
export const MANIFEST_TMP_FILE_NAME = 'manifest.json.tmp';
export const SEGMENTS_SUBDIR = 'segments';

export interface SegmentMetadata {
  /** Unique segment identifier (e.g. seg_0001_1729000000) */
  segmentId: string;
  /** Schema version */
  schemaVersion: number;
  /** Creation timestamp */
  createdAt: string;
  /** Relative file path within index directory */
  fileName: string;
  /** Total document count in this segment */
  documentCount: number;
  /** Total distinct term count in this segment */
  termCount: number;
  /** Total posting entries in this segment */
  postingCount: number;
  /** Total serialized byte size of this segment file */
  sizeBytes: number;
  /** SHA-256 integrity checksum */
  checksum: string;
  /** Optional deleted/superseded document IDs tombstoned in this segment */
  tombstones?: string[];
}

export interface SegmentPayload {
  segmentId: string;
  schemaVersion: number;
  createdAt: string;
  checksum: string;
  stats: {
    totalDocuments: number;
    totalTerms: number;
    totalPostings: number;
    avgDocumentLength: number;
    avgFieldLengths: Record<FieldName, number>;
  };
  documents: IndexedDocumentMeta[];
  dictionary: Array<{
    term: string;
    documentFrequency: number;
    postings: Posting[];
  }>;
  tombstones?: string[];
}

export interface SegmentManifest {
  schemaVersion: number;
  /** Monotonically increasing generation number */
  generation: number;
  /** Active segments in ascending generation / chronological order */
  activeSegments: SegmentMetadata[];
  /** Consolidated index-level statistics across all active segments */
  stats: IndexStats;
  createdAt: string;
  updatedAt: string;
  checksum: string;
}

export interface SegmentMergeOptions {
  /** Max segments to merge in one compaction pass (default: 5) */
  maxSegmentsPerMerge?: number;
  /** Whether to purge deleted document tombstones during merge (default: true) */
  purgeTombstones?: boolean;
  /** Custom target segment ID */
  targetSegmentId?: string;
  /** Whether to simulate an interrupted crash prior to manifest activation (for testing) */
  simulateCrashBeforeActivation?: boolean;
}

export interface SegmentMergeResult {
  mergedSegmentId: string;
  inputSegmentIds: string[];
  newGeneration: number;
  documentsMerged: number;
  termsConsolidated: number;
  postingsMerged: number;
  durationMs: number;
  obsoleteSegmentsDeleted: string[];
  manifestUpdated: boolean;
}

export interface SegmentCrashRecoveryReport {
  recovered: boolean;
  activeGeneration: number;
  validSegmentCount: number;
  danglingFilesPurged: string[];
  diagnostics: string[];
}

export interface SegmentCompactionPolicy {
  /** Minimum segment count required to trigger auto-compaction (default: 4) */
  minSegmentsForCompaction: number;
  /** Maximum segment count allowed before forcing synchronous compaction (default: 10) */
  maxSegmentsLimit: number;
}
