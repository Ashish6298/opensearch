/**
 * @opensearch/crawler — Sitemap Service & Auto-Discovery Engine (Phase 41)
 *
 * Coordinates sitemap discovery from robots.txt directives and well-known root paths,
 * fetches sitemaps using HttpFetcher, recursively traverses sitemap indexes up to maxDepth,
 * and enqueues discovered URLs into the crawler queue while respecting politeness and robots policies.
 */

import { Logger, createLogger } from '@opensearch/shared';
import { HttpFetcher } from '../fetcher/fetcher-types.js';
import { RobotsPolicyEvaluator } from '../robots/robots-types.js';
import { CrawlQueue } from '../queue/queue-types.js';
import { ENQUEUE_RESULT } from '../url/url-model.js';
import { computeUrlHash } from '../url/url-fingerprint.js';
import { CRAWL_STATUS, StorageAdapter } from '@opensearch/storage';
import { SitemapParser } from './sitemap-parser.js';
import { SitemapFetchResult, SitemapUrlEntry } from './sitemap-types.js';

export interface SitemapServiceOptions {
  fetcher: HttpFetcher;
  robotsEvaluator?: RobotsPolicyEvaluator;
  queue?: CrawlQueue;
  storage?: StorageAdapter;
  parser?: SitemapParser;
  logger?: Logger;
  maxIndexDepth?: number;
  maxSitemapsPerDomain?: number;
}

export interface IngestSitemapsSummary {
  domain: string;
  sitemapsDiscovered: string[];
  sitemapsParsed: number;
  urlsExtracted: number;
  urlsQueued: number;
  disallowedCount: number;
  errors: string[];
}

export class SitemapService {
  private readonly fetcher: HttpFetcher;
  private readonly robotsEvaluator?: RobotsPolicyEvaluator;
  private readonly queue?: CrawlQueue;
  private readonly storage?: StorageAdapter;
  private readonly parser: SitemapParser;
  private readonly logger: Logger;
  private readonly maxIndexDepth: number;
  private readonly maxSitemapsPerDomain: number;

  constructor(options: SitemapServiceOptions) {
    this.fetcher = options.fetcher;
    this.robotsEvaluator = options.robotsEvaluator;
    this.queue = options.queue;
    this.storage = options.storage;
    this.parser = options.parser ?? new SitemapParser();
    this.logger = options.logger ?? createLogger('@opensearch/crawler:sitemap-service');
    this.maxIndexDepth = options.maxIndexDepth ?? 3;
    this.maxSitemapsPerDomain = options.maxSitemapsPerDomain ?? 20;
  }

  /**
   * Fetches and parses a single sitemap URL (or gzipped sitemap).
   */
  async fetchAndParseSitemap(sitemapUrl: string): Promise<SitemapFetchResult> {
    try {
      const fetchResult = await this.fetcher.fetch({ url: sitemapUrl, depth: 0 });

      if (!fetchResult.ok) {
        return {
          sitemapUrl,
          ok: false,
          statusCode: fetchResult.statusCode,
          errorMessage: fetchResult.message,
        };
      }

      const body = fetchResult.body;
      const parsed = this.parser.parse(body, sitemapUrl);

      return {
        sitemapUrl,
        ok: true,
        statusCode: fetchResult.statusCode,
        contentType: fetchResult.contentType,
        parsed,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        sitemapUrl,
        ok: false,
        errorMessage: msg,
      };
    }
  }

