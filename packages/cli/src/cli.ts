/**
 * @opensearch/cli — Command-Line Interface Engine (Phase 44)
 *
 * Implements argument parsing, stdin piping, API querying, and terminal
 * result presentation with zero external dependencies.
 */

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
  noColor?: boolean;
  help?: boolean;
  version?: boolean;
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
    } else if (arg === '--no-color') {
      options.noColor = true;
    } else if (arg === '--health') {
      options.health = true;
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
    } else if (arg.startsWith('--suggest=')) {
      options.suggest = arg.split('=')[1];
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    options.query = positional.join(' ');
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

export async function runCli(
  args: string[],
  injectedStdin?: string,
): Promise<CliExecutionResult> {
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

  const baseApiUrl =
    options.apiUrl ||
    process.env.OPENSEARCH_API_URL ||
    'http://localhost:3001';

  // 3. Health check command
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

  // 4. Autocomplete suggest command
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

  // 5. Query Search
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
    const searchUrl = `${baseApiUrl}/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}&page=${page}`;
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

    const totalHits = data.pagination?.totalHits ?? data.meta?.totalHits ?? data.results?.length ?? 0;
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
      const resultLines = data.results.map((item: any, i: number) =>
        formatter.formatResultItem(item, (page - 1) * limit + i),
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
