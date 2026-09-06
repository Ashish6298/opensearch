/**
 * @opensearch/ranking — Candidate Retriever Implementation (Phase 13)
 *
 * Coordinates candidate retrieval from the inverted index:
 * 1. Term lookup & posting-list retrieval for each positive query term
 * 2. Candidate merging across multiple posting lists
 * 3. Boolean / intersection & union combination modes (with adaptive fallback)
 * 4. Negative term exclusion (purges documents matching any `negatedTerms`)
 * 5. Phrase verification (inspects field positional sequences for exact phrase matches)
 * 6. Result limits enforcement (`SEARCH_LIMITS.DEFAULT_MAX_CANDIDATES = 500`)
 * 7. Safe fallback for missing terms, empty queries, or empty indices
 */

import { InvertedIndex, Posting } from '@opensearch/indexer';
import { SEARCH_LIMITS } from '@opensearch/shared';
import { ParsedPhrase, ParsedQuery } from '../query/query-types.js';
import {
  CandidateDocument,
  CandidateRetriever,
  RetrievalOptions,
  RetrievalResult,
  RetrievalStats,
} from './retrieval-types.js';

export interface IndexCandidateRetrieverOptions {
  /** Target InvertedIndex instance to query */
  index: InvertedIndex;
  /** Default retrieval limits */
  defaultMaxCandidates?: number;
}

export class IndexCandidateRetriever implements CandidateRetriever {
  private readonly index: InvertedIndex;
  private readonly defaultMaxCandidates: number;

  constructor(options: IndexCandidateRetrieverOptions) {
    this.index = options.index;
    this.defaultMaxCandidates =
      options.defaultMaxCandidates ?? SEARCH_LIMITS.DEFAULT_MAX_CANDIDATES;
  }

  retrieve(query: ParsedQuery, options: RetrievalOptions = {}): RetrievalResult {
    const startMs = Date.now();
    const maxCandidates = options.maxCandidates ?? this.defaultMaxCandidates;
    const mode = options.mode ?? 'adaptive';
    const minCandidatesForAdaptive = options.minCandidatesForAdaptive ?? 10;
    const applyNegationFilter = options.applyNegationFilter ?? true;

    const searchedTerms = query.terms;
    const missingTerms: string[] = [];
    let totalPostingsEvaluated = 0;

    // Fast-path: empty query
    if (query.isEmpty || searchedTerms.length === 0) {
      return {
        candidates: [],
        stats: {
          searchedTerms: [],
          missingTerms: [],
          totalPostingsEvaluated: 0,
          candidateCount: 0,
          effectiveMode: 'union',
          durationMs: Date.now() - startMs,
        },
      };
    }

    // 1. Retrieve posting lists for each unique positive query term
    const termPostingsMap = new Map<string, Posting[]>();

    for (const term of query.uniqueTerms) {
      const postings = this.index.getPostings(term);
      if (postings && postings.length > 0) {
        termPostingsMap.set(term, postings);
        totalPostingsEvaluated += postings.length;
      } else {
        missingTerms.push(term);
      }
    }

    // Fast-path: no terms found in index dictionary
    if (termPostingsMap.size === 0) {
      return {
        candidates: [],
        stats: {
          searchedTerms,
          missingTerms,
          totalPostingsEvaluated: 0,
          candidateCount: 0,
          effectiveMode: 'union',
          durationMs: Date.now() - startMs,
        },
      };
    }

    // 2. Identify excluded documents matching any negated term
    const excludedDocIds = new Set<string>();
    if (applyNegationFilter && query.negatedTerms.length > 0) {
      for (const negTerm of query.negatedTerms) {
        const negPostings = this.index.getPostings(negTerm);
        if (negPostings) {
          for (const np of negPostings) {
            excludedDocIds.add(np.documentId);
          }
        }
      }
    }

    // 3. Aggregate all candidate matches per document
    // docId -> { term -> Posting }
    const docMatches = new Map<string, Map<string, Posting>>();

    for (const [term, postings] of termPostingsMap.entries()) {
      for (const posting of postings) {
        const docId = posting.documentId;
        if (excludedDocIds.has(docId)) {
          continue;
        }

        let currentDocMap = docMatches.get(docId);
        if (!currentDocMap) {
          currentDocMap = new Map<string, Posting>();
          docMatches.set(docId, currentDocMap);
        }
        currentDocMap.set(term, posting);
      }
    }

    const totalUniqueQueryTerms = query.uniqueTerms.length;

    // Helper: builds CandidateDocument objects from docId list
    const buildCandidates = (docIds: string[]): CandidateDocument[] => {
      const results: CandidateDocument[] = [];

      for (const docId of docIds) {
        const docMeta = this.index.getDocumentMeta(docId);
        if (!docMeta) {
          continue;
        }

        const termsMap = docMatches.get(docId) ?? new Map<string, Posting>();
        const matchedTerms = Array.from(termsMap.keys());
        const matchCount = matchedTerms.length;
        const isFullMatch = matchCount === totalUniqueQueryTerms;

        // Verify quoted phrase containment if query contains phrases
        const phraseMatches = this.verifyPhrases(query.phrases, termsMap);

        results.push({
          documentId: docId,
          documentMeta: docMeta,
          matchedTerms,
          termPostings: termsMap,
          matchCount,
          isFullMatch,
          phraseMatches,
        });

        if (results.length >= maxCandidates) {
          break;
        }
      }

      return results;
    };

    // 4. Combine candidates according to specified or adaptive retrieval mode
    let effectiveMode: 'union' | 'intersection' = 'union';
    let candidateDocIds: string[] = [];

    // Intersection list: documents that matched ALL searched positive terms
    const intersectionDocIds: string[] = [];
    // Union list: documents that matched at least ONE positive term
    const unionDocIds: string[] = [];

    for (const [docId, matchedMap] of docMatches.entries()) {
      unionDocIds.push(docId);
      if (matchedMap.size === totalUniqueQueryTerms) {
        intersectionDocIds.push(docId);
      }
    }

    // Sort candidates by matchCount descending so higher coverage appears first
    unionDocIds.sort((a, b) => {
      const matchA = docMatches.get(a)?.size ?? 0;
      const matchB = docMatches.get(b)?.size ?? 0;
      return matchB - matchA;
    });

    if (mode === 'intersection') {
      effectiveMode = 'intersection';
      candidateDocIds = intersectionDocIds;
    } else if (mode === 'union') {
      effectiveMode = 'union';
      candidateDocIds = unionDocIds;
    } else {
      // Adaptive mode: use intersection if sufficient results; otherwise union
      if (
        intersectionDocIds.length >= minCandidatesForAdaptive ||
        intersectionDocIds.length >= totalUniqueQueryTerms
      ) {
        effectiveMode = 'intersection';
        candidateDocIds = intersectionDocIds;
      } else {
        effectiveMode = 'union';
        candidateDocIds = unionDocIds;
      }
    }

    const candidates = buildCandidates(candidateDocIds);

    const stats: RetrievalStats = {
      searchedTerms,
      missingTerms,
      totalPostingsEvaluated,
      candidateCount: candidates.length,
      effectiveMode,
      durationMs: Date.now() - startMs,
    };

    return {
      candidates,
      stats,
    };
  }

