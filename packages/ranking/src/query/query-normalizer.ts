/**
 * @opensearch/ranking — Query Normalizer (Phase 12)
 *
 * Implements deterministic query text normalization:
 * - Unicode canonical normalization (NFC)
 * - Control character stripping (null bytes, non-printables)
 * - Accent and diacritic folding (e.g., 'café' -> 'cafe')
 * - Case folding (lowercasing)
 * - Punctuation handling while preserving quotation marks and minus signs for syntax
 */

export interface QueryNormalizerOptions {
  /** Strip/fold diacritics and accents (default: true) */
  stripAccents?: boolean;
  /** Convert to lowercase (default: true) */
  lowercase?: boolean;
  /** Canonical Unicode normalization form (default: 'NFC') */
  unicodeForm?: 'NFC' | 'NFD' | 'NFKC' | 'NFKD';
  /** Preserve quotation marks and minus prefixes during normalization (default: true) */
  preserveSyntaxChars?: boolean;
}

/**
 * Strips combining diacritical marks from Unicode characters.
 * Example: 'crème brûlée' -> 'creme brulee', 'München' -> 'Munchen'
 */
export function foldDiacritics(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC');
}

/**
 * Normalizes raw user search query string safely and deterministically.
 */
export function normalizeQueryText(text: string, options: QueryNormalizerOptions = {}): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const {
    stripAccents = true,
    lowercase = true,
    unicodeForm = 'NFC',
    preserveSyntaxChars = true,
  } = options;

  let result = text;

  // 1. Replace control characters (including null bytes \u0000, non-printables \u0000-\u001F, \u007F-\u009F) with space
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');

  // 2. Canonical Unicode normalization
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

  // 5. Replace multi-byte spaces and excessive whitespace
  result = result.replace(/[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g, ' ');

  // 6. Punctuation handling: if not preserving syntax chars, strip all symbols
  if (!preserveSyntaxChars) {
    result = result.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ');
  }

  return result.trim();
}
