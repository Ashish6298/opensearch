import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCliArgs, runCli } from '../src/index.js';

describe('Phase 94 — CLI Performance Benchmark Command Suite', () => {
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

  describe('1. Argument Parsing for Benchmarks', () => {
    it('parses benchmark subcommand and execution options', () => {
      const args = [
        'benchmark',
        '--warmup',
        '3',
        '--iterations',
        '10',
        '--docs',
        '50',
        '--out-json',
        './bench.json',
        '--out-md',
        './bench.md',
      ];

      const opts = parseCliArgs(args);

      expect(opts.benchmark).toBe(true);
      expect(opts.warmup).toBe(3);
      expect(opts.iterations).toBe(10);
      expect(opts.docs).toBe(50);
      expect(opts.outJson).toBe('./bench.json');
      expect(opts.outMd).toBe('./bench.md');
      expect(opts.query).toBeUndefined();
    });

    it('recognizes bench alias and equals syntax', () => {
      const args = ['bench', '--warmup=1', '--iterations=2', '--docs=15', '--json'];

      const opts = parseCliArgs(args);

      expect(opts.benchmark).toBe(true);
      expect(opts.warmup).toBe(1);
      expect(opts.iterations).toBe(2);
      expect(opts.docs).toBe(15);
      expect(opts.json).toBe(true);
      expect(opts.query).toBeUndefined();
    });
  });

  describe('2. CLI Benchmark Execution', () => {
    it('executes benchmark and outputs Markdown summary', async () => {
      const result = await runCli([
        'benchmark',
        '--docs',
        '5',
        '--warmup',
        '1',
        '--iterations',
        '1',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('# OpenSearch Performance Benchmark Report');
      expect(result.stdout).toContain('## 1. Hardware & Runtime Environment');
      expect(result.stdout).toContain('## 2. Methodology & Invariants');
      expect(result.stdout).toContain('## 3. Indexing Phase Benchmarks');
      expect(result.stdout).toContain('## 4. Query Latency & Throughput Distribution');
    });

    it('executes benchmark with --json and outputs valid JSON report', async () => {
      const result = await runCli([
        'benchmark',
        '--docs',
        '5',
        '--warmup',
        '1',
        '--iterations',
        '1',
        '--json',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');

      const parsed = JSON.parse(result.stdout);
      expect(parsed.benchmarkId).toMatch(/^bench-\d+-[a-z0-9]+$/);
      expect(parsed.environment.nodeVersion).toBeDefined();
      expect(parsed.indexingPhase.documentCount).toBe(5);
      expect(parsed.coldQueryPhase.throughputQps).toBeGreaterThan(0);
      expect(parsed.warmQueryPhase.throughputQps).toBeGreaterThan(0);
    });

    it('writes benchmark outputs to disk when --out-json and --out-md are specified', async () => {
      const jsonFile = path.join(os.tmpdir(), `bench-test-${Date.now()}.json`);
      const mdFile = path.join(os.tmpdir(), `bench-test-${Date.now()}.md`);
      tempFiles.push(jsonFile, mdFile);

      const result = await runCli([
        'benchmark',
        '--docs',
        '5',
        '--warmup',
        '1',
        '--iterations',
        '1',
        '--out-json',
        jsonFile,
        '--out-md',
        mdFile,
      ]);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(jsonFile)).toBe(true);
      expect(fs.existsSync(mdFile)).toBe(true);

      const jsonContent = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
      expect(jsonContent.benchmarkId).toBeDefined();

      const mdContent = fs.readFileSync(mdFile, 'utf-8');
      expect(mdContent).toContain('OpenSearch Performance Benchmark Report');
    });
  });

  describe('3. CLI Subsystem Profiler Execution', () => {
    it('executes profile command and outputs formatted Markdown breakdown', async () => {
      const result = await runCli(['profile', '--docs', '3', '--iterations', '1']);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('# OpenSearch Subsystem Profiling & Optimization Report');
      expect(result.stdout).toContain('## 1. Query Pipeline Subsystem Breakdown');
      expect(result.stdout).toContain('## 2. Storage & Persistence Breakdown');
      expect(result.stdout).toContain('## 3. Dominant Cost Bottlenecks (Evidence-Based)');
      expect(result.stdout).toContain('## 4. Optimization Recommendations & Decision Ledger');
    });

    it('executes profile command with --json and outputs valid JSON report', async () => {
      const result = await runCli(['profile', '--docs', '3', '--iterations', '1', '--json']);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');

      const parsed = JSON.parse(result.stdout);
      expect(parsed.profileId).toMatch(/^prof-\d+-[a-z0-9]+$/);
      expect(parsed.queryPipelineStages.length).toBeGreaterThan(0);
      expect(parsed.dominantCosts.length).toBeGreaterThan(0);
      expect(parsed.optimizationRecommendations.length).toBeGreaterThan(0);
    });
  });

  describe('4. CLI Top-k Retrieval Benchmark Execution', () => {
    it('executes topk command and outputs Markdown matrix', async () => {
      const result = await runCli(['topk', '--k', '3', '--algo', 'wand']);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('# OpenSearch Top-k Retrieval & Pruning Benchmark Report');
      expect(result.stdout).toContain('Multi-Corpus Scale Performance Matrix');
      expect(result.stdout).toContain('**Oracle Equivalence Rate:** **100%**');
    });

    it('executes topk command with --json and outputs valid JSON report', async () => {
      const result = await runCli(['topk', '--k', '3', '--algo', 'maxscore', '--json']);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');

      const parsed = JSON.parse(result.stdout);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.overallEquivalenceRate).toBe(100);
      expect(parsed.evaluations.length).toBeGreaterThan(0);
    });
  });
});
