/**
 * MCP Tools for Content Embeddings
 *
 * Exposes vector search, RAG queries, and embedding management tools.
 * Each handler is a thin wrapper around canonical tool definitions in ../../tools.
 */

import type { Core } from '@strapi/strapi';
import { validateToolInput } from '../schemas';

// Import MCP tool definitions and handlers
import { semanticSearchMcpTool, handleSemanticSearch } from './semantic-search';
import { ragQueryMcpTool, handleRagQuery } from './rag-query';
import { listEmbeddingsMcpTool, handleListEmbeddings } from './list-embeddings';
import { getEmbeddingMcpTool, handleGetEmbedding } from './get-embedding';
import { createEmbeddingMcpTool, handleCreateEmbedding } from './create-embedding';
import { searchYtKnowledgeMcpTool, handleSearchYtKnowledge } from './search-yt-knowledge';
import { getVideoTranscriptRangeMcpTool, handleGetVideoTranscriptRange } from './get-video-transcript-range';

// Export all MCP tool definitions (JSON Schema format for MCP ListTools)
export const tools = [
  semanticSearchMcpTool,
  ragQueryMcpTool,
  listEmbeddingsMcpTool,
  getEmbeddingMcpTool,
  createEmbeddingMcpTool,
  searchYtKnowledgeMcpTool,
  getVideoTranscriptRangeMcpTool,
];

// Tool handler registry
const toolHandlers: Record<
  string,
  (strapi: Core.Strapi, args: unknown) => Promise<any>
> = {
  semantic_search: handleSemanticSearch,
  rag_query: handleRagQuery,
  list_embeddings: handleListEmbeddings,
  get_embedding: handleGetEmbedding,
  create_embedding: handleCreateEmbedding,
  search_yt_knowledge: handleSearchYtKnowledge,
  get_video_transcript_range: handleGetVideoTranscriptRange,
};

/**
 * Handle MCP tool calls
 */
export async function handleToolCall(
  strapi: Core.Strapi,
  request: { params: { name: string; arguments?: unknown } }
) {
  const { name, arguments: args } = request.params;

  const handler = toolHandlers[name];
  if (!handler) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: true,
            message: `Unknown tool: ${name}`,
            availableTools: Object.keys(toolHandlers),
          }),
        },
      ],
    };
  }

  try {
    // Validate input using Zod schemas
    const validatedArgs = validateToolInput(name, args || {});
    const result = await handler(strapi, validatedArgs);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    strapi.log.error(`[yt-embeddings-strapi-plugin] Tool ${name} error:`, { error: errorMessage });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: true,
            tool: name,
            message: errorMessage,
          }, null, 2),
        },
      ],
    };
  }
}
