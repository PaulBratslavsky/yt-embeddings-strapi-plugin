import { embed, embedMany, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { EmbeddingModel, LanguageModel } from "ai";
import { Pool, PoolConfig } from "pg";
import {
  EMBEDDING_MODELS,
  type EmbeddingModelName,
} from "./config";

interface PluginConfig {
  openAIApiKey: string;
  neonConnectionString: string;
  embeddingModel?: EmbeddingModelName;
}

interface EmbeddingDocument {
  id: string;
  title: string;
  content: string;
  collectionType?: string;
  fieldName?: string;
}

interface CreateEmbeddingResult {
  embeddingId: string;
  embedding: number[];
}

interface QueryResponse {
  text: string;
  sourceDocuments: Array<{ pageContent: string; metadata: any }>;
}

class PluginManager {
  private embeddingModel_: EmbeddingModel<string> | null = null;
  private chatModel: LanguageModel | null = null;
  private pool: Pool | null = null;
  private embeddingModelName: EmbeddingModelName = "text-embedding-3-small";
  private dimensions: number = 1536;

  async initializePool(connectionString: string): Promise<Pool> {
    console.log("Initializing Neon DB Pool");

    if (this.pool) return this.pool;

    try {
      const poolConfig: PoolConfig = {
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 10,
      };

      this.pool = new Pool(poolConfig);

      // Test the connection
      const client = await this.pool.connect();
      await client.query("SELECT 1");
      client.release();

      // Initialize the vector store table if it doesn't exist
      await this.initializeVectorTable();

      console.log("Neon DB Pool initialized successfully");
      return this.pool;
    } catch (error) {
      console.error(`Failed to initialize Neon DB Pool: ${error}`);
      throw new Error(`Failed to initialize Neon DB Pool: ${error}`);
    }
  }

  private async initializeVectorTable(): Promise<void> {
    if (!this.pool) throw new Error("Pool not initialized");

    const client = await this.pool.connect();
    try {
      // Enable the pgvector extension
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");

      // Create the documents table if it doesn't exist
      // Note: If you change embedding models with different dimensions,
      // you may need to drop and recreate this table
      await client.query(`
        CREATE TABLE IF NOT EXISTS embeddings_documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          content TEXT,
          metadata JSONB,
          embedding vector(${this.dimensions})
        )
      `);

      // Drop any IVFFlat indexes that may have been created (they cause issues with small datasets)
      await client.query(`
        DROP INDEX IF EXISTS embeddings_documents_embedding_idx
      `);

      // Create HNSW index for similarity search (works better with any dataset size)
      await client.query(`
        CREATE INDEX IF NOT EXISTS embeddings_documents_embedding_hnsw_idx
        ON embeddings_documents
        USING hnsw (embedding vector_cosine_ops)
      `);

      // Create GIN index on metadata for faster lookups
      await client.query(`
        CREATE INDEX IF NOT EXISTS embeddings_documents_metadata_idx
        ON embeddings_documents
        USING gin (metadata)
      `);

      console.log(`Vector table initialized (dimensions: ${this.dimensions})`);
    } catch (error) {
      // Index creation might fail if not enough rows, that's okay
      console.log("Note: Index creation may require more data");
    } finally {
      client.release();
    }
  }

  private initializeEmbeddings(openai: ReturnType<typeof createOpenAI>): void {
    console.log(`Initializing OpenAI Embeddings (model: ${this.embeddingModelName})`);

    if (this.embeddingModel_) return;

    this.embeddingModel_ = openai.embedding(this.embeddingModelName, {
      dimensions: this.dimensions,
    });
  }

  private initializeChat(openai: ReturnType<typeof createOpenAI>): void {
    console.log("Initializing Chat Model");

    if (this.chatModel) return;

    this.chatModel = openai("gpt-4o-mini");
  }

  async initialize(config: PluginConfig): Promise<void> {
    // Set embedding model and dimensions from config
    const model = config.embeddingModel || "text-embedding-3-small";
    if (EMBEDDING_MODELS[model]) {
      this.embeddingModelName = model;
      this.dimensions = EMBEDDING_MODELS[model].dimensions;
    } else {
      console.warn(`Invalid embedding model "${model}", using default`);
      this.embeddingModelName = "text-embedding-3-small";
      this.dimensions = EMBEDDING_MODELS["text-embedding-3-small"].dimensions;
    }

    console.log(`Using embedding model: ${this.embeddingModelName} (${this.dimensions} dimensions)`);

    await this.initializePool(config.neonConnectionString);

    const openai = createOpenAI({ apiKey: config.openAIApiKey });
    this.initializeEmbeddings(openai);
    this.initializeChat(openai);

    console.log("Plugin Manager Initialization Complete");
  }

  async createEmbedding(docData: EmbeddingDocument): Promise<CreateEmbeddingResult> {
    if (!this.embeddingModel_ || !this.pool) {
      throw new Error("Plugin manager not initialized");
    }

    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Generate the embedding vector (single API call)
        const { embedding: embeddingVector } = await embed({
          model: this.embeddingModel_,
          value: docData.content,
        });

        // Insert directly into DB with pre-computed embedding (no second API call)
        const metadata = {
          id: docData.id,
          title: docData.title,
          collectionType: docData.collectionType || "standalone",
          fieldName: docData.fieldName || "content",
        };

        const vectorString = `[${embeddingVector.join(",")}]`;

        const result = await this.pool.query(
          `INSERT INTO embeddings_documents (content, metadata, embedding)
           VALUES ($1, $2::jsonb, $3::vector)
           RETURNING id`,
          [docData.content, JSON.stringify(metadata), vectorString]
        );

        return {
          embeddingId: result.rows[0]?.id || "",
          embedding: embeddingVector,
        };
      } catch (error: any) {
        const isRateLimit = error.message?.includes("429") || error.message?.includes("rate");
        const isLastAttempt = attempt === maxRetries;

        if (isRateLimit && !isLastAttempt) {
          console.log(`[createEmbedding] Rate limited, waiting ${retryDelay}ms before retry ${attempt + 1}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
          continue;
        }

        console.error(`[createEmbedding] Failed (attempt ${attempt}/${maxRetries}):`, error.message || error);
        if (isLastAttempt) {
          throw new Error(`Failed to create embedding after ${maxRetries} attempts: ${error.message || error}`);
        }
      }
    }

    throw new Error("Failed to create embedding: unexpected error");
  }

  async deleteEmbedding(strapiId: string): Promise<void> {
    if (!this.pool) {
      throw new Error("Plugin manager not initialized");
    }

    try {
      await this.pool.query(
        `DELETE FROM embeddings_documents WHERE metadata->>'id' = $1`,
        [strapiId]
      );
    } catch (error) {
      console.error(`Failed to delete embedding: ${error}`);
      throw new Error(`Failed to delete embedding: ${error}`);
    }
  }

  async queryEmbedding(query: string): Promise<QueryResponse> {
    if (!this.embeddingModel_ || !this.chatModel || !this.pool) {
      throw new Error("Plugin manager not initialized");
    }

    try {
      // Embed the query
      const { embedding: queryVector } = await embed({
        model: this.embeddingModel_,
        value: query,
      });
      const vectorStr = `[${queryVector.join(",")}]`;

      // Similarity search via raw SQL (cosine distance)
      const results = await this.pool.query(`
        SELECT
          content,
          metadata,
          1 - (embedding <=> $1::vector) AS similarity
        FROM embeddings_documents
        WHERE 1 - (embedding <=> $1::vector) > 0
        ORDER BY embedding <=> $1::vector
        LIMIT 6
      `, [vectorStr]);

      console.log(`[queryEmbedding] Query: "${query}"`);
      console.log(`[queryEmbedding] Found ${results.rows.length} results:`);
      results.rows.forEach((row: any, i: number) => {
        console.log(`  ${i + 1}. Score: ${row.similarity.toFixed(4)}, Title: ${row.metadata?.title || 'N/A'}`);
      });

      // Filter by similarity threshold
      const SIMILARITY_THRESHOLD = 1.0;
      const relevantResults = results.rows.filter((row: any) => row.similarity < SIMILARITY_THRESHOLD);

      console.log(`[queryEmbedding] ${relevantResults.length} results passed threshold (< ${SIMILARITY_THRESHOLD})`);

      // Take top 3 most relevant documents for context
      const topResults = relevantResults.slice(0, 3);
      const sourceDocuments = topResults.map((row: any) => ({
        pageContent: row.content,
        metadata: row.metadata,
      }));

      // Only show the single best matching source to the user
      const bestMatchForDisplay = topResults.length > 0
        ? [{ pageContent: topResults[0].content, metadata: topResults[0].metadata }]
        : [];

      // Format documents for context
      const context = sourceDocuments.map((doc) => {
        const title = doc.metadata?.title ? `Title: ${doc.metadata.title}\n` : '';
        return `${title}${doc.pageContent}`;
      }).join("\n\n");

      // RAG via generateText
      const { text } = await generateText({
        model: this.chatModel,
        system: `You are a helpful assistant that answers questions based on the provided context.
If you cannot find the answer in the context, say so. Be concise and accurate.

Context:
${context}`,
        prompt: query,
      });

      return {
        text,
        sourceDocuments: bestMatchForDisplay,
      };
    } catch (error) {
      console.error(`Failed to query embeddings: ${error}`);
      throw new Error(`Failed to query embeddings: ${error}`);
    }
  }

  async similaritySearch(
    query: string,
    k: number = 4
  ): Promise<Array<{ pageContent: string; metadata: any }>> {
    if (!this.embeddingModel_ || !this.pool) {
      throw new Error("Plugin manager not initialized");
    }

    try {
      const { embedding: queryVector } = await embed({
        model: this.embeddingModel_,
        value: query,
      });
      const vectorStr = `[${queryVector.join(",")}]`;

      const results = await this.pool.query(`
        SELECT content, metadata
        FROM embeddings_documents
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `, [vectorStr, k]);

      return results.rows.map((row: any) => ({
        pageContent: row.content,
        metadata: row.metadata,
      }));
    } catch (error) {
      console.error(`Failed to perform similarity search: ${error}`);
      throw new Error(`Failed to perform similarity search: ${error}`);
    }
  }

  isInitialized(): boolean {
    return !!(this.embeddingModel_ && this.chatModel && this.pool);
  }

  /**
   * Get all embeddings from Neon DB
   * Returns the metadata (including Strapi documentId) for each embedding
   */
  async getAllNeonEmbeddings(): Promise<Array<{
    id: string;
    strapiId: string;
    title: string;
    content: string;
    collectionType: string;
    fieldName: string;
  }>> {
    if (!this.pool) {
      throw new Error("Plugin manager not initialized");
    }

    try {
      const result = await this.pool.query(`
        SELECT
          id,
          content,
          metadata->>'id' as strapi_id,
          metadata->>'title' as title,
          metadata->>'collectionType' as collection_type,
          metadata->>'fieldName' as field_name
        FROM embeddings_documents
        ORDER BY id
      `);

      return result.rows.map((row) => ({
        id: row.id,
        strapiId: row.strapi_id,
        title: row.title || '',
        content: row.content || '',
        collectionType: row.collection_type || 'standalone',
        fieldName: row.field_name || 'content',
      }));
    } catch (error) {
      console.error(`Failed to get Neon embeddings: ${error}`);
      throw new Error(`Failed to get Neon embeddings: ${error}`);
    }
  }

  /**
   * Delete an embedding from Neon by its Neon UUID (not Strapi ID)
   */
  async deleteNeonEmbeddingById(neonId: string): Promise<void> {
    if (!this.pool) {
      throw new Error("Plugin manager not initialized");
    }

    try {
      await this.pool.query(
        `DELETE FROM embeddings_documents WHERE id = $1`,
        [neonId]
      );
    } catch (error) {
      console.error(`Failed to delete Neon embedding: ${error}`);
      throw new Error(`Failed to delete Neon embedding: ${error}`);
    }
  }

  getPool(): Pool | null {
    return this.pool;
  }

  getEmbeddingModel_(): EmbeddingModel<string> | null {
    return this.embeddingModel_;
  }

  getEmbeddingModelName(): EmbeddingModelName {
    return this.embeddingModelName;
  }

  async destroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.embeddingModel_ = null;
    this.chatModel = null;
  }

  /**
   * Clear all embeddings from Neon DB
   * Returns the number of deleted rows
   */
  async clearAllNeonEmbeddings(): Promise<number> {
    if (!this.pool) {
      throw new Error("Plugin manager not initialized");
    }

    try {
      const result = await this.pool.query(`
        DELETE FROM embeddings_documents
        RETURNING id
      `);

      console.log(`[clearAllNeonEmbeddings] Deleted ${result.rowCount} embeddings from Neon`);
      return result.rowCount || 0;
    } catch (error) {
      console.error(`Failed to clear Neon embeddings: ${error}`);
      throw new Error(`Failed to clear Neon embeddings: ${error}`);
    }
  }

  /**
   * Debug method to inspect raw data in Neon DB
   */
  async debugNeonEmbeddings(): Promise<Array<{
    id: string;
    content: string;
    metadata: any;
    metadataType: string;
    hasEmbedding: boolean;
    embeddingLength: number;
  }>> {
    if (!this.pool) {
      throw new Error("Plugin manager not initialized");
    }

    try {
      const result = await this.pool.query(`
        SELECT
          id,
          content,
          metadata,
          pg_typeof(metadata) as metadata_type,
          embedding IS NOT NULL as has_embedding,
          CASE WHEN embedding IS NOT NULL THEN array_length(embedding::float[], 1) ELSE 0 END as embedding_length
        FROM embeddings_documents
        ORDER BY id
        LIMIT 20
      `);

      return result.rows.map((row) => ({
        id: row.id,
        content: row.content?.substring(0, 200) + (row.content?.length > 200 ? '...' : ''),
        metadata: row.metadata,
        metadataType: row.metadata_type,
        hasEmbedding: row.has_embedding,
        embeddingLength: row.embedding_length || 0,
      }));
    } catch (error) {
      console.error(`Failed to debug Neon embeddings: ${error}`);
      throw new Error(`Failed to debug Neon embeddings: ${error}`);
    }
  }
}

export const pluginManager = new PluginManager();
export type { PluginConfig, EmbeddingDocument, QueryResponse, CreateEmbeddingResult };
