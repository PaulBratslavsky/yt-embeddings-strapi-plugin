/**
 * Semantic Search Tool — MCP Wrapper
 *
 * Thin MCP adapter that delegates to the canonical tool implementation.
 */

import type { Core } from '@strapi/strapi';
import { semanticSearchTool } from '../../tools/semantic-search';

export const semanticSearchMcpTool = {
  name: 'semantic_search',
  description: semanticSearchTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query text to find similar content',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 20)',
        default: 5,
      },
    },
    required: ['query'],
  },
};

export async function handleSemanticSearch(
  strapi: Core.Strapi,
  args: { query: string; limit?: number }
) {
  const result = await semanticSearchTool.execute(args, strapi);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
