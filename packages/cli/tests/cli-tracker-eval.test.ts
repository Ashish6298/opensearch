import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCliArgs, runCli } from '../src/index.js';
import { CliFormatter } from '../src/formatter.js';

describe('Phase 100 — CLI Tracker-Aware Ranking & Evaluation Suite', () => {
  const tempFiles: string[] = [];

  afterEach(() => {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // ignore cleanup errors
        }
      }
    }
    tempFiles.length = 0;
  });

  describe('1. Argument Parsing for Tracker Ranking', () => {
    it('parses tracker-eval subcommand and options', () => {
      const args = [
        'tracker-eval',
        '--tracker-weight',
        '0.25',
        '--out-json',
        './eval.json',
        '--out-md',
        './eval.md',
      ];

      const opts = parseCliArgs(args);

      expect(opts.trackerEval).toBe(true);
      expect(opts.trackerWeight).toBe(0.25);
      expect(opts.outJson).toBe('./eval.json');
      expect(opts.outMd).toBe('./eval.md');
      expect(opts.query).toBeUndefined();
    });

    it('parses tracker-signal and no-tracker-signal flags', () => {
      const argsOn = ['privacy search', '--tracker-signal', '--tracker-weight=0.20'];
      const optsOn = parseCliArgs(argsOn);
      expect(optsOn.query).toBe('privacy search');
      expect(optsOn.trackerSignal).toBe(true);
      expect(optsOn.trackerWeight).toBe(0.20);

      const argsOff = ['privacy search', '--no-tracker-signal'];
      const optsOff = parseCliArgs(argsOff);
      expect(optsOff.query).toBe('privacy search');
      expect(optsOff.noTrackerSignal).toBe(true);
    });
  });

  describe('2. Tracker Quality Evaluation Execution (tracker-eval)', () => {
    it('executes tracker-eval subcommand in markdown mode', async () => {
      const res = await runCli(['tracker-eval', '--tracker-weight', '0.20']);

      expect(res.exitCode).toBe(0);
      expect(res.stderr).toBe('');
      expect(res.stdout).toContain('# Tracker-Aware Ranking Quality Evaluation Report');
      expect(res.stdout).toContain('Aggregate Quality Metrics Comparison');
      expect(res.stdout).toContain('nDCG@10');
      expect(res.stdout).toContain('Trade-Off Analysis');
      expect(res.stdout).toContain('Production Safeguard');
    });

    it('executes tracker-eval in JSON mode with file export', async () => {
      const tmpJson = path.join(os.tmpdir(), `tracker-eval-${Date.now()}.json`);
      const tmpMd = path.join(os.tmpdir(), `tracker-eval-${Date.now()}.md`);
      tempFiles.push(tmpJson, tmpMd);

      const res = await runCli([
        'tracker-eval',
        '--json',
        '--out-json',
        tmpJson,
        '--out-md',
        tmpMd,
      ]);

      expect(res.exitCode).toBe(0);
      expect(fs.existsSync(tmpJson)).toBe(true);
      expect(fs.existsSync(tmpMd)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(tmpJson, 'utf-8'));
      expect(parsed.reportId).toBeDefined();
      expect(parsed.queryCount).toBeGreaterThan(0);
      expect(parsed.baselineMetrics).toBeDefined();
      expect(parsed.candidateMetrics).toBeDefined();
      expect(parsed.productionSafeguard).toContain('NOT guarantee security');
    });
  });

  describe('3. Formatter Privacy Badges & Indicators', () => {
    it('formats result item with clean tracker badge', () => {
      const formatter = new CliFormatter({ colorEnabled: false });
      const item = {
        title: 'Private Search Engine',
        url: 'https://example.org/search',
        snippet: 'A search engine that respects user privacy.',
        domain: 'example.org',
        trackerIndicator: {
          badgeText: 'No Trackers Detected',
          severity: 'clean' as const,
          trackerCount: 0,
        },
      };

      const formatted = formatter.formatResultItem(item, 0);
      expect(formatted).toContain('[1]');
      expect(formatted).toContain('Private Search Engine');
      expect(formatted).toContain('[🛡️ No Trackers Detected]');
    });

    it('formats result item with warning badge for detected trackers and explanation', () => {
      const formatter = new CliFormatter({ colorEnabled: false });
      const item = {
        title: 'News Portal',
        url: 'https://news.com/article',
        snippet: 'Latest breaking news.',
        domain: 'news.com',
        trackerIndicator: {
          badgeText: '3 Trackers Detected',
          severity: 'warning' as const,
          trackerCount: 3,
        },
        explanation: {
          finalScore: 1.85,
          bm25Score: 2.1,
          trackerMultiplier: 0.88,
          trackerExplain: {
            status: 'trackers_detected',
            explanation: 'Identified 3 standard trackers (analytics).',
          },
        },
      };

      const formatted = formatter.formatResultItem(item, 0);
      expect(formatted).toContain('[⚠️ 3 Trackers Detected]');
      expect(formatted).toContain('Tracker Multiplier: x0.88');
      expect(formatted).toContain('Identified 3 standard trackers');
    });
  });
});