  /**
   * Discovers and ingests all sitemaps for a target seed or domain.
   * If sitemaps are declared in robotsSitemaps, uses them; otherwise attempts standard /sitemap.xml.
   */
  async ingestDomainSitemaps(
    domainOrUrl: string,
    robotsSitemaps?: string[],
  ): Promise<IngestSitemapsSummary> {
    let domain = domainOrUrl;
    let baseOrigin = '';

    try {
      const parsed = new URL(
        domainOrUrl.startsWith('http') ? domainOrUrl : `https://${domainOrUrl}`,
      );
      domain = parsed.hostname;
      baseOrigin = `${parsed.protocol}//${parsed.host}`;
    } catch {
      baseOrigin = `https://${domainOrUrl}`;
    }

    const candidateSitemaps: string[] = [];
    if (robotsSitemaps && robotsSitemaps.length > 0) {
      for (const s of robotsSitemaps) {
        if (!candidateSitemaps.includes(s)) {
          candidateSitemaps.push(s);
        }
      }
    } else {
      // Default well-known sitemap paths
      candidateSitemaps.push(`${baseOrigin}/sitemap.xml`);
    }

    const summary: IngestSitemapsSummary = {
      domain,
      sitemapsDiscovered: [...candidateSitemaps],
      sitemapsParsed: 0,
      urlsExtracted: 0,
      urlsQueued: 0,
      disallowedCount: 0,
      errors: [],
    };

    const visitedSitemaps = new Set<string>();
    const pendingSitemaps: Array<{ url: string; depth: number }> = candidateSitemaps.map(url => ({
      url,
      depth: 0,
    }));

    while (pendingSitemaps.length > 0 && visitedSitemaps.size < this.maxSitemapsPerDomain) {
      const current = pendingSitemaps.shift();
      if (!current || visitedSitemaps.has(current.url)) continue;
      if (current.depth > this.maxIndexDepth) continue;

      visitedSitemaps.add(current.url);
      const res = await this.fetchAndParseSitemap(current.url);

      if (!res.ok || !res.parsed) {
        if (res.errorMessage) {
          summary.errors.push(`${current.url}: ${res.errorMessage}`);
        }
        continue;
      }

      summary.sitemapsParsed++;

      // If sitemapindex, enqueue nested child sitemaps
      if (res.parsed.type === 'sitemapindex') {
        for (const child of res.parsed.sitemaps) {
          if (!visitedSitemaps.has(child.loc)) {
            pendingSitemaps.push({ url: child.loc, depth: current.depth + 1 });
            if (!summary.sitemapsDiscovered.includes(child.loc)) {
              summary.sitemapsDiscovered.push(child.loc);
            }
          }
        }
      } else {
        // urlset or text sitemap -> process URLs
        for (const urlEntry of res.parsed.urls) {
          summary.urlsExtracted++;
          const queued = await this.processDiscoveredSitemapUrl(urlEntry);
          if (queued === 'queued') {
            summary.urlsQueued++;
          } else if (queued === 'disallowed') {
            summary.disallowedCount++;
          }
        }
      }
    }

    this.logger.info('Sitemap ingestion completed for domain', {
      domain,
      parsed: summary.sitemapsParsed,
      extracted: summary.urlsExtracted,
      queued: summary.urlsQueued,
      disallowed: summary.disallowedCount,
    });

    return summary;
  }

  /**
   * Evaluates robots.txt policy and enqueues allowed sitemap URL into queue & storage.
   */
  private async processDiscoveredSitemapUrl(
    entry: SitemapUrlEntry,
  ): Promise<'queued' | 'disallowed' | 'skipped' | 'duplicate'> {
    const targetUrl = entry.loc;

    // 1. Robots.txt policy check
    if (this.robotsEvaluator) {
      const decision = await this.robotsEvaluator.isUrlAllowed(targetUrl);
      if (!decision.allowed) {
        return 'disallowed';
      }
    }

    // 2. Enqueue into CrawlQueue if available
    let wasQueued = false;
    if (this.queue) {
      const outcome = await this.queue.enqueue(targetUrl, 1, null);
      if (outcome.code === ENQUEUE_RESULT.QUEUED) {
        wasQueued = true;
      }
    }

    // 3. Store in UrlRepository if storage available
    if (this.storage) {
      const urlHash = computeUrlHash(targetUrl);
      const existing = await this.storage.urls.findByHash(urlHash);
      if (!existing) {
        try {
          const parsed = new URL(targetUrl);
          await this.storage.urls.create({
            url: targetUrl,
            urlHash,
            domain: parsed.hostname,
            scheme: parsed.protocol === 'https:' ? 'https' : 'http',
            crawlStatus: CRAWL_STATUS.PENDING,
            referrerUrl: null,
            depth: 1,
            lastHttpStatus: null,
          });
        } catch (err) {
          this.logger.debug('Failed to record sitemap URL in UrlRepository', { targetUrl, err });
        }
      }
    }

    return wasQueued ? 'queued' : 'skipped';
  }
}

export function createSitemapService(options: SitemapServiceOptions): SitemapService {
  return new SitemapService(options);
}
