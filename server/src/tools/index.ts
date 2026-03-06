/**
 * Canonical Tool Definitions for Content Embeddings
 *
 * These are the source-of-truth implementations.
 * Both the AI SDK service (ai-tools.ts) and the MCP server consume these.
 */

export type { ToolDefinition } from './types';

export { semanticSearchTool } from './semantic-search';
export { ragQueryTool } from './rag-query';
export { listEmbeddingsTool } from './list-embeddings';
export { getEmbeddingTool } from './get-embedding';
export { createEmbeddingTool } from './create-embedding';

import { semanticSearchTool } from './semantic-search';
import { ragQueryTool } from './rag-query';
import { listEmbeddingsTool } from './list-embeddings';
import { getEmbeddingTool } from './get-embedding';
import { createEmbeddingTool } from './create-embedding';
import type { ToolDefinition } from './types';

export const tools: ToolDefinition[] = [
  semanticSearchTool,
  ragQueryTool,
  listEmbeddingsTool,
  getEmbeddingTool,
  createEmbeddingTool,
];
