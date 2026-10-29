import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PassThrough } from 'node:stream';
import {
  OpenSearchMcpServer,
  runStdioMcpServer,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  createApiServer,
  ApiServer,
} from '../src/index.js';
import { createInvertedIndex, createDocumentProcessor } from '@opensearch/indexer';
import {
  createQueryParser,
  createCandidateRetriever,
  createRankingEngine,
  createResultGenerator,
  createQuickAnswerEngine,
} from '@opensearch/ranking';

describe('Phase 109 — Model Context Protocol (MCP) Server Suite', () => {
  let sampleIndex: ReturnType<typeof createInvertedIndex>;
  let searchServices: any;
  let apiServer: ApiServer;
  let disabledMcpApiServer: ApiServer;
  let baseUrl: string;
  let disabledBaseUrl: string;

  beforeAll(async () => {
    // 1. Build test index with known documents using DocumentProcessor
    sampleIndex = createInvertedIndex();
    const processor = createDocumentProcessor();

    sampleIndex.addDocument(
      processor.process({
        id: 'doc-1',
        url: 'https://example.org/privacy-search',
        title: 'Privacy Preserving Search Architecture',
        description: 'OpenSearch ensures zero tracking and zero user profiling.',
        headings: 'Privacy Guarantee Local Mode',
        bodyText: 'OpenSearch is an independent privacy preserving first web search engine that enforces zero query logging and local-only ranking.',
        language: 'en',
      }),
    );
    sampleIndex.addDocument(
      processor.process({
        id: 'doc-2',
        url: 'https://example.org/mcp-standard',
        title: 'Model Context Protocol Documentation',
        description: 'Model Context Protocol specification and architecture.',
        headings: 'Protocol Handshake Tool Schemas',
        bodyText: 'The Model Context Protocol standardizes how language models query tools and resources safely.',
        language: 'en',
      }),
    );

    const queryParser = createQueryParser();
    const candidateRetriever = createCandidateRetriever(sampleIndex);
    const rankingEngine = createRankingEngine(sampleIndex);
    const resultGenerator = createResultGenerator();
    const quickAnswerEngine = createQuickAnswerEngine();

    searchServices = {
      index: sampleIndex,
      queryParser,
      candidateRetriever,
      rankingEngine,
      resultGenerator,
      quickAnswerEngine,
    };

    // 2. Start normal API server with MCP enabled
    apiServer = createApiServer({
      port: 0,
      host: '127.0.0.1',
      services: searchServices,
      enableMcp: true,
      isLocalOnly: true,
    });
    const info = await apiServer.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${info.port}`;

    // 3. Start API server with MCP explicitly disabled
    disabledMcpApiServer = createApiServer({
      port: 0,
      host: '127.0.0.1',
      services: searchServices,
      enableMcp: false,
    });
    const disabledInfo = await disabledMcpApiServer.start(0, '127.0.0.1');
    disabledBaseUrl = `http://127.0.0.1:${disabledInfo.port}`;
  });

  afterAll(async () => {
    await apiServer.stop();
    await disabledMcpApiServer.stop();
  });

  describe('1. MCP Protocol Handshake & Metadata', () => {
    it('handles "initialize" request with capabilities, serverInfo, and privacy disclosure', async () => {
      const server = new OpenSearchMcpServer({
        services: searchServices,
        isLocalOnly: true,
      });

      const response = await server.handleMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0' },
        },
      });

      expect(response).not.toBeNull();
      expect(response?.id).toBe(1);
      const res = response?.result as any;
      expect(res.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
      expect(res.serverInfo.name).toBe(MCP_SERVER_NAME);
      expect(res.capabilities.tools).toBeDefined();
      expect(res.instructions).toContain('local-only');
      expect(res.instructions).toContain('standard');
      expect(res.instructions).toContain('zero-query logging');
    });

    it('handles "ping" request', async () => {
      const server = new OpenSearchMcpServer();
      const response = await server.handleMessage({
        jsonrpc: '2.0',
        id: 2,
        method: 'ping',
      });
      expect(response?.result).toEqual({});
    });

    it('processes "notifications/initialized" notification without returning a response', async () => {
      const server = new OpenSearchMcpServer();
      const response = await server.handleMessage({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });
      expect(response).toBeNull();
    });

    it('returns standard -32601 for unsupported JSON-RPC method', async () => {
      const server = new OpenSearchMcpServer();
      const response = await server.handleMessage({
        jsonrpc: '2.0',
        id: 99,
        method: 'unknown/method',
      });
      expect(response?.error?.code).toBe(-32601);
      expect(response?.error?.message).toContain('Method not found');
    });
  });

  describe('2. Narrow Tools Definition (tools/list)', () => {
    it('exposes exactly the narrow, validated tools with schemas', async () => {
      const server = new OpenSearchMcpServer();
      const response = await server.handleMessage({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
      });

      const tools = (response?.result as any).tools;
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(4);

      const toolNames = tools.map((t: any) => t.name);
      expect(toolNames).toContain('search');
      expect(toolNames).toContain('quick_answer');
      expect(toolNames).toContain('get_status');
      expect(toolNames).toContain('get_privacy_policy');

      // Verify search tool schema limits
      const searchTool = tools.find((t: any) => t.name === 'search');
      expect(searchTool.inputSchema.properties.query.maxLength).toBe(200);
      expect(searchTool.inputSchema.properties.limit.maximum).toBe(20);
      expect(searchTool.inputSchema.required).toContain('query');
    });
  });

  describe('3. Strict Input Validation & Limits', () => {
    let server: OpenSearchMcpServer;

    beforeAll(() => {
      server = new OpenSearchMcpServer({
        services: searchServices,
        maxQueryLength: 200,
        maxResults: 20,
      });
    });

    it('rejects empty query string', async () => {
      const res = await server.handleMessage({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'search',
          arguments: { query: '   ' },
        },
      });
      const result = res?.result as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('cannot be empty');
    });

    it('rejects query exceeding 200 characters limit', async () => {
      const res = await server.handleMessage({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'search',
          arguments: { query: 'x'.repeat(201) },
        },
      });
      const result = res?.result as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('exceeds maximum allowable limit of 200 characters');
    });

    it('rejects limit exceeding maximum 20', async () => {
      const res = await server.handleMessage({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'search',
          arguments: { query: 'privacy', limit: 25 },
        },
      });
      const result = res?.result as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('must be an integer between 1 and 20');
    });

    it('rejects limit below 1', async () => {
      const res = await server.handleMessage({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'search',
          arguments: { query: 'privacy', limit: 0 },
        },
      });
      const result = res?.result as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('must be an integer between 1 and 20');
    });
  });

  describe('4. Security & Isolation Boundaries', () => {
    let server: OpenSearchMcpServer;

    beforeAll(() => {
      server = new OpenSearchMcpServer({ services: searchServices });
    });

    it('blocks shell execution tools unconditionally', async () => {
      const tools = ['exec', 'shell', 'bash', 'cmd', 'powershell', 'run_command', 'system'];
      for (const t of tools) {
        const res = await server.handleMessage({
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: { name: t, arguments: { command: 'ls' } },
        });
        const result = res?.result as any;
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Access Denied');
        expect(result.content[0].text).toContain('Shell execution');
      }
    });

    it('blocks filesystem access tools unconditionally', async () => {
      const tools = ['readFile', 'writeFile', 'read_file', 'write_file', 'fs', 'deleteFile', 'list_dir'];
      for (const t of tools) {
        const res = await server.handleMessage({
          jsonrpc: '2.0',
          id: 11,
          method: 'tools/call',
          params: { name: t, arguments: { path: '/etc/passwd' } },
        });
        const result = res?.result as any;
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Access Denied');
        expect(result.content[0].text).toContain('filesystem access');
      }
    });

    it('blocks arbitrary URL fetching tools unconditionally', async () => {
      const tools = ['fetch', 'curl', 'downloadUrl', 'http_request', 'wget'];
      for (const t of tools) {
        const res = await server.handleMessage({
          jsonrpc: '2.0',
          id: 12,
          method: 'tools/call',
          params: { name: t, arguments: { url: 'http://169.254.169.254/latest/meta-data' } },
        });
        const result = res?.result as any;
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Access Denied');
        expect(result.content[0].text).toContain('arbitrary URL fetching');
      }
    });

    it('blocks crawler administration tools unconditionally', async () => {
      const tools = ['crawl', 'crawlStart', 'crawler_admin', 'manageSeeds'];
      for (const t of tools) {
        const res = await server.handleMessage({
          jsonrpc: '2.0',
          id: 13,
          method: 'tools/call',
          params: { name: t, arguments: {} },
        });
        const result = res?.result as any;
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Access Denied');
        expect(result.content[0].text).toContain('crawl administration');
      }
    });

    it('blocks secrets extraction attempts unconditionally', async () => {
      const tools = ['get_secret', 'secrets', 'credentials', 'read_env'];
      for (const t of tools) {
        const res = await server.handleMessage({
          jsonrpc: '2.0',
          id: 14,
          method: 'tools/call',
          params: { name: t, arguments: {} },
        });
        const result = res?.result as any;
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Access Denied');
        expect(result.content[0].text).toContain('secrets');
      }
    });
  });

  describe('5. Server-Side Local-Only Mode Enforcement', () => {
    it('enforces local-only mode server-side even when client passes mode="standard"', async () => {
      const server = new OpenSearchMcpServer({
        services: searchServices,
        isLocalOnly: true,
      });

      const res = await server.handleMessage({
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/call',
        params: {
          name: 'search',
          arguments: {
            query: 'privacy search',
            mode: 'standard', // Request standard mode
          },
        },
      });

      const result = res?.result as any;
      expect(result.isError).toBe(false);
      const text = result.content[0].text;
      expect(text).toContain('Local-only mode is enforced server-side');
      expect(text).toContain('Mode**: local-only');
      expect(text).toContain('Network Dispatched: false');
    });
  });

  describe('6. Tool Execution with Search Services', () => {
    let server: OpenSearchMcpServer;

    beforeAll(() => {
      server = new OpenSearchMcpServer({
        services: searchServices,
        isLocalOnly: false,
      });
    });

    it('executes "search" and formats markdown with provenance and Privacy Receipt', async () => {
      const res = await server.handleMessage({
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/call',
        params: {
          name: 'search',
          arguments: {
            query: 'privacy preserving',
            limit: 2,
          },
        },
      });

      const result = res?.result as any;
      expect(result.isError).toBe(false);
      const text = result.content[0].text;
      expect(text).toContain('## Search Results for: "privacy preserving"');
      expect(text).toContain('Privacy Preserving Search Architecture');
      expect(text).toContain('https://example.org/privacy-search');
      expect(text).toContain('Privacy Receipt');
    });

    it('executes "quick_answer" without hallucinating citations when evidence is absent', async () => {
      const res = await server.handleMessage({
        jsonrpc: '2.0',
        id: 31,
        method: 'tools/call',
        params: {
          name: 'quick_answer',
          arguments: {
            query: 'completely absent non-indexed query terms',
          },
        },
      });

      const result = res?.result as any;
      expect(result.isError).toBe(false);
      const text = result.content[0].text;
      expect(text).toContain('Insufficient verified evidence');
    });

    it('executes "get_status" returning indexing and privacy metadata', async () => {
      const res = await server.handleMessage({
        jsonrpc: '2.0',
        id: 32,
        method: 'tools/call',
        params: {
          name: 'get_status',
          arguments: { verbose: true },
        },
      });

      const result = res?.result as any;
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.name).toBe(MCP_SERVER_NAME);
      expect(parsed.index.totalDocuments).toBeGreaterThanOrEqual(2);
      expect(parsed.servicesAvailable.rankingEngine).toBe(true);
    });

    it('executes "get_privacy_policy" returning data minimization guarantees', async () => {
      const res = await server.handleMessage({
        jsonrpc: '2.0',
        id: 33,
        method: 'tools/call',
        params: {
          name: 'get_privacy_policy',
          arguments: {},
        },
      });

      const result = res?.result as any;
      expect(result.isError).toBe(false);
      const text = result.content[0].text;
      expect(text).toContain('Zero User Accounts');
      expect(text).toContain('Zero Cookies');
      expect(text).toContain('Zero Search History');
    });
  });

  describe('7. Request Cancellation Handling', () => {
    it('handles "notifications/cancelled" without crashing', async () => {
      const server = new OpenSearchMcpServer({ services: searchServices });
      // Send notification cancelling non-existent or completed request
      const res = await server.handleMessage({
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: { requestId: 9999 },
      });
      expect(res).toBeNull();
    });
  });

  describe('8. Stdio Transport Streaming', () => {
    it('processes newline-delimited JSON-RPC messages over streams', async () => {
      const server = new OpenSearchMcpServer({ services: searchServices });
      const inStream = new PassThrough();
      const outStream = new PassThrough();

      const runner = runStdioMcpServer(server, { inStream, outStream });

      let receivedOutput = '';
      outStream.on('data', chunk => {
        receivedOutput += chunk.toString();
      });

      inStream.write(JSON.stringify({ jsonrpc: '2.0', id: 50, method: 'ping' }) + '\n');

      // Wait briefly for stream event loop tick
      await new Promise(r => setTimeout(r, 50));
      runner.close();

      expect(receivedOutput).toContain('"id":50');
      expect(receivedOutput).toContain('"result":{}');
    });
  });

  describe('9. HTTP & SSE Transport Endpoints', () => {
    it('handles JSON-RPC POST /api/v1/mcp over HTTP', async () => {
      const res = await fetch(`${baseUrl}/api/v1/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 101,
          method: 'tools/list',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(101);
      expect(data.result.tools.length).toBe(4);
    });

    it('rejects malformed HTTP POST /api/v1/mcp bodies with 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json-body',
      });

      expect(res.status).toBe(400);
    });

    it('initiates SSE connection on GET /api/v1/mcp/sse with discovery event', async () => {
      const controller = new AbortController();
      const res = await fetch(`${baseUrl}/api/v1/mcp/sse`, {
        signal: controller.signal,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      controller.abort();
    });
  });

  describe('10. MCP Disablement & Normal Search Isolation', () => {
    it('returns 503 on MCP endpoints when MCP is disabled', async () => {
      const res = await fetch(`${disabledBaseUrl}/api/v1/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      });

      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error.code).toBe('MCP_DISABLED');
    });

    it('ensures core search endpoints are 100% functional when MCP is disabled', async () => {
      const res = await fetch(`${disabledBaseUrl}/api/v1/search?q=privacy`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.query.raw ?? data.query).toBe('privacy');
      expect(Array.isArray(data.results)).toBe(true);

      const suggestRes = await fetch(`${disabledBaseUrl}/api/v1/suggest?q=priv`);
      expect(suggestRes.status).toBe(200);

      const osddRes = await fetch(`${disabledBaseUrl}/opensearch.xml`);
      expect(osddRes.status).toBe(200);
    });
  });
});
