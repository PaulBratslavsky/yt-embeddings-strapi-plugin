/**
 * Zod Schemas for MCP Tool Input Validation
 */

import { z } from 'zod';

// Semantic Search Schema
export const SemanticSearchSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  limit: z.number().min(1).max(20).optional().default(5),
});

// RAG Query Schema
export const RagQuerySchema = z.object({
  query: z.string().min(1, 'Query is required'),
  includeSourceDocuments: z.boolean().optional().default(true),
});

// List Embeddings Schema
export const ListEmbeddingsSchema = z.object({
  page: z.number().min(1).optional().default(1),
  pageSize: z.number().min(1).max(50).optional().default(25),
  search: z.string().optional(),
});

// Get Embedding Schema
export const GetEmbeddingSchema = z.object({
  documentId: z.string().min(1, 'Document ID is required'),
  includeContent: z.boolean().optional().default(true),
});

// Create Embedding Schema
export const CreateEmbeddingSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  metadata: z.record(z.any()).optional(),
  autoChunk: z.boolean().optional()
    .describe('Automatically split large content into chunks'),
});

// Search YT Knowledge Schema
export const SearchYtKnowledgeSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  limit: z.number().min(1).max(20).optional().default(5),
  videoId: z.string().optional(),
  topics: z.array(z.string()).optional(),
  contextWindowSeconds: z.number().min(0).optional().default(30),
  minSimilarity: z.number().min(0).max(1).optional().default(0.65),
});

// Get Video Transcript Range Schema
export const GetVideoTranscriptRangeSchema = z.object({
  videoId: z.string().min(1, 'Video ID is required'),
  startSeconds: z.number().min(0, 'Start seconds must be >= 0'),
  endSeconds: z.number().min(0, 'End seconds must be >= 0'),
});

// Schema registry
export const ToolSchemas: Record<string, z.ZodSchema> = {
  semantic_search: SemanticSearchSchema,
  rag_query: RagQuerySchema,
  list_embeddings: ListEmbeddingsSchema,
  get_embedding: GetEmbeddingSchema,
  create_embedding: CreateEmbeddingSchema,
  search_yt_knowledge: SearchYtKnowledgeSchema,
  get_video_transcript_range: GetVideoTranscriptRangeSchema,
};

/**
 * Validate tool input against its schema
 */
export function validateToolInput<T = unknown>(
  toolName: string,
  input: unknown
): T {
  const schema = ToolSchemas[toolName];

  if (!schema) {
    throw new Error(`No schema defined for tool: ${toolName}`);
  }

  const result = schema.safeParse(input);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new Error(`Validation failed for ${toolName}: ${errors}`);
  }

  return result.data as T;
}
