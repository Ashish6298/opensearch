/**
 * @opensearch/crawler — Sitemap Ingestion Types (Phase 41)
 *
 * Defines models and contracts for discovering, parsing, and ingesting sitemaps:
 * - XML <urlset> schemas with <loc>, <lastmod>, <changefreq>, <priority>
 * - XML <sitemapindex> recursive schemas with nested sitemaps
 * - Text sitemaps (one URL per line)
 * - Gzip-compressed sitemaps (.xml.gz)
 */

export interface SitemapUrlEntry {
  /** Target canonical URL */
  loc: string;
  /** ISO date string or raw timestamp string if present */
  lastmod?: string;
  /** Change frequency (always, hourly, daily, weekly, monthly, yearly, never) */
  changefreq?: string;
  /** Priority rating between 0.0 and 1.0 */
  priority?: number;
}

export interface SitemapIndexEntry {
  /** Target child sitemap URL */
  loc: string;
  /** ISO date string of child sitemap update */
  lastmod?: string;
}

export interface ParsedSitemap {
  /** Whether the document was a URL set or a sitemap index */
  type: 'urlset' | 'sitemapindex' | 'text';
  /** List of extracted URL entries (if type === 'urlset' or 'text') */
  urls: SitemapUrlEntry[];
  /** List of child sitemaps (if type === 'sitemapindex') */
  sitemaps: SitemapIndexEntry[];
  /** Total count of items extracted */
  totalCount: number;
  /** Warnings or non-fatal syntax issues encountered during parsing */
  warnings: string[];
}

export interface SitemapParserOptions {
  /** Maximum number of URLs to extract from a single sitemap (default: 50,000 per sitemap standard) */
  maxEntries?: number;
  /** Maximum nesting depth for sitemap indexes (default: 3) */
  maxDepth?: number;
  /** Strictness mode (default: false, gracefully ignores unrecognized XML tags) */
  strict?: boolean;
}

export interface SitemapFetchResult {
  sitemapUrl: string;
  ok: boolean;
  statusCode?: number;
  contentType?: string;
  parsed?: ParsedSitemap;
  errorMessage?: string;
}
