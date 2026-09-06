/**
 * @opensearch/ranking — HTML & Text Escaping Utility (Phase 15)
 *
 * Ensures all user-facing content, titles, snippets, and URLs are safely escaped
 * against Cross-Site Scripting (XSS) and injection attacks before rendering.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

const HTML_UNESCAPE_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&#96;': '`',
};

/**
 * Escapes unsafe HTML characters in a string.
 * Safe for null/undefined/non-string inputs.
 */
export function escapeHtml(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input.replace(/[&<>"'`]/g, match => HTML_ESCAPE_MAP[match] ?? match);
}

/**
 * Unescapes common HTML entities back to raw characters.
 */
export function unescapeHtml(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input.replace(
    /&(?:amp|lt|gt|quot|#39|#x27|#96);/g,
    match => HTML_UNESCAPE_MAP[match] ?? match,
  );
}

/**
 * Strips any leftover raw HTML tags from a text string while preserving inner text.
 */
export function stripHtmlTags(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
