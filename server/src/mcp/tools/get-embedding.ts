/**
 * Get Embedding Tool — MCP Wrapper
 *
 * Thin MCP adapter that delegates to the canonical tool implementation.
 */

import type { Core } from '@strapi/strapi';
import { getEmbeddingTool } from '../../tools/get-embedding';

export const getEmbeddingMcpTool = {
  name: 'get_embedding',
  description: getEmbeddingTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      documentId: {
        type: 'string',
        description: 'The document ID of the embedding to retrieve',
      },
      includeContent: {
        type: 'boolean',
        description: 'Include the full content text (default: true)',
        default: true,
      },
    },
    required: ['documentId'],
  },
};

export async function handleGetEmbedding(
  strapi: Core.Strapi,
  args: { documentId: string; includeContent?: boolean }
) {
  const result = await getEmbeddingTool.execute(args, strapi);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
