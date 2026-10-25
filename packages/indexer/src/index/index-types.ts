/**
 * @opensearch/indexer — Inverted Index Types (Phase 10 & Phase 73)
 *
 * Defines the domain models, schema specifications, and interfaces for the core inverted index:
 * - Posting: record of a term's occurrence in a specific document (frequencies + positions)
 * - PostingList: array/map of postings for a specific term with document frequency
 * - IndexedDocumentMeta: document-level metrics (total terms, field lengths, URL, title)
 * - IndexStats: statistical overview and length distributions
 * - SerializedIndexPayload: strictly versioned disk persistence schema
 * - InvertedIndex: primary searchable index interface
 * - Diagnostic errors with actionable recovery suggestions
 */

import { FieldName, ProcessedDocument } from '../pipeline/pipeline-types.js';

export const CURRENT_INDEX_SCHEMA_VERSION = 1;
export const SUPPORTED_INDEX_SCHEMA_VERSIONS: readonly number[] = [1];
export const INDEX_FORMAT_IDENTIFIER = 'opensearch-inverted-index';
export const INDEX_FILE_NAME = 'index-data.json';
export const INDEX_TMP_FILE_NAME = 'index-data.json.tmp';

export interface Posting {
  /** Target document ID */
  documentId: string;
  /** Total frequency of this term across all fields in the document */
  termFrequency: number;
  /** Breakdown of term frequency per field: fieldName -> count */
  fieldTermFrequencies: Record<FieldName, number>;
  /** Positional occurrences per field: fieldName -> sequential token positions */
  fieldPositions: Record<FieldName, number[]>;
}

export interface PostingList {
  /** The normalized term string */
  term: string;
  /** Total number of documents containing this term */
  documentFrequency: number;
  /** Map of documentId -> Posting for fast mutation/lookup */
  postings: Map<string, Posting>;
}

export interface IndexedDocumentMeta {
  /** Unique document identifier */
  documentId: string;
  /** Canonical or source URL */
  url: string;
  /** SHA-256 hash of canonical URL */
  urlHash: string;
  /** Document title */
  title: string;
  /** Document description or summary preview */
  description?: string;
  /** Detected or declared language */
  language: string | null;
  /** Total number of tokens in the document (document length) */
  totalTerms: number;
  /** Total terms per field: fieldName -> token count */
  fieldLengths: Record<FieldName, number>;
  /** Timestamp when document was added to the index */
  indexedAt: string;
  /** Document modification timestamp if known (ISO or HTTP date) */
  lastModified?: string;
  /** Timestamp when document was crawled if known */
  lastCrawledAt?: string;
  /** SHA-256 content fingerprint for change detection and idempotent indexing */
  fingerprint?: string;
}

export interface IndexStats {
  /** Total documents currently indexed */
  totalDocuments: number;
  /** Total unique terms in the dictionary */
  totalTerms: number;
  /** Total posting entries across all terms */
  totalPostings: number;
  /** Average document length (in tokens) across all indexed documents */
  avgDocumentLength: number;
  /** Average field lengths: fieldName -> average token count */
  avgFieldLengths: Record<FieldName, number>;
  /** ISO timestamp when index was last updated */
  lastUpdatedAt: string;
}

export interface SerializedIndexPayload {
  /** Canonical schema version number */
  schemaVersion: number;
  /** Legacy alias for backward compatibility with pre-v1.5 indexes */
  version?: number;
  /** Canonical format signature identifier */
  format?: string;
  /** SHA-256 integrity checksum over sorted document IDs and terms */
  checksum?: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** Operational statistics snapshot */
  stats: IndexStats;
  /** Array of indexed document metadata headers */
  documents: IndexedDocumentMeta[];
  /** Inverted dictionary array with posting lists */
  dictionary: Array<{
    term: string;
    documentFrequency: number;
    postings: Posting[];
  }>;
}

export interface InvertedIndexOptions {
  /** Path to index directory for persistence operations */
  indexDir?: string;
}

export interface InvertedIndex {
  /**
   * Adds or replaces a processed document in the index.
   */
  addDocument(doc: ProcessedDocument): void;

  /**
   * Updates an existing document in the index (equivalent to atomic remove + add).
   */
  updateDocument(doc: ProcessedDocument): void;

  /**
   * Removes a document and all its term postings from the index.
   * Returns true if document existed and was removed, false otherwise.
   */
  removeDocument(documentId: string): boolean;

  /**
   * Checks if a document exists in the index.
   */
  hasDocument(documentId: string): boolean;

  /**
   * Returns metadata for an indexed document, or null if not found.
   */
  getDocumentMeta(documentId: string): IndexedDocumentMeta | null;

  /**
   * Returns all indexed document metadata objects.
   */
  getAllDocumentMeta(): IndexedDocumentMeta[];

  /**
   * Retrieves the posting list for a given term, or null if term not in dictionary.
   */
  getPostings(term: string): Posting[] | null;

  /**
   * Returns the Document Frequency (DF) for a term (0 if not in dictionary).
   */
  getDocumentFrequency(term: string): number;

  /**
   * Returns the Term Frequency (TF) of a term in a specific document (0 if not found).
   */
  getTermFrequency(term: string, documentId: string): number;

  /**
   * Returns all terms currently in the dictionary.
   */
  getTerms(): string[];

  /**
   * Returns current index statistics.
   */
  getStats(): IndexStats;

  /**
   * Clears all documents, postings, and dictionary terms from memory.
   */
  clear(): void;

  /**
   * Serializes and saves the index to disk in the specified directory.
   */
  save(targetDir?: string): Promise<void>;

  /**
   * Loads and deserializes index data from disk in the specified directory.
   */
  load(targetDir?: string): Promise<void>;
}

/**
 * Thrown when an index file is corrupt, truncated, or structurally malformed.
 */
export class IndexCorruptError extends Error {
  public readonly recoverySuggestion: string;
  public readonly diagnostics?: Record<string, unknown>;

  constructor(
    message: string,
    recoverySuggestion: string,
    diagnostics?: Record<string, unknown>,
  ) {
    super(`${message}. Action: ${recoverySuggestion}`);
    this.name = 'IndexCorruptError';
    this.recoverySuggestion = recoverySuggestion;
    this.diagnostics = diagnostics;
  }
}

/**
 * Thrown when an index schema version is incompatible with current engine version.
 */
export class IndexIncompatibleSchemaError extends Error {
  public readonly foundVersion: number;
  public readonly supportedVersions: readonly number[];
  public readonly recoverySuggestion: string;

  constructor(
    foundVersion: number,
    supportedVersions: readonly number[],
    recoverySuggestion: string,
  ) {
    super(
      `Index schema version ${foundVersion} is incompatible with supported versions [${supportedVersions.join(', ')}]. Action: ${recoverySuggestion}`,
    );
    this.name = 'IndexIncompatibleSchemaError';
    this.foundVersion = foundVersion;
    this.supportedVersions = supportedVersions;
    this.recoverySuggestion = recoverySuggestion;
  }
}
