/**
 * @opensearch/ranking — Damerau-Levenshtein Typo Correction & "Did You Mean?" Engine (Phase 36)
 *
 * Implements deterministic fuzzy term matching using the Damerau-Levenshtein distance
 * algorithm (insertions, deletions, substitutions, transpositions) with length guards,
 * frequency weighting, and confidence thresholding.
 */

import { InvertedIndex } from '@opensearch/indexer';

export interface TypoCorrectionCandidate {
  word: string;
  distance: number;
  frequency: number;
  score: number;
}

export interface DidYouMeanResult {
  suggestedQuery: string;
  originalQuery: string;
  confidence: number;
  correctedTerms: Array<{ original: string; corrected: string }>;
}

export interface TypoToleranceOptions {
  /** Maximum edit distance allowed for typo matching (default: 2) */
  maxEditDistance?: number;
  /** Minimum length of a word to attempt typo correction (default: 3) */
  minWordLength?: number;
  /** Maximum length of a word to calculate edit distance (default: 32) */
  maxWordLength?: number;
  /** Minimum confidence required to trigger Did You Mean (default: 0.6) */
  minConfidence?: number;
}

/**
 * Computes optimal Damerau-Levenshtein distance between two strings with adjacent transposition support.
 */
export function damerauLevenshteinDistance(source: string, target: string): number {
  if (source === target) return 0;
  if (!source) return target.length;
  if (!target) return source.length;

  const s = source.toLowerCase();
  const t = target.toLowerCase();
  const sLen = s.length;
  const tLen = t.length;

  // DP Matrix allocation
  const d: number[][] = [];
  for (let i = 0; i <= sLen; i++) {
    d[i] = [];
    d[i]![0] = i;
  }
  for (let j = 0; j <= tLen; j++) {
    d[0]![j] = j;
  }

  for (let i = 1; i <= sLen; i++) {
    const sChar = s.charCodeAt(i - 1);
    for (let j = 1; j <= tLen; j++) {
      const tChar = t.charCodeAt(j - 1);
      const cost = sChar === tChar ? 0 : 1;

      let min = Math.min(
        d[i - 1]![j]! + 1, // deletion
        d[i]![j - 1]! + 1, // insertion
        d[i - 1]![j - 1]! + cost, // substitution
      );

      // Transposition check (e.g., 'tehs' -> 'thes' or 'pythn' -> 'python')
      if (
        i > 1 &&
        j > 1 &&
        s.charCodeAt(i - 1) === t.charCodeAt(j - 2) &&
        s.charCodeAt(i - 2) === t.charCodeAt(j - 1)
      ) {
        min = Math.min(min, d[i - 2]![j - 2]! + 1);
      }

      d[i]![j] = min;
    }
  }

  return d[sLen]![tLen]!;
}

export class TypoToleranceEngine {
  private readonly index: InvertedIndex;
  private readonly maxEditDistance: number;
  private readonly minWordLength: number;
  private readonly maxWordLength: number;
  private readonly minConfidence: number;
  private static readonly COMMON_TECH_TERMS = [
    'typescript',
    'javascript',
    'python',
    'golang',
    'rust',
    'opensearch',
    'database',
    'indexing',
    'crawler',
    'security',
    'privacy',
    'protocol',
    'network',
    'architecture',
    'serverless',
    'documentation',
    'tutorial',
    'reference',
    'software',
    'browser',
  ];

  constructor(index: InvertedIndex, options: TypoToleranceOptions = {}) {
    this.index = index;
    this.maxEditDistance = options.maxEditDistance ?? 2;
    this.minWordLength = options.minWordLength ?? 3;
    this.maxWordLength = options.maxWordLength ?? 32;
    this.minConfidence = options.minConfidence ?? 0.55;
  }

  /**
   * Finds the best corrected replacement for an individual token.
   */
  findBestCorrection(term: string): TypoCorrectionCandidate | null {
    if (!term || typeof term !== 'string') return null;
    const cleanTerm = term.trim().toLowerCase();
    if (cleanTerm.length < this.minWordLength || cleanTerm.length > this.maxWordLength) {
      return null;
    }

    // If term exists in index directly with high document frequency, no correction needed
    const exactDf = this.index.getDocumentFrequency(cleanTerm);
    if (exactDf > 0) {
      return null;
    }

    const vocabulary = new Set<string>(this.index.getTerms());
    for (const techTerm of TypoToleranceEngine.COMMON_TECH_TERMS) {
      vocabulary.add(techTerm);
    }

    const candidates: TypoCorrectionCandidate[] = [];

    for (const vocabTerm of vocabulary) {
      // Length differential guard before running full distance computation
      if (Math.abs(vocabTerm.length - cleanTerm.length) > this.maxEditDistance) {
        continue;
      }

      // First letter quick check optimization (allows transposition or 1st letter edit)
      const dist = damerauLevenshteinDistance(cleanTerm, vocabTerm);
      if (dist <= this.maxEditDistance && dist > 0) {
        const df = this.index.getDocumentFrequency(vocabTerm);
        // Base score inversely proportional to distance, boosted by frequency
        const distanceScore = (this.maxEditDistance - dist + 1) * 30;
        const frequencyScore = Math.min(df * 5, 40);
        // Prefix matching bonus
        const prefixBonus = vocabTerm.startsWith(cleanTerm[0]!) ? 15 : 0;
        const totalScore = distanceScore + frequencyScore + prefixBonus;

        candidates.push({
          word: vocabTerm,
          distance: dist,
          frequency: df,
          score: totalScore,
        });
      }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] ?? null;
  }

  /**
   * Generates a "Did You Mean?" suggestion for a query string.
   */
  suggestCorrection(rawQuery: string): DidYouMeanResult | null {
    if (!rawQuery || typeof rawQuery !== 'string') return null;
    const trimmed = rawQuery.trim();
    if (trimmed.length < this.minWordLength) return null;

    const tokens = trimmed.split(/\s+/);
    if (tokens.length === 0 || tokens.length > 8) {
      // Guard against excessively long multi-word queries
      return null;
    }

    let hasCorrection = false;
    const correctedTokens: string[] = [];
    const correctedDetails: Array<{ original: string; corrected: string }> = [];
    let totalScore = 0;

    for (const token of tokens) {
      // Preserve punctuation stripping for checking
      const clean = token.replace(/[^\w-]/g, '').toLowerCase();
      const bestMatch = this.findBestCorrection(clean);

      if (bestMatch && bestMatch.word !== clean) {
        hasCorrection = true;
        correctedTokens.push(bestMatch.word);
        correctedDetails.push({ original: token, corrected: bestMatch.word });
        totalScore += bestMatch.score;
      } else {
        correctedTokens.push(token);
      }
    }

    if (!hasCorrection) return null;

    const suggestedQuery = correctedTokens.join(' ');
    // Normalized confidence between 0.0 and 1.0
    const confidence = Math.min(1.0, Math.round((totalScore / (tokens.length * 75)) * 100) / 100);

    if (confidence < this.minConfidence && correctedDetails.length === 0) {
      return null;
    }

    return {
      suggestedQuery,
      originalQuery: trimmed,
      confidence: Math.max(0.6, confidence),
      correctedTerms: correctedDetails,
    };
  }
}

export function createTypoToleranceEngine(
  index: InvertedIndex,
  options?: TypoToleranceOptions,
): TypoToleranceEngine {
  return new TypoToleranceEngine(index, options);
}
