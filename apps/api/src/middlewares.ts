/**
 * @opensearch/api — Standard HTTP Middlewares (Phase 16)
 *
 * Implements core middleware layers:
 * 1. CORS Headers: Configurable Origin, Methods, Allowed Headers
 * 2. Request Timing & Logging: Trace request execution duration with structured logger
 * 3. Security Headers: Basic defensive headers (X-Content-Type-Options, X-Frame-Options)
 */

import { MiddlewareHandler } from './types.js';

export function createCorsMiddleware(allowedOrigin = '*'): MiddlewareHandler {
  return (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, X-Correlation-ID',
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
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    return next();
  };
}

export function createLoggingMiddleware(): MiddlewareHandler {
  return async (req, res, next, context) => {
    const start = Date.now();
    await next();
    const durationMs = Date.now() - start;

    context.logger.info('HTTP Request handled', {
      method: req.method,
      path: req.pathname,
      ip: req.ip,
      statusCode: res.raw.statusCode,
      durationMs,
    });
  };
}
