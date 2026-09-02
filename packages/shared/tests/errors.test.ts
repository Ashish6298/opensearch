import { describe, it, expect } from 'vitest';
import {
  OpenSearchError,
  ConfigError,
  ValidationError,
  NotFoundError,
  ConflictError,
  TimeoutError,
  SecurityError,
  StorageError,
  ServiceUnavailableError,
  toSafeErrorResponse,
  HTTP_STATUS,
} from '../src/index.js';

describe('Common Error Foundation', () => {
  it('should instantiate OpenSearchError and domain subclasses with correct properties', () => {
    const err = new ValidationError('Query too long', {
      code: 'QUERY_TOO_LONG',
      context: { length: 300, max: 200 },
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(OpenSearchError);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toBe('Query too long');
    expect(err.code).toBe('QUERY_TOO_LONG');
    expect(err.category).toBe('VALIDATION');
    expect(err.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(err.context?.length).toBe(300);
    expect(err.timestamp).toBeDefined();
  });

  it('should maintain status codes for distinct error categories', () => {
    expect(new ConfigError('Bad config').statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    expect(new NotFoundError('Document missing').statusCode).toBe(HTTP_STATUS.NOT_FOUND);
    expect(new ConflictError('Duplicate URL').statusCode).toBe(HTTP_STATUS.CONFLICT);
    expect(new TimeoutError('Fetch timed out').statusCode).toBe(HTTP_STATUS.GATEWAY_TIMEOUT);
    expect(new SecurityError('SSRF blocked').statusCode).toBe(HTTP_STATUS.FORBIDDEN);
    expect(new StorageError('Disk full').statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    expect(new ServiceUnavailableError('Overloaded').statusCode).toBe(
      HTTP_STATUS.SERVICE_UNAVAILABLE,
    );
  });

  it('should convert OpenSearchError to safe client error payload without stack traces', () => {
    const err = new SecurityError('Private IP access rejected', {
      code: 'SSRF_DETECTED',
      context: { host: '192.168.1.1' },
    });

    const safe = toSafeErrorResponse(err);
    expect(safe.error.message).toBe('Private IP access rejected');
    expect(safe.error.code).toBe('SSRF_DETECTED');
    expect(safe.error.category).toBe('SECURITY');
    expect(safe.error.statusCode).toBe(403);
    expect(safe.error.timestamp).toBeDefined();
    // Context or stack must not leak into safe client error
    expect((safe.error as Record<string, unknown>).context).toBeUndefined();
    expect((safe.error as Record<string, unknown>).stack).toBeUndefined();
  });

  it('should handle generic errors safely', () => {
    const genericErr = new Error('Unexpected crash');
    const safe = toSafeErrorResponse(genericErr);

    expect(safe.error.message).toBe('Unexpected crash');
    expect(safe.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(safe.error.statusCode).toBe(500);
  });
});
