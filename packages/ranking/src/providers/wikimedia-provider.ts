/**
 * @opensearch/ranking — Wikimedia Search Provider (Phase 70)
 *
 * Implements the official, documented Wikimedia OpenSearch Action API.
 * Free, permitted, open access, zero paid API keys, CC BY-SA 4.0 license.
 * Reference: https://www.mediawiki.org/wiki/API:Opensearch
 */

import {
  NormalizedSearchResult,
  ProviderMetadata,
  ProviderQueryOptions,
  ProviderQueryResult,
  SearchProvider,
} from './provider-types.js';

export const WIKIMEDIA_PROVIDER_METADATA: ProviderMetadata = {
  id: 'wikimedia',
  displayName: 'Wikipedia & Wikimedia',
  supportedCategories: ['general', 'encyclopedia', 'reference', 'academic'],
  endpoint: 'https://en.wikipedia.org/w/api.php',
  attribution: {
    name: 'Wikipedia / Wikimedia Foundation',
    url: 'https://www.wikimedia.org',
    license: 'CC BY-SA 4.0',
    requiredText: 'Source: Wikipedia (CC BY-SA 4.0)',
  },
  rateLimits: {
    maxRequestsPerMinute: 200,
    minDelayMs: 100,
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

export class WikimediaProvider implements SearchProvider {
  public readonly metadata: ProviderMetadata;
  private enabled: boolean;

  constructor(metadataOverride?: Partial<ProviderMetadata>, initialEnabled = true) {
    this.metadata = { ...WIKIMEDIA_PROVIDER_METADATA, ...metadataOverride };
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
        error: 'Wikimedia provider is disabled',
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
    const url = `${this.metadata.endpoint}?action=opensearch&search=${encodeURIComponent(trimmed)}&limit=${limit}&namespace=0&format=json`;

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
          error: `Wikimedia API responded with HTTP ${response.status} ${response.statusText}`,
        };
      }

      // OpenSearch API returns: [query, [titles], [descriptions], [urls]]
      const data = (await response.json()) as [string, string[], string[], string[]];
      const titles = data[1] || [];
      const descriptions = data[2] || [];
      const urls = data[3] || [];

      const results: NormalizedSearchResult[] = [];
      for (let i = 0; i < urls.length && results.length < limit; i++) {
        const title = titles[i]?.trim();
        const destUrl = urls[i]?.trim();
        const snippet = descriptions[i]?.trim() || `Wikipedia article about ${title}.`;

        if (destUrl && title) {
          results.push({
            title,
            canonicalUrl: destUrl,
            snippet,
            source: this.metadata.id,
            contentType: 'encyclopedia',
            attribution: this.metadata.attribution.requiredText,
            score: Math.max(0.1, 0.95 - i * 0.04),
          });
        }
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
        error: err?.message || 'Wikimedia fetch failed',
      };
    }
  }
}
