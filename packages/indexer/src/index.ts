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

// ── Phase 10 & 73: Inverted Index & Schema Lifecycle Audit ──
export {
  CURRENT_INDEX_SCHEMA_VERSION,
  SUPPORTED_INDEX_SCHEMA_VERSIONS,
  INDEX_FORMAT_IDENTIFIER,
  INDEX_FILE_NAME,
  INDEX_TMP_FILE_NAME,
  IndexCorruptError,
  IndexIncompatibleSchemaError,
} from './index/index-types.js';
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

export {
  validateIndexFile,
  validateIndexPayload,
  computeIndexChecksum,
} from './index/index-validator.js';
export type { IndexValidationResult } from './index/index-validator.js';

// ── Phase 11: Index Builder & Rebuild Pipeline ───────────────
export type {
  IndexBuildOptions,
  IndexBuildStats,
  IndexBuildSummary,
  IndexBuilder,
  IndexDocumentResult,
  GenerationCleanupOptions,
  GenerationCleanupResult,
  IndexHealthActiveGeneration,
  IndexHealthGenerations,
  IndexHealthPendingDocuments,
  IndexHealth,
} from './builder/builder-types.js';

export { DefaultIndexBuilder, computeDocumentFingerprint } from './builder/index-builder.js';
export type { IndexBuilderOptions } from './builder/index-builder.js';

export { createIndexBuilder } from './builder/builder-factory.js';
export type { IndexBuilderFactoryOptions } from './builder/builder-factory.js';

// ── Phase 23: Corpus Quality & Duplicate Analysis ────────────
export type { DocumentQualityReport, CorpusQualitySummary } from './builder/quality-checker.js';
export {
  computeContentHash,
  evaluateDocumentQuality,
  analyzeCorpusQuality,
} from './builder/quality-checker.js';

// ── Phase 35: Prefix Trie & Autocomplete (V1.2.0) ────────────
export type { SuggestionEntry, SuggestionMatch, PrefixTrieOptions } from './suggest/prefix-trie.js';
export { PrefixTrie, TrieNode, createPrefixTrie } from './suggest/prefix-trie.js';

// ── Phase 47: Dynamic Snippet Highlighting & Windowing (V1.3.0) ───
export type {
  SnippetWindowOptions,
  ExtractedSnippetWindow,
} from './snippet/snippet-window.js';
export {
  SnippetWindowExtractor,
  createSnippetWindowExtractor,
} from './snippet/snippet-window.js';

// ── Phase 59: Zero-Trace Reader Mode Extractor (V1.4.0) ──────────
export type { ReaderDocument } from './reader/reader-extractor.js';
export { ReaderExtractor } from './reader/reader-extractor.js';

// ── Phase 75: Reproducible Corpus Expansion (V1.5.0) ──────────────
export type {
  CorpusTier,
  CorpusSourceMetadata,
  CorpusDocument,
  CorpusSourceSummary,
  CorpusManifest,
  CorpusGenerationOptions,
  CorpusIngestionResult,
} from './corpus/corpus-types.js';

export {
  PERMITTED_CORPUS_SOURCES,
  getDemoCorpus,
} from './corpus/demo-corpus.js';

export {
  SeededRandom,
  generateReproducibleCorpus,
} from './corpus/corpus-generator.js';

export {
  validateCorpusDocument,
  ingestCorpus,
  loadCorpusFromFile,
  verifyCorpusChecksum,
} from './corpus/corpus-ingestion.js';
export type { IngestionOptions } from './corpus/corpus-ingestion.js';

