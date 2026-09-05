/**
 * @opensearch/crawler — HTML Parsing & Content Extraction Types (Phase 7)
 *
 * Defines domain models and contracts for extracting clean, searchable
 * document content and outbound discovery links from raw HTML.
 */

export interface HeadingItem {
  /** Heading tag level (1-6 for h1-h6) */
  level: number;
  /** Inner text of the heading, normalized */
  text: string;
}

export interface ExtractedLink {
  /** Raw href attribute value */
  rawHref: string;
  /** Resolved, normalized canonical URL */
  normalizedUrl: string;
  /** Anchor text if present */
  anchorText: string;
  /** Whether the link is internal to the document's origin */
  isInternal: boolean;
}

export interface ExtractedDocument {
  /** The base URL / document URL provided during extraction */
  documentUrl: string;
  /** Canonical URL extracted from <link rel="canonical"> or defaulting to documentUrl */
  canonicalUrl: string;
  /** Page title (<title> or og:title or h1 fallback) */
  title: string;
  /** Meta description (<meta name="description"> or og:description) */
  description: string;
  /** Structured headings (h1–h6) */
  headingItems: HeadingItem[];
  /** Flattened, space-separated headings string for easy indexing */
  headings: string;
  /** Clean, readable visible text content without scripts/styles/nav noise */
  bodyText: string;
  /** Detected or declared language (e.g. 'en', 'es', 'de', or null) */
  language: string | null;
  /** Extracted, validated, and normalized outbound links */
  outboundLinks: ExtractedLink[];
  /** Deduped list of normalized outbound URL strings */
  discoveredUrls: string[];
  /** Content length of the extracted body text in characters */
  textLength: number;
}

export interface HtmlParserOptions {
  /** Maximum length of extracted title (default: 300 characters) */
  maxTitleLength?: number;
  /** Maximum length of extracted description (default: 1000 characters) */
  maxDescriptionLength?: number;
  /** Maximum length of extracted body text (default: 1,000,000 characters) */
  maxBodyTextLength?: number;
  /** Maximum number of outbound links to extract per page (default: 500) */
  maxLinks?: number;
  /** Whether to strip navigation (<nav>, <header>, <footer>, <aside>) noise */
  stripNavNoise?: boolean;
}

export interface HtmlParser {
  /**
   * Parses raw HTML string and extracts structured content.
   * NEVER throws — always returns an ExtractedDocument (with empty fields if HTML is malformed or empty).
   *
   * @param html Raw HTML response body
   * @param documentUrl Canonical or final response URL of the document
   * @param httpHeaders Optional HTTP response headers (e.g. for Content-Language)
   */
  parse(
    html: string,
    documentUrl: string,
    httpHeaders?: Record<string, string | undefined>,
  ): ExtractedDocument;
}
