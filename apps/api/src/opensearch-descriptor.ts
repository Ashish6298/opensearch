/**
 * @opensearch/api — OpenSearch Description Document (OSDD) Generator (Phase 108)
 *
 * Generates an OpenSearch 1.1 standards-compatible XML description document
 * allowing browsers (Firefox, Chrome, Brave, Edge, Vivaldi, Safari) to auto-discover
 * and install OpenSearch as a native address bar search engine.
 *
 * Implements:
 * - Specification: OpenSearch 1.1 Draft 6 (http://a9.com/-/spec/opensearch/1.1/)
 * - MIME Type: application/opensearchdescription+xml
 * - URL Templates for search results and interactive autocompletion suggestions
 * - Distinct product identity to avoid confusion with Amazon OpenSearch / AWS Elasticsearch
 */

export interface OpenSearchDescriptorOptions {
  /** Deployment base URL (e.g., 'http://localhost:3000' or 'https://search.mydomain.com') */
  baseUrl?: string;
  /** Short product name displayed in browser search bars (max 16 characters) */
  shortName?: string;
  /** Full product name */
  longName?: string;
  /** Clear, non-deceptive product description */
  description?: string;
  /** Contact email or administrative URL */
  contact?: string;
  /** Descriptive tags separated by space */
  tags?: string;
  /** Relative or absolute URL template for search results HTML */
  searchTemplatePath?: string;
  /** Relative or absolute URL template for search suggestions JSON */
  suggestTemplatePath?: string;
  /** Path to favicon or search icon */
  iconPath?: string;
  /** Supported languages */
  language?: string;
}

export const OPENSEARCH_DESCRIPTOR_MIME_TYPE = 'application/opensearchdescription+xml; charset=utf-8';

export const DEFAULT_DESCRIPTOR_CONFIG = {
  shortName: 'OpenSearch Web', // Exactly 14 characters (<= 16 char standard requirement)
  longName: 'OpenSearch Privacy-First Web Search',
  description:
    'Independent, privacy-first web search engine with zero tracking and zero telemetry. (Not affiliated with Amazon Web Services or Amazon OpenSearch Service).',
  contact: 'https://github.com/Ashish6298/opensearch',
  tags: 'search web privacy independent open-source',
  language: 'en-US',
  iconPath: '/favicon.ico',
  searchTemplatePath: '/?q={searchTerms}',
  suggestTemplatePath: '/api/v1/suggest?q={searchTerms}&format=opensearch',
};

/**
 * Sanitizes an XML text string against XML entity injection.
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates the complete, standards-compliant OpenSearch 1.1 XML descriptor.
 * Accepts either a baseUrl string or an OpenSearchDescriptorOptions object.
 */
export function generateOpenSearchDescriptor(
  baseUrlOrOptions: string | OpenSearchDescriptorOptions = {},
  extraOptions: OpenSearchDescriptorOptions = {}
): string {
  const options: OpenSearchDescriptorOptions =
    typeof baseUrlOrOptions === 'string'
      ? { baseUrl: baseUrlOrOptions, ...extraOptions }
      : { ...baseUrlOrOptions, ...extraOptions };

  const rawBaseUrl = options.baseUrl && options.baseUrl.trim().length > 0
    ? options.baseUrl.trim()
    : 'http://localhost:3000';
  
  // Strip trailing slashes for clean template concatenation
  const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, '');

  const shortName = (options.shortName ?? DEFAULT_DESCRIPTOR_CONFIG.shortName).slice(0, 16);
  const description = options.description ?? DEFAULT_DESCRIPTOR_CONFIG.description;
  const contact = options.contact ?? DEFAULT_DESCRIPTOR_CONFIG.contact;
  const tags = options.tags ?? DEFAULT_DESCRIPTOR_CONFIG.tags;
  const language = options.language ?? DEFAULT_DESCRIPTOR_CONFIG.language;

  const searchPath = options.searchTemplatePath ?? DEFAULT_DESCRIPTOR_CONFIG.searchTemplatePath;
  const suggestPath = options.suggestTemplatePath ?? DEFAULT_DESCRIPTOR_CONFIG.suggestTemplatePath;
  const iconPath = options.iconPath ?? DEFAULT_DESCRIPTOR_CONFIG.iconPath;

  const searchUrlTemplate = `${cleanBaseUrl}${searchPath.startsWith('/') ? searchPath : `/${searchPath}`}`;
  const suggestUrlTemplate = `${cleanBaseUrl}${suggestPath.startsWith('/') ? suggestPath : `/${suggestPath}`}`;
  const iconUrl = `${cleanBaseUrl}${iconPath.startsWith('/') ? iconPath : `/${iconPath}`}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>${escapeXml(shortName)}</ShortName>
  <Description>${escapeXml(description)}</Description>
  <Tags>${escapeXml(tags)}</Tags>
  <Contact>${escapeXml(contact)}</Contact>
  <Url type="text/html" method="get" template="${escapeXml(searchUrlTemplate)}"/>
  <Url type="application/x-suggestions+json" method="get" template="${escapeXml(suggestUrlTemplate)}"/>
  <Image height="16" width="16" type="image/x-icon">${escapeXml(iconUrl)}</Image>
  <InputEncoding>UTF-8</InputEncoding>
  <OutputEncoding>UTF-8</OutputEncoding>
  <Language>${escapeXml(language)}</Language>
  <Developer>OpenSearch Community</Developer>
  <Attribution>Search results and indexing by OpenSearch independent engine with privacy-preserving fallback.</Attribution>
  <SyndicationRight>open</SyndicationRight>
  <AdultContent>false</AdultContent>
</OpenSearchDescription>
`.trim();
}
