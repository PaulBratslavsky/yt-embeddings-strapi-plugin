/**
 * MCP Server Factory for Content Embeddings
 *
 * Creates an MCP server that exposes vector search and RAG tools.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Core } from '@strapi/strapi';
import { tools, handleToolCall } from './tools';

export function createMcpServer(strapi: Core.Strapi): Server {
  const server = new Server(
    {
      name: 'yt-embeddings-strapi-plugin-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return handleToolCall(strapi, request);
  });

  return server;
}
