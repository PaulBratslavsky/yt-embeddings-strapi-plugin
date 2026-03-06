/**
 * Get Embedding — Canonical Tool Definition
 *
 * Retrieves a single embedding by document ID.
 * Returns raw result objects (no MCP envelope).
 */

import type { Core } from '@strapi/strapi';
import { GetEmbeddingSchema } from '../mcp/schemas';
import type { ToolDefinition } from './types';

export const getEmbeddingTool: ToolDefinition = {
  name: 'getEmbedding',
  description:
    'Get a specific embedded document by its document ID. ' +
    'Returns full content and metadata.',
  schema: GetEmbeddingSchema,
  execute: async (args, strapi) => {
    const { documentId, includeContent = true } = args as {
      documentId: string;
      includeContent?: boolean;
    };

    const embeddingsService = strapi
      .plugin('yt-embeddings-strapi-plugin')
      .service('embeddings');

    const embedding = await embeddingsService.getEmbedding(documentId);

    if (!embedding) {
      return {
        error: true,
        message: `Embedding not found with documentId: ${documentId}`,
      };
    }

    const result: any = {
      id: embedding.id,
      documentId: embedding.documentId,
      title: embedding.title,
      collectionType: embedding.collectionType,
      fieldName: embedding.fieldName,
      metadata: embedding.metadata,
      embeddingId: embedding.embeddingId,
      createdAt: embedding.createdAt,
      updatedAt: embedding.updatedAt,
    };

    if (includeContent) {
      result.content = embedding.content;
    }

    return result;
  },
  publicSafe: true,
};
