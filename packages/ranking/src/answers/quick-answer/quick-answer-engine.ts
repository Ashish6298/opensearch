/**
 * @opensearch/ranking — Quick Answer Engine (Phase 104)
 *
 * Implements deterministic, privacy-first extractive summarization of search results:
 * - 100% local rule-based sentence selection without requiring paid LLM services
 * - Optional models strictly disabled by default and disclosed if configured
 * - Verified citation linkages: strictly prevents citation fabrication
 * - Detects insufficient evidence and conflicting cross-source viewpoints
 * - Full input and output budgeting
 * - End-to-end Local-Only mode compliance with zero external network egress
 */

import type { SearchResultItem } from '../../results/result-types.js';
import {
  IQuickAnswerEngine,
  QuickAnswerCitation,
  QuickAnswerOptions,
  QuickAnswerPayload,
  QuickAnswerStatement,
} from './quick-answer-types.js';
import {
  sanitizeUntrustedText,
  validateSourceUrl,
} from './untrusted-content-sanitizer.js';
import {
  detectDisagreement,
} from './disagreement-detector.js';
import {
  isBoilerplateOrLowQuality,
  scoreCandidateSentence,
  ScoredSentence,
  selectTopExtractiveSentences,
  splitIntoSentences,
  tokenizeText,
} from './extractive-sentence-selector.js';

export const DEFAULT_QUICK_ANSWER_OPTIONS: Required<Omit<QuickAnswerOptions, 'optionalModelConfig'>> & {
  optionalModelConfig: { enabled: boolean; providerName?: string };
} = {
  maxInputDocuments: 5,
  maxInputCharsPerDoc: 1200,
  maxTotalInputChars: 5000,
  maxOutputSentences: 3,
  maxOutputChars: 450,
  minSentenceChars: 25,
  maxSentenceChars: 280,
  minRelevanceThreshold: 0.20,
  isLocalOnly: false,
  optionalModelConfig: {
    enabled: false, // Strict requirement: kept disabled by default
  },
};

export class QuickAnswerEngine implements IQuickAnswerEngine {
  private readonly defaultOptions: typeof DEFAULT_QUICK_ANSWER_OPTIONS;

  constructor(options: Partial<QuickAnswerOptions> = {}) {
    this.defaultOptions = {
      ...DEFAULT_QUICK_ANSWER_OPTIONS,
      ...options,
      optionalModelConfig: {
        ...DEFAULT_QUICK_ANSWER_OPTIONS.optionalModelConfig,
        ...(options.optionalModelConfig || {}),
      },
    };
  }

