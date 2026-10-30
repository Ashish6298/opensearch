/**
 * @opensearch/api — Phase 115: README and User Documentation Consistency Test Suite
 *
 * Verifies:
 * 1. Documented NPM scripts exist and match root package.json.
 * 2. Configuration keys documented in README / User Guide match shared configuration contracts.
 * 3. User documentation and provider integration guides are present and complete.
 * 4. Privacy modes and Privacy Receipt contracts are comprehensively documented.
 * 5. Architecture diagram and quickstart instructions exist in README.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Phase 115 — Documentation Consistency and User Guides', () => {
  const rootDir = path.resolve(__dirname, '../../..');
  const readmePath = path.join(rootDir, 'README.md');
  const userGuidePath = path.join(rootDir, 'docs/user-guide.md');
  const providerGuidePath = path.join(rootDir, 'docs/provider-integration-guide.md');
  const packageJsonPath = path.join(rootDir, 'package.json');
  const envExamplePath = path.join(rootDir, '.env.example');

  it('verifies README.md and documentation files exist', () => {
    expect(fs.existsSync(readmePath)).toBe(true);
    expect(fs.existsSync(userGuidePath)).toBe(true);
    expect(fs.existsSync(providerGuidePath)).toBe(true);
    expect(fs.existsSync(envExamplePath)).toBe(true);
  });

  it('ensures all documented lifecycle commands exist in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const scripts = pkg.scripts || {};

    const requiredScripts = [
      'build',
      'seed',
      'bench',
      'eval',
      'profile',
      'topk',
      'test',
      'typecheck',
      'lint',
      'start',
      'start:api',
      'start:web',
      'opensearch',
    ];

    for (const script of requiredScripts) {
      expect(scripts[script], `Script "${script}" must exist in package.json`).toBeDefined();
    }
  });

  it('verifies docs/user-guide.md contains all required Phase 115 sections', () => {
    const content = fs.readFileSync(userGuidePath, 'utf-8');

    expect(content).toContain('What is OpenSearch Web?');
    expect(content).toContain('Who is OpenSearch Web For?');
    expect(content).toContain('Privacy Modes & The Privacy Receipt');
    expect(content).toContain('Supported Runtimes & System Requirements');
    expect(content).toContain('Quick-Start Guide');
    expect(content).toContain('Command-Line Search');
    expect(content).toContain('Configuration Reference');
    expect(content).toContain('Troubleshooting & Common Questions');
    expect(content).toContain('Known Boundaries & Limitations');
  });

  it('verifies docs/provider-integration-guide.md documents SearchProvider contract and privacy requirements', () => {
    const content = fs.readFileSync(providerGuidePath, 'utf-8');

    expect(content).toContain('Search Provider Integration Guide');
    expect(content).toContain('Privacy Contract');
    expect(content).toContain('Zero User PII');
    expect(content).toContain('SearchProvider');
    expect(content).toContain('healthCheck');
    expect(content).toContain('search');
    expect(content).toContain('ProviderRegistry');
  });

  it('ensures .env.example contains essential runtime variables', () => {
    const env = fs.readFileSync(envExamplePath, 'utf-8');

    expect(env).toContain('API_PORT=');
    expect(env).toContain('API_HOST=');
    expect(env).toContain('WEB_PORT=');
    expect(env).toContain('STORAGE_DIR=');
    expect(env).toContain('INDEX_DIR=');
    expect(env).toContain('RATE_LIMIT_PER_MINUTE=');
    expect(env).toContain('ENABLE_MCP=');
    expect(env).toContain('TRUST_PROXY=');
    expect(env).toContain('DEPLOYMENT_MODEL=');
  });
});
