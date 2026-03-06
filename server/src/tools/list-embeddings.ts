/**
 * List Embeddings — Canonical Tool Definition
 *
 * Lists all embeddings stored in the database with pagination.
 * Returns raw result objects (no MCP envelope).
 */

import type { Core } from '@strapi/strapi';
import { ListEmbeddingsSchema } from '../mcp/schemas';
import type { ToolDefinition } from './types';

export const listEmbeddingsTool: ToolDefinition = {
  name: 'listEmbeddings',
  description:
    'List all embedded documents with pagination. ' +
    'Returns metadata and content preview without full text.',
  schema: ListEmbeddingsSchema,
  execute: async (args, strapi) => {
    const { page = 1, pageSize = 25, search } = args as {
      page?: number;
      pageSize?: number;
      search?: string;
    };
    const limit = Math.min(pageSize, 50);

    const embeddingsService = strapi
      .plugin('yt-embeddings-strapi-plugin')
      .service('embeddings');

    const filters: any = {};
    if (search) {
      filters.title = { $containsi: search };
    }

    const result = await embeddingsService.getEmbeddings({
      page,
      pageSize: limit,
      filters,
    });

    const embeddings = (result.results || []).map((emb: any) => ({
      id: emb.id,
      documentId: emb.documentId,
      title: emb.title,
      collectionType: emb.collectionType,
      fieldName: emb.fieldName,
      metadata: emb.metadata,
      contentPreview:
        emb.content?.substring(0, 200) + (emb.content?.length > 200 ? '...' : ''),
      createdAt: emb.createdAt,
      updatedAt: emb.updatedAt,
    }));

    return {
      embeddings,
      pagination: result.pagination || {
        page,
        pageSize: limit,
        total: embeddings.length,
      },
    };
  },
  publicSafe: true,
};
