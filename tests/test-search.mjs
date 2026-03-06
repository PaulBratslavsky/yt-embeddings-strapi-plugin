/**
 * Test script: diagnose yt-embeddings search
 *
 * Usage:
 *   node test-search.mjs
 *
 * Requires OPENAI_API_KEY and NEON_CONNECTION_STRING in
 * ../../strapi-local/.env (or set them in your shell).
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { createOpenAI } from '@ai-sdk/openai';
import { embed } from 'ai';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load env vars from strapi-local/.env ────────────────────────────────────
function loadEnv() {
  const envPath = resolve(__dirname, '../../strapi-local/.env');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const NEON_CONNECTION_STRING = process.env.NEON_CONNECTION_STRING;

if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
if (!NEON_CONNECTION_STRING) throw new Error('Missing NEON_CONNECTION_STRING');

// ── Connect to Neon ─────────────────────────────────────────────────────────
const pool = new pg.Pool({
  connectionString: NEON_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  console.log('=== yt-embeddings search diagnostic ===\n');

  // 1. Check what's in the DB
  console.log('--- Step 1: Check yt_videos table ---');
  const videos = await pool.query(
    `SELECT video_id, title, embedding_status, chunk_count, embedding_model
     FROM yt_videos ORDER BY created_at DESC LIMIT 5`
  );
  console.table(videos.rows);

  // 2. Check chunks exist and their embedding dimensions
  console.log('\n--- Step 2: Check yt_video_chunks ---');
  const chunkInfo = await pool.query(`
    SELECT
      video_id,
      count(*) as chunk_count,
      min(vector_dims(embedding)) as min_dim,
      max(vector_dims(embedding)) as max_dim
    FROM yt_video_chunks
    GROUP BY video_id
  `);
  console.table(chunkInfo.rows);

  // 3. Embed a test query with AI SDK
  console.log('\n--- Step 3: Embed test query via AI SDK ---');
  const openai = createOpenAI({ apiKey: OPENAI_API_KEY });
  const embeddingModel = openai.embedding('text-embedding-3-small', { dimensions: 1536 });

  const testQuery = 'junior developers getting jobs';
  const { embedding: queryVector } = await embed({ model: embeddingModel, value: testQuery });
  console.log(`Query: "${testQuery}"`);
  console.log(`Embedding length: ${queryVector.length}`);
  console.log(`First 5 values: [${queryVector.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);

  // 4. Raw similarity search — NO threshold
  console.log('\n--- Step 4: Raw similarity search (no threshold) ---');
  const vectorStr = `[${queryVector.join(',')}]`;
  const rawResults = await pool.query(`
    SELECT
      vc.video_id,
      vc.chunk_index,
      LEFT(vc.text, 80) as text_preview,
      1 - (vc.embedding <=> $1::vector) AS similarity,
      vector_dims(vc.embedding) as chunk_dim
    FROM yt_video_chunks vc
    ORDER BY vc.embedding <=> $1::vector
    LIMIT 5
  `, [vectorStr]);

  if (rawResults.rows.length === 0) {
    console.log('NO RESULTS AT ALL — table might be empty or vector dimensions mismatch');
  } else {
    console.table(rawResults.rows);
  }

  // 5. Check with the JOIN (matching the actual search query)
  console.log('\n--- Step 5: Full search query (with JOIN, minSimilarity=0.1) ---');
  const fullResults = await pool.query(`
    SELECT
      vc.video_id, vc.chunk_index,
      LEFT(vc.text, 80) as text_preview,
      v.title, v.embedding_status,
      1 - (vc.embedding <=> $1::vector) AS similarity
    FROM yt_video_chunks vc
    JOIN yt_videos v ON v.video_id = vc.video_id
    WHERE 1 - (vc.embedding <=> $1::vector) >= 0.1
      AND v.embedding_status = 'complete'
    ORDER BY vc.embedding <=> $1::vector
    LIMIT 5
  `, [vectorStr]);

  if (fullResults.rows.length === 0) {
    console.log('NO RESULTS — either JOIN fails, threshold too high, or embedding_status mismatch');
  } else {
    console.table(fullResults.rows);
  }

  // 6. Check if embedding_status values are what we expect
  console.log('\n--- Step 6: embedding_status distribution ---');
  const statuses = await pool.query(
    `SELECT embedding_status, count(*) FROM yt_videos GROUP BY embedding_status`
  );
  console.table(statuses.rows);

  await pool.end();
  console.log('\n=== Done ===');
}

run().catch((err) => {
  console.error('FATAL:', err);
  pool.end();
  process.exit(1);
});
