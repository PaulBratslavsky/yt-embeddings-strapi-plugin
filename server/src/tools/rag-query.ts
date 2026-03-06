/**
 * RAG Query — Canonical Tool Definition
 *
 * Performs Retrieval-Augmented Generation to answer questions using embedded content.
 * Returns raw result objects (no MCP envelope).
 */

import type { Core } from '@strapi/strapi';
import { RagQuerySchema } from '../mcp/schemas';
import type { ToolDefinition } from './types';

export const ragQueryTool: ToolDefinition = {
  name: 'ragQuery',
  description:
    'Ask a question and get an AI-generated answer grounded in embedded content. ' +
    'Uses retrieval-augmented generation (RAG) with vector search.',
  schema: RagQuerySchema,
  execute: async (args, strapi) => {
    const { query, includeSourceDocuments = true } = args as {
      query: string;
      includeSourceDocuments?: boolean;
    };

    const embeddingsService = strapi
      .plugin('yt-embeddings-strapi-plugin')
      .service('embeddings');

    const result = await embeddingsService.queryEmbeddings(query);

    const response: any = {
      query,
      answer: result.text,
    };

    if (includeSourceDocuments && result.sourceDocuments) {
      response.sourceDocuments = result.sourceDocuments.map((doc: any, index: number) => ({
        rank: index + 1,
        content:
          doc.pageContent?.substring(0, 500) + (doc.pageContent?.length > 500 ? '...' : ''),
        metadata: doc.metadata,
      }));
      response.sourceCount = result.sourceDocuments.length;
    }

    return response;
  },
  publicSafe: true,
};
