/**
 * @opensearch/ranking — Quick Answer Types (Phase 104)
 *
 * Defines contracts, domain models, options, and metadata structures for:
 * - Deterministic extractive summaries based on retrieved search results
 * - Strict source content sanitization (treating all sources as untrusted)
 * - Verifiable, non-fabricated citations linking claims directly to source URLs
 * - Disagreement and insufficient evidence detection
 * - Input/output bounded generation
 * - End-to-end Local-only mode enforcement with zero paid LLM dependencies
 */

import type { SearchResultItem } from '../../results/result-types.js';

export type QuickAnswerStatus =
  | 'sufficient_evidence'
  | 'insufficient_evidence'
  | 'no_relevant_sources'
  | 'disagreement_detected';

export interface QuickAnswerCitation {
  /** 1-based index used for inline citation markers e.g. [1] */
  index: number;
  /** Unique identifier of the source document in the index or result set */
  documentId: string;
  /** Sanitized title of the source document */
  title: string;
  /** Validated canonical URL allowing users to open original sources directly */
  url: string;
  /** Extracted hostname / domain */
  domain: string;
  /** Exact authentic excerpt / substring extracted from the source document */
  snippetQuote: string;
  /** Optional publication date if authentic and verified */
  publishedAt?: string;
  /** Provenance categorization */
  sourceType: 'local' | 'web';
}

export interface QuickAnswerStatement {
  /** Extracted statement sentence (sanitized) */
  sentence: string;
  /** 1-based citation references corresponding to the supporting sources */
  citationIndices: number[];
  /** Computed relevance confidence score (0.0 to 1.0) */
  confidenceScore: number;
  /** Document ID of the primary supporting source */
  sourceDocumentId: string;
}

export interface QuickAnswerDisagreement {
  /** Whether conflicting factual claims were identified across sources */
  detected: boolean;
  /** High-level topic or subject of conflicting claims */
  topic?: string;
  /** Plain-language explanation of the disagreement */
  details?: string;
  /** Distinct opposing perspectives with their respective citation references */
  conflictingViewpoints?: Array<{
    claim: string;
    citationIndices: number[];
  }>;
}

export interface QuickAnswerModelInfo {
  /** Summarization approach: deterministic extractive rule-based or optional local model */
  type: 'extractive' | 'optional_model';
  /** Technical name of the extractive algorithm or model */
  name: string;
  /** Whether the model runs entirely locally without network egress */
  isLocal: boolean;
  /** Proof that no paid external LLM services are required */
  requiresPaidService: false;
  /** Whether model architecture and processing details are disclosed to user */
  disclosed: boolean;
  /** Descriptive human-readable summary of how the answer was synthesized */
  description: string;
}

export interface QuickAnswerProvenance {
  /** Number of retrieved documents evaluated as candidate sources */
  sourceDocumentsEvaluated: number;
  /** Total discrete candidate sentences parsed and evaluated */
  candidateSentencesEvaluated: number;
  /** Total characters of untrusted input processed */
  inputCharactersProcessed: number;
  /** Total characters in synthesized output summary */
  outputCharacters: number;
  /** Execution elapsed time in milliseconds */
  evaluationDurationMs: number;
  /** Whether execution ran strictly within local-only privacy boundaries */
  localOnly: boolean;
  /** ISO timestamp of evaluation */
  timestamp: string;
}

export interface QuickAnswerPayload {
  /** Status classification */
  status: QuickAnswerStatus;
  /** Synthesized concise summary containing inline citation markers e.g. "TypeScript is..." [1] */
  summary: string;
  /** Individual factual statements with verified citation linkages */
  statements: QuickAnswerStatement[];
  /** Verified citations linking directly to authentic retrieved source documents */
  citations: QuickAnswerCitation[];
  /** Whether sufficient credible evidence was found */
  hasSufficientEvidence: boolean;
  /** Plain-language explanation when evidence is insufficient */
  insufficientEvidenceReason?: string;
  /** Disagreement report if conflicting viewpoints or facts were detected */
  disagreement?: QuickAnswerDisagreement;
  /** Model attribution and privacy disclosure */
  model: QuickAnswerModelInfo;
  /** Execution provenance telemetry */
  provenance: QuickAnswerProvenance;
}

export interface QuickAnswerOptions {
  /** Maximum number of top retrieved documents to evaluate (default: 5) */
  maxInputDocuments?: number;
  /** Maximum untrusted characters accepted per document (default: 1200) */
  maxInputCharsPerDoc?: number;
  /** Maximum total untrusted input characters across all documents (default: 5000) */
  maxTotalInputChars?: number;
  /** Maximum number of sentences in synthesized summary (default: 3) */
  maxOutputSentences?: number;
  /** Maximum total character length of synthesized summary (default: 450) */
  maxOutputChars?: number;
  /** Minimum character length for an acceptable sentence (default: 25) */
  minSentenceChars?: number;
  /** Maximum character length for a candidate sentence (default: 280) */
  maxSentenceChars?: number;
  /** Minimum relevance score threshold to consider evidence sufficient (default: 0.20) */
  minRelevanceThreshold?: number;
  /** Whether Local-only mode is active (strictly restricts sources to local index) */
  isLocalOnly?: boolean;
  /** Optional model configuration (kept disabled by default unless explicitly configured) */
  optionalModelConfig?: {
    enabled: boolean;
    providerName?: string;
  };
}

export interface IQuickAnswerEngine {
  /**
   * Generates a deterministic extractive Quick Answer based on retrieved search results.
   *
   * @param query Raw or normalized search query string
   * @param results Ranked search result items retrieved for the query
   * @param options Bounded execution and privacy options
   * @returns QuickAnswerPayload with verified citations or insufficient evidence status
   */
  generate(
    query: string,
    results: SearchResultItem[],
    options?: QuickAnswerOptions,
  ): QuickAnswerPayload;
}
