import { describe, it, expect } from 'vitest';
import { getApiStatus, API_SERVICE_INFO, createApiContext } from '../src/index.js';

describe('Search API Application Boundary', () => {
  it('should return initial status correctly', () => {
    const status = getApiStatus();
    expect(status.name).toBe('OpenSearch');
    expect(status.version).toBe('1.0.0');
    expect(status.status).toBe('ok');
    expect(API_SERVICE_INFO.moduleName).toBe('@opensearch/api');
  });

  it('should initialize application context with typed config and logger', () => {
    const context = createApiContext({
      API_PORT: '3100',
      LOG_LEVEL: 'warn',
    });

    expect(context.config.api.server.port).toBe(3100);
    expect(context.logger.getLevel()).toBe('warn');
  });
});
