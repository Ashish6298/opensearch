import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseCliArgs, runCli } from '../src/index.js';

describe('Phase 102 — CLI Focus Lens Editor, Import/Export, and Preview Suite', () => {
  describe('1. Argument Parsing for Lens Editor & Import/Export', () => {
    it('parses --lens-export flag and argument', () => {
      const opts = parseCliArgs(['--lens-export', 'developer']);
      expect(opts.lensExport).toBe('developer');
    });

    it('parses --lens-export= syntax', () => {
      const opts = parseCliArgs(['--lens-export=trusted-health']);
      expect(opts.lensExport).toBe('trusted-health');
    });

    it('parses --lens-import flag and argument', () => {
      const opts = parseCliArgs(['--lens-import', './my-profile.json']);
      expect(opts.lensImport).toBe('./my-profile.json');
    });

    it('parses --lens-preview flag', () => {
      const opts = parseCliArgs(['--lens-preview', 'developer']);
      expect(opts.lensPreview).toBe('developer');
    });

    it('parses --lens-validate flag', () => {
      const opts = parseCliArgs(['--lens-validate', './custom.json']);
      expect(opts.lensValidate).toBe('./custom.json');
    });

    it('parses --lens-reset flag', () => {
      const opts = parseCliArgs(['--lens-reset']);
      expect(opts.lensReset).toBe(true);
    });
  });

  describe('2. Focus Lens Export Execution', () => {
    it('exports a valid builtin lens to schema-compliant JSON', async () => {
      const res = await runCli(['--lens-export', 'developer']);
      expect(res.exitCode).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.id).toBe('developer');
      expect(parsed.boostDomains.some((d: any) => d.pattern === 'github.com')).toBe(true);
    });

    it('returns exitCode 1 when attempting to export an unknown lens id', async () => {
      const res = await runCli(['--lens-export', 'unknown-profile-999']);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('Focus Lens profile "unknown-profile-999" was not found');
    });
  });

  describe('3. Focus Lens Import & Validation Execution', () => {
    const tmpDir = os.tmpdir();

    it('successfully imports and registers a valid custom lens profile', async () => {
      const validProfile = {
        schemaVersion: 1,
        id: 'cli-test-lens',
        name: 'CLI Test Lens',
        description: 'Test profile imported via CLI.',
        boostDomains: [{ pattern: 'mit.edu', multiplier: 2.0 }],
        demoteDomains: [{ pattern: 'low-quality.org', multiplier: 0.5 }],
        excludeDomains: ['blocked-spam.com'],
      };

      const tmpFile = path.join(tmpDir, `valid-lens-${Date.now()}.json`);
      fs.writeFileSync(tmpFile, JSON.stringify(validProfile), 'utf8');

      try {
        const res = await runCli(['--lens-import', tmpFile]);
        expect(res.exitCode).toBe(0);
        expect(res.stdout).toContain('Successfully imported and registered Focus Lens');
        expect(res.stdout).toContain('CLI Test Lens');
      } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
    });

    it('fails safely with exitCode 1 and detailed errors on invalid lens import', async () => {
      const invalidProfile = {
        schemaVersion: 1,
        id: 'bad-lens',
        name: 'Bad Multiplier Lens',
        description: 'Contains out of bound multipliers',
        boostDomains: [
          { pattern: 'https://invalid-url.com/path', multiplier: 5.5 }, // Bad syntax + bad multiplier
        ],
      };

      const tmpFile = path.join(tmpDir, `invalid-lens-${Date.now()}.json`);
      fs.writeFileSync(tmpFile, JSON.stringify(invalidProfile), 'utf8');

      try {
        const res = await runCli(['--lens-import', tmpFile]);
        expect(res.exitCode).toBe(1);
        expect(res.stderr).toContain('Failed to import Focus Lens profile');
        expect(res.stderr).toContain('not a valid domain pattern');
        expect(res.stderr).toContain('multiplier must be a number between 1 and 3');
      } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
    });

    it('returns error when import file does not exist', async () => {
      const res = await runCli(['--lens-import', './non-existent-lens-file-404.json']);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('does not exist');
    });

    it('validates a lens profile with --lens-validate', async () => {
      const testProfile = {
        schemaVersion: 1,
        id: 'valid-syntax-lens',
        name: 'Valid Syntax',
        description: 'Profile to validate',
        boostDomains: [{ pattern: 'gnu.org', multiplier: 1.5 }],
        demoteDomains: [],
        excludeDomains: [],
      };

      const tmpFile = path.join(tmpDir, `validate-lens-${Date.now()}.json`);
      fs.writeFileSync(tmpFile, JSON.stringify(testProfile), 'utf8');

      try {
        const res = await runCli(['--lens-validate', tmpFile]);
        expect(res.exitCode).toBe(0);
        expect(res.stdout).toContain('Valid Focus Lens schema');
      } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
    });
  });

  describe('4. Focus Lens Preview Execution', () => {
    it('executes lens preview and outputs formatted human-readable report', async () => {
      const res = await runCli(['--lens-preview', 'developer']);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Focus Lens Preview: Developer');
      expect(res.stdout).toContain('Index Immutability Verified: PASS');
      expect(res.stdout).toContain('Queries tested:');
      expect(res.stdout).toContain('BOOST');
    });

    it('executes lens preview in JSON format', async () => {
      const res = await runCli(['--lens-preview', 'trusted-health', '--json']);
      expect(res.exitCode).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.lensId).toBe('trusted-health');
      expect(parsed.indexImmutabilityVerified).toBe(true);
      expect(parsed.isMedicalEndorsement).toBe(false);
      expect(Array.isArray(parsed.summaries)).toBe(true);
      expect(parsed.summaries.length).toBeGreaterThan(0);
    });
  });

  describe('5. Focus Lens Reset to Default Execution', () => {
    it('executes lens reset and restores default General profile', async () => {
      const res = await runCli(['--lens-reset']);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Restored default Focus Lens profile: "General" [general]');
    });

    it('executes lens reset with --json format', async () => {
      const res = await runCli(['--lens-reset', '--json']);
      expect(res.exitCode).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.success).toBe(true);
      expect(parsed.activeProfile.id).toBe('general');
    });
  });
});
