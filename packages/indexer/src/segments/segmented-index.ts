/**
 * @opensearch/indexer — Segmented Inverted Index (Phase 97)
 *
 * Implements the InvertedIndex interface using immutable file segments
 * and atomic manifests:
 * - High-speed incremental ingestion via append-only immutable segments
 * - Multi-segment querying with deduplicated postings
 * - In-memory write buffer with auto-flushing
 * - Compaction / segment merge support
 * - Crash recovery with zero index corruption
 */

import {
  IndexedDocumentMeta,
  IndexStats,
  InvertedIndex,
  InvertedIndexOptions,
  Posting,
} from '../index/index-types.js';
import { DocumentTermSummary, FieldName, ProcessedDocument } from '../pipeline/pipeline-types.js';
import {
  loadSegmentManifest,
  saveSegmentManifestAtomic,
} from './segment-manifest.js';
import {
  loadSegment,
  mergeSegments,
  recoverOrCleanDanglingSegments,
  writeSegmentAtomic,
} from './segment-merger.js';
import {
  CURRENT_MANIFEST_SCHEMA_VERSION,
  CURRENT_SEGMENT_SCHEMA_VERSION,
  SegmentCrashRecoveryReport,
  SegmentManifest,
  SegmentMergeResult,
  SegmentMetadata,
  SegmentPayload,
} from './segment-types.js';

function buildPosting(documentId: string, summary: DocumentTermSummary): Posting {
  const fieldTermFrequencies: Record<FieldName, number> = {};
  for (const [fieldName, count] of summary.fieldCounts.entries()) {
    fieldTermFrequencies[fieldName] = count;
  }

  const fieldPositions: Record<FieldName, number[]> = {};
  for (const [fieldName, positions] of summary.fieldPositions.entries()) {
    fieldPositions[fieldName] = positions;
  }

  return {
    documentId,
    termFrequency: summary.totalFrequency,
    fieldTermFrequencies,
    fieldPositions,
  };
}

export interface SegmentedIndexOptions extends InvertedIndexOptions {
  /** Maximum documents in write buffer before triggering automatic flush (default: 1000) */
  maxBufferSize?: number;
}

export class SegmentedInvertedIndex implements InvertedIndex {
  private readonly indexDir: string;
  private readonly maxBufferSize: number;

  // In-memory write buffer for new documents prior to segment flush
  private readonly writeBuffer: ProcessedDocument[] = [];

  // Active in-memory segment representations for fast querying
  private activeSegments: SegmentPayload[] = [];
  private activeManifest: SegmentManifest | null = null;

  constructor(options: SegmentedIndexOptions = {}) {
    this.indexDir = options.indexDir || './data/index';
    this.maxBufferSize = options.maxBufferSize || 1000;
  }

  /**
   * Adds a processed document to the write buffer.
   */
  addDocument(doc: ProcessedDocument): void {
    if (!doc || !doc.documentId) return;
    this.writeBuffer.push(doc);
    if (this.writeBuffer.length >= this.maxBufferSize) {
      void this.flushSegment();
    }
  }

  updateDocument(doc: ProcessedDocument): void {
    this.addDocument(doc);
  }

  removeDocument(documentId: string): boolean {
    // For immutable segments, deletions are tombstoned
    // Remove from in-memory buffer if present
    const idx = this.writeBuffer.findIndex(d => d.documentId === documentId);
    if (idx !== -1) {
      this.writeBuffer.splice(idx, 1);
      return true;
    }
    return false;
  }

  hasDocument(documentId: string): boolean {
    return this.getDocumentMeta(documentId) !== null;
  }

  getDocumentMeta(documentId: string): IndexedDocumentMeta | null {
    // 1. Check in-memory write buffer first (most recent)
    for (let i = this.writeBuffer.length - 1; i >= 0; i--) {
      const doc = this.writeBuffer[i]!;
      if (doc.documentId === documentId) {
        return this.buildDocMeta(doc);
      }
    }

    // 2. Check active segments in reverse chronological order
    for (let i = this.activeSegments.length - 1; i >= 0; i--) {
      const seg = this.activeSegments[i]!;
      for (const meta of seg.documents) {
        if (meta.documentId === documentId) {
          return meta;
        }
      }
    }

    return null;
  }

