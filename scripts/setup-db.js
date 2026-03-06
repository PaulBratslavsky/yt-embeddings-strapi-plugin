#!/usr/bin/env node

/**
 * Content Embeddings - Database Setup Script
 * Sets up Neon database for RAG with pgvector
 *
 * Usage:
 *   node setup-db.js <connection-string> [dimensions]
 *   or
 *   NEON_CONNECTION_STRING=... node setup-db.js
 *
 * Dimensions by model:
 *   - text-embedding-3-small: 1536 (default)
 *   - text-embedding-3-large: 3072
 *   - text-embedding-ada-002: 1536
 */

const { Pool } = require("../node_modules/@types/pg");

const MODELS = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};

function getSQL(dimensions) {
  return `
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the embeddings documents table
CREATE TABLE IF NOT EXISTS embeddings_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT,
  metadata JSONB,
  embedding vector(${dimensions})
);

-- Create index for similarity search (HNSW - faster for queries)
CREATE INDEX IF NOT EXISTS embeddings_documents_embedding_hnsw_idx
ON embeddings_documents
USING hnsw (embedding vector_cosine_ops);

-- Create index on metadata for faster lookups
CREATE INDEX IF NOT EXISTS embeddings_documents_metadata_idx
ON embeddings_documents
USING gin (metadata);
`;
}

async function setup() {
  const connectionString = process.argv[2] || process.env.NEON_CONNECTION_STRING;
  const modelOrDimensions = process.argv[3] || process.env.EMBEDDING_MODEL || "text-embedding-3-small";

  // Determine dimensions from model name or use directly if it's a number
  let dimensions;
  let modelName;
  if (MODELS[modelOrDimensions]) {
    modelName = modelOrDimensions;
    dimensions = MODELS[modelOrDimensions];
  } else if (!isNaN(parseInt(modelOrDimensions))) {
    dimensions = parseInt(modelOrDimensions);
    modelName = `custom (${dimensions}d)`;
  } else {
    console.error(`Error: Unknown model "${modelOrDimensions}"`);
    console.error(`Available models: ${Object.keys(MODELS).join(", ")}`);
    process.exit(1);
  }

  if (!connectionString) {
    console.error("Error: No connection string provided");
    console.error("");
    console.error("Usage:");
    console.error("  node setup-db.js <connection-string> [model]");
    console.error("");
    console.error("Models:");
    Object.entries(MODELS).forEach(([name, dims]) => {
      console.error(`  ${name}: ${dims} dimensions`);
    });
    console.error("");
    console.error("Example:");
    console.error("  node setup-db.js 'postgresql://...' text-embedding-3-small");
    process.exit(1);
  }

  console.log("Setting up database for Content Embeddings plugin...");
  console.log(`Model: ${modelName} (${dimensions} dimensions)\n`);

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Run setup SQL
    await pool.query(getSQL(dimensions));
    console.log("Created pgvector extension");
    console.log(`Created embeddings_documents table (${dimensions} dimensions)`);
    console.log("Created HNSW index for similarity search");
    console.log("Created GIN index for metadata lookups");

    // Verify setup
    const result = await pool.query(`
      SELECT
        'pgvector' as component,
        CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
             THEN 'OK' ELSE 'MISSING' END as status
      UNION ALL
      SELECT
        'table' as component,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'embeddings_documents')
             THEN 'OK' ELSE 'MISSING' END as status
    `);

    console.log("\nVerification:");
    result.rows.forEach((row) => {
      console.log(`  ${row.component}: ${row.status}`);
    });

    console.log("\n Database setup complete!\n");
    console.log("Next steps:");
    console.log("1. Add to your Strapi config/plugins.ts:");
    console.log(`
   'content-embeddings': {
     enabled: true,
     config: {
       openAIApiKey: env('OPENAI_API_KEY'),
       neonConnectionString: env('NEON_CONNECTION_STRING'),
       embeddingModel: '${modelName.includes('custom') ? 'text-embedding-3-small' : modelName}',
     },
   },
`);
    console.log("2. Set environment variables in .env:");
    console.log("   OPENAI_API_KEY=sk-...");
    console.log("   NEON_CONNECTION_STRING=postgresql://...");
    console.log(`   EMBEDDING_MODEL=${modelName.includes('custom') ? 'text-embedding-3-small' : modelName}`);
  } catch (error) {
    console.error("Error setting up database:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setup();
