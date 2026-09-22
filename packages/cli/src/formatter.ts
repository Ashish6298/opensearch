/**
 * @opensearch/cli — Terminal ANSI Color & Layout Formatter (Phase 44)
 *
 * Implements retro matrix terminal color formatting for OpenSearch CLI
 * outputs with zero external dependencies. Respects NO_COLOR env and non-TTY stdout.
 */

export interface FormatterOptions {
  colorEnabled?: boolean;
}

export class CliFormatter {
  public readonly colorEnabled: boolean;

  constructor(options: FormatterOptions = {}) {
    const isNoColor = Boolean(process.env.NO_COLOR && process.env.NO_COLOR !== '0');
    const isTty = Boolean(process.stdout && process.stdout.isTTY);
    this.colorEnabled = options.colorEnabled ?? (!isNoColor && isTty);
  }

  // ---- ANSI Color Helpers ----

  private wrap(text: string, open: string, close: string): string {
    if (!this.colorEnabled) return text;
    return `${open}${text}${close}`;
  }

  bold(text: string): string {
    return this.wrap(text, '\x1b[1m', '\x1b[22m');
  }

  dim(text: string): string {
    return this.wrap(text, '\x1b[2m', '\x1b[22m');
  }

  green(text: string): string {
    return this.wrap(text, '\x1b[32m', '\x1b[39m');
  }

  brightGreen(text: string): string {
    return this.wrap(text, '\x1b[92m', '\x1b[39m');
  }

  cyan(text: string): string {
    return this.wrap(text, '\x1b[36m', '\x1b[39m');
  }

  brightCyan(text: string): string {
    return this.wrap(text, '\x1b[96m', '\x1b[39m');
  }

  yellow(text: string): string {
    return this.wrap(text, '\x1b[33m', '\x1b[39m');
  }

  magenta(text: string): string {
    return this.wrap(text, '\x1b[35m', '\x1b[39m');
  }

  red(text: string): string {
    return this.wrap(text, '\x1b[31m', '\x1b[39m');
  }

  underline(text: string): string {
    return this.wrap(text, '\x1b[4m', '\x1b[24m');
  }

  // ---- High-Level Layout Renderers ----

  formatHeader(query: string, totalHits: number, durationMs: number, page = 1): string {
    const title = this.brightGreen(this.bold(`⚡ OpenSearch`));
    const stats = this.dim(
      `[query: "${query}" | hits: ${totalHits} | page: ${page} | ${durationMs.toFixed(1)}ms]`,
    );
    const sep = this.dim('─'.repeat(Math.min(78, (process.stdout?.columns || 80) - 2)));
    return `${title} ${stats}\n${sep}`;
  }

  formatInstantAnswer(answer: {
    type: string;
    title?: string;
    expression?: string;
    primaryResult?: string;
    primaryAnswer?: string;
    secondaryDetails?: Record<string, unknown>;
    redirectUrl?: string | null;
  }): string {
    const badge = this.yellow(
      this.bold(`[⚡ INSTANT ANSWER // ${(answer.type || 'INFO').toUpperCase()}]`),
    );
    const expr = this.dim(answer.expression || answer.title || '');
    const ansText = answer.primaryResult || answer.primaryAnswer || '';
    const result = this.brightGreen(this.bold(`= ${ansText}`));
    let output = `\n${badge} ${expr}\n  ${result}`;

    if (answer.redirectUrl) {
      output += `\n  ${this.dim('Redirect:')} ${this.cyan(this.underline(answer.redirectUrl))}`;
    }
    return output;
  }

  formatBang(bang: {
    isBang: boolean;
    serviceName: string;
    searchQuery: string;
    redirectUrl: string;
  }): string {
    const badge = this.magenta(
      this.bold(`[⚡ BANG REDIRECT // ${bang.serviceName.toUpperCase()}]`),
    );
    const target = this.cyan(this.underline(bang.redirectUrl));
    return `\n${badge}\n  ${this.dim('Target:')} ${target}\n`;
  }

  formatDidYouMean(didYouMean: { correctedQuery: string }): string {
    return `\n${this.yellow('Did you mean:')} ${this.brightGreen(this.bold(didYouMean.correctedQuery))} ?\n`;
  }

  formatResultItem(
    item: {
      title: string;
      url: string;
      snippet: string;
      domain?: string;
      category?: string;
      score?: number;
    },
    index: number,
  ): string {
    const num = this.dim(`[${index + 1}]`);
    const title = this.brightGreen(this.bold(item.title));
    const url = this.cyan(this.underline(item.url));
    const snippet = this.dim(item.snippet);
    const domainTag = item.domain ? this.magenta(`[${item.domain}]`) : '';

    return `${num} ${title} ${domainTag}\n    ${url}\n    ${snippet}`;
  }