  /**
   * Verifies whether all quoted phrases occur as adjacent positional sequences
   * within any common field in the candidate document.
   */
  private verifyPhrases(phrases: ParsedPhrase[], docTermPostings: Map<string, Posting>): boolean {
    if (!phrases || phrases.length === 0) {
      return true;
    }

    for (const phrase of phrases) {
      if (phrase.terms.length <= 1) {
        continue;
      }

      let phraseFoundInAnyField = false;

      // Extract postings for all terms in phrase
      const phrasePostings: Posting[] = [];
      let allTermsPresent = true;
      for (const pTerm of phrase.terms) {
        const posting = docTermPostings.get(pTerm);
        if (!posting) {
          allTermsPresent = false;
          break;
        }
        phrasePostings.push(posting);
      }

      if (!allTermsPresent) {
        return false;
      }

      // Check each field present in first term's posting
      const firstPosting = phrasePostings[0];
      if (!firstPosting) {
        return false;
      }

      for (const fieldName of Object.keys(firstPosting.fieldPositions)) {
        const firstPositions = firstPosting.fieldPositions[fieldName] ?? [];
        for (const startPos of firstPositions) {
          let sequenceMatched = true;
          for (let i = 1; i < phrase.terms.length; i++) {
            const expectedPos = startPos + i;
            const nextPosting = phrasePostings[i];
            const fieldPositions = nextPosting?.fieldPositions[fieldName] ?? [];
            if (!fieldPositions.includes(expectedPos)) {
              sequenceMatched = false;
              break;
            }
          }
          if (sequenceMatched) {
            phraseFoundInAnyField = true;
            break;
          }
        }
        if (phraseFoundInAnyField) {
          break;
        }
      }

      if (!phraseFoundInAnyField) {
        return false;
      }
    }

    return true;
  }
}

/**
 * Factory creating a CandidateRetriever for an InvertedIndex.
 */
export function createCandidateRetriever(
  index: InvertedIndex,
  options: Partial<IndexCandidateRetrieverOptions> = {},
): CandidateRetriever {
  return new IndexCandidateRetriever({
    index,
    ...options,
  });
}
