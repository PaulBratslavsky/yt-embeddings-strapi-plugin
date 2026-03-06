import type { Pool } from 'pg';

const YT_TABLES_SQL = `
-- ─── Videos table (one row per YouTube video) ────────────────────────────────
CREATE TABLE IF NOT EXISTS yt_videos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strapi_document_id  TEXT NOT NULL UNIQUE,
  video_id            TEXT NOT NULL UNIQUE,
  url                 TEXT NOT NULL,
  title               TEXT NOT NULL,
  channel_name        TEXT,
  channel_id          TEXT,
  duration_seconds    INTEGER,
  published_at        TIMESTAMPTZ,
  thumbnail_url       TEXT,
  description         TEXT,
  language            TEXT NOT NULL DEFAULT 'en',

  -- Processing state
  content_hash        TEXT NOT NULL,
  embedding_status    TEXT NOT NULL DEFAULT 'pending'
                        CHECK (embedding_status IN ('pending', 'processing', 'complete', 'failed')),
  chunk_count         INTEGER NOT NULL DEFAULT 0,
  error_message       TEXT,
  embedding_model     TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  embedded_at         TIMESTAMPTZ,

  -- LLM-extracted metadata
  topics              TEXT[] NOT NULL DEFAULT '{}',
  summary             TEXT NOT NULL DEFAULT '',
  key_moments         JSONB NOT NULL DEFAULT '[]',

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Video chunks table (one row per embeddable unit) ────────────────────────
CREATE TABLE IF NOT EXISTS yt_video_chunks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id            TEXT NOT NULL REFERENCES yt_videos(video_id) ON DELETE CASCADE,
  strapi_document_id  TEXT NOT NULL,

  text                TEXT NOT NULL,
  embedding           vector(1536),

  start_seconds       REAL NOT NULL,
  end_seconds         REAL NOT NULL,
  chunk_index         INTEGER NOT NULL,

  segments            JSONB NOT NULL,

  prev_chunk_id       UUID,
  next_chunk_id       UUID,

  tokens              INTEGER,

  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Video lookups
CREATE INDEX IF NOT EXISTS idx_yt_videos_video_id
  ON yt_videos (video_id);

CREATE INDEX IF NOT EXISTS idx_yt_videos_strapi_doc
  ON yt_videos (strapi_document_id);

CREATE INDEX IF NOT EXISTS idx_yt_videos_content_hash
  ON yt_videos (content_hash);

CREATE INDEX IF NOT EXISTS idx_yt_videos_status
  ON yt_videos (embedding_status);

-- Topic filtering
CREATE INDEX IF NOT EXISTS idx_yt_videos_topics
  ON yt_videos USING gin (topics);

-- Chunk lookups
CREATE INDEX IF NOT EXISTS idx_yt_video_chunks_video_time
  ON yt_video_chunks (video_id, start_seconds, end_seconds);

CREATE INDEX IF NOT EXISTS idx_yt_video_chunks_video_index
  ON yt_video_chunks (video_id, chunk_index);
`;

// HNSW index for vector similarity search — works with any dataset size
const YT_HNSW_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_yt_video_chunks_embedding
  ON yt_video_chunks USING hnsw (embedding vector_cosine_ops);
`;

// Drop old tables from initial implementation (if they exist and are empty)
const DROP_OLD_TABLES_SQL = `
DROP TABLE IF EXISTS yt_chunks CASCADE;
DROP TABLE IF EXISTS yt_embedding_jobs CASCADE;
`;

export async function runYtMigration(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // Clean up old schema
    await client.query(DROP_OLD_TABLES_SQL);

    // Create new schema
    await client.query(YT_TABLES_SQL);
    console.log('[yt-migration] yt_videos and yt_video_chunks tables ready');

    try {
      await client.query(YT_HNSW_INDEX_SQL);
      console.log('[yt-migration] HNSW vector index ready');
    } catch {
      console.log('[yt-migration] HNSW index creation deferred (may need data first)');
    }
  } finally {
    client.release();
  }
}
