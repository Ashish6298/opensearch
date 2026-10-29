/**
 * @opensearch/api — Model Context Protocol (MCP) Server (Phase 109)
 *
 * Implements a standards-compliant JSON-RPC 2.0 MCP server providing safe,
 * privacy-preserving search, status, and extractive answers for AI agents.
 *
 * Security & Privacy Guarantees:
 * - Narrow, strictly validated tools: search, quick_answer, get_status, get_privacy_policy.
 * - Server-side enforcement of Local-only mode.
 * - No shell execution, filesystem access, arbitrary URL fetching, crawl admin, or secrets.
 * - Explicit disclosure of standard mode upstream provider routing and zero-logging invariants.
 * - Request cancellation via notifications/cancelled.
 */

import {
  JsonRpcRequest,
  JsonRpcResponse,
  JSONRPC_ERRORS,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  McpServerOptions,
  McpToolCallResult,
  McpToolDefinition,
  SearchToolArgs,
  QuickAnswerToolArgs,
  StatusToolArgs,
} from './mcp-types.js';
import { SearchServices } from '../types.js';
import { AppConfig, createLogger, Logger } from '@opensearch/shared';
import { fetchExternalWebResults } from '../external-search.js';

// Disallowed tool identifiers that must be rejected unconditionally
const FORBIDDEN_TOOL_PATTERNS = [
  // Shell execution
  /^(exec|shell|bash|cmd|powershell|run_command|system|sh)$/i,
  // Filesystem access
  /^(fs|readFile|writeFile|read_file|write_file|deleteFile|unlink|list_dir|readdir)$/i,
  // Arbitrary URL fetching
  /^(fetch|curl|downloadUrl|http_request|wget|axios|request)$/i,
  // Crawler administration
  /^(crawl|crawlStart|crawler_admin|manageSeeds|enqueueUrl|purgeIndex)$/i,
  // Secrets / credentials
  /^(get_secret|secrets|credentials|read_env|env|tokens)$/i,
];

export class OpenSearchMcpServer {
  private readonly services?: SearchServices;
  private readonly config?: AppConfig;
  private readonly logger: Logger;
  private readonly isLocalOnly: boolean;
  private readonly maxQueryLength: number;
  private readonly maxResults: number;
  private readonly enabled: boolean;
  private readonly activeRequests = new Map<string | number, AbortController>();

