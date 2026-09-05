/**
 * @opensearch/crawler — HTTP Fetcher Implementation (Phase 5)
 *
 * Fetches public web resources using the WHATWG Fetch API (built into Node ≥ 18).
 * The fetcher is a thin, replaceable implementation of the HttpFetcher interface.
 *
 * Key guarantees:
 *  - ALWAYS returns FetchResult (never throws)
 *  - Timeout enforced via AbortSignal.timeout
 *  - Streaming body read with immediate abort if body exceeds maxPageBytes
 *  - Content-Type verified against ALLOWED_CONTENT_TYPE_PREFIXES
 *  - Retries with exponential backoff on transient errors (503, 504, 429, timeout, network)
 *  - Non-retriable errors (404, 403, 400, SSRF, invalid URL) fail immediately
 *  - Manual redirect following (redirect: 'manual'):
 *      - Tracks full redirectChain and redirectCount
 *      - Fails with REDIRECT_FAILURE if redirectCount > maxRedirects
 *      - Re-checks SSRF guard on EVERY redirect target before following
 *      - Normalizes every redirect target URL before following
 */

import { Logger, ALLOWED_CONTENT_TYPE_PREFIXES, CRAWLER_LIMITS } from '@opensearch/shared';

import { validateUrl } from '../url/url-validator.js';
import { normalizeUrl } from '../url/url-normalizer.js';
import { ssrfCheck } from './ssrf-guard.js';
import {
  FETCH_ERROR_CODE,
  FetchFailure,
  FetchResult,
  FetchSuccess,
  FetchTarget,
  HttpFetcher,
} from './fetcher-types.js';