  getAllDocumentMeta(): IndexedDocumentMeta[] {
    const map = new Map<string, IndexedDocumentMeta>();

    // Load from segments (older to newer)
    for (const seg of this.activeSegments) {
      for (const meta of seg.documents) {
        map.set(meta.documentId, meta);
      }
    }

    // Load from buffer (newest)
    for (const doc of this.writeBuffer) {
      map.set(doc.documentId, this.buildDocMeta(doc));
    }

    return Array.from(map.values());
  }

  getPostings(term: string): Posting[] | null {
    const postingsMap = new Map<string, Posting>();

    // 1. Gather postings from all active segments
    for (const seg of this.activeSegments) {
      for (const item of seg.dictionary) {
        if (item.term === term) {
          for (const p of item.postings) {
            postingsMap.set(p.documentId, p);
          }
        }
      }
    }

    // 2. Gather postings from write buffer
    for (const doc of this.writeBuffer) {
      const summary = doc.terms.get(term);
      if (summary) {
        postingsMap.set(doc.documentId, buildPosting(doc.documentId, summary));
      }
    }

    if (postingsMap.size === 0) return null;
    return Array.from(postingsMap.values()).sort((a, b) => a.documentId.localeCompare(b.documentId));
  }

  getDocumentFrequency(term: string): number {
    const postings = this.getPostings(term);
    return postings ? postings.length : 0;
  }

  getTermFrequency(term: string, documentId: string): number {
    const postings = this.getPostings(term);
    if (!postings) return 0;
    const p = postings.find(item => item.documentId === documentId);
    return p ? p.termFrequency : 0;
  }

  getTerms(): string[] {
    const termsSet = new Set<string>();
    for (const seg of this.activeSegments) {
      for (const item of seg.dictionary) {
        termsSet.add(item.term);
      }
    }
    for (const doc of this.writeBuffer) {
      for (const term of doc.terms.keys()) {
        termsSet.add(term);
      }
    }
    return Array.from(termsSet).sort();
  }

  getStats(): IndexStats {
    const docs = this.getAllDocumentMeta();
    const terms = this.getTerms();

    let totalPostings = 0;
    for (const term of terms) {
      totalPostings += this.getDocumentFrequency(term);
    }

    let sumLengths = 0;
    const fieldSums: Record<FieldName, number> = {} as any;
    for (const doc of docs) {
      sumLengths += doc.totalTerms;
      for (const [f, l] of Object.entries(doc.fieldLengths)) {
        fieldSums[f as FieldName] = ((fieldSums[f as FieldName] || 0) as number) + l;
      }
    }

    const totalDocs = docs.length;
    const avgFieldLengths: Record<FieldName, number> = {} as any;
    for (const [f, sum] of Object.entries(fieldSums)) {
      avgFieldLengths[f as FieldName] = totalDocs > 0 ? (sum as number) / totalDocs : 0;
    }

    return {
      totalDocuments: totalDocs,
      totalTerms: terms.length,
      totalPostings,
      avgDocumentLength: totalDocs > 0 ? sumLengths / totalDocs : 0,
      avgFieldLengths,
      lastUpdatedAt: this.activeManifest?.updatedAt || new Date().toISOString(),
    };
  }

  clear(): void {
    this.writeBuffer.length = 0;
    this.activeSegments.length = 0;
    this.activeManifest = null;
  }

