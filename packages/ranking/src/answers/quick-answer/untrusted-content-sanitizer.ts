/**
 * @opensearch/ranking — Untrusted Content Sanitizer (Phase 104)
 *
 * Implements strict security sanitization for arbitrary web and local content:
 * - Treats all source document text, snippets, and titles as completely untrusted
 * - Strips raw HTML/XML tags, comments, script tags, style blocks, and dangerous entities
 * - Removes control characters (ASCII 0-31 except standard whitespace), zero-width characters,
 *   and Unicode directional override exploits (e.g. RLO \u202E)
 * - Neutralizes adversarial prompt-injection patterns (e.g. "ignore previous instructions", "system:")
 * - Validates URLs to prevent javascript:, data:, and vbscript: execution vectors
 * - Enforces deterministic length bounds preventing memory exhaustion
 */

const DANGEROUS_SCHEMES = /^(javascript|vbscript|data):/i;

const ADVERSARIAL_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/gi,
  /you\s+are\s+now\s+(a|an|the)\s+/gi,
  /system\s*:\s*/gi,
  /assistant\s*:\s*/gi,
  /human\s*:\s*/gi,
  /bypass\s+all\s+(rules|guidelines)/gi,
  /<\s*script[^>]*>.*?<\s*\/\s*script\s*>/gis,
  /<\s*style[^>]*>.*?<\s*\/\s*style\s*>/gis,
  /<\s*iframe[^>]*>.*?<\s*\/\s*iframe\s*>/gis,
];

// Dangerous Unicode: Zero-width spaces, joiners, directional override characters
const DANGEROUS_UNICODE_CHARS = /[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g;

// Control characters (ASCII 0 to 31) excluding \t, \n, \r
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Sanitizes untrusted text extracted from arbitrary external or local documents.
 *
 * @param input Raw untrusted string from search results or page snippets
 * @param maxChars Maximum allowable length before safe truncation
 * @returns Clean, plain-text string safe for extractive analysis and display
 */
export function sanitizeUntrustedText(input: unknown, maxChars = 2000): string {
  if (typeof input !== 'string' || input.length === 0) {
    return '';
  }

  let text = input;

  // 1. Strip script, style, and iframe blocks with their internal contents
  text = text.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, ' ');
  text = text.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, ' ');
  text = text.replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, ' ');

  // 2. Strip HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // 3. Strip control characters and dangerous Unicode formatting / RTL override exploits
  text = text.replace(CONTROL_CHARS, '');
  text = text.replace(DANGEROUS_UNICODE_CHARS, '');

  // 4. Decode common safe HTML entities to plain characters
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // 5. Neutralize adversarial prompt-injection phrases
  for (const pattern of ADVERSARIAL_PATTERNS) {
    text = text.replace(pattern, '[filtered]');
  }

  // 6. Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // 7. Enforce hard character limit
  if (text.length > maxChars) {
    // Cut cleanly at last whitespace within limit if possible
    const cut = text.substring(0, maxChars);
    const lastSpace = cut.lastIndexOf(' ');
    text = lastSpace > maxChars * 0.8 ? cut.substring(0, lastSpace) + '...' : cut + '...';
  }

  return text;
}

/**
 * Validates and sanitizes a source URL to ensure it is safe to open.
 * Disallows javascript:, data:, or malformed protocols.
 *
 * @param rawUrl Raw URL from document metadata
 * @returns Safe canonical URL or fallback string
 */
export function validateSourceUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return '#';
  }

  const trimmed = rawUrl.trim();

  if (DANGEROUS_SCHEMES.test(trimmed)) {
    return '#';
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:') {
      return parsed.toString();
    }
    return '#';
  } catch {
    // Handle root-relative or domain-relative links
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
      return trimmed;
    }
    return '#';
  }
}
