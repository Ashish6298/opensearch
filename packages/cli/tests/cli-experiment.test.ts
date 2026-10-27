import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCliArgs, runCli } from '../src/index.js';

describe('Phase 92 — CLI Experiment Runner Command Suite', () => {
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

  describe('1. Argument Parsing for Experimentation', () => {
    it('parses experiment subcommand and configuration flags', () => {
      const args = [
        'experiment',
        '--dataset',
        'full',
        '--split',
        'held_out',
        '--k',
        '20',
        '--k1',
        '1.5',
        '--b',
        '0.8',
        '--pagerank-weight',
        '0.25',
      ];

      const opts = parseCliArgs(args);

      expect(opts.experiment).toBe(true);
      expect(opts.dataset).toBe('full');
      expect(opts.split).toBe('held_out');
      expect(opts.k).toBe(20);
      expect(opts.k1).toBe(1.5);
      expect(opts.b).toBe(0.8);
      expect(opts.pageRankWeight).toBe(0.25);
    });

    it('parses sweep mode and file export flags', () => {
      const args = [
        'eval',
        '--sweep',
        '--out-json',
        './report.json',
        '--out-md',
        './report.md',
      ];

      const opts = parseCliArgs(args);

      expect(opts.experiment).toBe(true);
      expect(opts.sweep).toBe(true);
      expect(opts.outJson).toBe('./report.json');
      expect(opts.outMd).toBe('./report.md');
    });
  });

  describe('2. CLI Experiment Execution', () => {
    it('executes baseline vs candidate experiment and outputs formatted Markdown', async () => {
      const result = await runCli(['experiment', '--dataset', 'ci', '--split', 'tuning']);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('# Search Quality Experiment Comparison Report');
      expect(result.stdout).toContain('Automated production tuning is strictly prohibited');
      expect(result.stdout).toContain('| Metric | Baseline');
      expect(result.stdout).toContain('nDCG@10');
    });

    it('executes experiment with --json output', async () => {
      const result = await runCli(['experiment', '--dataset', 'ci', '--split', 'tuning', '--json']);

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);

      expect(parsed.metadata.experimentId).toBeDefined();
      expect(parsed.metadata.productionSafeguard).toContain('strictly prohibited');
      expect(parsed.comparison.ndcg).toBeDefined();
      expect(parsed.queryWinLoss).toBeDefined();
    });

    it('executes parameter grid sweep and outputs ranked configurations', async () => {
      const result = await runCli(['experiment', '--sweep', '--dataset', 'ci', '--json']);

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);

      expect(parsed.candidatesEvaluated).toBeGreaterThan(0);
      expect(parsed.rankedConfigurations.length).toBe(parsed.candidatesEvaluated);
      expect(parsed.bestConfiguration.rank).toBe(1);
    });

    it('writes exported JSON and Markdown files to disk when flags are provided', async () => {
      const tempDir = os.tmpdir();
      const jsonPath = path.join(tempDir, `test-exp-${Date.now()}.json`);
      const mdPath = path.join(tempDir, `test-exp-${Date.now()}.md`);
      tempFiles.push(jsonPath, mdPath);

      const result = await runCli([
        'experiment',
        '--dataset',
        'ci',
        '--out-json',
        jsonPath,
        '--out-md',
        mdPath,
      ]);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(jsonPath)).toBe(true);
      expect(fs.existsSync(mdPath)).toBe(true);

      const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      expect(jsonContent.metadata.experimentId).toBeDefined();

      const mdContent = fs.readFileSync(mdPath, 'utf8');
      expect(mdContent).toContain('# Search Quality Experiment Comparison Report');
    });
  });
});
