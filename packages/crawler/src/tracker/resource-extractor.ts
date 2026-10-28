/**
 * @opensearch/crawler — Subresource Reference Extractor (Phase 99)
 *
 * Implements static HTML parsing for embedded subresources:
 * - Scripts (<script src="...">)
 * - Stylesheets & preloads (<link rel="..." href="...">)
 * - Images and tracking pixel beacons (<img src="..." width="1" height="1">)
 * - Embedded frames (<iframe src="...">, <embed src="...">, <object data="...">)
 * - Media assets (<video src="...">, <audio src="...">, <source src="...">)
 *
 * Requirements satisfied:
 * - Purely static parsing (NO script execution, NO VM / eval)
 * - Zero network calls
 * - Identifies tracking pixel beacon heuristics
 * - Resolves relative paths to absolute URLs against document base
 * - Classifies first-party vs third-party using registrable domain matching
 */

import {
  extractRegistrableDomain,
  isFirstPartyResource,
} from './domain-utils.js';
import {
  ExtractedResource,
  ResourceOriginCategory,
  SubresourceType,
} from './tracker-types.js';

export interface ResourceExtractorOptions {
  maxResources?: number;
}

export function extractSubresources(
  html: string,
  documentUrl: string,
  options: ResourceExtractorOptions = {},
): ExtractedResource[] {
  if (!html || typeof html !== 'string') return [];

  const maxResources = options.maxResources ?? 500;
  const results: ExtractedResource[] = [];
  const seenUrls = new Set<string>();

  // Determine base URL if <base href="..."> is specified
  const baseMatch = html.match(/<base\s+[^>]*href=["']([^"']+)["']/i);
  let effectiveBase = documentUrl;
  if (baseMatch && baseMatch[1]) {
    try {
      effectiveBase = new URL(baseMatch[1].trim(), documentUrl).toString();
    } catch {
      effectiveBase = documentUrl;
    }
  }

  function addResource(
    rawUrl: string,
    tagName: string,
    type: SubresourceType,
    isBeacon: boolean = false,
  ): void {
    if (results.length >= maxResources) return;
    if (!rawUrl || typeof rawUrl !== 'string') return;

    const trimmed = rawUrl.trim();
    if (!trimmed) return;

    // Discard non-HTTP resource schemes (inline data:, javascript:, blob:, mailto:)
    if (/^(data:|javascript:|blob:|mailto:|about:|tel:)/i.test(trimmed)) {
      return;
    }

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(trimmed, effectiveBase).toString();
    } catch {
      return;
    }

    // Only allow http: and https: resources
    if (!resolvedUrl.startsWith('http://') && !resolvedUrl.startsWith('https://')) {
      return;
    }

    if (seenUrls.has(resolvedUrl)) return;
    seenUrls.add(resolvedUrl);

    let origin = '';
    let hostname = '';
    try {
      const parsed = new URL(resolvedUrl);
      origin = parsed.origin;
      hostname = parsed.hostname;
    } catch {
      return;
    }

    const regDomain = extractRegistrableDomain(hostname);
    const originCategory: ResourceOriginCategory = isFirstPartyResource(resolvedUrl, documentUrl)
      ? 'first-party'
      : 'third-party';

    results.push({
      rawUrl: trimmed,
      resolvedUrl,
      origin,
      hostname,
      registrableDomain: regDomain,
      resourceType: type,
      originCategory,
      tagName,
      isPixelBeacon: isBeacon,
    });
  }

  // 1. Scripts: <script src="...">
  const scriptRegex = /<script\b(?=[^>]*\bsrc=["']?([^"'\s>]+))[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    if (match[1]) {
      addResource(match[1], 'script', 'script');
    }
  }

  // 2. Link tags: <link rel="..." href="...">
  const linkRegex = /<link\b[^>]*>/gi;
  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    const hrefMatch = tag.match(/\bhref=["']?([^"'\s>]+)/i);
    const relMatch = tag.match(/\brel=["']?([^"'>]+)/i);

    if (hrefMatch && hrefMatch[1]) {
      const rel = relMatch && relMatch[1] ? relMatch[1].toLowerCase() : '';
      let type: SubresourceType = 'other';

      if (rel.includes('stylesheet')) {
        type = 'stylesheet';
      } else if (rel.includes('preconnect') || rel.includes('dns-prefetch')) {
        type = 'preconnect';
      }

      addResource(hrefMatch[1], 'link', type);
    }
  }

  // 3. Images: <img src="..." width="..." height="...">
  const imgRegex = /<img\b[^>]*>/gi;
  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[0];
    const srcMatch = tag.match(/\bsrc=["']?([^"'\s>]+)/i);
    if (srcMatch && srcMatch[1]) {
      // Check for 1x1 or 0x0 tracking pixel beacon attributes
      const widthMatch = tag.match(/\bwidth=["']?(\d+)["']?/i);
      const heightMatch = tag.match(/\bheight=["']?(\d+)["']?/i);

      let isBeacon = false;
      if (widthMatch && heightMatch) {
        const w = parseInt(widthMatch[1]!, 10);
        const h = parseInt(heightMatch[1]!, 10);
        if (w <= 1 && h <= 1) {
          isBeacon = true;
        }
      }

      if (/style=["'][^"']*\b(display:\s*none|visibility:\s*hidden|width:\s*[01]px|height:\s*[01]px)/i.test(tag)) {
        isBeacon = true;
      }

      addResource(srcMatch[1], 'img', isBeacon ? 'beacon' : 'image', isBeacon);
    }
  }

  // 4. Iframes: <iframe src="...">
  const iframeRegex = /<iframe\b(?=[^>]*\bsrc=["']?([^"'\s>]+))[^>]*>/gi;
  while ((match = iframeRegex.exec(html)) !== null) {
    if (match[1]) {
      addResource(match[1], 'iframe', 'iframe');
    }
  }

  // 5. Media: <video src="...">, <audio src="...">, <source src="...">
  const mediaRegex = /<(?:video|audio|source)\b(?=[^>]*\bsrc=["']?([^"'\s>]+))[^>]*>/gi;
  while ((match = mediaRegex.exec(html)) !== null) {
    if (match[1]) {
      addResource(match[1], 'media', 'audio_video');
    }
  }

  // 6. Embed & Object: <embed src="...">, <object data="...">
  const embedRegex = /<embed\b(?=[^>]*\bsrc=["']?([^"'\s>]+))[^>]*>/gi;
  while ((match = embedRegex.exec(html)) !== null) {
    if (match[1]) {
      addResource(match[1], 'embed', 'other');
    }
  }

  const objectRegex = /<object\b(?=[^>]*\bdata=["']?([^"'\s>]+))[^>]*>/gi;
  while ((match = objectRegex.exec(html)) !== null) {
    if (match[1]) {
      addResource(match[1], 'object', 'other');
    }
  }

  return results;
}
