import { describe, it, expect } from 'vitest';
import { getWebInfo, WEB_APP_INFO } from '../src/index.js';

describe('Web Frontend Application Boundary', () => {
  it('should return initial web info correctly', () => {
    const info = getWebInfo();
    expect(info.title).toBe('OpenSearch');
    expect(info.version).toBe('1.0.0');
    expect(WEB_APP_INFO.moduleName).toBe('@opensearch/web');
  });
});
