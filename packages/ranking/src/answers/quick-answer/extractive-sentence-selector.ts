/**
 * @opensearch/ranking — Extractive Sentence Selector (Phase 104)
 *
 * Implements deterministic extractive summarization and sentence selection:
 * - Abbreviation-aware sentence segmentation
 * - Quality filtering (stripping boilerplate, cookie notices, navigation fragments)
 * - Relevance scoring based on query terms, phrase adjacency, and document rank
 * - Diversity enforcement (Jaccard similarity penalty to avoid redundant facts)
 * - Strict input/output character and sentence boundary constraints
 */



export interface ScoredSentence {
  sentence: string;
  originalText: string;
  documentId: string;
  documentRank: number;
  documentTitle: string;
  documentUrl: string;
  documentDomain: string;
  sourceType: 'local' | 'web';
  publishedAt?: string;
  sentenceIndex: number;
  score: number;
  termMatchCount: number;
  tokens: Set<string>;
}

const COMMON_ABBREVIATIONS = new Set([
  'e.g', 'i.e', 'etc', 'vs', 'mr', 'mrs', 'ms', 'dr', 'prof', 'inc', 'ltd', 'corp', 'co',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'no', 'vol', 'dept', 'approx', 'est', 'min', 'sec', 'ft', 'yd', 'km', 'mi',
]);

const BOILERPLATE_PATTERNS = [
  /\ball\s+rights\s+reserved\b/i,
  /\bterms\s+(and|&)\s+conditions\b/i,
  /\bcookie\s+(policy|settings|consent)\b/i,
  /\bsubscribe\s+to\s+our\s+newsletter\b/i,
  /\bsign\s+in\s+to\s+your\s+account\b/i,
  /\bclick\s+here\s+to\b/i,
  /\bread\s+more\s+about\b/i,
  /\bjavascript\s+is\s+(disabled|required)\b/i,
  /\bpage\s+not\s+found\b/i,
  /\b404\s+error\b/i,
  /\bprivacy\s+policy\b/i,
  /\baccept\s+all\s+cookies\b/i,
];

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'in', 'is', 'it',
  'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were', 'will', 'with', 'what', 'which', 'who',
  'how', 'when', 'where', 'why', 'do', 'does', 'did', 'this', 'these', 'those', 'or', 'if',
]);

/**
 * Tokenizes text into lowercase alphanumeric words.
 */
export function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/**
 * Calculates Jaccard token similarity between two token sets.
 */
export function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection++;
    }
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Splits text into discrete sentences, respecting abbreviations and decimal numbers.
 */
