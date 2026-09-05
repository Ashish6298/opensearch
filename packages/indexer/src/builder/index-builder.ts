/**
 * @opensearch/indexer — Index Builder Implementation (Phase 11)
 *
 * Implements the full and incremental index build pipeline:
 * 1. Queries DocumentRepository from StorageAdapter
 * 2. Processes document text through DocumentProcessor (Phase 9)
 * 3. Builds into isolated staging build directory (<indexDir>/builds/<buildId>)
 * 4. Atomically activates the index only after 100% success
 * 5. Updates DocumentRecord.indexStatus to INDEXED and records IndexMetadataRecord
 * 6. Preserves the active index intact if a build encounters failure or corruption
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Logger, createLogger } from '@opensearch/shared';
import { INDEX_STATUS, IndexMetadataRecord, StorageAdapter } from '@opensearch/storage';
import { DocumentProcessor } from '../pipeline/pipeline-types.js';
import { createDocumentProcessor } from '../pipeline/document-processor.js';
import { InvertedIndex } from '../index/index-types.js';
import { createInvertedIndex } from '../index/index-factory.js';
import {
  IndexBuildOptions,
  IndexBuildStats,
  IndexBuildSummary,
  IndexBuilder,
} from './builder-types.js';

export interface IndexBuilderOptions {
  config?: { storage?: { indexDir?: string } };
  storage: StorageAdapter;
  processor?: DocumentProcessor;
  logger?: Logger;
  indexDir?: string;
}

export class DefaultIndexBuilder implements IndexBuilder {
  private readonly storage: StorageAdapter;
  private readonly processor: DocumentProcessor;
  private readonly logger: Logger;
  private readonly rootIndexDir: string;

  private activeIndex: InvertedIndex | null = null;
  private activeMetadata: IndexMetadataRecord | null = null;

  constructor(options: IndexBuilderOptions) {
    this.storage = options.storage;
    this.processor = options.processor ?? createDocumentProcessor();
    this.logger = options.logger ?? createLogger('@opensearch/indexer:builder');
    this.rootIndexDir = options.indexDir ?? options.config?.storage?.indexDir ?? './data/index';
  }

  getActiveIndex(): InvertedIndex | null {
    return this.activeIndex;
  }

  async getActiveMetadata(): Promise<IndexMetadataRecord | null> {
    if (!this.activeMetadata) {
      this.activeMetadata = await this.storage.indexMetadata.findActive();
    }
    return this.activeMetadata;
  }

  async loadActiveIndex(): Promise<InvertedIndex> {
    if (this.activeIndex) {
      return this.activeIndex;
    }

    const activeMeta = await this.getActiveMetadata();
    if (activeMeta && fs.existsSync(activeMeta.indexPath)) {
      this.logger.info('Loading active index from disk', {
        buildId: activeMeta.buildId,
        indexPath: activeMeta.indexPath,
      });

      const idx = createInvertedIndex({ indexDir: activeMeta.indexPath });
      await idx.load(activeMeta.indexPath);
      this.activeIndex = idx;
      return idx;
    }

    // If no active index exists on disk, perform a full build
    this.logger.info('No active index found on disk. Performing full index build.');
    const summary = await this.build({ mode: 'full' });
    if (summary.status !== 'success' || !this.activeIndex) {
      throw new Error(
        `Failed to initialize active index: ${summary.errorMessage || 'unknown error'}`,
      );
    }
    return this.activeIndex;
  }

  async build(options: IndexBuildOptions = {}): Promise<IndexBuildSummary> {
    const startMs = Date.now();
    const version = options.versionLabel ?? '1.0.0';
    const mode = options.mode ?? 'full';
    const batchSize = options.batchSize ?? 500;
    const targetDir = options.targetDir ?? this.rootIndexDir;

    // 1. Create Index Metadata record in storage as 'building'
    const metaRecord = await this.storage.indexMetadata.create({
      version,
      isActive: false,
      documentCount: 0,
      termCount: 0,
      indexPath: targetDir, // will update to stagingDir with buildId
      status: 'building',
      errorMessage: null,
      completedAt: null,
      lastRebuildAt: new Date().toISOString(),
    });

    const buildId = metaRecord.buildId;
    const stagingDir = path.join(targetDir, 'builds', buildId);

    // Update indexPath with exact stagingDir path
    await this.storage.indexMetadata.update(buildId, {
      indexPath: stagingDir,
    });

    const stats: IndexBuildStats = {
      buildId,
      version,
      mode,
      documentsExamined: 0,
      documentsIndexed: 0,
      documentsSkipped: 0,
      termsIndexed: 0,
      postingsCount: 0,
      avgDocLength: 0,
      startedAt: metaRecord.startedAt,
      completedAt: null,
      durationMs: 0,
      status: 'building',
    };

    try {
      // 2. Initialize fresh or cloned index in staging directory
      const newIndex = createInvertedIndex({ indexDir: stagingDir });

      if (mode === 'incremental') {
        // Load active index state into staging index first
        const activeMeta = await this.getActiveMetadata();
        if (activeMeta && fs.existsSync(activeMeta.indexPath)) {
          await newIndex.load(activeMeta.indexPath);
          this.logger.debug('Cloned active index for incremental update', {
            baseBuildId: activeMeta.buildId,
          });
        }
      }

      // 3. Query documents to index
      let offset = 0;
      let hasMore = true;
      const documentsToUpdateStatus: string[] = [];

      while (hasMore) {
        let docs;
        if (mode === 'incremental' && !options.force) {
          // Fetch pending or stale docs
          const pending = await this.storage.documents.findByIndexStatus(INDEX_STATUS.PENDING, {
            limit: batchSize,
          });
          const stale = await this.storage.documents.findByIndexStatus(INDEX_STATUS.STALE, {
            limit: batchSize,
          });
          docs = [...pending, ...stale];
          hasMore = false; // findByIndexStatus fetches up to limit
        } else {
          // Full rebuild: fetch all documents in batches
          docs = await this.storage.documents.list({
            limit: batchSize,
            offset,
          });
          offset += docs.length;
          hasMore = docs.length === batchSize;
        }

        stats.documentsExamined += docs.length;

        for (const docRecord of docs) {
          // Skip documents that have empty or invalid text content
          const hasContent =
            docRecord.title || docRecord.headings || docRecord.description || docRecord.bodyText;

          if (!hasContent) {
            stats.documentsSkipped++;
            continue;
          }

          // Process document via Phase 9 DocumentProcessor
          const processedDoc = this.processor.process(docRecord);

          // Add to inverted index
          newIndex.addDocument(processedDoc);
          stats.documentsIndexed++;
          documentsToUpdateStatus.push(docRecord.id);
        }
      }

      // 4. Save new index to disk in staging directory
      fs.mkdirSync(stagingDir, { recursive: true });
      await newIndex.save(stagingDir);

      const finalStats = newIndex.getStats();
      stats.termsIndexed = finalStats.totalTerms;
      stats.postingsCount = finalStats.totalPostings;
      stats.avgDocLength = finalStats.avgDocumentLength;
      stats.completedAt = new Date().toISOString();
      stats.durationMs = Date.now() - startMs;
      stats.status = 'ready';

      // 5. Atomic activation: update old active index to inactive and new to active
      const previousActive = await this.storage.indexMetadata.findActive();
      if (previousActive) {
        await this.storage.indexMetadata.update(previousActive.buildId, {
          isActive: false,
          status: 'stale',
        });
      }

      const updatedMeta = await this.storage.indexMetadata.update(buildId, {
        isActive: true,
        documentCount: finalStats.totalDocuments,
        termCount: finalStats.totalTerms,
        status: 'ready',
        completedAt: stats.completedAt,
      });

      // 6. Update document status in DocumentRepository
      for (const docId of documentsToUpdateStatus) {
        try {
          await this.storage.documents.update(docId, {
            indexStatus: INDEX_STATUS.INDEXED,
            lastIndexedAt: stats.completedAt,
            indexVersion: buildId,
          });
        } catch {
          // continue updating remaining docs
        }
      }

      this.activeIndex = newIndex;
      this.activeMetadata = updatedMeta;

      this.logger.info('Index build completed successfully and activated', {
        buildId,
        documentsIndexed: stats.documentsIndexed,
        termsIndexed: stats.termsIndexed,
        durationMs: stats.durationMs,
      });

      return {
        buildId,
        status: 'success',
        stats,
        indexPath: stagingDir,
        message: `Successfully indexed ${stats.documentsIndexed} documents across ${stats.termsIndexed} unique terms`,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      stats.status = 'failed';
      stats.durationMs = Date.now() - startMs;
      stats.completedAt = new Date().toISOString();

      this.logger.error('Index build failed. Active index remains untouched.', {
        buildId,
        error: errorMsg,
      });

      // Update metadata to failed
      try {
        await this.storage.indexMetadata.update(buildId, {
          status: 'failed',
          errorMessage: errorMsg,
          completedAt: stats.completedAt,
        });
      } catch {
        // ignore storage update error on failure
      }

      // Cleanup failed staging directory
      try {
        if (fs.existsSync(stagingDir)) {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        }
      } catch {
        // ignore cleanup error
      }

      return {
        buildId,
        status: 'failed',
        stats,
        indexPath: stagingDir,
        errorMessage: errorMsg,
      };
    }
  }
}
