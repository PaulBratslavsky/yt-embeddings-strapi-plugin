/**
 * Create Embedding — Canonical Tool Definition
 *
 * Creates a new embedding from text content.
 * Supports automatic chunking for large content.
 * Returns raw result objects (no MCP envelope).
 */

import type { Core } from '@strapi/strapi';
import { CreateEmbeddingSchema } from '../mcp/schemas';
import type { ToolDefinition } from './types';

export const createEmbeddingTool: ToolDefinition = {
  name: 'createEmbedding',
  description:
    'Create a new embedding from text content for future semantic search. ' +
    'Large content can be auto-chunked into multiple embeddings.',
  schema: CreateEmbeddingSchema,
  execute: async (args, strapi) => {
    const { title, content, metadata, autoChunk } = args as {
      title: string;
      content: string;
      metadata?: Record<string, any>;
      autoChunk?: boolean;
    };

    const embeddingsService = strapi
      .plugin('yt-embeddings-strapi-plugin')
      .service('embeddings');

    if (autoChunk) {
      const result = await embeddingsService.createChunkedEmbedding({
        data: {
          title,
          content,
          metadata: metadata || {},
          collectionType: 'standalone',
          fieldName: 'content',
        },
      });

      return {
        success: true,
        message: result.wasChunked
          ? `Content chunked into ${result.totalChunks} embeddings`
          : 'Embedding created successfully (no chunking needed)',
        wasChunked: result.wasChunked,
        totalChunks: result.totalChunks,
        primaryEmbedding: {
          id: result.entity.id,
          documentId: result.entity.documentId,
          title: result.entity.title,
          embeddingId: result.entity.embeddingId,
        },
        chunks: result.chunks.map((chunk: any) => ({
          documentId: chunk.documentId,
          title: chunk.title,
          contentLength: chunk.content?.length || 0,
        })),
        contentLength: content.length,
        estimatedTokens: Math.ceil(content.length / 4),
      };
    }

    // Create single embedding
    const embedding = await embeddingsService.createEmbedding({
      data: {
        title,
        content,
        metadata: metadata || {},
        collectionType: 'standalone',
        fieldName: 'content',
      },
    });

    return {
      success: true,
      message: 'Embedding created successfully',
      embedding: {
        id: embedding.id,
        documentId: embedding.documentId,
        title: embedding.title,
        embeddingId: embedding.embeddingId,
        contentLength: content.length,
        metadata: embedding.metadata,
        createdAt: embedding.createdAt,
      },
      hint:
        content.length > 4000
          ? 'Content is large. Consider using autoChunk: true for better search results.'
          : undefined,
    };
  },
  publicSafe: false,
};
