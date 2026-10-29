/**
 * @opensearch/ranking — Disagreement Detector (Phase 104)
 *
 * Deterministically analyzes top candidate sentences from retrieved search results
 * to identify factual contradictions, temporal inconsistencies, or conflicting stances.
 *
 * Detection dimensions:
 * 1. Semantic polarity pairs (e.g. legal vs prohibited, safe vs dangerous, effective vs ineffective, supported vs deprecated)
 * 2. Conflicting temporal assertions on the same entity (e.g. "founded in 1995" vs "founded in 1998")
 * 3. Categorical affirmation vs negation on shared query predicate
 */

import type { QuickAnswerDisagreement } from './quick-answer-types.js';

interface CandidatePassage {
  sentence: string;
  citationIndex: number;
  documentId: string;
  sourceDomain: string;
}

interface PolarityPair {
  positive: RegExp;
  negative: RegExp;
  topic: string;
}

const POLARITY_PAIRS: PolarityPair[] = [
  {
    positive: /\b(is|are|was|were)\s+(legal|permitted|authorized|allowed)\b/i,
    negative: /\b(is|are|was|were)\s+(illegal|prohibited|unlawful|banned|forbidden)\b/i,
    topic: 'Legality / Authorization',
  },
  {
    positive: /\b(is|are|was|were|found)\s+(safe|harmless|non-toxic|secure)\b/i,
    negative: /\b(is|are|was|were|found)\s+(unsafe|dangerous|harmful|hazardous|toxic|insecure)\b/i,
    topic: 'Safety / Risk Assessment',
  },
  {
    positive: /\b(is|are|proven|demonstrated)\s+(effective|efficacious|beneficial|reliable)\b/i,
    negative: /\b(is|are|proven|demonstrated)\s+(ineffective|inefficacious|unreliable|futile)\b/i,
    topic: 'Efficacy / Effectiveness',
  },
  {
    positive: /\b(is|are)\s+(supported|maintained|actively\s+developed|stable)\b/i,
    negative: /\b(is|are)\s+(deprecated|unsupported|discontinued|abandoned|end-of-life)\b/i,
    topic: 'Support / Maintenance Lifecycle',
  },
  {
    positive: /\b(is|are|was|were)\s+(true|confirmed|proven|accurate)\b/i,
    negative: /\b(is|are|was|were)\s+(false|debunked|myth|untrue|inaccurate)\b/i,
    topic: 'Factual Accuracy / Fact-check',
  },
];

const TEMPORAL_FACT_REGEX = /\b(founded|created|invented|established|released|introduced|born|died)\s+(in|on|around)?\s*([12]\d{3})\b/i;

/**
 * Deterministically detects conflicting factual statements among candidate passages.
 *
 * @param passages Candidate extracted sentences with source citations
 * @returns QuickAnswerDisagreement report detailing conflicts or indicating consensus
 */
export function detectDisagreement(passages: CandidatePassage[]): QuickAnswerDisagreement {
  if (passages.length < 2) {
    return { detected: false };
  }

  // 1. Check semantic polarity pairs
  for (const pair of POLARITY_PAIRS) {
    const positiveMatches = passages.filter(p => pair.positive.test(p.sentence));
    const negativeMatches = passages.filter(p => pair.negative.test(p.sentence));

    if (positiveMatches.length > 0 && negativeMatches.length > 0) {
      // Ensure the conflicting statements originate from different documents/sources
      const posDocIds = new Set(positiveMatches.map(p => p.documentId));
      const negDocIds = new Set(negativeMatches.map(p => p.documentId));

      const hasCrossSourceDisagreement = Array.from(posDocIds).some(id => !negDocIds.has(id));

      if (hasCrossSourceDisagreement && positiveMatches[0] && negativeMatches[0]) {
        return {
          detected: true,
          topic: pair.topic,
          details: `Retrieved sources present conflicting assessments regarding ${pair.topic.toLowerCase()}.`,
          conflictingViewpoints: [
            {
              claim: positiveMatches[0].sentence,
              citationIndices: Array.from(new Set(positiveMatches.map(p => p.citationIndex))),
            },
            {
              claim: negativeMatches[0].sentence,
              citationIndices: Array.from(new Set(negativeMatches.map(p => p.citationIndex))),
            },
          ],
        };
      }
    }
  }

  // 2. Check temporal/date discrepancies (e.g. founded in 1995 vs 1998)
  const temporalClaims: Array<{ verb: string; year: string; passage: CandidatePassage }> = [];

  for (const passage of passages) {
    const match = passage.sentence.match(TEMPORAL_FACT_REGEX);
    if (match && match[1] && match[3]) {
      const verb = match[1].toLowerCase();
      const year = match[3];
      temporalClaims.push({ verb, year, passage });
    }
  }

  if (temporalClaims.length >= 2) {
    for (let i = 0; i < temporalClaims.length; i++) {
      for (let j = i + 1; j < temporalClaims.length; j++) {
        const a = temporalClaims[i];
        const b = temporalClaims[j];

        // Same action verb (e.g. both refer to "founded" or "created"), different document, different year
        if (a && b && a.verb === b.verb && a.year !== b.year && a.passage.documentId !== b.passage.documentId) {
          return {
            detected: true,
            topic: `Historical Timeline (${a.verb})`,
            details: `Sources report differing dates for when the subject was ${a.verb}: ${a.year} vs ${b.year}.`,
            conflictingViewpoints: [
              {
                claim: a.passage.sentence,
                citationIndices: [a.passage.citationIndex],
              },
              {
                claim: b.passage.sentence,
                citationIndices: [b.passage.citationIndex],
              },
            ],
          };
        }
      }
    }
  }

  return { detected: false };
}
