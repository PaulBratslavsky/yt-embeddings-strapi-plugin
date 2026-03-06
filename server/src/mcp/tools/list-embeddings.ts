/**
 * List Embeddings Tool — MCP Wrapper
 *
 * Thin MCP adapter that delegates to the canonical tool implementation.
 */

import type { Core } from '@strapi/strapi';
import { listEmbeddingsTool } from '../../tools/list-embeddings';

export const listEmbeddingsMcpTool = {
  name: 'list_embeddings',
  description: listEmbeddingsTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      page: {
        type: 'number',
        description: 'Page number (starts at 1)',
        default: 1,
      },
      pageSize: {
        type: 'number',
        description: 'Number of items per page (max: 50)',
        default: 25,
      },
      search: {
        type: 'string',
        description: 'Search filter for title',
      },
    },
    required: [],
  },
};

export async function handleListEmbeddings(
  strapi: Core.Strapi,
  args: { page?: number; pageSize?: number; search?: string }
) {
  const result = await listEmbeddingsTool.execute(args, strapi);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
