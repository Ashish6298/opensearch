/**
 * @opensearch/crawler — HTML Parser Implementation (Phase 7)
 *
 * Robust, high-throughput, resilient HTML content extractor:
 * - Title: <title> -> og:title -> <h1>
 * - Description: <meta name="description"> -> <meta property="og:description">
 * - Headings: h1–h6 in hierarchical order with structured + flattened representations
 * - Canonical URL: <link rel="canonical" href="..."> resolved against base URL
 * - Language: <html lang="..."> -> Content-Language HTTP header
 * - Body Text: Clean visible text with script/style/nav noise removed and entities decoded
 * - Outbound Links: Relative resolution, Phase 4 validation & normalization
 */

import { validateUrl } from '../url/url-validator.js';
import { normalizeUrl } from '../url/url-normalizer.js';
import { ExtractedDocument, HeadingItem, HtmlParser, HtmlParserOptions } from './parser-types.js';
import { cleanVisibleText, decodeHtmlEntities, stripHtmlNoiseTags } from './text-cleaner.js';
import { extractBaseHref, extractOutboundLinks } from './link-extractor.js';

export class DefaultHtmlParser implements HtmlParser {
  private readonly options: Required<HtmlParserOptions>;

  constructor(options: HtmlParserOptions = {}) {
    this.options = {
      maxTitleLength: options.maxTitleLength ?? 300,
      maxDescriptionLength: options.maxDescriptionLength ?? 1000,
      maxBodyTextLength: options.maxBodyTextLength ?? 1_000_000,
      maxLinks: options.maxLinks ?? 500,
      stripNavNoise: options.stripNavNoise ?? true,
    };
  }

  parse(
    html: string,
    documentUrl: string,
    httpHeaders?: Record<string, string | undefined>,
  ): ExtractedDocument {
    if (!html || typeof html !== 'string') {
      return this.createEmptyDocument(documentUrl);
    }

    const effectiveBaseUrl = extractBaseHref(html, documentUrl);

    // 1. Extract Title (<title> -> og:title -> first <h1>)
    const title = this.extractTitle(html);

    // 2. Extract Description (<meta name="description"> -> <meta property="og:description">)
    const description = this.extractDescription(html);

    // 3. Extract Canonical URL (<link rel="canonical" href="...">)
    const canonicalUrl = this.extractCanonicalUrl(html, effectiveBaseUrl, documentUrl);

    // 4. Extract Language (<html lang="..."> -> Content-Language header)
    const language = this.extractLanguage(html, httpHeaders);

    // 5. Extract Headings (h1–h6)
    const headingItems = this.extractHeadings(html);
    const headings = headingItems.map(h => h.text).join(' ');

    // 6. Extract Outbound Links
    const outboundLinks = extractOutboundLinks(html, documentUrl, this.options.maxLinks);
    const discoveredUrls = outboundLinks.map(l => l.normalizedUrl);

    // 7. Clean Body Text (strip script/style/nav noise, decode entities, collapse whitespace)
    const strippedHtml = stripHtmlNoiseTags(html, this.options.stripNavNoise);
    let bodyText = cleanVisibleText(strippedHtml);
    if (bodyText.length > this.options.maxBodyTextLength) {
      bodyText = bodyText.slice(0, this.options.maxBodyTextLength);
    }

    return {
      documentUrl,
      canonicalUrl,
      title: title.slice(0, this.options.maxTitleLength),
      description: description.slice(0, this.options.maxDescriptionLength),
      headingItems,
      headings,
      bodyText,
      language,
      outboundLinks,
      discoveredUrls,
      textLength: bodyText.length,
    };
  }

