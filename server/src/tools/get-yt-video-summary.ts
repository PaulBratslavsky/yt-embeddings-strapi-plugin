import type { Core } from '@strapi/strapi';
import { GetYtVideoSummarySchema } from '../mcp/schemas';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const getYtVideoSummaryTool = {
  name: 'getYtVideoSummary',
  description:
    "Get a YouTube video's summary, topics, and key moments by video ID. Useful for understanding what a video covers without searching.",
  schema: GetYtVideoSummarySchema,
  execute: async (args: unknown, strapi: Core.Strapi) => {
    const validated = GetYtVideoSummarySchema.parse(args);

    const video = await strapi
      .plugin('yt-embeddings-strapi-plugin')
      .service('ytEmbeddings')
      .getVideo(validated.videoId);

    if (!video) {
      return { error: true, message: `Video ${validated.videoId} not found.` };
    }

    return {
      videoId: video.video_id,
      title: video.title,
      topics: video.topics,
      summary: video.summary || null,
      chunkCount: video.chunk_count,
      embeddingStatus: video.embedding_status,
      watchLink: `https://www.youtube.com/watch?v=${video.video_id}`,
      keyMoments: video.key_moments?.map((km: any) => ({
        timestamp: formatTime(km.timestampSeconds),
        label: km.label,
      })) || [],
    };
  },
  publicSafe: true,
};
