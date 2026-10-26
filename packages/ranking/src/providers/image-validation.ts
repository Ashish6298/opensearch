/**
 * @opensearch/ranking — Image Validation & News Recency Suite (Phase 80)
 *
 * Implements strict security, provenance, and temporal validation for categories:
 * - URL safety validation: rejects dangerous schemes (javascript:, file:, data: non-image)
 * - Image attribution and license verification
 * - Classification integrity: prevents relabeling general results as images or news
 * - Authentic news recency vs. staleness evaluation (zero timestamp fabrication)
 */

import { SearchResultItem } from '../results/result-types.js';
import { NormalizedSearchResult } from './provider-types.js';

const DISALLOWED_SCHEMES = [
  'javascript:',
  'vbscript:',
  'file:',
  'ftp:',
  'blob:',
  'about:',
  'chrome:',
  'view-source:',
];

/**
 * Validates and sanitizes image and thumbnail URLs.
 * Strictly permits only valid http: and https: protocols.
 * Rejects javascript: URLs, malformed URLs, and control characters.
 */
export function validateSafeImageUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 4096) return null;

  // Check for dangerous control characters
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return null;

  const lower = trimmed.toLowerCase();
  for (const scheme of DISALLOWED_SCHEMES) {
    if (lower.startsWith(scheme)) return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    // Hostname must be valid
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Validates that an image result includes valid source attribution and/or license information.
 */
export function validateImageAttribution(
  attribution: unknown,
  providerDisplayName?: string,
): string | null {
  if (typeof attribution === 'string' && attribution.trim().length > 0) {
    return attribution.trim();
  }
  if (providerDisplayName && providerDisplayName.trim().length > 0) {
    return `Source: ${providerDisplayName.trim()}`;
  }
  return null;
}

/**
 * Checks whether a result legitimately belongs to the Images category.
 * Enforces: Do not relabel general results as images!
 */
export function isImageResult(
  item: NormalizedSearchResult | SearchResultItem | { contentType?: string; thumbnail?: { url?: string }; thumbnailUrl?: string; source?: string },
): boolean {
  const cType = (item.contentType || '').toLowerCase();
  const isImageContentType = cType === 'image' || cType === 'multimedia';

  const thumbUrl = ('thumbnail' in item && item.thumbnail?.url)
    ? item.thumbnail.url
    : ('thumbnailUrl' in item ? item.thumbnailUrl : undefined);

  const hasSafeThumb = Boolean(thumbUrl && validateSafeImageUrl(thumbUrl));

  // Must have an image content type or be from an image provider and possess a safe thumbnail
  if (isImageContentType && hasSafeThumb) {
    return true;
  }

  const source = (item.source || '').toLowerCase();
  if ((source === 'wikimedia-images' || source === 'wikimedia-commons' || source.includes('image')) && hasSafeThumb) {
    return true;
  }

  return false;
}

/**
 * Checks whether a result legitimately belongs to the News category.
 * Enforces: Do not relabel general results as news!
 */
export function isNewsResult(
  item: NormalizedSearchResult | SearchResultItem | { source?: string; contentType?: string; url?: string; canonicalUrl?: string },
): boolean {
  const source = (item.source || '').toLowerCase();
  if (source === 'hackernews' || source === 'news' || source.includes('news')) {
    return true;
  }

  const cType = (item.contentType || '').toLowerCase();
  const destUrl = ('canonicalUrl' in item ? item.canonicalUrl : ('url' in item ? item.url : '')) || '';
  const urlLower = destUrl.toLowerCase();

  // If item is specifically marked as an article and comes from a verified news domain
  if (cType === 'article') {
    const isNewsDomain = /(news\.|blog\.|theverge\.com|techcrunch\.com|arstechnica\.com|ycombinator\.com|lobste\.rs|reuters\.com|bloomberg\.com|bbc\.co)/i.test(urlLower);
    if (isNewsDomain) {
      return true;
    }
  }

  return false;
}

export interface NewsRecencyEvaluation {
  isRecent: boolean;
  isStale: boolean;
  label: string;
  ageDays: number;
  formattedDate: string;
}

/**
 * Accurately evaluates publication timestamp recency vs staleness.
 * Never fabricates publication dates; returns null if missing or invalid.
 */
export function evaluateNewsRecency(
  publishedAt: string | undefined,
  referenceNowMs: number = Date.now(),
): NewsRecencyEvaluation | null {
  if (!publishedAt || typeof publishedAt !== 'string') {
    return null;
  }

  const trimmed = publishedAt.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  const timeMs = parsed.getTime();
  if (isNaN(timeMs)) {
    return null;
  }

  const ageMs = Math.max(0, referenceNowMs - timeMs);
  const ageMinutes = Math.floor(ageMs / (60 * 1000));
  const ageHours = Math.floor(ageMs / (60 * 60 * 1000));
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  const formattedDate = parsed.toISOString().split('T')[0] ?? '';

  if (ageHours < 24) {
    const label = ageHours < 1
      ? (ageMinutes <= 1 ? 'Just now' : `${ageMinutes}m ago`)
      : `${ageHours}h ago`;
    return {
      isRecent: true,
      isStale: false,
      label,
      ageDays: 0,
      formattedDate,
    };
  }

  if (ageDays <= 7) {
    return {
      isRecent: true,
      isStale: false,
      label: `${ageDays}d ago`,
      ageDays,
      formattedDate,
    };
  }

  if (ageDays <= 30) {
    const weeks = Math.floor(ageDays / 7);
    return {
      isRecent: false,
      isStale: false,
      label: `${weeks}w ago`,
      ageDays,
      formattedDate,
    };
  }

  // Older than 30 days is distinguished as stale / archival news
  const months = Math.floor(ageDays / 30);
  const staleLabel = ageDays > 365
    ? `${Math.floor(ageDays / 365)}y ago`
    : `${months}mo ago`;

  return {
    isRecent: false,
    isStale: true,
    label: staleLabel,
    ageDays,
    formattedDate,
  };
}