export function splitIntoSentences(text: string): string[] {
  if (!text || text.trim().length === 0) return [];

  // Protect decimals and abbreviations temporarily
  const placeholderText = text
    .replace(/(\d+)\.(\d+)/g, '$1__DOT__$2')
    .replace(/\b([a-zA-Z]{1,4})\.([a-zA-Z]{1,4})\b/g, '$1__DOT__$2');

  // Split on sentence boundary punctuation: . ! ? followed by whitespace or line end
  const rawSegments = placeholderText.split(/(?<=[.!?])\s+(?=[A-Z0-9"']|$)/);
  const sentences: string[] = [];

  for (const raw of rawSegments) {
    const restored = raw
      .replace(/__DOT__/g, '.')
      .trim();

    if (restored.length > 0) {
      // Check if ends with an abbreviation period that was mistakenly split
      const lastWord = restored.split(/\s+/).pop()?.replace(/[^a-zA-Z]/g, '').toLowerCase() || '';
      if (COMMON_ABBREVIATIONS.has(lastWord) && sentences.length > 0) {
        // Merge with previous
        sentences[sentences.length - 1] += ' ' + restored;
      } else {
        sentences.push(restored);
      }
    }
  }

  return sentences;
}

/**
 * Determines whether a sentence is low-quality or boilerplate.
 */
export function isBoilerplateOrLowQuality(
  sentence: string,
  minChars = 25,
  maxChars = 320,
): boolean {
  if (sentence.length < minChars || sentence.length > maxChars) {
    return true;
  }

  const words = sentence.split(/\s+/);
  if (words.length < 4) {
    return true;
  }

  // Check boilerplate regex
  for (const pattern of BOILERPLATE_PATTERNS) {
    if (pattern.test(sentence)) {
      return true;
    }
  }

  // Check if mostly uppercase or mostly non-alphabetic
  const letters = sentence.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 10) {
    return true;
  }

  const upperCount = sentence.replace(/[^A-Z]/g, '').length;
  if (upperCount / letters.length > 0.6) {
    // Excessive caps (e.g. navigation header: "HOME ABOUT CONTACT FAQ")
    return true;
  }

  return false;
}

/**
 * Scores a candidate sentence against the user query.
 */
export function scoreCandidateSentence(
  sentence: string,
  queryTokens: string[],
  docTitleTokens: string[],
  docRank: number,
  sentenceIndex: number,
): { score: number; termMatchCount: number; tokens: Set<string> } {
  const sentenceTokens = tokenizeText(sentence);
  const tokenSet = new Set(sentenceTokens);

  if (queryTokens.length === 0 || sentenceTokens.length === 0) {
    return { score: 0, termMatchCount: 0, tokens: tokenSet };
  }

  let matchedQueryTerms = 0;
  let termFrequencySum = 0;

  for (const qToken of queryTokens) {
    if (tokenSet.has(qToken)) {
      matchedQueryTerms++;
      // Count frequency in sentence with diminishing return
      let freq = 0;
      for (const st of sentenceTokens) {
        if (st === qToken) freq++;
      }
      termFrequencySum += Math.min(freq, 3) * (STOPWORDS.has(qToken) ? 0.3 : 1.0);
    }
  }

  // Query coverage ratio (0.0 to 1.0)
  const coverageRatio = matchedQueryTerms / queryTokens.length;

  // Title overlap bonus
  let titleMatches = 0;
  for (const tToken of docTitleTokens) {
    if (tokenSet.has(tToken)) {
      titleMatches++;
    }
  }
  const titleBonus = docTitleTokens.length > 0 ? Math.min(0.2, (titleMatches / docTitleTokens.length) * 0.2) : 0;

  // Document rank decay: Rank 1 -> 1.0, Rank 2 -> 0.88, Rank 3 -> 0.77, etc.
  const rankMultiplier = Math.max(0.4, 1.0 - (docRank - 1) * 0.12);

  // Lead bias: position 0 or 1 often contains primary definition/answer
  const leadBias = sentenceIndex === 0 ? 0.20 : sentenceIndex === 1 ? 0.10 : 0.0;

  // Informative length bonus (sweet spot between 60 and 180 chars)
  const lengthBonus = sentence.length >= 60 && sentence.length <= 200 ? 0.10 : 0.0;

  const rawScore = (coverageRatio * 0.5 + Math.min(termFrequencySum / 5, 0.3) + titleBonus + leadBias + lengthBonus) * rankMultiplier;

  return {
    score: Math.min(1.0, Math.max(0.0, rawScore)),
    termMatchCount: matchedQueryTerms,
    tokens: tokenSet,
  };
}

/**
 * Selects the top non-redundant extractive sentences using greedy diversity filtering.
 */
export function selectTopExtractiveSentences(
  candidateSentences: ScoredSentence[],
  maxSentences = 3,
  maxTotalChars = 400,
  diversityThreshold = 0.40,
): ScoredSentence[] {
  // Sort descending by score
  const sorted = [...candidateSentences].sort((a, b) => b.score - a.score);

  const selected: ScoredSentence[] = [];
  let currentTotalChars = 0;

  for (const candidate of sorted) {
    if (selected.length >= maxSentences) break;
    if (candidate.score <= 0.05) continue;

    // Check if adding exceeds character budget
    if (currentTotalChars + candidate.sentence.length > maxTotalChars && selected.length > 0) {
      continue;
    }

    // Diversity check: ensure not too similar to already selected sentences
    let isRedundant = false;
    for (const prior of selected) {
      const sim = calculateJaccardSimilarity(candidate.tokens, prior.tokens);
      if (sim > diversityThreshold) {
        isRedundant = true;
        break;
      }
    }

    if (!isRedundant) {
      selected.push(candidate);
      currentTotalChars += candidate.sentence.length;
    }
  }

  return selected;
}
