// Available OpenAI embedding models and their dimensions
export const EMBEDDING_MODELS = {
  "text-embedding-3-small": { dimensions: 1536 },
  "text-embedding-3-large": { dimensions: 3072 },
  "text-embedding-ada-002": { dimensions: 1536 },
} as const;

export type EmbeddingModelName = keyof typeof EMBEDDING_MODELS;

export interface PluginConfigSchema {
  openAIApiKey?: string;
  neonConnectionString?: string;
  embeddingModel?: EmbeddingModelName;
  /** Maximum characters per chunk (default: 4000, roughly ~1000 tokens) */
  chunkSize?: number;
  /** Number of characters to overlap between chunks (default: 200) */
  chunkOverlap?: number;
  /** Automatically chunk content that exceeds chunkSize (default: false) */
  autoChunk?: boolean;
  /** Preprocess content before embedding - strips HTML/Markdown (default: true) */
  preprocessContent?: boolean;
}

export default {
  default: {
    openAIApiKey: "",
    neonConnectionString: "",
    embeddingModel: "text-embedding-3-small" as EmbeddingModelName,
    chunkSize: 4000,
    chunkOverlap: 200,
    autoChunk: false,
    preprocessContent: true,
  },
  validator(config: PluginConfigSchema) {
    if (!config.openAIApiKey) {
      console.warn(
        "yt-embeddings-strapi-plugin: openAIApiKey is not configured. Plugin features will be disabled."
      );
    }
    if (!config.neonConnectionString) {
      console.warn(
        "yt-embeddings-strapi-plugin: neonConnectionString is not configured. Plugin features will be disabled."
      );
    }
    if (config.embeddingModel && !EMBEDDING_MODELS[config.embeddingModel]) {
      console.warn(
        `yt-embeddings-strapi-plugin: Invalid embeddingModel "${config.embeddingModel}". ` +
        `Valid options: ${Object.keys(EMBEDDING_MODELS).join(", ")}. ` +
        `Defaulting to "text-embedding-3-small".`
      );
    }
    if (config.chunkSize && (config.chunkSize < 100 || config.chunkSize > 8000)) {
      console.warn(
        `yt-embeddings-strapi-plugin: chunkSize ${config.chunkSize} is outside recommended range (100-8000). ` +
        `Using default value of 4000.`
      );
    }
  },
};
