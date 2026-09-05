/**
 * @opensearch/indexer — Pipeline Types (Phase 9)
 *
 * Defines domain models, contracts, and data structures for the
 * document processing and tokenization pipeline:
 * - Token and positional metadata
 * - Field types and weighting configurations
 * - Processed document representations
 * - Processor options and interface
 */

import { DocumentRecord } from '@opensearch/storage';

export type FieldName = 'title' | 'headings' | 'description' | 'body' | string;

export interface TokenPosition {
  /** 0-based token index in the field sequence */
  position: number;
  /** Character start index in original raw text */
  startOffset: number;
  /** Character end index in original raw text */
  endOffset: number;
}

export interface Token {
  /** The normalized, processed term string */
  term: string;
  /** Positional metadata */
  position: number;
  startOffset: number;
  endOffset: number;
}

export interface FieldWeightConfig {
  /** Multiplier weight applied to title terms (default: 3.0) */
  title: number;
  /** Multiplier weight applied to headings terms (default: 2.0) */
  headings: number;
  /** Multiplier weight applied to description terms (default: 1.5) */
  description: number;
  /** Multiplier weight applied to body text terms (default: 1.0) */
  body: number;
  /** Default multiplier for any custom/dynamic fields */
  defaultWeight: number;
}

export interface ProcessedField {
  /** Field identifier (e.g. 'title', 'headings', 'description', 'body') */
  fieldName: FieldName;
  /** Configured weight/boost for this field */
  weight: number;
  /** Total token count in this field (including stop words if retained) */
  totalTokens: number;
  /** Ordered array of tokens extracted from this field */
  tokens: Token[];
  /** Term frequency map within this field: term -> count */
  termFrequencies: Map<string, number>;
}

export interface DocumentTermSummary {
  /** The normalized term */
  term: string;
  /** Total frequency across all fields in the document */
  totalFrequency: number;
  /** Weighted frequency across all fields (sum of count * fieldWeight) */
  weightedScore: number;
  /** Occurrence breakdown per field: fieldName -> count */
  fieldCounts: Map<FieldName, number>;
  /** Positions per field */
  fieldPositions: Map<FieldName, number[]>;
}

export interface ProcessedDocument {
  /** Document ID (UUID from storage DocumentRecord or assigned) */
  documentId: string;
  /** Canonical or source URL */
  url: string;
  /** SHA-256 hash of canonical URL */
  urlHash: string;
  /** Document title if present */
  title: string;
  /** Document description if present */
  description: string;
  /** Detected or declared language code (or null) */
  language: string | null;
  /** Processed fields map */
  fields: Map<FieldName, ProcessedField>;
  /** Aggregated term dictionary for this document: term -> summary */
  terms: Map<string, DocumentTermSummary>;
  /** Total word count across all fields */
  totalTokens: number;
  /** Total unique terms in the document */
  uniqueTerms: number;
  /** ISO timestamp when processing occurred */
  processedAt: string;
}

export interface DocumentProcessorOptions {
  /** Custom field weights (falls back to DEFAULT_FIELD_WEIGHTS) */
  fieldWeights?: Partial<FieldWeightConfig>;
  /** Minimum character length for valid tokens (default: 1) */
  minTokenLength?: number;
  /** Maximum character length for valid tokens (default: 64) */
  maxTokenLength?: number;
  /** Whether to filter out stop words (default: true) */
  removeStopWords?: boolean;
  /** Custom stop words set to use (falls back to DEFAULT_STOP_WORDS) */
  customStopWords?: Set<string>;
  /** Whether to strip/fold diacritics/accents (e.g., 'café' -> 'cafe') (default: true) */
  stripAccents?: boolean;
  /** Custom document ID generator if DocumentRecord lacks an ID */
  idGenerator?: () => string;
}

export interface RawDocumentInput {
  id?: string;
  url: string;
  urlHash?: string;
  title?: string;
  headings?: string;
  description?: string;
  bodyText?: string;
  language?: string | null;
}

export interface DocumentProcessor {
  /**
   * Processes a stored DocumentRecord or raw fields into a structured ProcessedDocument.
   * Safe execution: never throws on malformed or empty documents.
   */
  process(doc: DocumentRecord | RawDocumentInput): ProcessedDocument;

  /**
   * Processes a single text string into a token stream.
   */
  tokenizeText(text: string): Token[];

  /**
   * Normalizes a term string (canonical NFC, case folding, accent strip, punctuation strip).
   */
  normalizeTerm(term: string): string;
}
