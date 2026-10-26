/**
 * @opensearch/ranking — Wikimedia Commons Image Search Provider (Phase 80)
 *
 * Implements the official, documented Wikimedia Commons Action API for safe image search.
 * Free, permitted, open access, zero paid API keys, Creative Commons & Public Domain images.
 * Reference: https://commons.wikimedia.org/w/api.php
 */

import { validateSafeImageUrl } from './image-validation.js';
import {
  NormalizedSearchResult,
  ProviderMetadata,
  ProviderQueryOptions,
  ProviderQueryResult,
  SearchProvider,
} from './provider-types.js';

export const WIKIMEDIA_IMAGE_PROVIDER_METADATA: ProviderMetadata = {
  id: 'wikimedia-images',
  displayName: 'Wikimedia Commons (Images)',
  supportedCategories: ['multimedia'],
  endpoint: 'https://commons.wikimedia.org/w/api.php',
  attribution: {
    name: 'Wikimedia Commons',
    url: 'https://commons.wikimedia.org',
    license: 'CC BY-SA / Public Domain',
    requiredText: 'Source: Wikimedia Commons (CC / Public Domain)',
  },
  rateLimits: {
    maxRequestsPerMinute: 120,
    minDelayMs: 200,
  },
  timeoutMs: 3000,
  cachePolicy: {
    enabled: true,
    ttlSeconds: 3600,
  },
  privacy: {
    querySentToOrigin: true,
    forwardClientIp: false,
    forwardCookies: false,
    logsRetentionPolicy: 'anonymized-aggregated',
    requiresAuth: false,
  },
};

interface WikimediaImageInfo {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  width?: number;
  height?: number;
  extmetadata?: {
    Artist?: { value?: string };
    LicenseShortName?: { value?: string };
    UsageTerms?: { value?: string };
    ImageDescription?: { value?: string };
    DateTime?: { value?: string };
  };
}

interface WikimediaPageItem {
  pageid?: number;
  title?: string;
  imageinfo?: WikimediaImageInfo[];
}

interface WikimediaQueryResponse {
  query?: {
    pages?: Record<string, WikimediaPageItem>;
  };
}

export class WikimediaImageProvider implements SearchProvider {
  public readonly metadata: ProviderMetadata;
  private enabled: boolean;

  constructor(metadataOverride?: Partial<ProviderMetadata>, initialEnabled = true) {
    this.metadata = { ...WIKIMEDIA_IMAGE_PROVIDER_METADATA, ...metadataOverride };
    this.enabled = initialEnabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async search(query: string, options: ProviderQueryOptions = {}): Promise<ProviderQueryResult> {
    const startMs = Date.now();

    if (!this.enabled) {
      return {
        providerId: this.metadata.id,
        results: [],
        durationMs: Date.now() - startMs,
        error: 'Wikimedia Image provider is disabled',
      };
    }

    const trimmed = query.trim();
    if (!trimmed) {
      return {
        providerId: this.metadata.id,
        results: [],
        durationMs: Date.now() - startMs,
        totalHits: 0,
      };
    }

    const limit = options.limit ?? 10;
    const timeoutMs = options.timeoutMs ?? this.metadata.timeoutMs;
    const url = `${this.metadata.endpoint}?action=query&generator=search&gsrsearch=${encodeURIComponent(trimmed)}&gsrnamespace=6&prop=imageinfo&iiprop=url|size|extmetadata&format=json&gsrlimit=${limit}`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'OpenSearch/1.4.0 (https://github.com/Ashish6298/opensearch; search@opensearch.local)',
          Accept: 'application/json',
        },
        signal: options.signal ?? AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        return {
          providerId: this.metadata.id,
          results: [],
          durationMs: Date.now() - startMs,
          error: `Wikimedia Commons API responded with HTTP ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as WikimediaQueryResponse;
      const pagesObj = data?.query?.pages || {};
      const pages = Object.values(pagesObj);

      const results: NormalizedSearchResult[] = [];

      for (let i = 0; i < pages.length && results.length < limit; i++) {
        const page = pages[i];
        if (!page) continue;

        const info = page.imageinfo?.[0];
        if (!info) continue;

        const rawImageUrl = info.thumburl || info.url;
        const safeImageUrl = validateSafeImageUrl(rawImageUrl);
        if (!safeImageUrl) continue; // Enforce safe thumbnail URL

        const rawDestUrl = info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title || '')}`;
        const safeDestUrl = validateSafeImageUrl(rawDestUrl) || rawDestUrl;

        // Clean title (remove "File:" prefix and file extension)
        const rawTitle = page.title || 'Untitled Image';
        const displayTitle = rawTitle.replace(/^File:/i, '').replace(/\.[a-zA-Z0-9]+$/, '').replace(/_/g, ' ').trim();

        // License and artist attribution
        const license = info.extmetadata?.LicenseShortName?.value?.trim() || 'CC / Public Domain';
        const artist = info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, '').trim();
        const attribution = artist
          ? `${artist} · Wikimedia Commons (${license})`
          : `Wikimedia Commons (${license})`;

        const desc = info.extmetadata?.ImageDescription?.value?.replace(/<[^>]+>/g, '').trim();
        const snippet = desc || `Image of ${displayTitle} from Wikimedia Commons. Licensed under ${license}.`;
        const timestamp = info.extmetadata?.DateTime?.value?.trim();

        results.push({
          title: displayTitle,
          canonicalUrl: safeDestUrl,
          snippet,
          source: this.metadata.id,
          contentType: 'multimedia',
          timestamp: timestamp || undefined,
          attribution,
          thumbnail: {
            url: safeImageUrl,
            width: info.width,
            height: info.height,
          },
          score: Math.max(0.1, 0.95 - i * 0.04),
          metadata: {
            license,
            artist,
            width: info.width,
            height: info.height,
          },
        });
      }

      return {
        providerId: this.metadata.id,
        results,
        durationMs: Date.now() - startMs,
        totalHits: results.length,
      };
    } catch (err: any) {
      return {
        providerId: this.metadata.id,
        results: [],
        durationMs: Date.now() - startMs,
        error: err?.message || 'Wikimedia Commons Image fetch failed',
      };
    }
  }
}