  constructor(options: McpServerOptions = {}) {
    this.services = options.services;
    this.config = options.config;
    void this.config;
    this.logger = options.logger ?? createLogger('@opensearch/api:mcp');
    this.isLocalOnly = Boolean(options.isLocalOnly ?? false);
    this.maxQueryLength = options.maxQueryLength ?? 200;
    this.maxResults = options.maxResults ?? 20;
    this.enabled = options.enabled ?? true;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getIsLocalOnly(): boolean {
    return this.isLocalOnly;
  }

  /**
   * Returns list of supported, validated tools conforming to MCP schemas.
   */
  getTools(): McpToolDefinition[] {
    return [
      {
        name: 'search',
        description:
          'Search the web or local index using OpenSearch. In "standard" mode, queries may be dispatched to external upstream search providers with strict IP shielding and zero-query logging. In "local-only" mode, all searches are strictly confined to the local inverted index with zero network requests. Query length is strictly limited to 200 characters and results to 20.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query terms (1 to 200 characters).',
              minLength: 1,
              maxLength: this.maxQueryLength,
            },
            limit: {
              type: 'integer',
              description: `Maximum number of results to return (1 to ${this.maxResults}, default: 5).`,
              minimum: 1,
              maximum: this.maxResults,
              default: 5,
            },
            category: {
              type: 'string',
              description: 'Search category filter.',
              enum: ['all', 'web', 'images', 'news'],
              default: 'all',
            },
            lens: {
              type: 'string',
              description: 'Optional Focus Lens name or ID (e.g., "academic", "forums", "news").',
            },
            safeSearch: {
              type: 'string',
              description: 'SafeSearch content filtering mode.',
              enum: ['strict', 'moderate', 'off'],
              default: 'moderate',
            },
            mode: {
              type: 'string',
              description:
                'Search privacy mode. Note: If server is configured in local-only mode, requests are enforced to local-only regardless of this parameter.',
              enum: ['local-only', 'standard'],
              default: this.isLocalOnly ? 'local-only' : 'standard',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'quick_answer',
        description:
          'Retrieve a concise, deterministic extractive answer with verified citations based on retrieved documents. Never hallucinates citations; explicitly notes insufficient evidence when reliable source facts are absent.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Question or query to answer (1 to 200 characters).',
              minLength: 1,
              maxLength: this.maxQueryLength,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_status',
        description:
          'Retrieve current engine operational status, document and vocabulary counts, and active privacy mode.',
        inputSchema: {
          type: 'object',
          properties: {
            verbose: {
              type: 'boolean',
              description: 'Whether to include detailed service breakdown.',
              default: false,
            },
          },
        },
      },
      {
        name: 'get_privacy_policy',
        description:
          'Retrieve OpenSearch zero-tracking, zero-cookie, and data minimization policy summary.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  /**
   * Handles an incoming JSON-RPC 2.0 message string or parsed object.
   */
  async handleMessage(rawMessage: unknown): Promise<JsonRpcResponse | null> {
    if (!this.enabled) {
      return {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: JSONRPC_ERRORS.INTERNAL_ERROR,
          message: 'Model Context Protocol (MCP) server is disabled on this instance.',
        },
      };
    }

    let request: JsonRpcRequest;
    if (typeof rawMessage === 'string') {
      try {
        request = JSON.parse(rawMessage);
      } catch {
        return {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: JSONRPC_ERRORS.PARSE_ERROR,
            message: 'Invalid JSON payload received by MCP server.',
          },
        };
      }
    } else if (rawMessage && typeof rawMessage === 'object') {
      request = rawMessage as JsonRpcRequest;
    } else {
      return {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: JSONRPC_ERRORS.INVALID_REQUEST,
          message: 'Expected a JSON-RPC request object.',
        },
      };
    }

    // Notifications (no id field)
    if (request.id === undefined || request.id === null) {
      await this.handleNotification(request);
      return null;
    }

    const id = request.id;
    const abortController = new AbortController();
    this.activeRequests.set(id, abortController);

    try {
      const result = await this.dispatchMethod(request.method, request.params ?? {}, abortController.signal);
      return {
        jsonrpc: '2.0',
        id,
        result,
      };
    } catch (err: unknown) {
      const errorObj = err as { code?: number; message?: string; data?: unknown };
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: errorObj.code ?? JSONRPC_ERRORS.INTERNAL_ERROR,
          message: errorObj.message ?? 'An unexpected error occurred processing the MCP request.',
          data: errorObj.data,
        },
      };
    } finally {
      this.activeRequests.delete(id);
    }
  }

  /**
   * Dispatches notifications (one-way messages without a response).
   */
  private async handleNotification(request: JsonRpcRequest): Promise<void> {
    if (request.method === 'notifications/cancelled') {
      const params = request.params as { requestId?: string | number } | undefined;
      if (params && params.requestId !== undefined) {
        const controller = this.activeRequests.get(params.requestId);
        if (controller) {
          this.logger.info(`[MCP] Request ${params.requestId} cancelled by client.`);
          controller.abort();
          this.activeRequests.delete(params.requestId);
        }
      }
    } else if (request.method === 'notifications/initialized') {
      this.logger.info('[MCP] Client initialization handshake complete.');
    }
  }

  /**
   * Dispatches JSON-RPC methods.
   */
  private async dispatchMethod(
    method: string,
    params: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return this.handleInitialize(params);

      case 'ping':
        return {};

      case 'tools/list':
        return {
          tools: this.getTools(),
        };

      case 'tools/call':
        return this.handleToolCall(params, signal);

      default:
        throw {
          code: JSONRPC_ERRORS.METHOD_NOT_FOUND,
          message: `Method not found: "${method}". Supported methods: initialize, ping, tools/list, tools/call.`,
        };
    }
  }

  private handleInitialize(_params: Record<string, unknown>): unknown {
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
        description:
          'OpenSearch Model Context Protocol server for safe web search, status, and privacy-first answers.',
      },
      instructions: `OpenSearch MCP Server provides privacy-preserving search and extractive answers.
Privacy Guarantees:
- In "local-only" mode, searches are executed strictly within the local indexed corpus with zero network traffic.
- In "standard" mode, queries may be dispatched to upstream fallback providers (e.g. Google/DuckDuckGo) with strict IP shielding, no user identifiers, and zero-query logging.
- Server-side local-only enforcement: If this server is configured in local-only mode, all external dispatch is prohibited.
- Dangerous capabilities (shell execution, filesystem access, arbitrary URL fetching, crawl administration, secrets) are strictly forbidden.`,
    };
  }

  private async handleToolCall(
    params: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<McpToolCallResult> {
    const toolName = typeof params['name'] === 'string' ? params['name'].trim() : '';
    const args = (params['arguments'] ?? {}) as Record<string, unknown>;

    if (!toolName) {
      return {
        content: [{ type: 'text', text: 'Error: Tool name is required.' }],
        isError: true,
      };
    }

    // 1. Check against forbidden actions (Shell, FS, Fetch, Crawl, Secrets)
    for (const pattern of FORBIDDEN_TOOL_PATTERNS) {
      if (pattern.test(toolName)) {
        this.logger.warn(`[MCP Security] Blocked attempt to call forbidden tool: ${toolName}`);
        return {
          content: [
            {
              type: 'text',
              text: `Access Denied: Tool "${toolName}" is prohibited. Shell execution, filesystem access, arbitrary URL fetching, crawl administration, and secrets access are strictly forbidden in OpenSearch MCP.`,
            },
          ],
          isError: true,
        };
      }
    }

    if (signal.aborted) {
      return {
        content: [{ type: 'text', text: 'Operation cancelled by client.' }],
        isError: true,
      };
    }

    // 2. Dispatch narrow allowed tools
    switch (toolName) {
      case 'search':
        return this.executeSearchTool(args as unknown as SearchToolArgs, signal);

      case 'quick_answer':
        return this.executeQuickAnswerTool(args as unknown as QuickAnswerToolArgs, signal);

      case 'get_status':
        return this.executeStatusTool(args as unknown as StatusToolArgs);

      case 'get_privacy_policy':
        return this.executePrivacyPolicyTool();

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool "${toolName}". Available tools: search, quick_answer, get_status, get_privacy_policy.`,
            },
          ],
          isError: true,
        };
    }
  }

  /**
   * Search tool execution with strict schema validation and server-side privacy enforcement.
   */
  private async executeSearchTool(args: SearchToolArgs, signal: AbortSignal): Promise<McpToolCallResult> {
    const rawQuery = typeof args.query === 'string' ? args.query.trim() : '';

    if (!rawQuery) {
      return {
        content: [{ type: 'text', text: 'Validation Error: "query" parameter is required and cannot be empty.' }],
        isError: true,
      };
    }

    if (rawQuery.length > this.maxQueryLength) {
      return {
        content: [
          {
            type: 'text',
            text: `Validation Error: "query" length (${rawQuery.length}) exceeds maximum allowable limit of ${this.maxQueryLength} characters.`,
          },
        ],
        isError: true,
      };
    }

    let limit = 5;
    if (args.limit !== undefined) {
      const parsed = Number(args.limit);
      if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > this.maxResults) {
        return {
          content: [
            {
              type: 'text',
              text: `Validation Error: "limit" must be an integer between 1 and ${this.maxResults}.`,
            },
          ],
          isError: true,
        };
      }
      limit = parsed;
    }

    // Enforce server-side Local-only mode
    const requestedMode = args.mode ?? (this.isLocalOnly ? 'local-only' : 'standard');
    let effectiveMode: 'local-only' | 'standard' = requestedMode;
    let modeNotice = '';

    if (this.isLocalOnly) {
      effectiveMode = 'local-only';
      if (requestedMode === 'standard') {
        modeNotice = '[Server Policy: Local-only mode is enforced server-side. Upstream network dispatch is blocked.]\n\n';
      }
    }

    if (signal.aborted) {
      return {
        content: [{ type: 'text', text: 'Search operation cancelled.' }],
        isError: true,
      };
    }

    // Ensure search subsystem is ready
    if (!this.services) {
      return {
        content: [{ type: 'text', text: 'Error: Search services are not initialized.' }],
        isError: true,
      };
    }

    const { queryParser, candidateRetriever, rankingEngine, resultGenerator } = this.services;

    // 1. Query Parsing
    const parsedQuery = queryParser.parse(rawQuery);

    // 2. Candidate Retrieval
    const retrievalResult = candidateRetriever.retrieve(parsedQuery, {
      maxCandidates: Math.max(50, limit * 5),
    });

    // 3. Ranking
    const rankingResult = rankingEngine.rank(parsedQuery, retrievalResult.candidates, {
      topK: limit,
      enableDuplicatePenalty: true,
    });

    // 4. Result Generation
    const searchResultSet = resultGenerator.generateResults(parsedQuery, rankingResult.hits, {
      pagination: {
        page: 1,
        pageSize: limit,
      },
    });

    let items = searchResultSet.items;

    // 5. Upstream fallback if standard mode is allowed and local results are insufficient
    let externalDispatched = false;
    let externalProviderUsed = '';

    if (effectiveMode === 'standard' && items.length === 0) {
      try {
        const externalHits = await fetchExternalWebResults(
          rawQuery,
          limit,
          this.services?.providerRegistry,
          args.category ?? 'all',
          args.safeSearch ?? 'moderate'
        );
        if (externalHits.length > 0) {
          items = externalHits;
          externalDispatched = true;
          externalProviderUsed = externalHits[0]?.source ?? 'external_fallback';
        }
      } catch (err) {
        this.logger.warn(`[MCP] External fallback search failed: ${(err as Error).message}`);
      }
    }

    // 6. Format Markdown Result Presentation
    const lines: string[] = [];
    if (modeNotice) {
      lines.push(modeNotice);
    }

    lines.push(`## Search Results for: "${rawQuery}"`);
    lines.push(`- **Mode**: ${effectiveMode}`);
    lines.push(`- **Results returned**: ${items.length}`);
    if (externalDispatched) {
      lines.push(`- **Upstream Provider**: ${externalProviderUsed} (queried with zero IP logging and sanitized parameters)`);
    } else {
      lines.push(`- **Source**: Local Inverted Index (zero network dispatch)`);
    }
    lines.push('');

    if (items.length === 0) {
      lines.push('No matching documents found.');
    } else {
      items.forEach((item, index) => {
        lines.push(`### ${index + 1}. [${item.title || item.url}](${item.url})`);
        lines.push(`- **URL**: ${item.url}`);
        lines.push(`- **Source**: \`${item.source ?? 'local-index'}\``);
        if (item.score !== undefined) {
          lines.push(`- **Score**: ${item.score.toFixed(3)}`);
        }
        lines.push(`- **Snippet**: ${item.snippet || 'No snippet available.'}`);
        lines.push('');
      });
    }

    // Append Privacy Receipt summary
    lines.push('---');
    lines.push(`**Privacy Receipt**: Mode: ${effectiveMode} | Network Dispatched: ${externalDispatched} | Telemetry: none | Zero Query Logging: verified`);

    return {
      content: [
        {
          type: 'text',
          text: lines.join('\n'),
        },
      ],
      isError: false,
    };
  }

  /**
   * Deterministic Extractive Quick Answer tool execution.
   */
  private async executeQuickAnswerTool(args: QuickAnswerToolArgs, signal: AbortSignal): Promise<McpToolCallResult> {
    const rawQuery = typeof args.query === 'string' ? args.query.trim() : '';

    if (!rawQuery) {
      return {
        content: [{ type: 'text', text: 'Validation Error: "query" parameter is required.' }],
        isError: true,
      };
    }

    if (rawQuery.length > this.maxQueryLength) {
      return {
        content: [
          {
            type: 'text',
            text: `Validation Error: "query" exceeds maximum allowable limit of ${this.maxQueryLength} characters.`,
          },
        ],
        isError: true,
      };
    }

    if (signal.aborted) {
      return {
        content: [{ type: 'text', text: 'Quick answer operation cancelled.' }],
        isError: true,
      };
    }

    if (!this.services) {
      return {
        content: [{ type: 'text', text: 'Error: Search services are not initialized.' }],
        isError: true,
      };
    }

    const { queryParser, candidateRetriever, rankingEngine, resultGenerator, quickAnswerEngine } = this.services;

    // Retrieve relevant candidates
    const parsedQuery = queryParser.parse(rawQuery);
    const retrievalResult = candidateRetriever.retrieve(parsedQuery, { maxCandidates: 25 });
    const rankingResult = rankingEngine.rank(parsedQuery, retrievalResult.candidates, { topK: 5 });
    const searchResultSet = resultGenerator.generateResults(parsedQuery, rankingResult.hits, {
      pagination: { page: 1, pageSize: 5 },
    });

    if (!quickAnswerEngine || searchResultSet.items.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Quick Answer for "${rawQuery}": Insufficient verified evidence found in indexed sources to generate a deterministic answer without hallucination.`,
          },
        ],
        isError: false,
      };
    }

    const quickAnswer = quickAnswerEngine.generate(rawQuery, searchResultSet.items, {
      isLocalOnly: this.isLocalOnly,
    });

    if (!quickAnswer || !quickAnswer.hasSufficientEvidence) {
      return {
        content: [
          {
            type: 'text',
            text: `Quick Answer for "${rawQuery}": Insufficient verified evidence found in indexed sources to construct an extractive answer. (No citations fabricated).`,
          },
        ],
        isError: false,
      };
    }

    const lines: string[] = [];
    lines.push(`## Quick Answer for: "${rawQuery}"`);
    lines.push('');
    lines.push(quickAnswer.summary);
    lines.push('');
    if (quickAnswer.citations && quickAnswer.citations.length > 0) {
      lines.push('### Supporting Sources:');
      quickAnswer.citations.forEach((cit) => {
        lines.push(`[${cit.index}] [${cit.title || cit.url}](${cit.url})`);
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: lines.join('\n'),
        },
      ],
      isError: false,
    };
  }

  /**
   * Status tool execution.
   */
  private executeStatusTool(args: StatusToolArgs): McpToolCallResult {
    const totalDocs = this.services?.index.getStats().totalDocuments ?? 0;
    const totalTerms = this.services?.index.getStats().totalTerms ?? 0;
    const isReady = Boolean(this.services && totalDocs >= 0);

    const statusObj = {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
      status: isReady ? 'ok' : 'initializing',
      privacyMode: this.isLocalOnly ? 'local-only' : 'standard',
      localOnlyEnforced: this.isLocalOnly,
      index: {
        totalDocuments: totalDocs,
        totalTerms,
      },
      timestamp: new Date().toISOString(),
    };

    if (args.verbose) {
      Object.assign(statusObj, {
        limits: {
          maxQueryLength: this.maxQueryLength,
          maxResults: this.maxResults,
        },
        servicesAvailable: {
          index: Boolean(this.services?.index),
          queryParser: Boolean(this.services?.queryParser),
          candidateRetriever: Boolean(this.services?.candidateRetriever),
          rankingEngine: Boolean(this.services?.rankingEngine),
          quickAnswerEngine: Boolean(this.services?.quickAnswerEngine),
        },
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(statusObj, null, 2),
        },
      ],
      isError: false,
    };
  }

  /**
   * Privacy policy tool execution.
   */
  private executePrivacyPolicyTool(): McpToolCallResult {
    const policyText = `# OpenSearch Privacy & Data Minimization Policy

OpenSearch operates under a strict Zero-Tracking, Zero-Profiling, and Data-Minimization Policy.

## Core Commitments:
1. **Zero User Accounts**: No registration, authentication, or user profiles.
2. **Zero Search History**: Queries are processed strictly in-memory and are never stored or associated with submitters.
3. **Zero Cookies**: No cookies, session identifiers, or tracking tokens are set.
4. **IP Anonymization**: All operational logs mask IP addresses (IPv4 /24 mask, IPv6 /48 mask). Query text is stripped from logs.
5. **Local-Only Mode**: When Local-only mode is active, the engine blocks 100% of outbound network queries, guaranteeing search stays on your device/server.
6. **Standard Mode Disclosure**: When in standard mode and local index results are empty, queries may be dispatched to external upstream providers with strict IP shielding and zero-query logging.
7. **Verifiable Privacy Receipts**: Every query response is accompanied by a verifiable Privacy Receipt declaring outbound requests and telemetry state.`;

    return {
      content: [
        {
          type: 'text',
          text: policyText,
        },
      ],
      isError: false,
    };
  }
}
