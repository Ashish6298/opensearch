/**
 * @opensearch/indexer
 * Phase 9: Document Processing Pipeline — Complete Implementation
 */

// ── Pipeline Types ──────────────────────────────────────────
export type {
  FieldName,
  TokenPosition,
  Token,
  FieldWeightConfig,
  ProcessedField,
  DocumentTermSummary,
  ProcessedDocument,
  DocumentProcessorOptions,
  RawDocumentInput,
  DocumentProcessor,
} from './pipeline/pipeline-types.js';

// ── Text Normalizer ─────────────────────────────────────────
export { normalizeText, foldDiacritics, stripPunctuation } from './pipeline/normalizer.js';
export type { TextNormalizeOptions } from './pipeline/normalizer.js';

// ── Stop Words ──────────────────────────────────────────────
export { DEFAULT_STOP_WORDS, isStopWord } from './pipeline/stop-words.js';

// ── Tokenizer ───────────────────────────────────────────────
export { tokenize } from './pipeline/tokenizer.js';
export type { TokenizerOptions } from './pipeline/tokenizer.js';

// ── Field Weights ───────────────────────────────────────────
export { DEFAULT_FIELD_WEIGHTS, getFieldWeight } from './pipeline/field-weights.js';

// ── Document Processor ──────────────────────────────────────
export {
  DefaultDocumentProcessor,
  createDocumentProcessor,
} from './pipeline/document-processor.js';

// ── Phase 10: Inverted Index ─────────────────────────────────
export type {
  Posting,
  PostingList,
  IndexedDocumentMeta,
  IndexStats,
  SerializedIndexPayload,
  InvertedIndexOptions,
  InvertedIndex,
} from './index/index-types.js';

export { MemoryInvertedIndex } from './index/inverted-index.js';
export { createInvertedIndex } from './index/index-factory.js';

// ── Phase 11: Index Builder & Rebuild Pipeline ───────────────
export type {
  IndexBuildOptions,
  IndexBuildStats,
  IndexBuildSummary,
  IndexBuilder,
} from './builder/builder-types.js';

export { DefaultIndexBuilder } from './builder/index-builder.js';
export type { IndexBuilderOptions } from './builder/index-builder.js';

export { createIndexBuilder } from './builder/builder-factory.js';
export type { IndexBuilderFactoryOptions } from './builder/builder-factory.js';