  /**
   * Flushes in-memory write buffer to an immutable segment file and updates the manifest.
   */
  async flushSegment(targetDir?: string): Promise<SegmentMetadata | null> {
    const dir = targetDir || this.indexDir;
    if (this.writeBuffer.length === 0) return null;

    const segmentDocs = [...this.writeBuffer];
    this.writeBuffer.length = 0;

    const segmentId = `seg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const documentsMeta: IndexedDocumentMeta[] = segmentDocs.map(d => this.buildDocMeta(d));

    // Build dictionary for this segment
    const termMap = new Map<string, Posting[]>();
    for (const doc of segmentDocs) {
      for (const [term, summary] of doc.terms.entries()) {
        let pList = termMap.get(term);
        if (!pList) {
          pList = [];
          termMap.set(term, pList);
        }
        pList.push(buildPosting(doc.documentId, summary));
      }
    }

    let totalPostings = 0;
    const dictionary = Array.from(termMap.entries())
      .map(([term, postings]) => {
        totalPostings += postings.length;
        return {
          term,
          documentFrequency: postings.length,
          postings: postings.sort((a, b) => a.documentId.localeCompare(b.documentId)),
        };
      })
      .sort((a, b) => a.term.localeCompare(b.term));

    const payload: Omit<SegmentPayload, 'checksum'> = {
      segmentId,
      schemaVersion: CURRENT_SEGMENT_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      stats: {
        totalDocuments: documentsMeta.length,
        totalTerms: dictionary.length,
        totalPostings,
        avgDocumentLength: 0,
        avgFieldLengths: {} as any,
      },
      documents: documentsMeta,
      dictionary,
    };

    // Write immutable segment
    const meta = writeSegmentAtomic(dir, payload);

    // Update manifest
    const currentManifest = loadSegmentManifest(dir) || {
      schemaVersion: CURRENT_MANIFEST_SCHEMA_VERSION,
      generation: 0,
      activeSegments: [],
      stats: {
        totalDocuments: 0,
        totalTerms: 0,
        totalPostings: 0,
        avgDocumentLength: 0,
        avgFieldLengths: {} as any,
        lastUpdatedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      checksum: '',
    };

    const newActiveSegments = [...currentManifest.activeSegments, meta];
    const newGeneration = currentManifest.generation + 1;
    const now = new Date().toISOString();

    const updatedManifest = saveSegmentManifestAtomic(dir, {
      schemaVersion: CURRENT_MANIFEST_SCHEMA_VERSION,
      generation: newGeneration,
      activeSegments: newActiveSegments,
      stats: {
        totalDocuments: currentManifest.stats.totalDocuments + meta.documentCount,
        totalTerms: currentManifest.stats.totalTerms + meta.termCount,
        totalPostings: currentManifest.stats.totalPostings + meta.postingCount,
        avgDocumentLength: 0,
        avgFieldLengths: {} as any,
        lastUpdatedAt: now,
      },
      createdAt: currentManifest.createdAt,
      updatedAt: now,
    });

    this.activeManifest = updatedManifest;
    const loadedPayload = loadSegment(dir, meta);
    this.activeSegments.push(loadedPayload);

    return meta;
  }

  /**
   * Compacts active segments by merging them into a single consolidated segment.
   */
  async compact(targetDir?: string): Promise<SegmentMergeResult | null> {
    const dir = targetDir || this.indexDir;
    // Flush any pending write buffer first
    await this.flushSegment(dir);

    const manifest = loadSegmentManifest(dir);
    if (!manifest || manifest.activeSegments.length <= 1) {
      return null; // Nothing to compact
    }

    const segmentIds = manifest.activeSegments.map(s => s.segmentId);
    const result = await mergeSegments(dir, segmentIds);

    // Reload state after merge
    await this.load(dir);
    return result;
  }

  async save(targetDir?: string): Promise<void> {
    const dir = targetDir || this.indexDir;
    await this.flushSegment(dir);
  }

  async load(targetDir?: string): Promise<void> {
    const dir = targetDir || this.indexDir;
    const manifest = loadSegmentManifest(dir);

    if (!manifest) {
      this.clear();
      return;
    }

    this.activeSegments = manifest.activeSegments.map(meta => loadSegment(dir, meta));
    this.activeManifest = manifest;
    this.writeBuffer.length = 0;
  }

  recover(targetDir?: string): SegmentCrashRecoveryReport {
    const dir = targetDir || this.indexDir;
    return recoverOrCleanDanglingSegments(dir);
  }

  getActiveSegmentCount(): number {
    return this.activeSegments.length;
  }

  private buildDocMeta(doc: ProcessedDocument): IndexedDocumentMeta {
    const fieldLengths: Record<FieldName, number> = {} as any;
    for (const [field, data] of doc.fields.entries()) {
      fieldLengths[field] = data.totalTokens;
    }

    return {
      documentId: doc.documentId,
      url: doc.url,
      urlHash: doc.urlHash,
      title: doc.title,
      description: doc.description || undefined,
      language: doc.language,
      totalTerms: doc.totalTokens,
      fieldLengths,
      indexedAt: doc.processedAt || new Date().toISOString(),
    };
  }
}
