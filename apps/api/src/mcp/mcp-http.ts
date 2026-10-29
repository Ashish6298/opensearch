/**
 * @opensearch/api — Model Context Protocol (MCP) HTTP & SSE Route Handlers (Phase 109)
 *
 * Implements HTTP JSON-RPC 2.0 and Server-Sent Events (SSE) transports
 * allowing remote AI clients to access MCP tools over standard HTTP.
 */

import { RouteHandler } from '../types.js';
import { HTTP_STATUS } from '@opensearch/shared';

/**
 * Handles JSON-RPC 2.0 requests via HTTP POST /api/v1/mcp.
 */
export const handleMcpPost: RouteHandler = async (req, res, context) => {
  if (context.enableMcp === false || !context.mcpServer || !context.mcpServer.isEnabled()) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      error: {
        message: 'Model Context Protocol (MCP) server is disabled on this instance. Core search endpoints remain active.',
        code: 'MCP_DISABLED',
        category: 'FEATURE_DISABLED',
        statusCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32600,
        message: 'Invalid Request: Expected a JSON-RPC 2.0 object in request body.',
      },
    });
    return;
  }

  try {
    const response = await context.mcpServer.handleMessage(payload);
    if (response === null) {
      // Notification received without response required
      res.status(HTTP_STATUS.NO_CONTENT).sendEmpty();
      return;
    }
    res.status(HTTP_STATUS.OK).json(response);
  } catch (err) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: `MCP Server Error: ${(err as Error).message}`,
      },
    });
  }
};

/**
 * Handles MCP Server-Sent Events (SSE) connection via GET /api/v1/mcp/sse.
 */
export const handleMcpSse: RouteHandler = (req, res, context) => {
  if (context.enableMcp === false || !context.mcpServer || !context.mcpServer.isEnabled()) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      error: {
        message: 'Model Context Protocol (MCP) server is disabled on this instance. Core search endpoints remain active.',
        code: 'MCP_DISABLED',
        category: 'FEATURE_DISABLED',
        statusCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Set SSE Streaming Headers
  res.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  const hostHeader = (req.headers['x-forwarded-host'] as string) || (req.headers['host'] as string) || 'localhost:3000';
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
  const endpointUrl = `${proto}://${hostHeader}/api/v1/mcp`;

  // Send initial MCP SSE endpoint discovery event per specification
  res.raw.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

  req.raw.on('close', () => {
    if (!res.raw.writableEnded) {
      res.raw.end();
    }
  });
};
