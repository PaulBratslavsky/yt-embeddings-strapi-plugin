import type { Core } from '@strapi/strapi';

const PLUGIN_ID = 'yt-embeddings-strapi-plugin';

const ytController = ({ strapi }: { strapi: Core.Strapi }) => ({

  // POST /api/yt-embeddings-strapi-plugin/yt/ingest
  async ingest(ctx: any) {
    try {
      const { documentId } = ctx.request.body;

      if (!documentId) {
        ctx.throw(400, 'documentId is required');
      }

      // Fetch the transcript from Strapi DB
      const transcript = await strapi.documents('plugin::yt-transcript-strapi-plugin.transcript' as any)
        .findOne({ documentId, fields: ['documentId', 'videoId', 'title', 'fullTranscript', 'transcriptWithTimeCodes'] as any });

      if (!transcript) {
        ctx.throw(404, `Transcript ${documentId} not found`);
      }

      const t = transcript as any;
      const result = await strapi.plugin(PLUGIN_ID).service('ytEmbeddings').embedTranscript({
        documentId: t.documentId,
        id: t.id,
        videoId: t.videoId,
        title: t.title,
        fullTranscript: t.fullTranscript,
        transcriptWithTimeCodes: t.transcriptWithTimeCodes,
      });

      ctx.body = result;
    } catch (error: any) {
      if (error.status) throw error;
      ctx.throw(500, error.message || 'Failed to ingest transcript');
    }
  },

  // GET /api/yt-embeddings-strapi-plugin/yt/videos
  async listVideos(ctx: any) {
    try {
      const { page, pageSize, status } = ctx.query;
      const result = await strapi.plugin(PLUGIN_ID).service('ytEmbeddings').listVideos({
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 25,
        status,
      });
      ctx.body = result;
    } catch (error: any) {
      ctx.throw(500, error.message || 'Failed to list videos');
    }
  },

  // GET /api/yt-embeddings-strapi-plugin/yt/videos/:videoId
  async getVideo(ctx: any) {
    try {
      const { videoId } = ctx.params;
      const result = await strapi.plugin(PLUGIN_ID).service('ytEmbeddings').getVideo(videoId);
      if (!result) {
        ctx.throw(404, `Video ${videoId} not found`);
      }
      ctx.body = result;
    } catch (error: any) {
      if (error.status) throw error;
      ctx.throw(500, error.message || 'Failed to get video');
    }
  },

  // DELETE /api/yt-embeddings-strapi-plugin/yt/videos/:videoId
  async deleteVideo(ctx: any) {
    try {
      const { videoId } = ctx.params;
      const result = await strapi.plugin(PLUGIN_ID).service('ytEmbeddings').deleteVideo(videoId);
      if (!result) {
        ctx.throw(404, `Video ${videoId} not found`);
      }
      ctx.body = result;
    } catch (error: any) {
      if (error.status) throw error;
      ctx.throw(500, error.message || 'Failed to delete video');
    }
  },

  // GET /api/yt-embeddings-strapi-plugin/yt/search?q=...&limit=5&videoId=...&topics=RAG,MCP
  async search(ctx: any) {
    try {
      const { q, limit, videoId, topics, minSimilarity, contextWindowSeconds } = ctx.query;

      if (!q) {
        ctx.throw(400, 'Query parameter "q" is required');
      }

      const result = await strapi.plugin(PLUGIN_ID).service('ytEmbeddings').search(q, {
        limit: limit ? parseInt(limit, 10) : 5,
        minSimilarity: minSimilarity ? parseFloat(minSimilarity) : 0.65,
        videoId,
        topics: topics ? topics.split(',') : undefined,
        contextWindowSeconds: contextWindowSeconds ? parseInt(contextWindowSeconds, 10) : 30,
      });

      ctx.body = result;
    } catch (error: any) {
      if (error.status) throw error;
      ctx.throw(500, error.message || 'Failed to search');
    }
  },

  // GET /api/yt-embeddings-strapi-plugin/yt/videos/:videoId/chunks?start=60&end=120
  async getVideoChunks(ctx: any) {
    try {
      const { videoId } = ctx.params;
      const { start, end } = ctx.query;

      const result = await strapi.plugin(PLUGIN_ID).service('ytEmbeddings').getVideoChunks(videoId, {
        start: start !== undefined ? parseFloat(start) : undefined,
        end: end !== undefined ? parseFloat(end) : undefined,
      });

      ctx.body = result;
    } catch (error: any) {
      ctx.throw(500, error.message || 'Failed to get video chunks');
    }
  },

  // POST /api/yt-embeddings-strapi-plugin/yt/recompute
  async recompute(ctx: any) {
    try {
      const result = await strapi.plugin(PLUGIN_ID).service('ytEmbeddings').recomputeAll();
      ctx.body = result;
    } catch (error: any) {
      ctx.throw(500, error.message || 'Failed to recompute');
    }
  },
});

export default ytController;
