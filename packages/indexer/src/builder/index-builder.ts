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
import { createHash } from 'node:crypto';
import { Logger, createLogger } from '@opensearch/shared';
import {
  DocumentRecord,
  INDEX_STATUS,
  IndexMetadataRecord,
  StorageAdapter,
} from '@opensearch/storage';
import { DocumentProcessor } from '../pipeline/pipeline-types.js';
import { createDocumentProcessor } from '../pipeline/document-processor.js';
import {
  CURRENT_INDEX_SCHEMA_VERSION,
  INDEX_FILE_NAME,
  InvertedIndex,
} from '../index/index-types.js';
import { createInvertedIndex } from '../index/index-factory.js';
import { validateIndexFile } from '../index/index-validator.js';
import {
  IndexBuildOptions,
  IndexBuildStats,
  IndexBuildSummary,
  IndexBuilder,
  IndexDocumentResult,
  GenerationCleanupOptions,
  GenerationCleanupResult,
  IndexHealth,
  IndexHealthActiveGeneration,
} from './builder-types.js';

export interface IndexBuilderOptions {
  config?: { storage?: { indexDir?: string } };
  storage: StorageAdapter;
  processor?: DocumentProcessor;
  logger?: Logger;
  indexDir?: string;
}

export function computeDocumentFingerprint(doc: {
  title?: string;
  headings?: string;
  description?: string;
  bodyText?: string;
  contentHash?: string | null;
}): string {
  if (doc.contentHash) return doc.contentHash;
  const raw = `${doc.title || ''}\n${doc.headings || ''}\n${doc.description || ''}\n${doc.bodyText || ''}`;
  const normalized = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

function getDirectorySizeBytes(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let totalBytes = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalBytes += getDirectorySizeBytes(fullPath);
      } else if (entry.isFile()) {
        totalBytes += fs.statSync(fullPath).size;
      }
    }
  } catch {
    // Ignore read errors
  }
  return totalBytes;
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

      try {
        const idx = createInvertedIndex({ indexDir: activeMeta.indexPath });
        await idx.load(activeMeta.indexPath);
        this.activeIndex = idx;
        return idx;
      } catch (err: any) {
        this.logger.error(
          'Active index on disk failed validation or is corrupt. Initiating automatic recovery rebuild.',
          {
            buildId: activeMeta.buildId,
            error: err.message,
          },
        );

        try {
          await this.storage.indexMetadata.update(activeMeta.buildId, {
            status: 'failed',
            isActive: false,
            errorMessage: `Index corrupt or incompatible: ${err.message}`,
          });
        } catch {
          // ignore storage error
        }
        this.activeMetadata = null;
      }
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

          const fingerprint = computeDocumentFingerprint(docRecord);
          const existingMeta = newIndex.getDocumentMeta(docRecord.id);

          // Track document fingerprints to avoid unnecessary processing
          if (
            mode === 'incremental' &&
            existingMeta &&
            existingMeta.fingerprint === fingerprint &&
            !options.force
          ) {
            stats.documentsSkipped++;
            documentsToUpdateStatus.push(docRecord.id);
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

      // Pre-activation audit: strictly validate staged index integrity before promotion
      const audit = validateIndexFile(stagingDir);
      if (!audit.valid) {
        throw new Error(
          `Staged index failed integrity audit: ${audit.errors.join('; ')}`,
        );
      }

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

      // Clean up obsolete generations according to documented retention rules
      try {
        await this.cleanObsoleteGenerations();
      } catch {
        // Non-blocking cleanup
      }

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

  /**
   * Idempotently indexes or updates a single DocumentRecord.
   * Compares document content fingerprint to skip processing if unchanged.
   */
  async indexDocument(
    docRecord: DocumentRecord,
    options: { force?: boolean } = {}
  ): Promise<IndexDocumentResult> {
    const startMs = Date.now();
    await this.loadActiveIndex();
    if (!this.activeIndex) {
      throw new Error('No active index available for document indexing');
    }

    const fingerprint = computeDocumentFingerprint(docRecord);
    const existingMeta = this.activeIndex.getDocumentMeta(docRecord.id);

    // If document already indexed and content fingerprint has not changed, skip processing
    if (existingMeta && existingMeta.fingerprint === fingerprint && !options.force) {
      return {
        action: 'skipped',
        documentId: docRecord.id,
        fingerprint,
        termsCount: existingMeta.totalTerms,
        durationMs: Date.now() - startMs,
      };
    }

    // Process document through tokenizer and normalizer
    const processedDoc = this.processor.process(docRecord);
    this.activeIndex.addDocument(processedDoc);

    const activeMeta = await this.getActiveMetadata();
    if (activeMeta && activeMeta.indexPath) {
      await this.activeIndex.save(activeMeta.indexPath);
      const stats = this.activeIndex.getStats();
      await this.storage.indexMetadata.update(activeMeta.buildId, {
        documentCount: stats.totalDocuments,
        termCount: stats.totalTerms,
      });
    }

    await this.storage.documents.update(docRecord.id, {
      indexStatus: INDEX_STATUS.INDEXED,
      lastIndexedAt: new Date().toISOString(),
      indexVersion: activeMeta?.buildId ?? null,
    });

    return {
      action: existingMeta ? 'updated' : 'indexed',
      documentId: docRecord.id,
      fingerprint,
      termsCount: processedDoc.totalTokens,
      durationMs: Date.now() - startMs,
    };
  }

  /**
   * Idempotently deletes a document from the active index and purges its postings.
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    await this.loadActiveIndex();
    if (!this.activeIndex) {
      return false;
    }

    const removed = this.activeIndex.removeDocument(documentId);
    if (!removed) {
      return false;
    }

    const activeMeta = await this.getActiveMetadata();
    if (activeMeta && activeMeta.indexPath) {
      await this.activeIndex.save(activeMeta.indexPath);
      const stats = this.activeIndex.getStats();
      await this.storage.indexMetadata.update(activeMeta.buildId, {
        documentCount: stats.totalDocuments,
        termCount: stats.totalTerms,
      });
    }

    try {
      await this.storage.documents.update(documentId, {
        indexStatus: INDEX_STATUS.NOT_INDEXED,
      });
    } catch {
      // document might not exist in repository
    }

    return true;
  }

  /**
   * Cleans up obsolete index generations on disk according to retention rules.
   * Guarantees the active generation is never pruned.
   */
  async cleanObsoleteGenerations(
    options: GenerationCleanupOptions = {}
  ): Promise<GenerationCleanupResult> {
    const maxRetained = Math.max(1, options.maxRetained ?? 3);
    const keepFailed = options.keepFailed ?? false;

    const activeMeta = await this.getActiveMetadata();
    const activeBuildId = activeMeta?.buildId ?? null;

    const allMetadata = await this.storage.indexMetadata.list();
    const readyBuilds = allMetadata.filter(m => m.status === 'ready');

    // Build the set of buildIds to retain
    const retainedBuildIds = new Set<string>();
    if (activeBuildId) {
      retainedBuildIds.add(activeBuildId);
    }

    // Retain up to maxRetained - 1 additional ready generations
    for (const meta of readyBuilds) {
      if (retainedBuildIds.size >= maxRetained) break;
      retainedBuildIds.add(meta.buildId);
    }

    let bytesFreed = 0;
    const prunedBuildIds: string[] = [];
    const buildsBaseDir = path.join(this.rootIndexDir, 'builds');

    // Prune obsolete builds
    for (const meta of allMetadata) {
      if (retainedBuildIds.has(meta.buildId)) continue;

      const shouldPrune =
        meta.status === 'stale' ||
        meta.status === 'ready' ||
        (!keepFailed && (meta.status === 'failed' || meta.status === 'building'));

      if (shouldPrune) {
        const buildDir = meta.indexPath || path.join(buildsBaseDir, meta.buildId);
        if (fs.existsSync(buildDir)) {
          bytesFreed += getDirectorySizeBytes(buildDir);
          try {
            fs.rmSync(buildDir, { recursive: true, force: true });
          } catch {
            // ignore cleanup failure
          }
        }
        prunedBuildIds.push(meta.buildId);
        try {
          await this.storage.indexMetadata.update(meta.buildId, { status: 'stale' });
        } catch {
          // ignore
        }
      }
    }

    // Also scan physical directory for orphaned build folders
    if (fs.existsSync(buildsBaseDir)) {
      try {
        const physicalFolders = fs.readdirSync(buildsBaseDir);
        for (const folder of physicalFolders) {
          if (!retainedBuildIds.has(folder) && !prunedBuildIds.includes(folder)) {
            const folderPath = path.join(buildsBaseDir, folder);
            bytesFreed += getDirectorySizeBytes(folderPath);
            try {
              fs.rmSync(folderPath, { recursive: true, force: true });
              prunedBuildIds.push(folder);
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    }

    return {
      activeBuildId,
      retainedBuildIds: Array.from(retainedBuildIds),
      prunedBuildIds,
      bytesFreed,
    };
  }

  /**
   * Returns current index health diagnostics without leaking queries or user content.
   */
  async getIndexHealth(): Promise<IndexHealth> {
    const activeMeta = await this.getActiveMetadata();
    const allGenerations = await this.storage.indexMetadata.list();

    const pendingDocs = await this.storage.documents.findByIndexStatus(INDEX_STATUS.PENDING, {
      limit: 10000,
    });
    const staleDocs = await this.storage.documents.findByIndexStatus(INDEX_STATUS.STALE, {
      limit: 10000,
    });
    const indexedDocs = await this.storage.documents.findByIndexStatus(INDEX_STATUS.INDEXED, {
      limit: 10000,
    });

    let activeGenHealth: IndexHealthActiveGeneration | null = null;
    let status: IndexHealth['status'] = 'uninitialized';

    if (activeMeta) {
      const indexFileExists = fs.existsSync(path.join(activeMeta.indexPath, INDEX_FILE_NAME));
      let integrityValid = false;
      let fileSize = 0;

      if (indexFileExists) {
        const audit = validateIndexFile(activeMeta.indexPath);
        integrityValid = audit.valid;
        try {
          fileSize = fs.statSync(path.join(activeMeta.indexPath, INDEX_FILE_NAME)).size;
        } catch {
          fileSize = 0;
        }
      }

      const memoryStats = this.activeIndex ? this.activeIndex.getStats() : null;

      activeGenHealth = {
        buildId: activeMeta.buildId,
        version: activeMeta.version,
        documentCount: memoryStats?.totalDocuments ?? activeMeta.documentCount,
        termCount: memoryStats?.totalTerms ?? activeMeta.termCount,
        avgDocumentLength: memoryStats?.avgDocumentLength ?? 0,
        totalPostings: memoryStats?.totalPostings ?? 0,
        builtAt: activeMeta.completedAt ?? activeMeta.startedAt,
        indexPath: activeMeta.indexPath,
        integrityValid,
        fileSizeBytes: fileSize,
      };

      if (!integrityValid) {
        status = 'corrupt';
      } else if (pendingDocs.length > 0 || staleDocs.length > 0) {
        status = 'degraded';
      } else {
        status = 'healthy';
      }
    }

    const sortedGens = [...allGenerations].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    );

    const oldestGen = sortedGens[0];
    const newestGen = sortedGens[sortedGens.length - 1];

    return {
      status,
      schemaVersion: CURRENT_INDEX_SCHEMA_VERSION,
      activeGeneration: activeGenHealth,
      generations: {
        totalGenerations: allGenerations.length,
        retainedCount: allGenerations.filter(g => g.status === 'ready' || g.isActive).length,
        oldestGenerationAt: oldestGen ? oldestGen.startedAt : null,
        newestGenerationAt: newestGen ? newestGen.startedAt : null,
      },
      pendingDocuments: {
        pendingCount: pendingDocs.length,
        staleCount: staleDocs.length,
        indexedCount: indexedDocs.length,
        needsReindex: pendingDocs.length > 0 || staleDocs.length > 0,
      },
      lastCheckedAt: new Date().toISOString(),
    };
  }
}
