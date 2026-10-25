/**
 * @opensearch/ranking — Search Provider Normalizer (Phase 69)
 *
 * Normalizes disparate search provider results into the shared NormalizedSearchResult schema
 * and provides seamless conversion to SearchResultItem for ranking and UI layers,
 * keeping provider-specific wire structures isolated.
 */

import { SearchResultItem } from '../results/result-types.js';
import { NormalizedSearchResult, ProviderMetadata } from './provider-types.js';

export interface RawResultInput {
  title?: string;
  url?: string;
  link?: string;
  canonicalUrl?: string;
  snippet?: string;
  description?: string;
  summary?: string;
  abstract?: string;
  timestamp?: string;
  date?: string;
  lastModified?: string;
  thumbnailUrl?: string;
  thumbnail?: { url: string; width?: number; height?: number };
  contentType?: string;
  score?: number;
  [key: string]: unknown;
}

/**
 * Normalizes arbitrary provider response items into the typed NormalizedSearchResult schema.
 */
export function normalizeProviderResult(
  raw: RawResultInput,
  providerMeta: ProviderMetadata,
): NormalizedSearchResult {
  const title = (raw.title || raw.url || raw.canonicalUrl || 'Untitled Result').trim();
  const canonicalUrl = (raw.canonicalUrl || raw.url || raw.link || '').trim();
  const snippet = (
    raw.snippet ||
    raw.description ||
    raw.summary ||
    raw.abstract ||
    `Result from ${providerMeta.displayName}`
  ).trim();

  let thumbnail = raw.thumbnail;
  if (!thumbnail && raw.thumbnailUrl && typeof raw.thumbnailUrl === 'string') {
    thumbnail = { url: raw.thumbnailUrl };
  }

  const attribution =
    providerMeta.attribution.requiredText ||
    (providerMeta.attribution.license
      ? `Source: ${providerMeta.attribution.name} (${providerMeta.attribution.license})`
      : `Source: ${providerMeta.attribution.name}`);

  const timestamp = raw.timestamp || raw.date || raw.lastModified || undefined;

  return {
    title,
    canonicalUrl,
    snippet,
    source: providerMeta.id,
    contentType: (raw.contentType as any) || 'webpage',
    timestamp,
    attribution,
    thumbnail,
    score: typeof raw.score === 'number' ? Math.max(0, Math.min(1, raw.score)) : undefined,
    metadata: raw,
  };
}

/**
 * Converts NormalizedSearchResults into standard SearchResultItems for ranking and UI rendering.
 * Retains complete provenance (source, attribution, content type, thumbnail).
 */
export function convertToSearchResultItem(
  normalized: NormalizedSearchResult,
  rank: number,
  baseScore: number = 0.90,
): SearchResultItem {
  let domain = '';
  try {
    if (normalized.canonicalUrl.includes('://')) {
      domain = new URL(normalized.canonicalUrl).hostname.replace(/^www\./, '');
    } else {
      domain = normalized.canonicalUrl;
    }
  } catch {
    domain = normalized.canonicalUrl;
  }

  const displayUrl = domain ? `${domain} › ...` : normalized.canonicalUrl;

  return {
    documentId: `${normalized.source}-${rank}`,
    score: normalized.score ?? Math.max(0.1, baseScore - rank * 0.02),
    rank,
    title: normalized.title,
    highlightedTitle: normalized.title,
    url: normalized.canonicalUrl,
    displayUrl,
    domain,
    snippet: normalized.snippet,
    highlightedSnippet: normalized.snippet,
    language: 'en',
    indexedAt: normalized.timestamp || new Date().toISOString(),
    source: normalized.source,
    contentType: normalized.contentType,
    attribution: normalized.attribution,
    thumbnailUrl: normalized.thumbnail?.url,
  };
}
