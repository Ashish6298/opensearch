/**
 * @opensearch/api — Standard HTTP Middlewares (Phase 16 & 18)
 *
 * Implements core middleware layers:
 * 1. CORS Headers: Configurable Origin, Methods, Allowed Headers & Preflight
 * 2. Security Headers: Defensive HTTP headers (CSP, X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy)
 * 3. Rate Limiting: IP-based sliding window rate limiter emitting standard rate-limit headers
 * 4. Request Timeout: Abort and timeout protection against slow/stalled operations
 * 5. Request Logging: Structured execution logs with privacy minimization (IP anonymization)
 */

import { HTTP_STATUS, TimeoutError, anonymizeIpAddress } from '@opensearch/shared';
import { MemoryRateLimiter } from './rate-limiter.js';
import { MiddlewareHandler } from './types.js';

/**
 * Anonymizes an IP address for privacy-conscious logging.
 * Delegated to central @opensearch/shared anonymizeIpAddress.
 */
export function anonymizeIp(ip: string): string {
  return anonymizeIpAddress(ip);
}

export function createCorsMiddleware(allowedOrigin = '*'): MiddlewareHandler {
  return (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, X-Correlation-ID',
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Cache, Retry-After',
    );
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      res.sendEmpty(204);
      return;
    }

    return next();
  };
}

export function createSecurityHeadersMiddleware(): MiddlewareHandler {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );

    // Phase 31: Add HSTS header when accessed over HTTPS / TLS reverse proxy
    const isHttps =
      req.raw.headers['x-forwarded-proto'] === 'https' ||
      (req.raw.socket as unknown as { encrypted?: boolean }).encrypted === true ||
      process.env.NODE_ENV === 'production';
    if (isHttps) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    return next();
  };
}

export function createRateLimitMiddleware(rateLimiter: MemoryRateLimiter): MiddlewareHandler {
  return (req, res, next) => {
    const clientKey = req.ip || '127.0.0.1';
    const result = rateLimiter.consume(clientKey);

    res.setHeader('X-RateLimit-Limit', result.limit.toString());
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTimeMs / 1000).toString());

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfterSeconds.toString());
      res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        error: {
          message: `Too many requests. Please retry after ${result.retryAfterSeconds} seconds.`,
          code: 'RATE_LIMIT_EXCEEDED',
          category: 'SECURITY',
          statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    return next();
  };
}

export function createTimeoutMiddleware(timeoutMs: number): MiddlewareHandler {
  return async (req, _res, next) => {
    let timer: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new TimeoutError(`Request timed out after ${timeoutMs}ms.`, {
            code: 'REQUEST_TIMEOUT',
            statusCode: HTTP_STATUS.GATEWAY_TIMEOUT,
            context: { path: req.pathname, timeoutMs },
          }),
        );
      }, timeoutMs);
    });

    try {
      await Promise.race([next(), timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  };
}

export function createLoggingMiddleware(): MiddlewareHandler {
  return async (req, res, next, context) => {
    const start = Date.now();
    await next();
    const durationMs = Date.now() - start;

    // Structured logging with privacy minimization (anonymized IP, no auth secrets logged)
    context.logger.info('HTTP Request handled', {
      method: req.method,
      path: req.pathname,
      ip: anonymizeIp(req.ip),
      statusCode: res.raw.statusCode,
      durationMs,
    });
  };
}
