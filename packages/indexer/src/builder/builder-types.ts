/**
 * @opensearch/indexer — Index Builder Types (Phase 11)
 *
 * Defines contracts and domain models for index building & rebuild orchestration:
 * - Full vs. Incremental build modes
 * - Build statistics and metadata tracking
 * - Safe atomic staging and index swapping
 * - IndexBuilder interface
 */

import { IndexMetadataRecord } from '@opensearch/storage';
import { InvertedIndex } from '../index/index-types.js';

export interface IndexBuildOptions {
  /** Build mode: 'full' rebuilds from scratch, 'incremental' indexes only pending docs */
  mode?: 'full' | 'incremental';
  /** Force full rebuild even if no pending documents exist */
  force?: boolean;
  /** Batch size for paginated document processing from storage (default: 500) */
  batchSize?: number;
  /** Optional custom index directory override */
  targetDir?: string;
  /** Semantic version label for this build (e.g. '1.0.0') */
  versionLabel?: string;
}

export interface IndexBuildStats {
  buildId: string;
  version: string;
  mode: 'full' | 'incremental';
  documentsExamined: number;
  documentsIndexed: number;
  documentsSkipped: number;
  termsIndexed: number;
  postingsCount: number;
  avgDocLength: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  status: 'building' | 'ready' | 'failed' | 'stale';
}

export interface IndexBuildSummary {
  buildId: string;
  status: 'success' | 'failed' | 'no_op';
  stats: IndexBuildStats;
  indexPath: string;
  message?: string;
  errorMessage?: string;
}

export interface IndexBuilder {
  /**
   * Builds or updates the inverted index from stored documents in DocumentRepository.
   * Atomic and safe: failed builds never corrupt or replace an active index.
   */
  build(options?: IndexBuildOptions): Promise<IndexBuildSummary>;

  /**
   * Returns the currently active in-memory InvertedIndex instance, or null if none loaded.
   */
  getActiveIndex(): InvertedIndex | null;

  /**
   * Retrieves the active IndexMetadataRecord from storage.
   */
  getActiveMetadata(): Promise<IndexMetadataRecord | null>;

  /**
   * Loads the active index from disk into memory, or builds one if none exists.
   */
  loadActiveIndex(): Promise<InvertedIndex>;
}
