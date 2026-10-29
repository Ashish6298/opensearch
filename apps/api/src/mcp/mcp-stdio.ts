/**
 * @opensearch/api — Model Context Protocol (MCP) Stdio Transport (Phase 109)
 *
 * Implements newline-delimited JSON-RPC 2.0 streaming over standard I/O (stdin/stdout)
 * enabling native plug-and-play integration with AI desktop clients, coding agents,
 * and command-line MCP runners.
 */

import * as readline from 'node:readline';
import { Readable, Writable } from 'node:stream';
import { OpenSearchMcpServer } from './mcp-server.js';

export interface StdioMcpOptions {
  inStream?: Readable;
  outStream?: Writable;
}

/**
 * Runs the OpenSearch MCP server over standard I/O streams.
 */
export function runStdioMcpServer(
  server: OpenSearchMcpServer,
  options: StdioMcpOptions = {}
): { close: () => void } {
  const inStream = options.inStream ?? process.stdin;
  const outStream = options.outStream ?? process.stdout;

  const rl = readline.createInterface({
    input: inStream,
    terminal: false,
  });

  const sendResponse = (data: unknown) => {
    if (outStream.writable && !outStream.destroyed) {
      outStream.write(JSON.stringify(data) + '\n');
    }
  };

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    try {
      const response = await server.handleMessage(trimmed);
      if (response !== null) {
        sendResponse(response);
      }
    } catch (err) {
      sendResponse({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: `Internal error in stdio transport: ${(err as Error).message}`,
        },
      });
    }
  });

  return {
    close: () => {
      rl.close();
    },
  };
}
