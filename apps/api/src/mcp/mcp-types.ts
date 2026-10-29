/**
 * @opensearch/api — Model Context Protocol (MCP) Server Types (Phase 109)
 *
 * Implements schemas and interfaces conforming to the Model Context Protocol
 * (2024-11-05 specification) for safe, privacy-preserving AI search integration.
 */

import { SearchServices } from '../types.js';
import { AppConfig, Logger } from '@opensearch/shared';

export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const MCP_SERVER_NAME = 'opensearch-mcp';
export const MCP_SERVER_VERSION = '1.4.0';

// JSON-RPC 2.0 Error Codes
export const JSONRPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom tool execution error codes
  TOOL_NOT_FOUND: -32001,
  VALIDATION_FAILED: -32002,
  ACCESS_DENIED: -32003,
  CANCELLED: -32004,
} as const;

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolCallResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface McpServerOptions {
  /** Search services instance (queryParser, retriever, ranking, etc.) */
  services?: SearchServices;
  /** Global application configuration */
  config?: AppConfig;
  /** Logger */
  logger?: Logger;
  /** Enforce Local-only mode server-side. Standard mode will be blocked. Default: false */
  isLocalOnly?: boolean;
  /** Maximum allowable query length in characters. Default: 200 */
  maxQueryLength?: number;
  /** Maximum allowable results count. Default: 20 */
  maxResults?: number;
  /** Whether the MCP server is enabled. Default: true */
  enabled?: boolean;
}

export interface SearchToolArgs {
  query: string;
  limit?: number;
  category?: 'all' | 'web' | 'images' | 'news';
  lens?: string;
  safeSearch?: 'strict' | 'moderate' | 'off';
  mode?: 'local-only' | 'standard';
}

export interface QuickAnswerToolArgs {
  query: string;
}

export interface StatusToolArgs {
  verbose?: boolean;
}
