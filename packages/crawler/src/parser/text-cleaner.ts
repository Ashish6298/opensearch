/**
 * @opensearch/crawler — HTML Text Cleaner & Entity Decoder (Phase 7)
 *
 * Provides utilities for:
 * - Decoding standard and numeric HTML entities (&amp;, &#x20;, &#39;, etc.)
 * - Removing noise elements (<script>, <style>, <noscript>, <svg>, <nav>, etc.)
 * - Collapsing whitespace and converting block elements to clean text flow
 */

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&laquo;': '«',
  '&raquo;': '»',
  '&bull;': '•',
  '&middot;': '·',
  '&cent;': '¢',
  '&pound;': '£',
  '&yen;': '¥',
  '&euro;': '€',
  '&deg;': '°',
  '&plusmn;': '±',
  '&frac12;': '½',
  '&frac14;': '¼',
  '&frac34;': '¾',
};

/**
 * Decodes standard named and numeric HTML entities.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes('&')) {
    return text;
  }

  // 1. Replace named entities
  let result = text.replace(/&[a-zA-Z]+;/g, match => {
    return NAMED_ENTITIES[match.toLowerCase()] ?? match;
  });

  // 2. Replace decimal numeric entities (e.g. &#160;)
  result = result.replace(/&#(\d+);/g, (_, code) => {
    try {
      const num = Number.parseInt(code, 10);
      return num > 0 && num < 0x10ffff ? String.fromCodePoint(num) : '';
    } catch {
      return '';
    }
  });

  // 3. Replace hex numeric entities (e.g. &#x20;)
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try {
      const num = Number.parseInt(hex, 16);
      return num > 0 && num < 0x10ffff ? String.fromCodePoint(num) : '';
    } catch {
      return '';
    }
  });

  return result;
}

/**
 * Strips HTML comments, script tags, style tags, SVG, and noscript blocks.
 */
export function stripHtmlNoiseTags(html: string, stripNav = true): string {
  let cleaned = html;

  // 1. Strip comments: <!-- ... -->
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, ' ');

  // 2. Strip <script>...</script>
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');

  // 3. Strip <style>...</style>
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

  // 4. Strip <noscript>...</noscript>
  cleaned = cleaned.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ');

  // 5. Strip <svg>...</svg>
  cleaned = cleaned.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ');

  // 6. Strip <iframe>...</iframe>
  cleaned = cleaned.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ');

  // 7. Strip navigation noise tags if requested
  if (stripNav) {
    cleaned = cleaned.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ');
    cleaned = cleaned.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ');
    cleaned = cleaned.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ');
    cleaned = cleaned.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ');
  }

  return cleaned;
}

/**
 * Converts block elements to line breaks, strips remaining tags, and normalizes spaces.
 */
export function cleanVisibleText(htmlFragment: string): string {
  if (!htmlFragment) return '';

  // Replace block elements with newlines/spaces
  let text = htmlFragment
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<td\b[^>]*>/gi, ' ')
    .replace(/<th\b[^>]*>/gi, ' ');

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode entities
  text = decodeHtmlEntities(text);

  // Normalize whitespace: collapse multiple spaces/tabs to a single space, max two newlines
  return text
    .split('\n')
    .map(line => line.replace(/[ \t\r\f\v]+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n');
}
