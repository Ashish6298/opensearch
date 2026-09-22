import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDocumentProcessor, createInvertedIndex } from '@opensearch/indexer';
import { createApiServer, ApiServer } from '@opensearch/api';
import { parseCliArgs, runCli, CliFormatter } from '../src/index.js';

describe('Phase 44 — OpenSearch Standalone CLI Tool Suite', () => {
  let server: ApiServer;
  let apiBaseUrl: string;

  beforeAll(async () => {
    const index = createInvertedIndex();
    const processor = createDocumentProcessor();

    index.addDocument(
      processor.process({
        id: 'doc-cli-1',
        url: 'https://opensearch.dev/docs/cli',
        title: 'OpenSearch CLI Tool Reference',
        headings: 'Command Line Search & Shell Pipelines',
        description: 'Terminal client for querying OpenSearch from bash and powershell.',
        bodyText:
          'The opensearch CLI command supports full-text search, json piping into jq, health checks, and autocomplete.',
        language: 'en',
      }),
    );

    index.addDocument(
      processor.process({
        id: 'doc-cli-2',
        url: 'https://opensearch.dev/docs/architecture',
        title: 'OpenSearch Distributed Architecture',
        headings: 'Monorepo and Systems Engineering',
        description: 'Modular search engine architecture with BM25 ranking.',
        bodyText:
          'OpenSearch is designed with zero telemetry, high performance, and standalone zero-install tools.',
        language: 'en',
      }),
    );

    server = createApiServer({
      index,
      rateLimitPerMinute: 100,
    });
    const info = await server.start(0, '127.0.0.1');
    apiBaseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('Argument Parser (parseCliArgs)', () => {
    it('parses positional queries correctly', () => {
      const parsed = parseCliArgs(['typescript', 'async', 'await']);
      expect(parsed.query).toBe('typescript async await');
    });

    it('parses --limit and -l flags', () => {
      expect(parseCliArgs(['query', '--limit', '15']).limit).toBe(15);
      expect(parseCliArgs(['query', '-l', '8']).limit).toBe(8);
      expect(parseCliArgs(['query', '--limit=20']).limit).toBe(20);
    });

    it('parses --page and -p flags', () => {
      expect(parseCliArgs(['query', '--page', '3']).page).toBe(3);
      expect(parseCliArgs(['query', '-p', '2']).page).toBe(2);
      expect(parseCliArgs(['query', '--page=4']).page).toBe(4);
    });

    it('parses --json flag', () => {
      expect(parseCliArgs(['query', '--json']).json).toBe(true);
    });

    it('parses --api custom target flag', () => {
      expect(parseCliArgs(['query', '--api', 'http://127.0.0.1:3000']).apiUrl).toBe('http://127.0.0.1:3000');
    });

    it('parses --health flag', () => {
      expect(parseCliArgs(['--health']).health).toBe(true);
    });

    it('parses --suggest and -s flags', () => {
      expect(parseCliArgs(['--suggest', 'type']).suggest).toBe('type');
      expect(parseCliArgs(['-s', 'py']).suggest).toBe('py');
    });

    it('parses --help and --version flags', () => {
      expect(parseCliArgs(['--help']).help).toBe(true);
      expect(parseCliArgs(['-h']).help).toBe(true);
      expect(parseCliArgs(['--version']).version).toBe(true);
      expect(parseCliArgs(['-v']).version).toBe(true);
    });
  });

  describe('CLI Formatter (CliFormatter)', () => {
    it('formats results with ANSI colors when enabled', () => {
      const formatter = new CliFormatter({ colorEnabled: true });
      const rendered = formatter.formatResultItem(
        {
          title: 'Test Title',
          url: 'https://example.com',
          snippet: 'Test snippet content',
          domain: 'example.com',
        },
        0,
      );
      expect(rendered).toContain('Test Title');
      expect(rendered).toContain('https://example.com');
      expect(rendered).toContain('\x1b['); // contains ANSI escapes
    });

    it('omits ANSI escape sequences when color is disabled', () => {
      const formatter = new CliFormatter({ colorEnabled: false });
      const rendered = formatter.formatResultItem(
        {
          title: 'Test Title',
          url: 'https://example.com',
          snippet: 'Test snippet content',
          domain: 'example.com',
        },
        0,
      );
      expect(rendered).toContain('Test Title');
      expect(rendered).not.toContain('\x1b['); // zero ANSI escapes
    });
  });

  describe('CLI Command Execution (runCli)', () => {
    it('executes --help and displays usage manual', async () => {
      const res = await runCli(['--help']);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('OpenSearch CLI');
      expect(res.stdout).toContain('USAGE:');
    });

    it('executes --version and displays current version string', async () => {
      const res = await runCli(['--version']);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('OpenSearch v');
    });

    it('executes search query against API and returns formatted output', async () => {
      const res = await runCli(['cli', 'tool', '--api', apiBaseUrl]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('OpenSearch');
      expect(res.stdout).toContain('OpenSearch CLI Tool Reference');
      expect(res.stdout).toContain('https://opensearch.dev/docs/cli');
    });

    it('executes search query with --json and outputs parseable JSON', async () => {
      const res = await runCli(['cli', 'reference', '--api', apiBaseUrl, '--json']);
      expect(res.exitCode).toBe(0);
      const json = JSON.parse(res.stdout);
      expect(json.results).toBeDefined();
      expect(json.results.length).toBeGreaterThan(0);
      expect(json.results[0].title).toContain('OpenSearch CLI Tool Reference');
    });

    it('executes search query piped via stdin', async () => {
      const res = await runCli(['--api', apiBaseUrl, '--json'], 'architecture');
      expect(res.exitCode).toBe(0);
      const json = JSON.parse(res.stdout);
      expect(json.results).toBeDefined();
      expect(json.results.some((r: any) => r.title.includes('Architecture'))).toBe(true);
    });

    it('executes instant answer calculations directly in CLI', async () => {
      const res = await runCli(['25 * 40 + 100', '--api', apiBaseUrl]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('INSTANT ANSWER');
      expect(res.stdout).toContain('1,100');
    });

    it('executes bang shortcuts in CLI', async () => {
      const res = await runCli(['!gh opensearch', '--api', apiBaseUrl]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('BANG REDIRECT');
      expect(res.stdout).toContain('https://github.com/search?q=opensearch');
    });

    it('probes cluster health with --health command', async () => {
      const res = await runCli(['--health', '--api', apiBaseUrl]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('OpenSearch Cluster Health Diagnostics');
      expect(res.stdout).toContain('Status:');
    });

    it('probes cluster health with --health --json', async () => {
      const res = await runCli(['--health', '--json', '--api', apiBaseUrl]);
      expect(res.exitCode).toBe(0);
      const json = JSON.parse(res.stdout);
      expect(json.status).toBe('ok');
      expect(json.totalDocumentsIndexed).toBe(2);
    });

    it('fetches suggestions with --suggest command', async () => {
      const res = await runCli(['--suggest', 'cli', '--api', apiBaseUrl]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Suggestions for "cli"');
    });

    it('handles unreachable API gracefully with informative error', async () => {
      const res = await runCli(['test', '--api', 'http://127.0.0.1:59999']);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('Failed to connect to OpenSearch cluster');
    });
  });
});
