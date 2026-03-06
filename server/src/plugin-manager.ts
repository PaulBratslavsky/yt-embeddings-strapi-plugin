import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { Document } from "@langchain/core/documents";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  RunnableSequence,
  RunnablePassthrough,
} from "@langchain/core/runnables";
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
  sourceDocuments: Document[];
}

class PluginManager {
  private embeddings: OpenAIEmbeddings | null = null;
  private chat: ChatOpenAI | null = null;
  private pool: Pool | null = null;
  private embeddingModel: EmbeddingModelName = "text-embedding-3-small";
  private dimensions: number = 1536;
  private vectorStoreConfig: {
    pool: Pool;
    tableName: string;
    columns: {
      idColumnName: string;
      vectorColumnName: string;
      contentColumnName: string;
      metadataColumnName: string;
    };
    distanceStrategy: "cosine" | "innerProduct" | "euclidean";
  } | null = null;

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

  async initializeEmbeddings(openAIApiKey: string): Promise<OpenAIEmbeddings> {
    console.log(`Initializing OpenAI Embeddings (model: ${this.embeddingModel})`);

    if (this.embeddings) return this.embeddings;

    try {
      this.embeddings = new OpenAIEmbeddings({
        openAIApiKey,
        modelName: this.embeddingModel,
        dimensions: this.dimensions,
      });

      return this.embeddings;
    } catch (error) {
      console.error(`Failed to initialize Embeddings: ${error}`);
      throw new Error(`Failed to initialize Embeddings: ${error}`);
    }
  }

  async initializeChat(openAIApiKey: string): Promise<ChatOpenAI> {
    console.log("Initializing Chat Model");

    if (this.chat) return this.chat;

    try {
      this.chat = new ChatOpenAI({
        modelName: "gpt-4o-mini",
        temperature: 0.7,
        openAIApiKey,
      });

      return this.chat;
    } catch (error) {
      console.error(`Failed to initialize Chat: ${error}`);
      throw new Error(`Failed to initialize Chat: ${error}`);
    }
  }

  async initialize(config: PluginConfig): Promise<void> {
    // Set embedding model and dimensions from config
    const model = config.embeddingModel || "text-embedding-3-small";
    if (EMBEDDING_MODELS[model]) {
      this.embeddingModel = model;
      this.dimensions = EMBEDDING_MODELS[model].dimensions;
    } else {
      console.warn(`Invalid embedding model "${model}", using default`);
      this.embeddingModel = "text-embedding-3-small";
      this.dimensions = EMBEDDING_MODELS["text-embedding-3-small"].dimensions;
    }

    console.log(`Using embedding model: ${this.embeddingModel} (${this.dimensions} dimensions)`);

    await this.initializePool(config.neonConnectionString);
    await this.initializeEmbeddings(config.openAIApiKey);
    await this.initializeChat(config.openAIApiKey);

    if (this.pool) {
      this.vectorStoreConfig = {
        pool: this.pool,
        tableName: "embeddings_documents",
        columns: {
          idColumnName: "id",
          vectorColumnName: "embedding",
          contentColumnName: "content",
          metadataColumnName: "metadata",
        },
        distanceStrategy: "cosine",
      };
    }

    console.log("Plugin Manager Initialization Complete");
  }

  async createEmbedding(docData: EmbeddingDocument): Promise<CreateEmbeddingResult> {
    if (!this.embeddings || !this.vectorStoreConfig || !this.pool) {
      throw new Error("Plugin manager not initialized");
    }

    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Generate the embedding vector (single API call)
        const embeddingVector = await this.embeddings.embedQuery(docData.content);

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
    if (!this.embeddings || !this.chat || !this.vectorStoreConfig) {
      throw new Error("Plugin manager not initialized");
    }

    try {
      const vectorStore = await PGVectorStore.initialize(
        this.embeddings,
        this.vectorStoreConfig
      );

      // Use similaritySearchWithScore to get relevance scores
      // Retrieve more documents initially, then filter by score
      const resultsWithScores = await vectorStore.similaritySearchWithScore(query, 6);

      console.log(`[queryEmbedding] Query: "${query}"`);
      console.log(`[queryEmbedding] Found ${resultsWithScores.length} results:`);
      resultsWithScores.forEach(([doc, score], i) => {
        console.log(`  ${i + 1}. Score: ${score.toFixed(4)}, Title: ${doc.metadata?.title || 'N/A'}`);
      });

      // Filter by similarity threshold (cosine distance: 0 = identical, higher = more different)
      // Increase threshold to allow more results
      const SIMILARITY_THRESHOLD = 1.0;
      const relevantResults = resultsWithScores.filter(([_, score]) => score < SIMILARITY_THRESHOLD);

      console.log(`[queryEmbedding] ${relevantResults.length} results passed threshold (< ${SIMILARITY_THRESHOLD})`);

      // Take top 3 most relevant documents for context
      const topResults = relevantResults.slice(0, 3);
      const sourceDocuments = topResults.map(([doc]) => doc);

      // Only show the single best matching source to the user
      const bestMatchForDisplay = topResults.length > 0 ? [topResults[0][0]] : [];

      // Format documents for context - include title from metadata
      const formatDocs = (docs: Document[]): string => {
        return docs.map((doc) => {
          const title = doc.metadata?.title ? `Title: ${doc.metadata.title}\n` : '';
          return `${title}${doc.pageContent}`;
        }).join("\n\n");
      };

      // Create RAG prompt
      const ragPrompt = ChatPromptTemplate.fromMessages([
        [
          "system",
          `You are a helpful assistant that answers questions based on the provided context.
If you cannot find the answer in the context, say so. Be concise and accurate.

Context:
{context}`,
        ],
        ["human", "{question}"],
      ]);

      // Build LCEL chain - use all relevant docs for context
      const ragChain = RunnableSequence.from([
        {
          context: async () => formatDocs(sourceDocuments),
          question: new RunnablePassthrough(),
        },
        ragPrompt,
        this.chat,
        new StringOutputParser(),
      ]);

      const text = await ragChain.invoke(query);

      return {
        text,
        sourceDocuments: bestMatchForDisplay, // Only return best match to display
      };
    } catch (error) {
      console.error(`Failed to query embeddings: ${error}`);
      throw new Error(`Failed to query embeddings: ${error}`);
    }
  }

  async similaritySearch(
    query: string,
    k: number = 4
  ): Promise<Document[]> {
    if (!this.embeddings || !this.vectorStoreConfig) {
      throw new Error("Plugin manager not initialized");
    }

    try {
      const vectorStore = await PGVectorStore.initialize(
        this.embeddings,
        this.vectorStoreConfig
      );

      return await vectorStore.similaritySearch(query, k);
    } catch (error) {
      console.error(`Failed to perform similarity search: ${error}`);
      throw new Error(`Failed to perform similarity search: ${error}`);
    }
  }

  isInitialized(): boolean {
    return !!(this.embeddings && this.chat && this.pool);
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

  getEmbeddings(): OpenAIEmbeddings | null {
    return this.embeddings;
  }

  getEmbeddingModel(): EmbeddingModelName {
    return this.embeddingModel;
  }

  getChat(): ChatOpenAI | null {
    return this.chat;
  }

  async destroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.embeddings = null;
    this.chat = null;
    this.vectorStoreConfig = null;
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
