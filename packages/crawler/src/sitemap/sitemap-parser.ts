/**
 * @opensearch/crawler — XML & Text Sitemap Parser (Phase 41)
 *
 * Implements standard Sitemaps XML 0.9 protocol parser (urlset and sitemapindex),
 * plain text sitemaps, and gzip decompression:
 * - Extracts <loc>, <lastmod>, <changefreq>, <priority>
 * - Normalizes & validates URLs
 * - Never throws unhandled exceptions on malformed XML
 */

import * as zlib from 'node:zlib';
import { validateUrl } from '../url/url-validator.js';
import { normalizeUrl } from '../url/url-normalizer.js';
import {
  ParsedSitemap,
  SitemapIndexEntry,
  SitemapParserOptions,
  SitemapUrlEntry,
} from './sitemap-types.js';

export class SitemapParser {
  private readonly maxEntries: number;

  constructor(options: SitemapParserOptions = {}) {
    this.maxEntries = options.maxEntries ?? 50_000;
  }

  /**
   * Decompresses gzipped buffer if gzipped, or converts buffer to string.
   */
  decompressIfNeeded(input: Buffer | Uint8Array | string): string {
    if (typeof input === 'string') {
      return input;
    }

    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);

    // Check gzip magic header (0x1f, 0x8b)
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
      try {
        return zlib.gunzipSync(buf).toString('utf-8');
      } catch {
        // Fallback: try deflate
        try {
          return zlib.inflateSync(buf).toString('utf-8');
        } catch {
          // If decompression fails, treat as plain utf-8
          return buf.toString('utf-8');
        }
      }
    }

    return buf.toString('utf-8');
  }

  /**
   * Parses raw content (XML string, text string, or Buffer) into structured ParsedSitemap.
   */
  parse(rawContent: string | Buffer | Uint8Array, sourceUrl?: string): ParsedSitemap {
    const text = this.decompressIfNeeded(rawContent).trim();

    if (!text) {
      return {
        type: 'urlset',
        urls: [],
        sitemaps: [],
        totalCount: 0,
        warnings: ['Empty sitemap content'],
      };
    }

    // Determine format: XML <sitemapindex>, XML <urlset>, or plain text
    if (/<sitemapindex[\s>]/i.test(text)) {
      return this.parseSitemapIndexXml(text, sourceUrl);
    } else if (/<urlset[\s>]/i.test(text)) {
      return this.parseUrlsetXml(text, sourceUrl);
    } else if (text.startsWith('<?xml') && /<sitemap[\s>]/i.test(text)) {
      return this.parseSitemapIndexXml(text, sourceUrl);
    } else if (text.startsWith('<?xml') && /<url[\s>]/i.test(text)) {
      return this.parseUrlsetXml(text, sourceUrl);
    } else if (!text.includes('<url') && !text.includes('<sitemap') && /(?:^|\n)\s*https?:\/\//i.test(text)) {
      return this.parseTextSitemap(text, sourceUrl);
    }

    // Default fallback: attempt urlset XML extraction
    return this.parseUrlsetXml(text, sourceUrl);
  }

  /**
   * Parses standard <urlset> XML documents.
   */
  private parseUrlsetXml(xml: string, sourceUrl?: string): ParsedSitemap {
    const urls: SitemapUrlEntry[] = [];
    const warnings: string[] = [];

    // Match all <url>...</url> blocks
    const urlBlockRegex = /<url[\s\S]*?<\/url>/gi;
    let match: RegExpExecArray | null;

    while ((match = urlBlockRegex.exec(xml)) !== null && urls.length < this.maxEntries) {
      const block = match[0];
      const locMatch = /<loc\s*>([\s\S]*?)<\/loc\s*>/i.exec(block);

      if (!locMatch) {
        continue;
      }

      const rawLoc = locMatch[1] ? this.cleanXmlText(locMatch[1]) : '';
      if (!rawLoc) continue;

      const normalized = this.validateAndNormalizeUrl(rawLoc, sourceUrl);
      if (!normalized) {
        warnings.push(`Invalid URL in sitemap: ${rawLoc}`);
        continue;
      }

      const entry: SitemapUrlEntry = {
        loc: normalized,
      };

      const lastmodMatch = /<lastmod\s*>([\s\S]*?)<\/lastmod\s*>/i.exec(block);
      if (lastmodMatch && lastmodMatch[1]) {
        const lastmod = this.cleanXmlText(lastmodMatch[1]);
        if (lastmod) {
          entry.lastmod = lastmod;
        }
      }

      const changefreqMatch = /<changefreq\s*>([\s\S]*?)<\/changefreq\s*>/i.exec(block);
      if (changefreqMatch && changefreqMatch[1]) {
        const changefreq = this.cleanXmlText(changefreqMatch[1]).toLowerCase();
        if (
          ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].includes(changefreq)
        ) {
          entry.changefreq = changefreq;
        }
      }

      const priorityMatch = /<priority\s*>([\s\S]*?)<\/priority\s*>/i.exec(block);
      if (priorityMatch && priorityMatch[1]) {
        const pNum = Number.parseFloat(this.cleanXmlText(priorityMatch[1]));
        if (!Number.isNaN(pNum) && pNum >= 0.0 && pNum <= 1.0) {
          entry.priority = Math.round(pNum * 10) / 10;
        }
      }

      urls.push(entry);
    }

    return {
      type: 'urlset',
      urls,
      sitemaps: [],
      totalCount: urls.length,
      warnings,
    };
  }

  /**
   * Parses <sitemapindex> XML documents containing references to child sitemaps.
   */
  private parseSitemapIndexXml(xml: string, sourceUrl?: string): ParsedSitemap {
    const sitemaps: SitemapIndexEntry[] = [];
    const warnings: string[] = [];

    const sitemapBlockRegex = /<sitemap[\s\S]*?<\/sitemap>/gi;
    let match: RegExpExecArray | null;

    while ((match = sitemapBlockRegex.exec(xml)) !== null && sitemaps.length < this.maxEntries) {
      const block = match[0];
      const locMatch = /<loc\s*>([\s\S]*?)<\/loc\s*>/i.exec(block);

      if (!locMatch || !locMatch[1]) {
        continue;
      }

      const rawLoc = this.cleanXmlText(locMatch[1]);
      if (!rawLoc) continue;

      const normalized = this.validateAndNormalizeUrl(rawLoc, sourceUrl);
      if (!normalized) {
        warnings.push(`Invalid child sitemap URL in sitemapindex: ${rawLoc}`);
        continue;
      }

      const entry: SitemapIndexEntry = {
        loc: normalized,
      };

      const lastmodMatch = /<lastmod\s*>([\s\S]*?)<\/lastmod\s*>/i.exec(block);
      if (lastmodMatch && lastmodMatch[1]) {
        const lastmod = this.cleanXmlText(lastmodMatch[1]);
        if (lastmod) {
          entry.lastmod = lastmod;
        }
      }

      sitemaps.push(entry);
    }

    return {
      type: 'sitemapindex',
      urls: [],
      sitemaps,
      totalCount: sitemaps.length,
      warnings,
    };
  }

  /**
   * Parses line-delimited plain text sitemaps (.txt).
   */
  private parseTextSitemap(text: string, sourceUrl?: string): ParsedSitemap {
    const urls: SitemapUrlEntry[] = [];
    const warnings: string[] = [];
    const lines = text.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const normalized = this.validateAndNormalizeUrl(line, sourceUrl);
      if (normalized) {
        urls.push({ loc: normalized });
      } else {
        warnings.push(`Invalid URL in text sitemap: ${line}`);
      }

      if (urls.length >= this.maxEntries) {
        break;
      }
    }

    return {
      type: 'text',
      urls,
      sitemaps: [],
      totalCount: urls.length,
      warnings,
    };
  }

  private cleanXmlText(str: string): string {
    if (!str) return '';
    // Strip CDATA wrapper if present: <![CDATA[ ... ]]>
    let clean = str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
    // Decode common XML entities
    clean = clean
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    return clean.trim();
  }

  private validateAndNormalizeUrl(rawUrl: string, baseUrl?: string): string | null {
    let target = rawUrl.trim();
    if (baseUrl && !target.startsWith('http://') && !target.startsWith('https://')) {
      try {
        target = new URL(target, baseUrl).toString();
      } catch {
        return null;
      }
    }

    const norm = normalizeUrl(target);
    if (!norm.ok) return null;

    const val = validateUrl(norm.normalized, { allowPrivate: true });
    return val.ok ? norm.normalized : null;
  }
}

export function createSitemapParser(options?: SitemapParserOptions): SitemapParser {
  return new SitemapParser(options);
}
