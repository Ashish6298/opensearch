/**
 * Common Reusable Utilities for OpenSearch
 */

/**
 * Normalizes input text: collapses multiple spaces, trims ends, and handles null/undefined.
 */
export function normalizeWhitespace(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * Bounds a number within min and max inclusive.
 */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * Crash-proof JSON parsing. Returns fallback value on failure.
 */
export function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Type guard for non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Basic URL sanitization & validation helper.
 * Returns normalized URL string or null if invalid or unsafe scheme.
 */
export function sanitizeUrl(rawUrl: string): string | null {
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Masks sensitive strings (e.g. passwords, API keys) for safe debugging or logging.
 */
export function maskSecret(secret: unknown): string {
  if (typeof secret !== 'string' || secret.length === 0) {
    return '[EMPTY]';
  }
  if (secret.length <= 4) {
    return '****';
  }
  return `${secret.slice(0, 2)}****${secret.slice(-2)}`;
}

/**
 * Deep clones a plain serializable object/array.
 */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
