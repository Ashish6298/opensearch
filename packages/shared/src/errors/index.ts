import { HTTP_STATUS } from '../constants.js';

export type ErrorCategory =
  | 'CONFIG'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TIMEOUT'
  | 'SECURITY'
  | 'STORAGE'
  | 'NETWORK'
  | 'INTERNAL';

export interface ErrorOptions {
  code?: string;
  statusCode?: number;
  category?: ErrorCategory;
  cause?: unknown;
  context?: Record<string, unknown>;
}

export interface SafeErrorResponse {
  error: {
    message: string;
    code: string;
    category: ErrorCategory;
    statusCode: number;
    timestamp: string;
  };
}

/**
 * Base Application Error for OpenSearch
 */
export class OpenSearchError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly category: ErrorCategory;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: string;

  constructor(message: string, options: ErrorOptions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code ?? 'OPENSEARCH_ERROR';
    this.statusCode = options.statusCode ?? HTTP_STATUS.INTERNAL_SERVER_ERROR;
    this.category = options.category ?? 'INTERNAL';
    this.context = options.context;
    this.timestamp = new Date().toISOString();

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      category: this.category,
      context: this.context,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Configuration Error
 */
export class ConfigError extends OpenSearchError {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'CONFIG_ERROR',
      statusCode: options.statusCode ?? HTTP_STATUS.INTERNAL_SERVER_ERROR,
      category: 'CONFIG',
      ...options,
    });
  }
}

/**
 * Validation Error
 */
export class ValidationError extends OpenSearchError {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'VALIDATION_ERROR',
      statusCode: options.statusCode ?? HTTP_STATUS.BAD_REQUEST,
      category: 'VALIDATION',
      ...options,
    });
  }
}

/**
 * Resource Not Found Error
 */
export class NotFoundError extends OpenSearchError {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'NOT_FOUND_ERROR',
      statusCode: options.statusCode ?? HTTP_STATUS.NOT_FOUND,
      category: 'NOT_FOUND',
      ...options,
    });
  }
}

/**
 * Conflict Error (Duplicates, State clashes)
 */
export class ConflictError extends OpenSearchError {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'CONFLICT_ERROR',
      statusCode: options.statusCode ?? HTTP_STATUS.CONFLICT,
      category: 'CONFLICT',
      ...options,
    });
  }
}

/**
 * Operational Timeout Error
 */
export class TimeoutError extends OpenSearchError {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'TIMEOUT_ERROR',
      statusCode: options.statusCode ?? HTTP_STATUS.GATEWAY_TIMEOUT,
      category: 'TIMEOUT',
      ...options,
    });
  }
}

/**
 * Security & Abuse Protection Error (SSRF, dangerous URL, abuse limit)
 */
export class SecurityError extends OpenSearchError {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'SECURITY_ERROR',
      statusCode: options.statusCode ?? HTTP_STATUS.FORBIDDEN,
      category: 'SECURITY',
      ...options,
    });
  }
}

/**
 * Storage & Persistence Error
 */
export class StorageError extends OpenSearchError {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'STORAGE_ERROR',
      statusCode: options.statusCode ?? HTTP_STATUS.INTERNAL_SERVER_ERROR,
      category: 'STORAGE',
      ...options,
    });
  }
}

/**
 * Service Unavailable Error (Temporary outage, degradation)
 */
export class ServiceUnavailableError extends OpenSearchError {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'SERVICE_UNAVAILABLE',
      statusCode: options.statusCode ?? HTTP_STATUS.SERVICE_UNAVAILABLE,
      category: 'NETWORK',
      ...options,
    });
  }
}

/**
 * Formats an error into a safe client-facing payload without leaking stack traces or secrets.
 */
export function toSafeErrorResponse(error: unknown): SafeErrorResponse {
  if (error instanceof OpenSearchError) {
    return {
      error: {
        message: error.message,
        code: error.code,
        category: error.category,
        statusCode: error.statusCode,
        timestamp: error.timestamp,
      },
    };
  }

  const message = error instanceof Error ? error.message : 'An unexpected internal error occurred.';

  return {
    error: {
      message,
      code: 'INTERNAL_SERVER_ERROR',
      category: 'INTERNAL',
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      timestamp: new Date().toISOString(),
    },
  };
}
