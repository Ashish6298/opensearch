import { describe, it, expect } from 'vitest';
import { getProjectIdentity, PROJECT_NAME, PROJECT_VERSION } from '../src/index.js';

describe('Shared Package Foundation', () => {
  it('should export correct project identity', () => {
    const identity = getProjectIdentity();
    expect(identity.name).toBe('OpenSearch');
    expect(identity.version).toBe('1.0.0');
    expect(PROJECT_NAME).toBe('OpenSearch');
    expect(PROJECT_VERSION).toBe('1.0.0');
  });
});
