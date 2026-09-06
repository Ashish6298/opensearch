/**
 * @opensearch/api — HTTP Router & Dispatcher (Phase 16)
 *
 * Lightweight, fast, zero-external-dependency HTTP router supporting:
 * - Parameterized path matching (/api/v1/search, /items/:id)
 * - Middleware pipeline execution (CORS, body parsing, logging, error handling)
 * - Strict HTTP method matching
 * - Graceful 404 Not Found & 405 Method Not Allowed handling
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import {
  HTTP_STATUS,
  NotFoundError,
  OpenSearchError,
  toSafeErrorResponse,
  ValidationError,
} from '@opensearch/shared';
import {
  ApiAppContext,
  ApiRequest,
  ApiResponse,
  HttpMethod,
  MiddlewareHandler,
  RouteDefinition,
  RouteHandler,
} from './types.js';

export class Router {
  private readonly routes: RouteDefinition[] = [];
  private readonly middlewares: MiddlewareHandler[] = [];

  /**
   * Registers a middleware function to run on all requests.
   */
  use(middleware: MiddlewareHandler): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Registers a route handler for a given HTTP method and path pattern.
   */
  addRoute(method: HttpMethod, pathPattern: string, handler: RouteHandler): this {
    const { regex, paramNames } = this.compilePathPattern(pathPattern);
    this.routes.push({
      method: method.toUpperCase(),
      pattern: regex,
      paramNames,
      handler,
    });
    return this;
  }

  get(path: string, handler: RouteHandler): this {
    return this.addRoute('GET', path, handler);
  }

  post(path: string, handler: RouteHandler): this {
    return this.addRoute('POST', path, handler);
  }

  put(path: string, handler: RouteHandler): this {
    return this.addRoute('PUT', path, handler);
  }

  delete(path: string, handler: RouteHandler): this {
    return this.addRoute('DELETE', path, handler);
  }

  options(path: string, handler: RouteHandler): this {
    return this.addRoute('OPTIONS', path, handler);
  }

  /**
   * Dispatches an incoming HTTP request through middleware and matched route handler.
   */
  async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    context: ApiAppContext,
  ): Promise<void> {
    const apiRes = this.createResponseWrapper(res);

    try {
      const apiReq = await this.createRequestWrapper(req, context);

      // Execute middleware chain
      let index = 0;
      const next = async (): Promise<void> => {
        if (index < this.middlewares.length) {
          const mw = this.middlewares[index++];
          if (mw) {
            await mw(apiReq, apiRes, next, context);
          }
        } else {
          await this.dispatchRoute(apiReq, apiRes, context);
        }
      };

      await next();
    } catch (err: unknown) {
      this.handleError(err, apiRes, context);
    }
  }

  private async dispatchRoute(
    req: ApiRequest,
    res: ApiResponse,
    context: ApiAppContext,
  ): Promise<void> {
    const method = req.method;
    const pathname = req.pathname;

    let pathMatched = false;

    for (const route of this.routes) {
      const match = pathname.match(route.pattern);
      if (match) {
        pathMatched = true;
        if (route.method === method || route.method === '*') {
          // Extract path parameters
          const params: Record<string, string> = {};
          if (route.paramNames && route.paramNames.length > 0) {
            for (let i = 0; i < route.paramNames.length; i++) {
              const paramName = route.paramNames[i];
              if (paramName && match[i + 1]) {
                params[paramName] = decodeURIComponent(match[i + 1]!);
              }
            }
          }
          req.params = params;
          await route.handler(req, res, context);
          return;
        }
      }
    }

    if (pathMatched) {
      res.status(HTTP_STATUS.METHOD_NOT_ALLOWED).json({
        error: {
          message: `Method ${method} is not allowed for ${pathname}`,
          code: 'METHOD_NOT_ALLOWED',
          category: 'VALIDATION',
          statusCode: HTTP_STATUS.METHOD_NOT_ALLOWED,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    throw new NotFoundError(`Endpoint '${pathname}' was not found on this server.`, {
      context: { method, pathname },
    });
  }

  private handleError(err: unknown, res: ApiResponse, context: ApiAppContext): void {
    const safeError = toSafeErrorResponse(err);
    const statusCode =
      err instanceof OpenSearchError ? err.statusCode : HTTP_STATUS.INTERNAL_SERVER_ERROR;

    if (statusCode >= 500) {
      context.logger.error('Unhandled API error during request processing', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    } else {
      context.logger.warn('API client error', {
        code: safeError.error.code,
        message: safeError.error.message,
        statusCode,
      });
    }

    res.status(statusCode).json(safeError);
  }

  private async createRequestWrapper(
    req: IncomingMessage,
    context: ApiAppContext,
  ): Promise<ApiRequest> {
    const hostHeader = req.headers.host || 'localhost';
    const parsedUrl = new URL(req.url || '/', `http://${hostHeader}`);

    const query: Record<string, string | string[] | undefined> = {};
    for (const [key, value] of parsedUrl.searchParams.entries()) {
      if (query[key] !== undefined) {
        if (Array.isArray(query[key])) {
          (query[key] as string[]).push(value);
        } else {
          query[key] = [query[key] as string, value];
        }
      } else {
        query[key] = value;
      }
    }

    const headers: Record<string, string | string[] | undefined> = {};
    for (const [key, val] of Object.entries(req.headers)) {
      headers[key.toLowerCase()] = val;
    }

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';

    // Parse body for POST / PUT / PATCH requests
    let body: unknown = undefined;
    const method = (req.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      body = await this.readRequestBody(req, context.config.api.bodyLimitBytes);
    }

    return {
      raw: req,
      method,
      pathname: parsedUrl.pathname,
      query,
      params: {},
      headers,
      body,
      ip,
    };
  }

  private createResponseWrapper(res: ServerResponse): ApiResponse {
    const wrapper: ApiResponse = {
      raw: res,
      status(code: number) {
        res.statusCode = code;
        return this;
      },
      setHeader(name: string, value: string | number | readonly string[]) {
        res.setHeader(name, value);
        return this;
      },
      json(data: unknown) {
        const payload = JSON.stringify(data);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Length', Buffer.byteLength(payload));
        res.end(payload);
      },
      text(data: string, contentType = 'text/plain; charset=utf-8') {
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', Buffer.byteLength(data));
        res.end(data);
      },
      sendEmpty(code = 204) {
        res.statusCode = code;
        res.end();
      },
    };
    return wrapper;
  }

  private async readRequestBody(req: IncomingMessage, limitBytes: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      req.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes > limitBytes) {
          reject(
            new ValidationError(
              `Request body exceeds maximum allowed size of ${limitBytes} bytes.`,
              {
                code: 'PAYLOAD_TOO_LARGE',
                statusCode: HTTP_STATUS.PAYLOAD_TOO_LARGE,
              },
            ),
          );
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (chunks.length === 0) {
          resolve(undefined);
          return;
        }

        const raw = Buffer.concat(chunks).toString('utf-8').trim();
        if (!raw) {
          resolve(undefined);
          return;
        }

        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(
              new ValidationError('Malformed JSON payload provided in request body.', {
                code: 'INVALID_JSON',
                statusCode: HTTP_STATUS.BAD_REQUEST,
              }),
            );
          }
        } else {
          resolve(raw);
        }
      });

      req.on('error', err => {
        reject(err);
      });
    });
  }

  private compilePathPattern(pattern: string): { regex: RegExp; paramNames: string[] } {
    if (pattern === '/' || pattern === '') {
      return { regex: /^\/?$/, paramNames: [] };
    }

    const paramNames: string[] = [];
    const regexPattern = pattern.replace(/\/+$/, '').replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });

    return {
      regex: new RegExp(`^${regexPattern}\\/?$`),
      paramNames,
    };
  }
}