function nowMs(): number {
  return Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetriable(code: string, statusCode?: number): boolean {
  if (
    code === FETCH_ERROR_CODE.TIMEOUT ||
    code === FETCH_ERROR_CODE.CONNECTION_FAILURE ||
    code === FETCH_ERROR_CODE.NETWORK_ERROR ||
    code === FETCH_ERROR_CODE.DNS_FAILURE
  ) {
    return true;
  }
  if (code === FETCH_ERROR_CODE.HTTP_SERVER_ERROR && (statusCode === 503 || statusCode === 504)) {
    return true;
  }
  if (code === FETCH_ERROR_CODE.HTTP_CLIENT_ERROR && statusCode === 429) {
    return true;
  }
  return false;
}

function isAllowedContentType(ct: string): boolean {
  const lower = ct.toLowerCase().trim();
  return ALLOWED_CONTENT_TYPE_PREFIXES.some(prefix => lower.startsWith(prefix));
}

function classifyFetchError(err: unknown, startMs: number): FetchFailure {
  const durationMs = nowMs() - startMs;
  const msg = err instanceof Error ? err.message : String(err);
  const msgLower = msg.toLowerCase();

  if (err instanceof Error && err.name === 'AbortError') {
    return {
      ok: false,
      code: FETCH_ERROR_CODE.TIMEOUT,
      message: 'Request aborted due to timeout',
      redirectCount: 0,
      retryCount: 0,
      durationMs,
      retryable: true,
    };
  }

  if (msgLower.includes('enotfound') || msgLower.includes('getaddrinfo')) {
    return {
      ok: false,
      code: FETCH_ERROR_CODE.DNS_FAILURE,
      message: 'DNS resolution failed',
      redirectCount: 0,
      retryCount: 0,
      durationMs,
      retryable: true,
    };
  }

  if (
    msgLower.includes('econnrefused') ||
    msgLower.includes('econnreset') ||
    msgLower.includes('connection refused') ||
    msgLower.includes('socket hang up') ||
    msgLower.includes('epipe')
  ) {
    return {
      ok: false,
      code: FETCH_ERROR_CODE.CONNECTION_FAILURE,
      message: 'Connection failed or was reset',
      redirectCount: 0,
      retryCount: 0,
      durationMs,
      retryable: true,
    };
  }

  return {
    ok: false,
    code: FETCH_ERROR_CODE.NETWORK_ERROR,
    message: 'Network error during fetch',
    redirectCount: 0,
    retryCount: 0,
    durationMs,
    retryable: true,
  };
}

export interface NodeFetcherConfig {
  timeoutMs?: number;
  maxRedirects?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  maxPageBytes?: number;
  userAgent?: string;
  logger: Logger;
}

export class NodeFetcher implements HttpFetcher {
  private readonly cfg: Required<Omit<NodeFetcherConfig, 'logger'>> & { logger: Logger };

  constructor(cfg: NodeFetcherConfig) {
    this.cfg = {
      timeoutMs: cfg.timeoutMs ?? CRAWLER_LIMITS.DEFAULT_TIMEOUT_MS,
      maxRedirects: cfg.maxRedirects ?? CRAWLER_LIMITS.DEFAULT_MAX_REDIRECTS,
      maxRetries: cfg.maxRetries ?? CRAWLER_LIMITS.DEFAULT_MAX_RETRIES,
      retryBackoffMs: cfg.retryBackoffMs ?? CRAWLER_LIMITS.DEFAULT_RETRY_BACKOFF_MS,
      maxPageBytes: cfg.maxPageBytes ?? CRAWLER_LIMITS.DEFAULT_MAX_PAGE_BYTES,
      userAgent: cfg.userAgent ?? CRAWLER_LIMITS.DEFAULT_USER_AGENT,
      logger: cfg.logger,
    };
  }

  async fetch(target: FetchTarget): Promise<FetchResult> {
    const validation = validateUrl(target.url);
    if (!validation.ok) {
      const isPrivate = validation.reason.toLowerCase().includes('private/loopback');
      return {
        ok: false,
        code: isPrivate ? FETCH_ERROR_CODE.SSRF_REJECTED : FETCH_ERROR_CODE.INVALID_TARGET,
        message: validation.reason,
        redirectCount: 0,
        retryCount: 0,
        durationMs: 0,
        retryable: false,
      };
    }

    const normResult = normalizeUrl(target.url);
    if (!normResult.ok) {
      return {
        ok: false,
        code: FETCH_ERROR_CODE.INVALID_TARGET,
        message: normResult.reason,
        redirectCount: 0,
        retryCount: 0,
        durationMs: 0,
        retryable: false,
      };
    }

    const startingUrl = normResult.normalized;

    const ssrf = await ssrfCheck(startingUrl);
    if (!ssrf.safe) {
      this.cfg.logger.warn('SSRF check failed on initial target', {
        host: new URL(startingUrl).hostname,
        reason: ssrf.reason,
      });
      return {
        ok: false,
        code: FETCH_ERROR_CODE.SSRF_REJECTED,
        message: `Target rejected by SSRF guard: ${ssrf.reason ?? 'private or internal host'}`,
        redirectCount: 0,
        retryCount: 0,
        durationMs: 0,
        retryable: false,
      };
    }

    let retryCount = 0;
    const maxRetries = this.cfg.maxRetries;

    while (true) {
      const result = await this.doFetch(startingUrl, retryCount);

      if (result.ok) {
        return result;
      }

      const shouldRetry =
        retryCount < maxRetries && result.retryable && isRetriable(result.code, result.statusCode);

      if (!shouldRetry) {
        return { ...result, retryCount };
      }

      const backoffMs = Math.min(
        this.cfg.retryBackoffMs * Math.pow(2, retryCount),
        CRAWLER_LIMITS.MAX_RETRY_BACKOFF_MS,
      );

      this.cfg.logger.info('Transient fetch failure, retrying', {
        url: target.url,
        attempt: retryCount + 1,
        maxRetries,
        backoffMs,
        errorCode: result.code,
        statusCode: result.statusCode,
      });

      await sleep(backoffMs);
      retryCount++;
    }
  }

  private async doFetch(initialUrl: string, retryCount: number): Promise<FetchResult> {
    const startMs = nowMs();
    let currentUrl = initialUrl;
    let redirectCount = 0;
    const redirectChain: string[] = [];

    while (true) {
      let response: Response;
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), this.cfg.timeoutMs);

      try {
        response = await fetch(currentUrl, {
          method: 'GET',
          headers: {
            'User-Agent': this.cfg.userAgent,
            Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
            'Accept-Encoding': 'gzip, deflate, br',
          },
          redirect: 'manual',
          signal: abortController.signal,
        });
      } catch (err) {
        clearTimeout(timeoutId);
        const failure = classifyFetchError(err, startMs);
        return {
          ...failure,
          finalUrl: currentUrl,
          redirectCount,
          retryCount,
        };
      } finally {
        clearTimeout(timeoutId);
      }

      // Handle Redirects (301, 302, 303, 307, 308)
      if (
        response.status === 301 ||
        response.status === 302 ||
        response.status === 303 ||
        response.status === 307 ||
        response.status === 308
      ) {
        const location = response.headers.get('location');
        if (!location) {
          return {
            ok: false,
            code: FETCH_ERROR_CODE.REDIRECT_FAILURE,
            message: `Redirect response (${response.status}) had no Location header`,
            statusCode: response.status,
            finalUrl: currentUrl,
            redirectCount,
            retryCount,
            durationMs: nowMs() - startMs,
            retryable: false,
          };
        }

        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).href;
        } catch {
          return {
            ok: false,
            code: FETCH_ERROR_CODE.REDIRECT_FAILURE,
            message: `Invalid Location header in redirect: "${location.slice(0, 80)}"`,
            statusCode: response.status,
            finalUrl: currentUrl,
            redirectCount,
            retryCount,
            durationMs: nowMs() - startMs,
            retryable: false,
          };
        }

        const validRedirect = validateUrl(nextUrl);
        if (!validRedirect.ok) {
          return {
            ok: false,
            code: FETCH_ERROR_CODE.REDIRECT_FAILURE,
            message: `Redirect target rejected: ${validRedirect.reason}`,
            statusCode: response.status,
            finalUrl: nextUrl,
            redirectCount,
            retryCount,
            durationMs: nowMs() - startMs,
            retryable: false,
          };
        }

        const normRedirect = normalizeUrl(nextUrl);
        if (!normRedirect.ok) {
          return {
            ok: false,
            code: FETCH_ERROR_CODE.REDIRECT_FAILURE,
            message: `Redirect target failed normalization: ${normRedirect.reason}`,
            statusCode: response.status,
            finalUrl: nextUrl,
            redirectCount,
            retryCount,
            durationMs: nowMs() - startMs,
            retryable: false,
          };
        }

        const canonicalNextUrl = normRedirect.normalized;

        const ssrfRedirect = await ssrfCheck(canonicalNextUrl);
        if (!ssrfRedirect.safe) {
          this.cfg.logger.warn('SSRF guard rejected redirect target', {
            target: canonicalNextUrl,
            reason: ssrfRedirect.reason,
          });
          return {
            ok: false,
            code: FETCH_ERROR_CODE.SSRF_REJECTED,
            message: `Redirect target rejected by SSRF guard: ${ssrfRedirect.reason}`,
            statusCode: response.status,
            finalUrl: canonicalNextUrl,
            redirectCount,
            retryCount,
            durationMs: nowMs() - startMs,
            retryable: false,
          };
        }

        redirectCount++;
        redirectChain.push(canonicalNextUrl);

        if (redirectCount > this.cfg.maxRedirects) {
          return {
            ok: false,
            code: FETCH_ERROR_CODE.REDIRECT_FAILURE,
            message: `Exceeded maximum redirect limit of ${this.cfg.maxRedirects}`,
            statusCode: response.status,
            finalUrl: canonicalNextUrl,
            redirectCount,
            retryCount,
            durationMs: nowMs() - startMs,
            retryable: false,
          };
        }

        currentUrl = canonicalNextUrl;
        continue;
      }

      const durationMs = nowMs() - startMs;

      // Handle 4xx Client Errors
      if (response.status >= 400 && response.status < 500) {
        return {
          ok: false,
          code: FETCH_ERROR_CODE.HTTP_CLIENT_ERROR,
          message: `HTTP ${response.status} Client Error`,
          statusCode: response.status,
          finalUrl: currentUrl,
          redirectCount,
          retryCount,
          durationMs,
          retryable: response.status === 429,
        };
      }

      // Handle 5xx Server Errors
      if (response.status >= 500) {
        return {
          ok: false,
          code: FETCH_ERROR_CODE.HTTP_SERVER_ERROR,
          message: `HTTP ${response.status} Server Error`,
          statusCode: response.status,
          finalUrl: currentUrl,
          redirectCount,
          retryCount,
          durationMs,
          retryable: response.status === 503 || response.status === 504,
        };
      }

      // Check Content-Type
      const rawContentType = response.headers.get('content-type') ?? '';
      const contentType = rawContentType.split(';')[0]?.trim().toLowerCase() ?? '';

      if (!contentType || !isAllowedContentType(contentType)) {
        return {
          ok: false,
          code: FETCH_ERROR_CODE.UNSUPPORTED_CONTENT_TYPE,
          message: contentType
            ? `Content-Type "${rawContentType.slice(0, 80)}" is not accepted`
            : 'Response had no Content-Type header',
          statusCode: response.status,
          contentType,
          finalUrl: currentUrl,
          redirectCount,
          retryCount,
          durationMs,
          retryable: false,
        };
      }

      if (!response.body) {
        const normNoBody = normalizeUrl(currentUrl);
        const finalUrl = normNoBody.ok ? normNoBody.normalized : currentUrl;
        return {
          ok: true,
          finalUrl,
          statusCode: response.status,
          contentType,
          body: '',
          contentLength: 0,
          durationMs: nowMs() - startMs,
          redirectCount,
          redirectChain,
          retryCount,
        };
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytesReceived = 0;
      let bodyAborted = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            bytesReceived += value.length;
            if (bytesReceived > this.cfg.maxPageBytes) {
              await reader.cancel();
              bodyAborted = true;
              break;
            }
            chunks.push(value);
          }
        }
      } catch (err) {
        const failure = classifyFetchError(err, startMs);
        return {
          ...failure,
          redirectCount,
          retryCount,
        };
      }

      if (bodyAborted) {
        return {
          ok: false,
          code: FETCH_ERROR_CODE.CONTENT_SIZE_EXCEEDED,
          message: `Response body exceeded maximum size of ${this.cfg.maxPageBytes} bytes`,
          statusCode: response.status,
          contentType,
          finalUrl: currentUrl,
          redirectCount,
          retryCount,
          durationMs: nowMs() - startMs,
          retryable: false,
        };
      }

      const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
      const combined = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      const body = new TextDecoder('utf-8', { fatal: false }).decode(combined);

      const normFinal = normalizeUrl(currentUrl);
      const finalUrl = normFinal.ok ? normFinal.normalized : currentUrl;

      this.cfg.logger.debug('Fetch success', {
        finalUrl,
        statusCode: response.status,
        contentType,
        contentLength: totalBytes,
        durationMs: nowMs() - startMs,
        redirectCount,
        retryCount,
      });

      return {
        ok: true,
        finalUrl,
        statusCode: response.status,
        contentType,
        body,
        contentLength: totalBytes,
        durationMs: nowMs() - startMs,
        redirectCount,
        redirectChain,
        retryCount,
      } satisfies FetchSuccess;
    }
  }
}