  /**
   * Generates a deterministic extractive Quick Answer based on retrieved search results.
   */
  public generate(
    query: string,
    results: SearchResultItem[],
    options: Partial<QuickAnswerOptions> = {},
  ): QuickAnswerPayload {
    const startMs = Date.now();
    const opts = {
      ...this.defaultOptions,
      ...options,
      optionalModelConfig: {
        ...this.defaultOptions.optionalModelConfig,
        ...(options.optionalModelConfig || {}),
      },
    };

    const isLocalOnly = Boolean(opts.isLocalOnly);
    const cleanQuery = (query || '').trim();
    const queryTokens = tokenizeText(cleanQuery);

    // Initial empty provenance template
    const provenance = {
      sourceDocumentsEvaluated: 0,
      candidateSentencesEvaluated: 0,
      inputCharactersProcessed: 0,
      outputCharacters: 0,
      evaluationDurationMs: 0,
      localOnly: isLocalOnly,
      timestamp: new Date().toISOString(),
    };

    const modelInfo = {
      type: 'extractive' as const,
      name: 'deterministic-extractive-v1',
      isLocal: true,
      requiresPaidService: false as const,
      disclosed: true,
      description: 'Deterministic extractive sentence selection and citation linking over verified search results.',
    };

    // 1. Check for empty query or zero retrieved results
    if (!cleanQuery || queryTokens.length === 0 || !results || results.length === 0) {
      provenance.evaluationDurationMs = Date.now() - startMs;
      return {
        status: 'no_relevant_sources',
        summary: '',
        statements: [],
        citations: [],
        hasSufficientEvidence: false,
        insufficientEvidenceReason: 'No relevant search results were available to synthesize a quick answer.',
        model: modelInfo,
        provenance,
      };
    }

    // 2. Select input documents within bounds
    // In Local-only mode, only consider local results if marked, or results present in the local execution
    let candidateDocs = results;
    if (isLocalOnly) {
      // In local-only mode, all results must be from local index
      candidateDocs = results.filter(r => !r.source || r.source === 'local-index' || r.source === 'local');
      if (candidateDocs.length === 0) {
        provenance.evaluationDurationMs = Date.now() - startMs;
        return {
          status: 'insufficient_evidence',
          summary: '',
          statements: [],
          citations: [],
          hasSufficientEvidence: false,
          insufficientEvidenceReason: 'Local-only search mode active: No local index sources available with sufficient evidence.',
          model: modelInfo,
          provenance,
        };
      }
    }

    const boundedDocs = candidateDocs.slice(0, opts.maxInputDocuments);
    provenance.sourceDocumentsEvaluated = boundedDocs.length;

    // 3. Extract and sanitize candidate sentences from untrusted input
    const allCandidateSentences: ScoredSentence[] = [];
    let totalInputChars = 0;

    for (let docIdx = 0; docIdx < boundedDocs.length; docIdx++) {
      if (totalInputChars >= opts.maxTotalInputChars) break;

      const doc = boundedDocs[docIdx];
      if (!doc) continue;

      const docRank = doc.rank || docIdx + 1;
      const docTitle = sanitizeUntrustedText(doc.title || '', 200);
      const docTitleTokens = tokenizeText(docTitle);

      // Extract raw text sources from document: snippet, body, or description
      const rawBody = (doc as unknown as { content?: string; body?: string; description?: string }).content
        || (doc as unknown as { description?: string }).description
        || doc.snippet
        || '';

      const sanitizedBody = sanitizeUntrustedText(rawBody, opts.maxInputCharsPerDoc);
      totalInputChars += sanitizedBody.length + docTitle.length;

      // Segment text into discrete sentences
      const rawSentences = splitIntoSentences(sanitizedBody);
      provenance.candidateSentencesEvaluated += rawSentences.length;

      const sourceType: 'local' | 'web' = (doc.source === 'local-index' || doc.source === 'local') ? 'local' : 'web';
      const safeUrl = validateSourceUrl(doc.url);

      for (let sIdx = 0; sIdx < rawSentences.length; sIdx++) {
        const sentenceText = rawSentences[sIdx];
        if (!sentenceText) continue;

        if (isBoilerplateOrLowQuality(sentenceText, opts.minSentenceChars, opts.maxSentenceChars)) {
          continue;
        }

        const scored = scoreCandidateSentence(
          sentenceText,
          queryTokens,
          docTitleTokens,
          docRank,
          sIdx,
        );

        allCandidateSentences.push({
          sentence: sentenceText,
          originalText: sentenceText,
          documentId: doc.documentId,
          documentRank: docRank,
          documentTitle: docTitle || doc.domain || 'Source Document',
          documentUrl: safeUrl,
          documentDomain: doc.domain || 'local',
          sourceType,
          publishedAt: doc.publishedAt,
          sentenceIndex: sIdx,
          score: scored.score,
          termMatchCount: scored.termMatchCount,
          tokens: scored.tokens,
        });
      }
    }

    provenance.inputCharactersProcessed = totalInputChars;

    // 4. Insufficient Evidence Check
    // If no candidate sentences scored above threshold or query matches are negligible
    const maxScore = allCandidateSentences.reduce((max, s) => Math.max(max, s.score), 0);
    const hasAdequateMatches = allCandidateSentences.some(s => s.termMatchCount >= 1 && s.score >= opts.minRelevanceThreshold);

    if (allCandidateSentences.length === 0 || !hasAdequateMatches || maxScore < opts.minRelevanceThreshold) {
      provenance.evaluationDurationMs = Date.now() - startMs;
      return {
        status: 'insufficient_evidence',
        summary: '',
        statements: [],
        citations: [],
        hasSufficientEvidence: false,
        insufficientEvidenceReason: 'Retrieved search results do not provide sufficient verified evidence to summarize an authoritative answer.',
        model: modelInfo,
        provenance,
      };
    }

    // 5. Select top extractive sentences with diversity filtering
    const topSentences = selectTopExtractiveSentences(
      allCandidateSentences,
      opts.maxOutputSentences,
      opts.maxOutputChars,
    );

    if (topSentences.length === 0) {
      provenance.evaluationDurationMs = Date.now() - startMs;
      return {
        status: 'insufficient_evidence',
        summary: '',
        statements: [],
        citations: [],
        hasSufficientEvidence: false,
        insufficientEvidenceReason: 'Unable to extract coherent, high-confidence sentences from candidate search results.',
        model: modelInfo,
        provenance,
      };
    }

    // 6. Build Citations (Acceptance criterion: Quick Answer does not fabricate citations)
    // Map document IDs to 1-based citation index
    const citationMap = new Map<string, QuickAnswerCitation>();
    let nextCitationIndex = 1;

    for (const item of topSentences) {
      if (!citationMap.has(item.documentId)) {
        citationMap.set(item.documentId, {
          index: nextCitationIndex++,
          documentId: item.documentId,
          title: item.documentTitle,
          url: item.documentUrl,
          domain: item.documentDomain,
          snippetQuote: item.sentence, // Exact authentic substring from source document
          publishedAt: item.publishedAt,
          sourceType: item.sourceType,
        });
      }
    }

    const citations = Array.from(citationMap.values()).sort((a, b) => a.index - b.index);

    // 7. Detect Disagreement across candidate passages
    const passagesForDisagreement = topSentences.map(s => {
      const cit = citationMap.get(s.documentId)!;
      return {
        sentence: s.sentence,
        citationIndex: cit.index,
        documentId: s.documentId,
        sourceDomain: s.documentDomain,
      };
    });

    const disagreement = detectDisagreement(passagesForDisagreement);

    // 8. Build Statements & Synthesize Inline Summary
    const statements: QuickAnswerStatement[] = [];
    const summarySegments: string[] = [];

    for (const item of topSentences) {
      const citation = citationMap.get(item.documentId)!;
      statements.push({
        sentence: item.sentence,
        citationIndices: [citation.index],
        confidenceScore: Math.round(item.score * 100) / 100,
        sourceDocumentId: item.documentId,
      });

      // Append clean sentence with inline citation marker e.g. "Some fact. [1]"
      let sentenceWithPunctuation = item.sentence.trim();
      if (!/[.!?]$/.test(sentenceWithPunctuation)) {
        sentenceWithPunctuation += '.';
      }
      summarySegments.push(`${sentenceWithPunctuation} [${citation.index}]`);
    }

    let summaryText = summarySegments.join(' ');

    // If disagreement was detected, prepend clear objective disagreement note
    if (disagreement.detected && disagreement.details) {
      summaryText = `Note: ${disagreement.details} ${summaryText}`;
    }

    provenance.outputCharacters = summaryText.length;
    provenance.evaluationDurationMs = Date.now() - startMs;

    return {
      status: disagreement.detected ? 'disagreement_detected' : 'sufficient_evidence',
      summary: summaryText,
      statements,
      citations,
      hasSufficientEvidence: true,
      disagreement: disagreement.detected ? disagreement : undefined,
      model: modelInfo,
      provenance,
    };
  }
}

/**
 * Shared singleton instance for default Quick Answer generation.
 */
let sharedQuickAnswerEngine: QuickAnswerEngine | null = null;

export function createQuickAnswerEngine(options?: Partial<QuickAnswerOptions>): QuickAnswerEngine {
  return new QuickAnswerEngine(options);
}

export function getSharedQuickAnswerEngine(): QuickAnswerEngine {
  if (!sharedQuickAnswerEngine) {
    sharedQuickAnswerEngine = new QuickAnswerEngine();
  }
  return sharedQuickAnswerEngine;
}