  formatHealth(health: Record<string, unknown>): string {
    const title = this.brightGreen(this.bold(`⚡ OpenSearch Cluster Health Diagnostics`));
    const sep = this.dim('─'.repeat(60));
    const statusVal =
      health.status === 'ok'
        ? this.brightGreen(this.bold('OK'))
        : this.yellow(this.bold(String(health.status).toUpperCase()));

    let out = `${title}\n${sep}\n`;
    out += `  ${this.bold('Status:')}               ${statusVal}\n`;
    out += `  ${this.bold('Version:')}              ${health.version ?? '1.2.0'}\n`;
    out += `  ${this.bold('Uptime:')}               ${health.uptimeSeconds ?? 0}s\n`;
    out += `  ${this.bold('Total Documents:')}      ${health.totalDocumentsIndexed ?? 0}\n`;
    out += `  ${this.bold('Memory Heap Used:')}     ${health.memoryUsageMb ?? 0} MB\n`;
    out += `  ${this.bold('Environment:')}          ${health.environment ?? 'development'}\n`;

    if (health.components && typeof health.components === 'object') {
      out += `\n  ${this.cyan(this.bold('Components:'))}\n`;
      for (const [comp, val] of Object.entries(
        health.components as Record<string, { status?: string }>,
      )) {
        const cStatus =
          val?.status === 'ok'
            ? this.brightGreen('ok')
            : this.yellow(String(val?.status ?? 'unknown'));
        out += `    • ${this.dim(comp.padEnd(16))}: ${cStatus}\n`;
      }
    }

    return out;
  }

  formatSuggestions(query: string, suggestions: Array<{ text: string; score?: number }>): string {
    const title = this.brightGreen(this.bold(`⚡ OpenSearch Suggestions for "${query}":`));
    if (suggestions.length === 0) {
      return `${title}\n  ${this.dim('No completions found.')}`;
    }

    let out = `${title}\n`;
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i]!;
      out += `  ${this.dim(`[${i + 1}]`)} ${this.brightGreen(s.text)}\n`;
    }
    return out;
  }

  formatHelp(): string {
    const logo = `
  ___                    ____                      _     
 / _ \\ _ __   ___ _ __  / ___|  ___  __ _ _ __ ___| |__  
| | | | '_ \\ / _ \\ '_ \\ \\___ \\ / _ \\/ _\` | '__/ __| '_ \\ 
| |_| | |_) |  __/ | | | ___) |  __/ (_| | | | (__| | | |
 \\___/| .__/ \\___|_| |_||____/ \\___|\\__,_|_|  \\___|_| |_|
      |_|                                                `;

    return `${this.brightGreen(logo)}
${this.bold('OpenSearch CLI')} — Privacy-first, zero-tracking web search from your terminal.

${this.yellow(this.bold('USAGE:'))}
  $ ${this.green('opensearch')} <query> [options]
  $ ${this.green('echo "query" | opensearch')} [options]

${this.yellow(this.bold('COMMANDS & OPTIONS:'))}
  ${this.cyan('<query>')}                  Search query keywords, phrases, or bang shortcuts (e.g. !gh, !npm)
  ${this.cyan('-l, --limit <num>')}        Maximum number of results to display (default: 5)
  ${this.cyan('-p, --page <num>')}         Page number for pagination (default: 1)
  ${this.cyan('--json')}                   Output raw, parseable JSON for shell pipelines (jq)
  ${this.cyan('--api <url>')}              Target OpenSearch API URL (default: http://localhost:3001)
  ${this.cyan('-s, --suggest <prefix>')}   Fetch prefix autocompletions for a term
  ${this.cyan('--health')}                 Probe cluster diagnostic health and document statistics
  ${this.cyan('--no-color')}               Disable ANSI color formatting
  ${this.cyan('-h, --help')}               Show this help information
  ${this.cyan('-v, --version')}            Show CLI and engine version

${this.yellow(this.bold('EXAMPLES:'))}
  $ opensearch "typescript async await"
  $ opensearch "bm25 ranking" --limit 10
  $ opensearch "!gh react"
  $ opensearch "25 * 40 + 100"
  $ opensearch "database" --json | jq .results[0].title
  $ opensearch --suggest "type"
  $ opensearch --health
`;
  }
}
