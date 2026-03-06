/**
 * Create Embedding Tool — MCP Wrapper
 *
 * Thin MCP adapter that delegates to the canonical tool implementation.
 */

import type { Core } from '@strapi/strapi';
import { createEmbeddingTool } from '../../tools/create-embedding';

export const createEmbeddingMcpTool = {
  name: 'create_embedding',
  description: createEmbeddingTool.description,
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'A descriptive title for the embedding',
      },
      content: {
        type: 'string',
        description: 'The text content to embed (will be vectorized)',
      },
      metadata: {
        type: 'object',
        description: 'Optional metadata to associate with the embedding (tags, source, etc.)',
      },
      autoChunk: {
        type: 'boolean',
        description:
          'Automatically split large content into chunks (default: false). When enabled, content over 4000 characters will be split into multiple embeddings with overlap for context preservation.',
      },
    },
    required: ['title', 'content'],
  },
};

export async function handleCreateEmbedding(
  strapi: Core.Strapi,
  args: {
    title: string;
    content: string;
    metadata?: Record<string, any>;
    autoChunk?: boolean;
  }
) {
  const result = await createEmbeddingTool.execute(args, strapi);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
