/**
 * @opensearch/ranking — Hacker News Search Provider (Phase 70)
 *
 * Implements the official, documented Hacker News Search API (Algolia).
 * Free, permitted, open access, zero paid API keys.
 * Reference: https://hn.algolia.com/api
 */

import {
  NormalizedSearchResult,
  ProviderMetadata,
  ProviderQueryOptions,
  ProviderQueryResult,
  SearchProvider,
} from './provider-types.js';

export const HACKERNEWS_PROVIDER_METADATA: ProviderMetadata = {
  id: 'hackernews',
  displayName: 'Hacker News (Y Combinator)',
  supportedCategories: ['general', 'code', 'news'],
  endpoint: 'https://hn.algolia.com/api/v1/search',
  attribution: {
    name: 'Hacker News / Algolia',
    url: 'https://news.ycombinator.com',
    license: 'Public / Permitted Search API',
    requiredText: 'Source: Hacker News (Y Combinator)',
  },
  rateLimits: {
    maxRequestsPerMinute: 60,
    minDelayMs: 200,
  },
  timeoutMs: 3000,
  cachePolicy: {
    enabled: true,
    ttlSeconds: 600,
  },
  privacy: {
    querySentToOrigin: true,
    forwardClientIp: false,
    forwardCookies: false,
    logsRetentionPolicy: 'standard-web-logs',
    requiresAuth: false,
  },
};

interface HnHit {
  title?: string;
  story_title?: string;
  url?: string;
  story_url?: string;
  objectID: string;
  story_text?: string;
  comment_text?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
}

interface HnResponse {
  hits?: HnHit[];
  nbHits?: number;
}

export class HackerNewsProvider implements SearchProvider {
  public readonly metadata: ProviderMetadata;
  private enabled: boolean;

  constructor(metadataOverride?: Partial<ProviderMetadata>, initialEnabled = true) {
    this.metadata = { ...HACKERNEWS_PROVIDER_METADATA, ...metadataOverride };
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
        error: 'Hacker News provider is disabled',
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
    const url = `${this.metadata.endpoint}?query=${encodeURIComponent(trimmed)}&hitsPerPage=${limit}&tags=story`;

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
          error: `Hacker News API responded with HTTP ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as HnResponse;
      const hits = data.hits || [];
      const results: NormalizedSearchResult[] = [];

      for (let i = 0; i < hits.length && results.length < limit; i++) {
        const hit = hits[i]!;
        const title = (hit.title || hit.story_title || '').trim();
        const destUrl = (
          hit.url ||
          hit.story_url ||
          `https://news.ycombinator.com/item?id=${hit.objectID}`
        ).trim();

        if (title && destUrl) {
          const points = hit.points ?? 0;
          const comments = hit.num_comments ?? 0;
          const snippet =
            hit.story_text?.replace(/<[^>]+>/g, '').trim() ||
            `Discussion on Hacker News with ${points} points and ${comments} comments.`;

          results.push({
            title,
            canonicalUrl: destUrl,
            snippet,
            source: this.metadata.id,
            contentType: 'article',
            attribution: this.metadata.attribution.requiredText,
            timestamp: hit.created_at,
            score: Math.max(0.1, 0.90 - i * 0.03),
            metadata: {
              points,
              comments,
              hnItemId: hit.objectID,
            },
          });
        }
      }

      return {
        providerId: this.metadata.id,
        results,
        durationMs: Date.now() - startMs,
        totalHits: data.nbHits ?? results.length,
      };
    } catch (err: any) {
      return {
        providerId: this.metadata.id,
        results: [],
        durationMs: Date.now() - startMs,
        error: err?.message || 'Hacker News fetch failed',
      };
    }
  }
}
