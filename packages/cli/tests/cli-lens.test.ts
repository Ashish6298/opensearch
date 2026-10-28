import { describe, expect, it } from 'vitest';
import { parseCliArgs, runCli } from '../src/index.js';
import { CliFormatter } from '../src/formatter.js';
import { BUILTIN_LENSES } from '@opensearch/ranking';

describe('Phase 101 — CLI Focus Lens Suite', () => {
  describe('1. Argument Parsing for Focus Lenses', () => {
    it('parses lenses subcommand', () => {
      const opts = parseCliArgs(['lenses']);
      expect(opts.lenses).toBe(true);
      expect(opts.query).toBeUndefined();
    });

    it('parses --lens flag and argument', () => {
      const opts = parseCliArgs(['typescript async', '--lens', 'developer']);
      expect(opts.query).toBe('typescript async');
      expect(opts.lens).toBe('developer');
    });

    it('parses --lens= syntax', () => {
      const opts = parseCliArgs(['respiratory virus', '--lens=trusted-health']);
      expect(opts.query).toBe('respiratory virus');
      expect(opts.lens).toBe('trusted-health');
    });
  });

  describe('2. Focus Lens Listing Execution (lenses)', () => {
    it('executes lenses subcommand in text format', async () => {
      const res = await runCli(['lenses']);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('OpenSearch Focus Lenses');
      expect(res.stdout).toContain('General');
      expect(res.stdout).toContain('Student');
      expect(res.stdout).toContain('Developer');
      expect(res.stdout).toContain('Research');
      expect(res.stdout).toContain('Trusted Health Sources');
      expect(res.stdout).toContain('No-Trackers');
      expect(res.stdout).toContain('Notice:');
    });

    it('executes lenses subcommand in JSON format', async () => {
      const res = await runCli(['lenses', '--json']);
      expect(res.exitCode).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThanOrEqual(6);
      const ids = parsed.map((l: any) => l.id);
      expect(ids).toContain('trusted-health');
      expect(ids).toContain('developer');
    });
  });

  describe('3. Formatter Lens Badges & Explanations', () => {
    it('formats search result item with boost lens badge', () => {
      const formatter = new CliFormatter({ colorEnabled: false });
      const item = {
        title: 'MDN Web Docs',
        url: 'https://developer.mozilla.org/en-US/docs/Web',
        snippet: 'Authoritative documentation.',
        domain: 'developer.mozilla.org',
        lensExplain: {
          lensName: 'Developer',
          action: 'boost' as const,
          multiplier: 1.8,
          explanation: 'Document boosted by Focus Lens Developer.',
        },
      };

      const out = formatter.formatResultItem(item, 0);
      expect(out).toContain('[🎯 Developer +1.8x]');
    });

    it('formats search result item with demote lens badge and explain breakdown', () => {
      const formatter = new CliFormatter({ colorEnabled: false });
      const item = {
        title: 'Homework Solver',
        url: 'https://chegg.com/solution',
        snippet: 'Paywalled answers.',
        domain: 'chegg.com',
        lensExplain: {
          lensName: 'Student',
          action: 'demote' as const,
          multiplier: 0.5,
          explanation: 'Commercial homework paywall demoted.',
        },
        explanation: {
          finalScore: 0.85,
          bm25Score: 1.7,
          lensExplain: {
            lensName: 'Student',
            action: 'demote' as const,
            multiplier: 0.5,
            explanation: 'Commercial homework paywall demoted.',
          },
        },
      };

      const out = formatter.formatResultItem(item, 0);
      expect(out).toContain('[🎯 Student 0.5x]');
      expect(out).toContain('Focus Lens: Student (demote x0.5)');
    });
  });
});
