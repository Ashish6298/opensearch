/**
 * @opensearch/cli — Command-Line Interface Engine (Phase 44 & Phase 92)
 *
 * Implements argument parsing, stdin piping, API querying, offline IR ranking
 * experimentation, parameter sweeps, and terminal result presentation.
 */

import * as fs from 'node:fs';
import {
  DEFAULT_BASELINE_CONFIG,
  compareExperiments,
  exportExperimentJson,
  exportExperimentMarkdown,
  exportBenchmarkJson,
  exportBenchmarkMarkdown,
  resolveDataset,
  runBenchmark,
  runParameterSweep,
} from '@opensearch/ranking';
import { PROJECT_NAME, PROJECT_VERSION } from '@opensearch/shared';
import { CliFormatter } from './formatter.js';

export interface CliOptions {
  query?: string;
  limit?: number;
  page?: number;
  json?: boolean;
  apiUrl?: string;
  health?: boolean;
  suggest?: string;
  explain?: boolean;
  noColor?: boolean;
  help?: boolean;
  version?: boolean;
  // Phase 92: Experiment runner options
  experiment?: boolean;
  dataset?: string;
  split?: 'tuning' | 'held_out' | 'all';
  k?: number;
  sweep?: boolean;
  outJson?: string;
  outMd?: string;
  k1?: number;
  b?: number;
  pageRankWeight?: number;
  // Phase 94: Benchmark harness options
  benchmark?: boolean;
  warmup?: number;
  iterations?: number;
  docs?: number;
}

export interface CliExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Zero-dependency command-line argument parser.
 */
export function parseCliArgs(args: string[]): CliOptions {
  const options: CliOptions = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--explain' || arg === '-e') {
      options.explain = true;
    } else if (arg === '--no-color') {
      options.noColor = true;
    } else if (arg === '--health') {
      options.health = true;
    } else if (arg === 'experiment' || arg === 'eval' || arg === '--experiment') {
      options.experiment = true;
    } else if (arg === '--sweep') {
      options.sweep = true;
    } else if (arg === '--dataset') {
      const next = args[++i];
      if (next && !next.startsWith('-')) options.dataset = next;
    } else if (arg.startsWith('--dataset=')) {
      options.dataset = arg.split('=')[1];
    } else if (arg === '--split') {
      const next = args[++i];
      if (next && (next === 'tuning' || next === 'held_out' || next === 'all')) {
        options.split = next as 'tuning' | 'held_out' | 'all';
      }
    } else if (arg.startsWith('--split=')) {
      const val = arg.split('=')[1];
      if (val === 'tuning' || val === 'held_out' || val === 'all') {
        options.split = val as 'tuning' | 'held_out' | 'all';
      }
    } else if (arg === '-k' || arg === '--k') {
      const next = args[++i];
      if (next && !next.startsWith('-')) options.k = parseInt(next, 10);
    } else if (arg.startsWith('--k=')) {
      options.k = parseInt(arg.split('=')[1] ?? '10', 10);
    } else if (arg === '--out-json') {
      const next = args[++i];
      if (next && !next.startsWith('-')) options.outJson = next;
    } else if (arg.startsWith('--out-json=')) {
      options.outJson = arg.split('=')[1];
    } else if (arg === '--out-md') {
      const next = args[++i];
      if (next && !next.startsWith('-')) options.outMd = next;
    } else if (arg.startsWith('--out-md=')) {
      options.outMd = arg.split('=')[1];
    } else if (arg === '--k1') {
      const next = args[++i];
      if (next && !next.startsWith('-')) options.k1 = parseFloat(next);
    } else if (arg.startsWith('--k1=')) {
      options.k1 = parseFloat(arg.split('=')[1] ?? '1.2');
    } else if (arg === '--b') {
      const next = args[++i];
      if (next && !next.startsWith('-')) options.b = parseFloat(next);
    } else if (arg.startsWith('--b=')) {
      options.b = parseFloat(arg.split('=')[1] ?? '0.75');
    } else if (arg === '--pagerank-weight') {
      const next = args[++i];
      if (next && !next.startsWith('-')) options.pageRankWeight = parseFloat(next);
    } else if (arg.startsWith('--pagerank-weight=')) {
      options.pageRankWeight = parseFloat(arg.split('=')[1] ?? '0.15');
    } else if (arg === '--limit' || arg === '-l') {
      const next = args[++i];
      if (next && !next.startsWith('-')) {
        options.limit = parseInt(next, 10);
      }
    } else if (arg === '--page' || arg === '-p') {
      const next = args[++i];
      if (next && !next.startsWith('-')) {
        options.page = parseInt(next, 10);
      }
    } else if (arg === '--api') {
      const next = args[++i];
      if (next && !next.startsWith('-')) {
        options.apiUrl = next;
      }
    } else if (arg === '--suggest' || arg === '-s') {
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        options.suggest = next;
        i++;
      } else {
        options.suggest = '';
      }
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1] ?? '5', 10);
    } else if (arg.startsWith('--page=')) {
      options.page = parseInt(arg.split('=')[1] ?? '1', 10);
    } else if (arg.startsWith('--api=')) {
      options.apiUrl = arg.split('=')[1];
    } else if (arg === 'benchmark' || arg === 'bench' || arg === '--benchmark') {
      options.benchmark = true;
    } else if (arg === '--warmup') {
      const next = args[++i];
      if (next && !next.startsWith('-')) options.warmup = parseInt(next, 10);
    } else if (arg.startsWith('--warmup=')) {
      options.warmup = parseInt(arg.split('=')[1] ?? '2', 10);
    } else if (arg === '--iterations') {
      const next = args[++i];
      if (next && !next.startsWith('-')) options.iterations = parseInt(next, 10);
    } else if (arg.startsWith('--iterations=')) {
      options.iterations = parseInt(arg.split('=')[1] ?? '5', 10);
    } else if (arg === '--docs') {
      const next = args[++i];
      if (next && !next.startsWith('-')) options.docs = parseInt(next, 10);
    } else if (arg.startsWith('--docs=')) {
      options.docs = parseInt(arg.split('=')[1] ?? '0', 10);
    } else if (arg.startsWith('--suggest=')) {
      options.suggest = arg.split('=')[1];
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  // Filter out 'experiment' or 'eval' positional keyword from query text
  const filteredPositional = positional.filter(
    p => p !== 'experiment' && p !== 'eval' && p !== 'benchmark' && p !== 'bench',
  );
  if (filteredPositional.length > 0) {
    options.query = filteredPositional.join(' ');
  }

  return options;
}

