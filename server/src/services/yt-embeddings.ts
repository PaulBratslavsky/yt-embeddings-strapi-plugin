import type { Core } from '@strapi/strapi';
import * as crypto from 'crypto';
import { pluginManager } from '../plugin-manager';
import { chunkTranscript, type Segment } from '../utils/yt-chunker';
import { extractVideoMetadata, type KeyMoment } from './yt-metadata';

export interface TranscriptInput {
  documentId: string;
  id: number;
  videoId: string;
  title: string;
  fullTranscript: string;
  transcriptWithTimeCodes: Segment[];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

const ytEmbeddings = ({ strapi }: { strapi: Core.Strapi }) => ({

  // ── Ingest a single transcript ──────────────────────────────────────────────
  async embedTranscript(transcript: TranscriptInput): Promise<{ videoId: string; chunkCount: number; skipped: boolean }> {
    const pool = pluginManager.getPool();
    const embeddings = pluginManager.getEmbeddings();
    const embeddingModel = pluginManager.getEmbeddingModel();

    if (!pool || !embeddings) {
      throw new Error('[yt-embed] Plugin manager not initialized');
    }

    const contentHash = computeContentHash(transcript.fullTranscript);

    // 1. Check if already ingested with same content
    const existing = await pool.query(
      'SELECT id, embedding_status, content_hash FROM yt_videos WHERE video_id = $1',
      [transcript.videoId]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.embedding_status === 'complete' && row.content_hash === contentHash) {
        strapi.log.info(`[yt-embed] ${transcript.videoId} already ingested, skipping`);
        return { videoId: transcript.videoId, chunkCount: 0, skipped: true };
      }
      // Content changed or previously failed — re-ingest
      strapi.log.info(`[yt-embed] Re-ingesting ${transcript.videoId} (status: ${row.embedding_status}, hash changed: ${row.content_hash !== contentHash})`);
      await pool.query('DELETE FROM yt_videos WHERE video_id = $1', [transcript.videoId]);
    }

    // 2. Derive duration from last segment
    const segs = transcript.transcriptWithTimeCodes;
    const durationSeconds = segs.length > 0
      ? Math.floor(segs[segs.length - 1].end / 1000)
      : 0;

    // 3. Insert video row (status: processing)
    await pool.query(
      `INSERT INTO yt_videos
        (strapi_document_id, video_id, url, title, duration_seconds,
         content_hash, embedding_status, embedding_model)
       VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7)`,
      [
        transcript.documentId,
        transcript.videoId,
        `https://www.youtube.com/watch?v=${transcript.videoId}`,
        transcript.title,
        durationSeconds,
        contentHash,
        embeddingModel,
      ]
    );

    try {
      // 4. Extract video-level metadata via LLM
      const config = strapi.config.get('plugin::yt-embeddings-strapi-plugin') as any;
      let topics: string[] = [];
      let summary = '';
      let keyMoments: KeyMoment[] = [];
      let language = 'en';

      try {
        const meta = await extractVideoMetadata(
          transcript.title,
          transcript.fullTranscript,
          durationSeconds,
          config.openAIApiKey,
        );
        topics = meta.topics;
        summary = meta.summary;
        keyMoments = meta.keyMoments;
        language = meta.language;
        strapi.log.info(`[yt-embed] Metadata extracted: ${topics.length} topics, ${keyMoments.length} key moments`);
      } catch (err) {
        strapi.log.warn(`[yt-embed] Metadata extraction failed, continuing without it:`, err);
      }

      // 5. Chunk the transcript
      const chunks = chunkTranscript(transcript.transcriptWithTimeCodes);

      if (chunks.length === 0) {
        await pool.query(
          `UPDATE yt_videos
           SET embedding_status = 'complete', chunk_count = 0, embedded_at = NOW(),
               topics = $1, summary = $2, key_moments = $3, language = $4, updated_at = NOW()
           WHERE video_id = $5`,
          [topics, summary, JSON.stringify(keyMoments), language, transcript.videoId]
        );
        strapi.log.info(`[yt-embed] ${transcript.title} — no chunks (empty transcript)`);
        return { videoId: transcript.videoId, chunkCount: 0, skipped: false };
      }

      // 6. Batch embed all chunks
      const embeddingVectors = await embeddings.embedDocuments(chunks.map(c => c.text));

      // 7. Insert chunks
      const insertedIds: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vectorStr = `[${embeddingVectors[i].join(',')}]`;
        const result = await pool.query(
          `INSERT INTO yt_video_chunks
            (video_id, strapi_document_id, text, embedding,
             start_seconds, end_seconds, chunk_index, segments, tokens)
           VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            transcript.videoId, transcript.documentId, chunk.text, vectorStr,
            chunk.startSeconds, chunk.endSeconds, i,
            JSON.stringify(chunk.segments), chunk.tokens,
          ]
        );
        insertedIds.push(result.rows[0].id);
      }

      // 8. Wire prev/next chunk links
      for (let i = 0; i < insertedIds.length; i++) {
        await pool.query(
          'UPDATE yt_video_chunks SET prev_chunk_id = $1, next_chunk_id = $2 WHERE id = $3',
          [insertedIds[i - 1] ?? null, insertedIds[i + 1] ?? null, insertedIds[i]]
        );
      }

      // 9. Mark video complete with metadata
      await pool.query(
        `UPDATE yt_videos
         SET embedding_status = 'complete', chunk_count = $1, embedded_at = NOW(),
             topics = $2, summary = $3, key_moments = $4, language = $5, updated_at = NOW()
         WHERE video_id = $6`,
        [chunks.length, topics, summary, JSON.stringify(keyMoments), language, transcript.videoId]
      );

      strapi.log.info(`[yt-embed] ${transcript.title} — ${chunks.length} chunks embedded`);
      return { videoId: transcript.videoId, chunkCount: chunks.length, skipped: false };

    } catch (err) {
      await pool.query(
        `UPDATE yt_videos SET embedding_status = 'failed', error_message = $1, updated_at = NOW() WHERE video_id = $2`,
        [String(err), transcript.videoId]
      );
      throw err;
    }
  },

  // ── Semantic search with context expansion ──────────────────────────────────
  async search(query: string, options: {
    limit?: number;
    minSimilarity?: number;
    videoId?: string;
    topics?: string[];
    contextWindowSeconds?: number;
  } = {}) {
    const pool = pluginManager.getPool();
    const embeddingsClient = pluginManager.getEmbeddings();

    if (!pool || !embeddingsClient) {
      throw new Error('[yt-embed] Plugin manager not initialized');
    }

    const { limit = 5, minSimilarity = 0.2, contextWindowSeconds = 30 } = options;

    // Embed the query
    const queryVector = await embeddingsClient.embedQuery(query);
    const vectorStr = `[${queryVector.join(',')}]`;

    // Build parameterized query with optional filters
    const params: any[] = [vectorStr, minSimilarity, limit * 2];
    const filters: string[] = [];

    if (options.videoId) {
      params.push(options.videoId);
      filters.push(`vc.video_id = $${params.length}`);
    }
    if (options.topics?.length) {
      params.push(options.topics);
      filters.push(`v.topics && $${params.length}::text[]`);
    }

    const whereExtra = filters.length > 0
      ? 'AND ' + filters.join(' AND ')
      : '';

    const rows = await pool.query(`
      SELECT
        vc.id, vc.video_id, vc.text, vc.start_seconds, vc.end_seconds,
        vc.chunk_index, vc.segments, vc.strapi_document_id,
        vc.prev_chunk_id, vc.next_chunk_id,
        v.title, v.channel_name, v.summary AS video_summary,
        v.topics, v.duration_seconds,
        1 - (vc.embedding <=> $1::vector) AS similarity
      FROM yt_video_chunks vc
      JOIN yt_videos v ON v.video_id = vc.video_id
      WHERE 1 - (vc.embedding <=> $1::vector) >= $2
        AND v.embedding_status = 'complete'
        ${whereExtra}
      ORDER BY vc.embedding <=> $1::vector
      LIMIT $3
    `, params);

    if (!rows.rows.length) return [];

    // Deduplicate adjacent chunks from same video
    const seen = new Set<string>();
    const deduped = rows.rows.filter((row: any) => {
      if (seen.has(row.prev_chunk_id) || seen.has(row.next_chunk_id)) return false;
      seen.add(row.id);
      return true;
    }).slice(0, limit);

    // Expand context window for each result
    return Promise.all(deduped.map(async (row: any) => {
      const half = contextWindowSeconds / 2;
      const ctxStart = Math.max(0, row.start_seconds - half);
      const ctxEnd = Math.min(
        row.duration_seconds ?? row.end_seconds + half,
        row.end_seconds + half,
      );

      const ctxRows = await pool.query(`
        SELECT segments, start_seconds, end_seconds
        FROM yt_video_chunks
        WHERE video_id = $1
          AND start_seconds < $2
          AND end_seconds   > $3
        ORDER BY start_seconds
      `, [row.video_id, ctxEnd, ctxStart]);

      const contextText = buildContextText(
        ctxRows.rows, ctxStart, ctxEnd, row.start_seconds, row.end_seconds
      );

      return {
        chunkText:        row.text,
        startSeconds:     row.start_seconds,
        endSeconds:       row.end_seconds,
        similarity:       Math.round(row.similarity * 1000) / 1000,
        contextText,
        videoId:          row.video_id,
        title:            row.title,
        channelName:      row.channel_name,
        videoSummary:     row.video_summary,
        topics:           row.topics,
        strapiDocumentId: row.strapi_document_id,
        deepLink:         `https://www.youtube.com/watch?v=${row.video_id}&t=${Math.floor(row.start_seconds)}`,
        contextLink:      `https://www.youtube.com/watch?v=${row.video_id}&t=${Math.floor(ctxStart)}`,
      };
    }));
  },

  // ── Get transcript range for a specific video ──────────────────────────────
  async getTranscriptRange(videoId: string, startSeconds: number, endSeconds: number) {
    const pool = pluginManager.getPool();
    if (!pool) throw new Error('[yt-embed] Plugin manager not initialized');

    const rows = await pool.query(`
      SELECT text, start_seconds, end_seconds, segments
      FROM yt_video_chunks
      WHERE video_id = $1
        AND start_seconds < $3
        AND end_seconds   > $2
      ORDER BY start_seconds
    `, [videoId, startSeconds, endSeconds]);

    return rows.rows;
  },

  // ── List all ingested videos ────────────────────────────────────────────────
  async listVideos(options: { page?: number; pageSize?: number; status?: string } = {}) {
    const pool = pluginManager.getPool();
    if (!pool) throw new Error('[yt-embed] Plugin manager not initialized');

    const { page = 1, pageSize = 25, status } = options;
    const offset = (page - 1) * pageSize;

    const params: any[] = [pageSize, offset];
    let statusFilter = '';
    if (status) {
      params.push(status);
      statusFilter = `WHERE embedding_status = $${params.length}`;
    }

    const [dataResult, countResult] = await Promise.all([
      pool.query(`
        SELECT id, strapi_document_id, video_id, url, title, channel_name,
               duration_seconds, language, topics, summary, key_moments,
               embedding_status, chunk_count, embedded_at, created_at
        FROM yt_videos
        ${statusFilter}
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `, params),
      pool.query(`SELECT count(*)::int FROM yt_videos ${statusFilter}`,
        status ? [status] : []),
    ]);

    return {
      data: dataResult.rows,
      total: countResult.rows[0].count,
      page,
      pageSize,
    };
  },

  // ── Get single video with key moments ──────────────────────────────────────
  async getVideo(videoId: string) {
    const pool = pluginManager.getPool();
    if (!pool) throw new Error('[yt-embed] Plugin manager not initialized');

    const result = await pool.query(
      'SELECT * FROM yt_videos WHERE video_id = $1',
      [videoId]
    );
    return result.rows[0] ?? null;
  },

  // ── Delete a video and all its chunks ──────────────────────────────────────
  async deleteVideo(videoId: string) {
    const pool = pluginManager.getPool();
    if (!pool) throw new Error('[yt-embed] Plugin manager not initialized');

    const result = await pool.query(
      'DELETE FROM yt_videos WHERE video_id = $1 RETURNING id, title, chunk_count',
      [videoId]
    );
    return result.rows[0] ?? null;
  },

  // ── Get chunks for a video by time range ───────────────────────────────────
  async getVideoChunks(videoId: string, options: { start?: number; end?: number } = {}) {
    const pool = pluginManager.getPool();
    if (!pool) throw new Error('[yt-embed] Plugin manager not initialized');

    const params: any[] = [videoId];
    let timeFilter = '';
    if (options.start !== undefined && options.end !== undefined) {
      params.push(options.end, options.start);
      timeFilter = `AND start_seconds < $${params.length - 1} AND end_seconds > $${params.length}`;
    }

    const result = await pool.query(`
      SELECT id, text, start_seconds, end_seconds, chunk_index, segments, tokens
      FROM yt_video_chunks
      WHERE video_id = $1 ${timeFilter}
      ORDER BY chunk_index
    `, params);

    return result.rows;
  },

  // ── Check embedding status by Strapi document ID ─────────────────────────
  async getStatusByDocumentId(documentId: string): Promise<{ embedded: boolean; videoId?: string; chunkCount?: number; embeddedAt?: string } | null> {
    const pool = pluginManager.getPool();
    if (!pool) throw new Error('[yt-embed] Plugin manager not initialized');

    const result = await pool.query(
      'SELECT video_id, chunk_count, embedded_at, embedding_status FROM yt_videos WHERE strapi_document_id = $1',
      [documentId]
    );

    if (!result.rows.length) return { embedded: false };

    const row = result.rows[0];
    return {
      embedded: row.embedding_status === 'complete',
      videoId: row.video_id,
      chunkCount: row.chunk_count,
      embeddedAt: row.embedded_at,
    };
  },

  // ── Re-embed all transcripts ───────────────────────────────────────────────
  async recomputeAll() {
    const pool = pluginManager.getPool();
    if (!pool) throw new Error('[yt-embed] Plugin manager not initialized');

    strapi.log.info('[yt-embed] Recompute: dropping all yt data...');
    await pool.query('DELETE FROM yt_video_chunks');
    await pool.query('DELETE FROM yt_videos');

    const transcripts = await strapi.documents('plugin::yt-transcript-strapi-plugin.transcript' as any)
      .findMany({ fields: ['documentId', 'videoId', 'title', 'fullTranscript', 'transcriptWithTimeCodes'] as any });

    let processed = 0;
    for (const t of transcripts as any[]) {
      try {
        await this.embedTranscript({
          documentId: t.documentId,
          id: t.id,
          videoId: t.videoId,
          title: t.title,
          fullTranscript: t.fullTranscript,
          transcriptWithTimeCodes: t.transcriptWithTimeCodes,
        });
        processed++;
      } catch (err) {
        strapi.log.error(`[yt-embed] Failed to embed ${t.videoId}:`, err);
      }
    }

    strapi.log.info(`[yt-embed] Recompute complete. ${processed}/${(transcripts as any[]).length} videos embedded.`);
    return { total: (transcripts as any[]).length, processed };
  },
});

// ── Context text builder ──────────────────────────────────────────────────────
function buildContextText(
  rows: any[], ctxStart: number, ctxEnd: number,
  matchStart: number, matchEnd: number,
): string {
  const parts: string[] = [];
  let inMatch = false;

  for (const row of rows) {
    const segs = row.segments as Array<{ text: string; start: number; end: number }>;
    for (const seg of segs) {
      const s = seg.start / 1000;
      const e = seg.end / 1000;
      if (e <= ctxStart || s >= ctxEnd) continue;
      if (!inMatch && s >= matchStart) { parts.push('[RELEVANT]'); inMatch = true; }
      if (inMatch && s >= matchEnd) { parts.push('[/RELEVANT]'); inMatch = false; }
      parts.push(seg.text);
    }
  }
  if (inMatch) parts.push('[/RELEVANT]');
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export default ytEmbeddings;
