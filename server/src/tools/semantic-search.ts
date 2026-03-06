/**
 * Semantic Search — Canonical Tool Definition
 *
 * Performs vector similarity search to find relevant content.
 * Returns raw result objects (no MCP envelope).
 */

import type { Core } from '@strapi/strapi';
import { SemanticSearchSchema } from '../mcp/schemas';
import type { ToolDefinition } from './types';

export const semanticSearchTool: ToolDefinition = {
  name: 'semanticSearch',
  description:
    'Search for semantically similar content using vector embeddings. ' +
    'Finds relevant documents by meaning, not just keywords.',
  schema: SemanticSearchSchema,
  execute: async (args, strapi) => {
    const { query, limit = 5 } = args as { query: string; limit?: number };
    const maxLimit = Math.min(limit, 20);

    const pluginManager = (strapi as any).contentEmbeddingsManager;

    if (!pluginManager) {
      throw new Error('Content embeddings plugin not initialized');
    }

    const results = await pluginManager.similaritySearch(query, maxLimit);

    const formattedResults = results.map((doc: any, index: number) => ({
      rank: index + 1,
      content: doc.pageContent,
      metadata: doc.metadata,
      score: doc.score || null,
    }));

    return {
      query,
      resultCount: formattedResults.length,
      results: formattedResults,
    };
  },
  publicSafe: true,
};