/**
 * Reads all incoming data from stdin (for piping support).
 */
export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }

  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf-8');

    process.stdin.on('data', chunk => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      resolve(data.trim());
    });

    process.stdin.on('error', () => {
      resolve('');
    });

    // Timeout guard so stdin read does not hang if unclosed
    setTimeout(() => {
      resolve(data.trim());
    }, 500);
  });
}

export async function runCli(args: string[], injectedStdin?: string): Promise<CliExecutionResult> {
  const options = parseCliArgs(args);
  const formatter = new CliFormatter({
    colorEnabled: options.noColor ? false : undefined,
  });

  // 1. Help flag
  if (options.help) {
    return {
      exitCode: 0,
      stdout: formatter.formatHelp(),
      stderr: '',
    };
  }

  // 2. Version flag
  if (options.version) {
    const versionOutput = `${PROJECT_NAME} v${PROJECT_VERSION} (Engine v1.2.0)`;
    return {
      exitCode: 0,
      stdout: versionOutput,
      stderr: '',
    };
  }

  // 3. Phase 92: Experiment Runner Subcommand
  if (options.experiment) {
    try {
      const dataset = resolveDataset(options.dataset);
      const split = options.split ?? 'tuning';
      const k = options.k ?? 10;

      let markdownOutput = '';
      let jsonOutput = '';

      if (options.sweep) {
        const sweepResult = runParameterSweep(
          dataset,
          DEFAULT_BASELINE_CONFIG,
          {
            k1: [0.8, 1.2, 1.6],
            b: [0.5, 0.75, 0.9],
            pageRankWeight: [0.0, 0.15, 0.3],
          },
          { split, metricOptions: { k } },
        );

        jsonOutput = exportExperimentJson(sweepResult);
        markdownOutput = exportExperimentMarkdown(sweepResult);

        if (options.outJson) {
          fs.writeFileSync(options.outJson, jsonOutput, 'utf-8');
        }
        if (options.outMd) {
          fs.writeFileSync(options.outMd, markdownOutput, 'utf-8');
        }

        return {
          exitCode: 0,
          stdout: options.json ? jsonOutput : markdownOutput,
          stderr: '',
        };
      } else {
        const candidateConfig = {
          ...DEFAULT_BASELINE_CONFIG,
          name: 'candidate-experiment',
          bm25: {
            ...DEFAULT_BASELINE_CONFIG.bm25,
            ...(options.k1 !== undefined ? { k1: options.k1 } : {}),
            ...(options.b !== undefined ? { b: options.b } : {}),
          },
          pageRank: {
            ...DEFAULT_BASELINE_CONFIG.pageRank,
            ...(options.pageRankWeight !== undefined ? { weight: options.pageRankWeight } : {}),
          },
        };

        const comparisonResult = compareExperiments(
          dataset,
          DEFAULT_BASELINE_CONFIG,
          candidateConfig,
          { split, metricOptions: { k } },
        );

        jsonOutput = exportExperimentJson(comparisonResult);
        markdownOutput = exportExperimentMarkdown(comparisonResult);

        if (options.outJson) {
          fs.writeFileSync(options.outJson, jsonOutput, 'utf-8');
        }
        if (options.outMd) {
          fs.writeFileSync(options.outMd, markdownOutput, 'utf-8');
        }

        return {
          exitCode: 0,
          stdout: options.json ? jsonOutput : markdownOutput,
          stderr: '',
        };
      }
    } catch (err: any) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: formatter.red(`[ERROR] Experiment execution failed: ${err.message}`),
      };
    }
  }

  // 4. Phase 94: Performance Benchmark Subcommand
  if (options.benchmark) {
    try {
      const report = await runBenchmark({
        documentCount: options.docs,
        warmupIterations: options.warmup,
        measuredIterations: options.iterations,
        recordQueryLevelDetails: true,
      });

      const jsonOutput = exportBenchmarkJson(report);
      const markdownOutput = exportBenchmarkMarkdown(report);

      if (options.outJson) {
        fs.writeFileSync(options.outJson, jsonOutput, 'utf-8');
      }
      if (options.outMd) {
        fs.writeFileSync(options.outMd, markdownOutput, 'utf-8');
      }

      return {
        exitCode: 0,
        stdout: options.json ? jsonOutput : markdownOutput,
        stderr: '',
      };
    } catch (err: any) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: formatter.red(`[ERROR] Benchmark execution failed: ${err.message}`),
      };
    }
  }

  const baseApiUrl = options.apiUrl || process.env.OPENSEARCH_API_URL || 'http://localhost:3001';

  // 4. Health check command
  if (options.health) {
    try {
      const res = await fetch(`${baseApiUrl}/health`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = (await res.json()) as Record<string, unknown>;

      if (options.json) {
        return {
          exitCode: 0,
          stdout: JSON.stringify(data, null, 2),
          stderr: '',
        };
      }

      return {
        exitCode: 0,
        stdout: formatter.formatHealth(data),
        stderr: '',
      };
    } catch (err: any) {
      const errMsg = `Failed to connect to OpenSearch cluster at ${baseApiUrl}/health: ${err.message}`;
      return {
        exitCode: 1,
        stdout: '',
        stderr: formatter.red(`[ERROR] ${errMsg}`),
      };
    }
  }

  // 5. Autocomplete suggest command
  if (options.suggest !== undefined) {
    const prefix = options.suggest;
    if (!prefix.trim()) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: formatter.red('[ERROR] Prefix for --suggest cannot be empty.'),
      };
    }

    try {
      const limit = options.limit ?? 5;
      const res = await fetch(
        `${baseApiUrl}/api/v1/suggest?q=${encodeURIComponent(prefix)}&limit=${limit}`,
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = (await res.json()) as { query: string; suggestions: Array<{ text: string }> };

      if (options.json) {
        return {
          exitCode: 0,
          stdout: JSON.stringify(data, null, 2),
          stderr: '',
        };
      }

      return {
        exitCode: 0,
        stdout: formatter.formatSuggestions(data.query, data.suggestions),
        stderr: '',
      };
    } catch (err: any) {
      const errMsg = `Failed to fetch suggestions from ${baseApiUrl}: ${err.message}`;
      return {
        exitCode: 1,
        stdout: '',
        stderr: formatter.red(`[ERROR] ${errMsg}`),
      };
    }
  }

  // 6. Query Search
  let query = options.query?.trim();

  // If no query was supplied as argument, attempt reading from stdin
  if (!query) {
    query = (injectedStdin ?? (await readStdin())).trim();
  }

  if (!query) {
    return {
      exitCode: 0,
      stdout: formatter.formatHelp(),
      stderr: '',
    };
  }

  const limit = options.limit ?? 5;
  const page = options.page ?? 1;

  try {
    const explainQuery = options.explain ? '&explain=true' : '';
    const searchUrl = `${baseApiUrl}/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}&page=${page}${explainQuery}`;
    const res = await fetch(searchUrl);

    if (!res.ok) {
      const errJson = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const msg = (errJson?.error as string) || `HTTP ${res.status}: ${res.statusText}`;
      return {
        exitCode: 1,
        stdout: '',
        stderr: formatter.red(`[ERROR] Search request failed: ${msg}`),
      };
    }

    const data = (await res.json()) as any;

    if (options.json) {
      return {
        exitCode: 0,
        stdout: JSON.stringify(data, null, 2),
        stderr: '',
      };
    }

    const totalHits =
      data.pagination?.totalHits ?? data.meta?.totalHits ?? data.results?.length ?? 0;
    const durationMs = data.meta?.durationMs ?? 0;

    let output = formatter.formatHeader(query, totalHits, durationMs, page);

    if (data.instantAnswer) {
      output += formatter.formatInstantAnswer(data.instantAnswer);
    }

    if (data.bang) {
      output += formatter.formatBang(data.bang);
    }

    if (data.didYouMean) {
      output += formatter.formatDidYouMean(data.didYouMean);
    }

    if (data.results && data.results.length > 0) {
      output += '\n\n';
      const queryTokens = query.split(/\s+/).filter(Boolean);
      const resultLines = data.results.map((item: any, i: number) =>
        formatter.formatResultItem(item, (page - 1) * limit + i, queryTokens),
      );
      output += resultLines.join('\n\n');
      output += '\n';
    } else {
      output += `\n\n  ${formatter.dim('No results found matching your query.')}\n`;
    }

    return {
      exitCode: 0,
      stdout: output,
      stderr: '',
    };
  } catch (err: any) {
    const errMsg = `Failed to connect to OpenSearch cluster at ${baseApiUrl}: ${err.message}`;
    return {
      exitCode: 1,
      stdout: '',
      stderr: formatter.red(`[ERROR] ${errMsg}`),
    };
  }
}
