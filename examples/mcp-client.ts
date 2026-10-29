/**
 * OpenSearch — Minimal Model Context Protocol (MCP) Client Example (Phase 109)
 *
 * Demonstrates how an AI coding assistant, LLM agent, or desktop client
 * initializes and interacts with the OpenSearch MCP server using JSON-RPC 2.0.
 *
 * Run with:
 *   npx tsx examples/mcp-client.ts
 */

import {
  OpenSearchMcpServer,
  JsonRpcRequest,
  JsonRpcResponse,
  MCP_PROTOCOL_VERSION,
} from '../apps/api/src/index.js';

async function main() {
  console.log('===========================================================');
  console.log('OpenSearch — Model Context Protocol (MCP) Client Example');
  console.log('===========================================================\n');

  // 1. Initialize MCP Server in-process (or connect via stdio / HTTP)
  const server = new OpenSearchMcpServer({
    isLocalOnly: true, // Enforce local-only mode server-side for maximum privacy
    maxQueryLength: 200,
    maxResults: 10,
  });

  let messageId = 1;
  const sendRequest = async (method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: messageId++,
      method,
      params,
    };
    const response = await server.handleMessage(request);
    if (!response) {
      throw new Error('Received null response for request');
    }
    return response;
  };

  // 2. Perform MCP Handshake: initialize
  console.log('[Step 1] Sending "initialize" request...');
  const initRes = await sendRequest('initialize', {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: 'example-mcp-client',
      version: '1.0.0',
    },
  });
  console.log('✓ Initialized:', JSON.stringify(initRes.result, null, 2));

  // 3. Send notifications/initialized notification
  console.log('\n[Step 2] Sending "notifications/initialized" notification...');
  await server.handleMessage({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });
  console.log('✓ Initialization confirmed');

  // 4. List available tools: tools/list
  console.log('\n[Step 3] Querying "tools/list"...');
  const toolsRes = await sendRequest('tools/list');
  const tools = (toolsRes.result as { tools: Array<{ name: string; description: string }> }).tools;
  console.log(`✓ Retrieved ${tools.length} narrow tools:`);
  tools.forEach(t => console.log(`  - ${t.name}: ${t.description.slice(0, 80)}...`));

  // 5. Query status: tools/call -> get_status
  console.log('\n[Step 4] Calling tool "get_status"...');
  const statusRes = await sendRequest('tools/call', {
    name: 'get_status',
    arguments: { verbose: true },
  });
  console.log('✓ Status response:\n', (statusRes.result as { content: Array<{ text: string }> }).content[0]?.text);

  // 6. Execute search: tools/call -> search
  console.log('\n[Step 5] Calling tool "search" with query "open source"...');
  const searchRes = await sendRequest('tools/call', {
    name: 'search',
    arguments: {
      query: 'open source',
      limit: 3,
    },
  });
  console.log('✓ Search output:\n', (searchRes.result as { content: Array<{ text: string }> }).content[0]?.text);

  // 7. Security demonstration: Attempting forbidden tool (e.g., shell exec)
  console.log('\n[Step 6] Testing security rejection on prohibited tool "exec"...');
  const forbiddenRes = await sendRequest('tools/call', {
    name: 'exec',
    arguments: { command: 'whoami' },
  });
  console.log('✓ Security response (strictly blocked):', (forbiddenRes.result as { content: Array<{ text: string }> }).content[0]?.text);

  // 8. Schema validation: Query exceeding length limit
  console.log('\n[Step 7] Testing input schema validation on oversized query (> 200 chars)...');
  const oversizedRes = await sendRequest('tools/call', {
    name: 'search',
    arguments: {
      query: 'a'.repeat(250),
    },
  });
  console.log('✓ Input validation response:', (oversizedRes.result as { content: Array<{ text: string }> }).content[0]?.text);

  console.log('\n===========================================================');
  console.log('MCP Client Demonstration Completed Successfully!');
  console.log('===========================================================');
}

if (process.argv[1] && process.argv[1].endsWith('mcp-client.ts')) {
  main().catch(err => {
    console.error('Fatal client error:', err);
    process.exit(1);
  });
}

export { main };
