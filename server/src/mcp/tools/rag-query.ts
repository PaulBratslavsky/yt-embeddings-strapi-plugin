/**
 * RAG Query Tool — MCP Wrapper
 *
 * Thin MCP adapter that delegates to the canonical tool implementation.
 */

import type { Core } from '@strapi/strapi';
import { ragQueryTool } from '../../tools/rag-query';

export const ragQueryMcpTool = {
  name: 'rag_query',
  description: ragQueryTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The question or query to answer using embedded content',
      },
      includeSourceDocuments: {
        type: 'boolean',
        description: 'Include the source documents used to generate the answer (default: true)',
        default: true,
      },
    },
    required: ['query'],
  },
};

export async function handleRagQuery(
  strapi: Core.Strapi,
  args: { query: string; includeSourceDocuments?: boolean }
) {
  const result = await ragQueryTool.execute(args, strapi);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
