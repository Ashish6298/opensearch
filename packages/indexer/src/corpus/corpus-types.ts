/**
 * @opensearch/indexer — Corpus Types (Phase 75)
 *
 * Defines contracts and domain models for reproducible corpus expansion:
 * - Controlled staged corpus tiers (demo 1k, benchmark 10k, large 100k)
 * - Source provenance, license compliance, and acquisition dates
 * - Canonical URLs, content hashes, and deduplication keys
 * - Corpus manifest and generation summaries with recorded sizes
 */

export type CorpusTier = 'demo' | 'benchmark' | 'large';

export interface CorpusSourceMetadata {
  id: string;
  name: string;
  license: string;
  termsUrl: string;
  attribution: string;
  permittedUse: string;
}

export interface CorpusDocument {
  /** Unique document identifier */
  id: string;
  /** Canonical public web URL */
  canonicalUrl: string;
  /** SHA-256 hash of canonical URL for deduplication and joins */
  urlHash: string;
  /** Document title */
  title: string;
  /** Document meta description */
  description: string;
  /** Section headings separated by newlines */
  headings: string;
  /** Document body text content */
  bodyText: string;
  /** Provenance source identifier (e.g. 'wikimedia-open', 'ietf-rfc', 'mdn-open-docs') */
  source: string;
  /** License governing document content (e.g. 'CC BY-SA 4.0', 'Public Domain / IETF Trust') */
  license: string;
  /** Reference URL for the license terms */
  licenseUrl: string;
  /** ISO 8601 timestamp of data acquisition */
  acquiredAt: string;
  /** SHA-256 content hash of normalized body text for deduplication */
  contentHash: string;
  /** Detected or standard language code (e.g. 'en') */
  language: string;
  /** Categorization and topic tags */
  tags: string[];
  /** Calculated word count of body text */
  wordCount: number;
  /** Length of visible content in bytes */
  contentLength: number;
  /** Outbound canonical URLs referenced in document */
  outboundLinks: string[];
}

export interface CorpusSourceSummary {
  count: number;
  license: string;
  termsUrl: string;
}

export interface CorpusManifest {
  /** Target corpus scale tier */
  tier: CorpusTier;
  /** Actual verified document count */
  documentCount: number;
  /** Aggregate word count across all documents */
  totalWords: number;
  /** Aggregate content size in uncompressed bytes */
  totalBytes: number;
  /** Average words per document */
  averageDocumentLength: number;
  /** Number of distinct normalized terms across the corpus */
  uniqueVocabularyCount: number;
  /** ISO 8601 generation timestamp */
  generatedAt: string;
  /** Reproducible PRNG seed used for deterministic generation */
  reproducibleSeed: number | string;
  /** Per-source document distribution and license compliance */
  sources: Record<string, CorpusSourceSummary>;
  /** SHA-256 checksum of all document content hashes sorted deterministically */
  contentChecksum: string;
}

export interface CorpusGenerationOptions {
  /** Target tier: demo (1,000), benchmark (10,000), large (100,000) */
  tier?: CorpusTier;
  /** Exact target document count (overrides tier default if specified) */
  targetCount: number;
  /** Seed for deterministic pseudo-random sequence generation (default: 42) */
  seed?: number | string;
  /** Optional directory to serialize JSONL documents and manifest.json */
  outputDir?: string;
  /** Whether to filter out duplicate URLs and content hashes (default: true) */
  deduplicate?: boolean;
  /** Optional restriction to specific source IDs */
  sources?: string[];
}

export interface CorpusIngestionResult {
  totalProcessed: number;
  inserted: number;
  duplicatesSkipped: number;
  durationMs: number;
  manifest: CorpusManifest;
  errors: string[];
  outputPath?: string;
}
