/**
 * @opensearch/indexer — Text Normalizer (Phase 9)
 *
 * Implements deterministic text normalization:
 * - Unicode canonical normalization (NFC)
 * - Case folding (lowercasing)
 * - Accent/diacritic folding (e.g. 'café' -> 'cafe', 'naïve' -> 'naive')
 * - Control character stripping & punctuation handling
 */

export interface TextNormalizeOptions {
  /** Strip/fold diacritics and accents (default: true) */
  stripAccents?: boolean;
  /** Convert to lowercase (default: true) */
  lowercase?: boolean;
  /** Canonical Unicode normalization form (default: 'NFC') */
  unicodeForm?: 'NFC' | 'NFD' | 'NFKC' | 'NFKD';
}

/**
 * Normalizes raw string input according to indexing standards.
 */
export function normalizeText(text: string, options: TextNormalizeOptions = {}): string {
  if (!text) return '';

  const { stripAccents = true, lowercase = true, unicodeForm = 'NFC' } = options;

  let result = text;

  // 1. Remove control characters (except common whitespace: \t, \n, \r)
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');

  // 2. Normalize Unicode form
  try {
    result = result.normalize(unicodeForm);
  } catch {
    // fallback if environment fails
  }

  // 3. Strip / Fold Accents & Diacritics
  if (stripAccents) {
    result = foldDiacritics(result);
  }

  // 4. Case folding
  if (lowercase) {
    result = result.toLowerCase();
  }

  return result;
}

/**
 * Strips combining diacritical marks from Unicode characters.
 * Example: 'crème brûlée' -> 'creme brulee', 'München' -> 'Munchen'
 */
export function foldDiacritics(text: string): string {
  if (!text) return '';
  // Decompose to NFD (base character + combining diacritical marks)
  // then strip combining marks in range \u0300-\u036f
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC');
}

/**
 * Removes punctuation while preserving term-separating whitespace.
 */
export function stripPunctuation(text: string): string {
  if (!text) return '';
  // Replace punctuation and symbols with space, except alphanumeric and unicode word letters
  return text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