  private extractTitle(html: string): string {
    // 1. Try standard <title>...</title>
    const titleMatch = html.match(/<title\b[^>]*>(.*?)<\/title>/is);
    if (titleMatch && titleMatch[1]) {
      const clean = decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
      if (clean) return clean;
    }

    // 2. Try <meta property="og:title" content="...">
    const ogMatch =
      html.match(
        /<meta\b[^>]*\b(?:property|name)=["']og:title["'][^>]*\bcontent=["']([^"']*)["']/i,
      ) ??
      html.match(
        /<meta\b[^>]*\bcontent=["']([^"']*)["'][^>]*\b(?:property|name)=["']og:title["']/i,
      );
    if (ogMatch && ogMatch[1]) {
      const clean = decodeHtmlEntities(ogMatch[1]).replace(/\s+/g, ' ').trim();
      if (clean) return clean;
    }

    // 3. Fallback to first <h1>
    const h1Match = html.match(/<h1\b[^>]*>(.*?)<\/h1>/is);
    if (h1Match && h1Match[1]) {
      const clean = decodeHtmlEntities(h1Match[1].replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
      if (clean) return clean;
    }

    return '';
  }

  private extractDescription(html: string): string {
    // 1. Try <meta name="description" content="...">
    const descMatch =
      html.match(/<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["']([^"']*)["']/i) ??
      html.match(/<meta\b[^>]*\bcontent=["']([^"']*)["'][^>]*\bname=["']description["']/i);
    if (descMatch && descMatch[1]) {
      const clean = decodeHtmlEntities(descMatch[1]).replace(/\s+/g, ' ').trim();
      if (clean) return clean;
    }

    // 2. Try <meta property="og:description" content="...">
    const ogDescMatch =
      html.match(
        /<meta\b[^>]*\b(?:property|name)=["']og:description["'][^>]*\bcontent=["']([^"']*)["']/i,
      ) ??
      html.match(
        /<meta\b[^>]*\bcontent=["']([^"']*)["'][^>]*\b(?:property|name)=["']og:description["']/i,
      );
    if (ogDescMatch && ogDescMatch[1]) {
      const clean = decodeHtmlEntities(ogDescMatch[1]).replace(/\s+/g, ' ').trim();
      if (clean) return clean;
    }

    return '';
  }

  private extractCanonicalUrl(html: string, baseUrl: string, fallbackUrl: string): string {
    const canonicalMatch =
      html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']*)["']/i) ??
      html.match(/<link\b[^>]*\bhref=["']([^"']*)["'][^>]*\brel=["']canonical["']/i);

    if (!canonicalMatch || !canonicalMatch[1]) {
      return fallbackUrl;
    }

    const rawHref = decodeHtmlEntities(canonicalMatch[1].trim());
    try {
      const resolved = new URL(rawHref, baseUrl).href;
      const valid = validateUrl(resolved);
      if (!valid.ok) return fallbackUrl;

      const norm = normalizeUrl(resolved);
      return norm.ok ? norm.normalized : fallbackUrl;
    } catch {
      return fallbackUrl;
    }
  }

  private extractLanguage(
    html: string,
    headers?: Record<string, string | undefined>,
  ): string | null {
    // 1. <html lang="...">
    const htmlLangMatch = html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i);
    if (htmlLangMatch && htmlLangMatch[1]) {
      const lang = htmlLangMatch[1].trim().toLowerCase().split(/[-_]/)[0];
      if (lang && /^[a-z]{2,3}$/.test(lang)) {
        return lang;
      }
    }

    // 2. <meta http-equiv="content-language" content="...">
    const metaLangMatch = html.match(
      /<meta\b[^>]*\bhttp-equiv=["']content-language["'][^>]*\bcontent=["']([^"']+)["']/i,
    );
    if (metaLangMatch && metaLangMatch[1]) {
      const lang = metaLangMatch[1]
        .trim()
        .toLowerCase()
        .split(/[-_,;\s]/)[0];
      if (lang && /^[a-z]{2,3}$/.test(lang)) {
        return lang;
      }
    }

    // 3. HTTP Header Content-Language
    if (headers) {
      const headerVal = headers['content-language'] ?? headers['Content-Language'];
      if (headerVal) {
        const lang = headerVal
          .trim()
          .toLowerCase()
          .split(/[-_,;\s]/)[0];
        if (lang && /^[a-z]{2,3}$/.test(lang)) {
          return lang;
        }
      }
    }

    return null;
  }

  private extractHeadings(html: string): HeadingItem[] {
    const headingRegex = /<h([1-6])\b[^>]*>(.*?)<\/h\1>/gis;
    const items: HeadingItem[] = [];

    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(html)) !== null) {
      const levelStr = match[1] ?? '1';
      const level = Number.parseInt(levelStr, 10);
      const rawText = match[2] ?? '';
      const text = decodeHtmlEntities(rawText.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();

      if (text) {
        items.push({ level, text });
      }
    }

    return items;
  }

  private createEmptyDocument(documentUrl: string): ExtractedDocument {
    return {
      documentUrl,
      canonicalUrl: documentUrl,
      title: '',
      description: '',
      headingItems: [],
      headings: '',
      bodyText: '',
      language: null,
      outboundLinks: [],
      discoveredUrls: [],
      textLength: 0,
    };
  }
}
