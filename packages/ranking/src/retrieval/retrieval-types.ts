/**
 * @opensearch/ranking — Candidate Retrieval Types (Phase 13)
 *
 * Defines domain models and interfaces for retrieving and merging
 * candidate document postings from the inverted index.
 */

import { IndexedDocumentMeta, Posting } from '@opensearch/indexer';
import { ParsedQuery } from '../query/query-types.js';

export type RetrievalMode = 'union' | 'intersection' | 'adaptive';

export interface TermPostingMatch {
  /** The normalized query term */
  term: string;
  /** Posting details for this term in the candidate document */
  posting: Posting;
}

export interface CandidateDocument {
  /** Unique document identifier */
  documentId: string;
  /** Document metadata cached from the index */
  documentMeta: IndexedDocumentMeta;
  /** List of query terms that matched in this document */
  matchedTerms: string[];
  /** Detailed posting records for each matched term */
  termPostings: Map<string, Posting>;
  /** Total count of distinct query terms matched */
  matchCount: number;
  /** Whether all required/positive query terms were matched in this document */
  isFullMatch: boolean;
  /** Whether all quoted exact phrases were satisfied in this document */
  phraseMatches: boolean;
}

export interface RetrievalOptions {
  /**
   * Retrieval candidate combination mode:
   * - 'union': OR combination (matches ANY positive query term)
   * - 'intersection': AND combination (matches ALL positive query terms)
   * - 'adaptive': Attempts intersection first; if candidates < minCandidates, falls back to union (default)
   */
  mode?: RetrievalMode;
  /** Maximum number of candidate documents to return (default: SEARCH_LIMITS.DEFAULT_MAX_CANDIDATES = 500) */
  maxCandidates?: number;
  /** Minimum candidates required before adaptive mode falls back to union (default: 10) */
  minCandidatesForAdaptive?: number;
  /** Whether to enforce negative term exclusion (default: true) */
  applyNegationFilter?: boolean;
}

export interface RetrievalStats {
  /** Query terms searched against the inverted index */
  searchedTerms: string[];
  /** Terms that had 0 postings in the index dictionary */
  missingTerms: string[];
  /** Total postings evaluated during candidate merging */
  totalPostingsEvaluated: number;
  /** Number of candidate documents retrieved after merging and filtering */
  candidateCount: number;
  /** Retrieval strategy effectively used ('union' or 'intersection') */
  effectiveMode: 'union' | 'intersection';
  /** Time spent in retrieval in milliseconds */
  durationMs: number;
}

export interface RetrievalResult {
  /** Array of candidate documents ready for scoring/ranking */
  candidates: CandidateDocument[];
  /** Retrieval diagnostics and metrics */
  stats: RetrievalStats;
}

export interface CandidateRetriever {
  /**
   * Retrieves candidate documents from an InvertedIndex for a parsed query.
   * Never throws on empty, missing, or malformed queries.
   */
  retrieve(query: ParsedQuery, options?: RetrievalOptions): RetrievalResult;
}
