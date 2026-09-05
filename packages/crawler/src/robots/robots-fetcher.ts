/**
 * @opensearch/crawler — Robots.txt Fetcher (Phase 6)
 *
 * Safely fetches `/robots.txt` for a given URL or origin using the existing Phase 5 HttpFetcher:
 * - Constructs canonical `https://host:port/robots.txt` or `http://host:port/robots.txt`
 * - Leverages Phase 5 SSRF protection, timeout, response size limits, and manual redirects
 * - Handles 404/410/absent robots.txt gracefully
 * - Handles 5xx server errors and network failures safely
 */

import { Logger } from '@opensearch/shared';
import { HttpFetcher } from '../fetcher/fetcher-types.js';
import { ParsedRobotsTxt } from './robots-types.js';
import { parseRobotsTxt } from './robots-parser.js';

export interface FetchRobotsResult {
  origin: string;
  robotsUrl: string;
  status: 'success' | 'absent' | 'error';
  statusCode?: number;
  parsed: ParsedRobotsTxt | null;
  errorMessage?: string;
}

export interface RobotsFetcherOptions {
  fetcher: HttpFetcher;
  logger: Logger;
  maxRobotsBytes?: number;
}

/**
 * Derives the canonical origin (scheme://host[:port]) from a URL.
 */
export function getOriginFromUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  return `${parsed.protocol}//${parsed.host}`;
}

/**
 * Builds the canonical robots.txt URL for an origin or target URL.
 */
export function buildRobotsUrl(originOrUrl: string): string {
  const origin = getOriginFromUrl(originOrUrl);
  return `${origin}/robots.txt`;
}

export class RobotsFetcher {
  private readonly fetcher: HttpFetcher;
  private readonly logger: Logger;

  constructor(options: RobotsFetcherOptions) {
    this.fetcher = options.fetcher;
    this.logger = options.logger;
  }

  /**
   * Fetches and parses robots.txt for a given origin or URL.
   */
  async fetchRobots(originOrUrl: string): Promise<FetchRobotsResult> {
    let origin = '';
    let robotsUrl = '';

    try {
      origin = getOriginFromUrl(originOrUrl);
      robotsUrl = buildRobotsUrl(origin);
    } catch {
      return {
        origin: originOrUrl,
        robotsUrl: '',
        status: 'error',
        parsed: null,
        errorMessage: `Invalid URL format: "${originOrUrl.slice(0, 80)}"`,
      };
    }

    this.logger.debug('Fetching robots.txt', { origin, robotsUrl });

    try {
      const result = await this.fetcher.fetch({ url: robotsUrl });

      if (result.ok) {
        // Status 200–299
        const parsed = parseRobotsTxt(result.body);
        this.logger.debug('Successfully retrieved and parsed robots.txt', {
          origin,
          groupsCount: parsed.groups.length,
          sitemapsCount: parsed.sitemaps.length,
          contentLength: result.contentLength,
        });

        return {
          origin,
          robotsUrl,
          status: 'success',
          statusCode: result.statusCode,
          parsed,
        };
      }

      // Handle fetch errors
      if (result.statusCode === 404 || result.statusCode === 410) {
        // Explicit 404 Not Found or 410 Gone means no restrictions
        this.logger.debug('Robots.txt is absent (404/410), full access granted', {
          origin,
          statusCode: result.statusCode,
        });
        return {
          origin,
          robotsUrl,
          status: 'absent',
          statusCode: result.statusCode,
          parsed: null,
        };
      }

      // 5xx server error, 403 Forbidden, SSRF block, timeout, or network failure
      this.logger.warn('Failed to fetch robots.txt', {
        origin,
        code: result.code,
        statusCode: result.statusCode,
        message: result.message,
      });

      return {
        origin,
        robotsUrl,
        status: 'error',
        statusCode: result.statusCode,
        parsed: null,
        errorMessage: result.message,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn('Unexpected exception while fetching robots.txt', { origin, error: msg });
      return {
        origin,
        robotsUrl,
        status: 'error',
        parsed: null,
        errorMessage: msg,
      };
    }
  }
}
