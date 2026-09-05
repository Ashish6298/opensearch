/**
 * @opensearch/indexer — Tokenizer (Phase 9)
 *
 * Implements Unicode-aware tokenization with positional tracking:
 * - Emits ordered token stream with character offsets and sequential positions
 * - Filters tokens by min/max length
 * - Applies stop words filtering
 */

import { Token } from './pipeline-types.js';
import { foldDiacritics } from './normalizer.js';
import { isStopWord } from './stop-words.js';

export interface TokenizerOptions {
  /** Minimum character length of a token (default: 1) */
  minTokenLength?: number;
  /** Maximum character length of a token (default: 64) */
  maxTokenLength?: number;
  /** Whether to filter stop words (default: true) */
  removeStopWords?: boolean;
  /** Custom stop words set (optional) */
  customStopWords?: Set<string>;
  /** Whether to fold/strip accents (default: true) */
  stripAccents?: boolean;
  /** Whether to lowercase tokens (default: true) */
  lowercase?: boolean;
}

/**
 * Tokenizes raw text into an array of structured Token objects.
 */
export function tokenize(text: string, options: TokenizerOptions = {}): Token[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const {
    minTokenLength = 1,
    maxTokenLength = 64,
    removeStopWords = true,
    customStopWords,
    stripAccents = true,
    lowercase = true,
  } = options;

  const tokens: Token[] = [];
  // Match contiguous Unicode letter or number sequences
  const wordRegex = /[\p{L}\p{N}]+/gu;

  let match: RegExpExecArray | null;
  let currentPosition = 0;

  while ((match = wordRegex.exec(text)) !== null) {
    const rawWord = match[0];
    const startOffset = match.index;
    const endOffset = startOffset + rawWord.length;

    let term = rawWord;

    // 1. Accent folding
    if (stripAccents) {
      term = foldDiacritics(term);
    }

    // 2. Lowercase folding
    if (lowercase) {
      term = term.toLowerCase();
    }

    // 3. Length filter
    if (term.length < minTokenLength || term.length > maxTokenLength) {
      continue;
    }

    // 4. Stop-word filter
    if (removeStopWords && isStopWord(term, customStopWords)) {
      continue;
    }

    tokens.push({
      term,
      position: currentPosition++,
      startOffset,
      endOffset,
    });
  }

  return tokens;
}
