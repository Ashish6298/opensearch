/**
 * @opensearch/crawler — Link Extractor & Normalizer (Phase 7)
 *
 * Extracts outbound `<a href="...">` links from HTML:
 * - Resolves relative URLs against document base URL
 * - Handles `<base href="...">` tag if present
 * - Validates using Phase 4 `validateUrl` (accepts only http: and https:)
 * - Normalizes using Phase 4 `normalizeUrl` (strips fragments, lowercases host, etc.)
 * - Checks internal vs external domain relative to document origin
 * - Deduplicates URLs preserving discovery order
 */

import { validateUrl } from '../url/url-validator.js';
import { normalizeUrl } from '../url/url-normalizer.js';
import { validateTargetHostSync } from '../fetcher/ssrf-guard.js';
import { decodeHtmlEntities } from './text-cleaner.js';
import { ExtractedLink } from './parser-types.js';

/**
 * Extracts the base URL from `<base href="...">` if declared in the HTML head.
 */
export function extractBaseHref(html: string, fallbackUrl: string): string {
  const baseMatch = html.match(/<base\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  if (!baseMatch || !baseMatch[1]) {
    return fallbackUrl;
  }

  const rawBase = baseMatch[1].trim();
  try {
    return new URL(rawBase, fallbackUrl).href;
  } catch {
    return fallbackUrl;
  }
}

/**
 * Extracts, validates, normalizes, and deduplicates all outbound links in the HTML.
 */
export function extractOutboundLinks(
  html: string,
  documentUrl: string,
  maxLinks = 500,
  pageNofollow = false,
): ExtractedLink[] {
  const effectiveBaseUrl = extractBaseHref(html, documentUrl);
  let docOrigin = '';
  try {
    const docParsed = new URL(documentUrl);
    docOrigin = docParsed.origin;
  } catch {
    // ignore
  }

  // Regex for <a ... href="..." ...>anchor text</a>
  const linkRegex = /<a\b([^>]*)>(.*?)<\/a>|<a\b([^>]*)\/?>/gis;
  const extractedLinks: ExtractedLink[] = [];
  const seenUrls = new Set<string>();

  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    if (extractedLinks.length >= maxLinks) {
      break;
    }

    const attrs = match[1] ?? match[3] ?? '';
    const rawAnchor = match[2] ?? '';

    // Extract href attribute
    const hrefMatch = attrs.match(/\bhref=["']([^"']*)["']|\bhref=([^\s>]+)/i);
    if (!hrefMatch) {
      continue;
    }

    let rawHref = decodeHtmlEntities((hrefMatch[1] ?? hrefMatch[2] ?? '').trim());
    rawHref = rawHref.replace(/^['"]+|['"]+$/g, '');
    const lowerHref = rawHref.toLowerCase();
    if (
      !rawHref ||
      rawHref.includes('<') ||
      rawHref.includes('>') ||
      rawHref.startsWith('#') ||
      lowerHref.startsWith('javascript:') ||
      lowerHref.startsWith('data:') ||
      lowerHref.startsWith('mailto:') ||
      lowerHref.startsWith('tel:') ||
      lowerHref.startsWith('file:') ||
      lowerHref.startsWith('ftp:') ||
      lowerHref.startsWith('about:') ||
      lowerHref.startsWith('chrome:')
    ) {
      continue;
    }

    // Resolve relative URL against effective base URL
    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(rawHref, effectiveBaseUrl).href;
    } catch {
      continue;
    }

    // Validate scheme & safety
    const validation = validateUrl(resolvedUrl);
    if (!validation.ok) {
      continue;
    }

    // SSRF syntactic check
    try {
      const parsedResolved = new URL(resolvedUrl);
      const hostCheck = validateTargetHostSync(parsedResolved.hostname);
      if (!hostCheck.allowed) {
        continue;
      }
    } catch {
      continue;
    }

    // Normalize canonical URL
    const normResult = normalizeUrl(resolvedUrl);
    if (!normResult.ok) {
      continue;
    }

    const canonicalUrl = normResult.normalized;

    if (seenUrls.has(canonicalUrl)) {
      continue;
    }
    seenUrls.add(canonicalUrl);

    // Parse rel attributes (nofollow, ugc, sponsored)
    const relMatch = attrs.match(/\brel=["']([^"']*)["']|\brel=([^\s>]+)/i);
    const rawRel = (relMatch ? (relMatch[1] ?? relMatch[2] ?? '') : '').toLowerCase();
    const relTokens = rawRel ? rawRel.split(/\s+/).filter(Boolean) : [];
    const isNofollow = pageNofollow || relTokens.includes('nofollow');

    // Clean anchor text
    const anchorText = decodeHtmlEntities(rawAnchor.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();

    let isInternal = false;
    try {
      isInternal = new URL(canonicalUrl).origin === docOrigin;
    } catch {
      // ignore
    }

    extractedLinks.push({
      rawHref,
      normalizedUrl: canonicalUrl,
      anchorText,
      isInternal,
      isNofollow,
      relAttributes: relTokens.length > 0 ? relTokens : undefined,
    });
  }

  return extractedLinks;
}
