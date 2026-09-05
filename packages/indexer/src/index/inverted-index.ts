/**
 * @opensearch/indexer — Inverted Index Implementation (Phase 10)
 *
 * Implements the core in-memory inverted index with:
 * 1. Term dictionary and posting lists with field-level frequencies and positions
 * 2. Document frequency tracking for BM25 and TF-IDF rankers
 * 3. Document metadata store and length statistics
 * 4. Safe atomic mutations: add, update, remove
 * 5. Full disk serialization and deserialization
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { FieldName, ProcessedDocument } from '../pipeline/pipeline-types.js';
import {
  IndexedDocumentMeta,
  IndexStats,
  InvertedIndex,
  InvertedIndexOptions,
  Posting,
  PostingList,
  SerializedIndexPayload,
} from './index-types.js';

export class MemoryInvertedIndex implements InvertedIndex {
  private readonly defaultIndexDir: string;

  // Term Dictionary: normalized term -> PostingList
  private readonly dictionary = new Map<string, PostingList>();

  // Document metadata store: documentId -> IndexedDocumentMeta
  private readonly documents = new Map<string, IndexedDocumentMeta>();

  private lastUpdatedAt: string = new Date().toISOString();

  constructor(options: InvertedIndexOptions = {}) {
    this.defaultIndexDir = options.indexDir || './data/index';
  }

  addDocument(doc: ProcessedDocument): void {
    if (!doc || !doc.documentId) return;

    // If document already exists, remove it first to maintain clean posting counts
    if (this.documents.has(doc.documentId)) {
      this.removeDocument(doc.documentId);
    }

    const fieldLengths: Record<FieldName, number> = {};
    for (const [fieldName, fieldData] of doc.fields.entries()) {
      fieldLengths[fieldName] = fieldData.totalTokens;
    }

    // 1. Record document metadata
    const docMeta: IndexedDocumentMeta = {
      documentId: doc.documentId,
      url: doc.url,
      urlHash: doc.urlHash,
      title: doc.title,
      language: doc.language,
      totalTerms: doc.totalTokens,
      fieldLengths,
      indexedAt: new Date().toISOString(),
    };
    this.documents.set(doc.documentId, docMeta);

    // 2. Insert postings for each term in the document
    for (const [term, summary] of doc.terms.entries()) {
      let postingList = this.dictionary.get(term);
      if (!postingList) {
        postingList = {
          term,
          documentFrequency: 0,
          postings: new Map<string, Posting>(),
        };
        this.dictionary.set(term, postingList);
      }

      const fieldTermFrequencies: Record<FieldName, number> = {};
      for (const [fieldName, count] of summary.fieldCounts.entries()) {
        fieldTermFrequencies[fieldName] = count;
      }

      const fieldPositions: Record<FieldName, number[]> = {};
      for (const [fieldName, positions] of summary.fieldPositions.entries()) {
        fieldPositions[fieldName] = positions;
      }

      const posting: Posting = {
        documentId: doc.documentId,
        termFrequency: summary.totalFrequency,
        fieldTermFrequencies,
        fieldPositions,
      };

      postingList.postings.set(doc.documentId, posting);
      postingList.documentFrequency = postingList.postings.size;
    }

    this.lastUpdatedAt = new Date().toISOString();
  }

  updateDocument(doc: ProcessedDocument): void {
    this.addDocument(doc);
  }

  removeDocument(documentId: string): boolean {
    if (!this.documents.has(documentId)) {
      return false;
    }

    this.documents.delete(documentId);

    // Scan dictionary to remove document postings and prune empty posting lists
    for (const [term, postingList] of this.dictionary.entries()) {
      if (postingList.postings.has(documentId)) {
        postingList.postings.delete(documentId);
        postingList.documentFrequency = postingList.postings.size;

        if (postingList.documentFrequency === 0) {
          this.dictionary.delete(term);
        }
      }
    }

    this.lastUpdatedAt = new Date().toISOString();
    return true;
  }

  hasDocument(documentId: string): boolean {
    return this.documents.has(documentId);
  }

  getDocumentMeta(documentId: string): IndexedDocumentMeta | null {
    return this.documents.get(documentId) ?? null;
  }

  getAllDocumentMeta(): IndexedDocumentMeta[] {
    return Array.from(this.documents.values());
  }

  getPostings(term: string): Posting[] | null {
    if (!term) return null;
    const postingList = this.dictionary.get(term.toLowerCase());
    if (!postingList) return null;
    return Array.from(postingList.postings.values());
  }

  getDocumentFrequency(term: string): number {
    if (!term) return 0;
    const postingList = this.dictionary.get(term.toLowerCase());
    return postingList ? postingList.documentFrequency : 0;
  }

  getTermFrequency(term: string, documentId: string): number {
    if (!term || !documentId) return 0;
    const postingList = this.dictionary.get(term.toLowerCase());
    if (!postingList) return 0;
    const posting = postingList.postings.get(documentId);
    return posting ? posting.termFrequency : 0;
  }

  getTerms(): string[] {
    return Array.from(this.dictionary.keys());
  }

  getStats(): IndexStats {
    const totalDocuments = this.documents.size;
    const totalTerms = this.dictionary.size;

    let totalPostings = 0;
    for (const pList of this.dictionary.values()) {
      totalPostings += pList.documentFrequency;
    }

    let sumDocLengths = 0;
    const fieldLengthSums: Record<FieldName, number> = {};
    const fieldDocCounts: Record<FieldName, number> = {};

    for (const doc of this.documents.values()) {
      sumDocLengths += doc.totalTerms;
      for (const [field, length] of Object.entries(doc.fieldLengths)) {
        fieldLengthSums[field] = (fieldLengthSums[field] || 0) + length;
        fieldDocCounts[field] = (fieldDocCounts[field] || 0) + 1;
      }
    }

    const avgDocumentLength = totalDocuments > 0 ? sumDocLengths / totalDocuments : 0;
    const avgFieldLengths: Record<FieldName, number> = {};
    for (const [field, sum] of Object.entries(fieldLengthSums)) {
      avgFieldLengths[field] = totalDocuments > 0 ? sum / totalDocuments : 0;
    }

    return {
      totalDocuments,
      totalTerms,
      totalPostings,
      avgDocumentLength,
      avgFieldLengths,
      lastUpdatedAt: this.lastUpdatedAt,
    };
  }

  clear(): void {
    this.dictionary.clear();
    this.documents.clear();
    this.lastUpdatedAt = new Date().toISOString();
  }

  // ── Persistence: Save to Disk ──────────────────────────────────────────────

  async save(targetDir?: string): Promise<void> {
    const dir = targetDir || this.defaultIndexDir;
    fs.mkdirSync(dir, { recursive: true });

    const stats = this.getStats();
    const documentsList = this.getAllDocumentMeta();

    const dictionaryList = Array.from(this.dictionary.values()).map(pList => ({
      term: pList.term,
      documentFrequency: pList.documentFrequency,
      postings: Array.from(pList.postings.values()),
    }));

    const payload: SerializedIndexPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      stats,
      documents: documentsList,
      dictionary: dictionaryList,
    };

    const tmpFile = path.join(dir, 'index-data.json.tmp');
    const finalFile = path.join(dir, 'index-data.json');

    fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf-8');
    fs.renameSync(tmpFile, finalFile);
  }

  // ── Persistence: Load from Disk ────────────────────────────────────────────

  async load(targetDir?: string): Promise<void> {
    const dir = targetDir || this.defaultIndexDir;
    const filePath = path.join(dir, 'index-data.json');

    if (!fs.existsSync(filePath)) {
      throw new Error(`Index file not found at: ${filePath}`);
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const payload = JSON.parse(raw) as SerializedIndexPayload;

    if (!payload || payload.version !== 1 || !Array.isArray(payload.documents)) {
      throw new Error('Invalid or corrupted index file format');
    }

    this.clear();

    // Reconstruct documents store
    for (const docMeta of payload.documents) {
      this.documents.set(docMeta.documentId, docMeta);
    }

    // Reconstruct dictionary and posting lists
    for (const item of payload.dictionary) {
      const postingsMap = new Map<string, Posting>();
      for (const posting of item.postings) {
        postingsMap.set(posting.documentId, posting);
      }

      this.dictionary.set(item.term, {
        term: item.term,
        documentFrequency: item.documentFrequency,
        postings: postingsMap,
      });
    }

    this.lastUpdatedAt = payload.createdAt || new Date().toISOString();
  }
}
