import type { Core } from '@strapi/strapi';
import { ListYtVideosSchema } from '../mcp/schemas';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}

export const listYtVideosTool = {
  name: 'listYtVideos',
  description:
    'List all ingested YouTube videos with their topics, chunk count, and duration. Useful for discovering available content before searching.',
  schema: ListYtVideosSchema,
  execute: async (args: unknown, strapi: Core.Strapi) => {
    const validated = ListYtVideosSchema.parse(args);

    const result = await strapi
      .plugin('yt-embeddings-strapi-plugin')
      .service('ytEmbeddings')
      .listVideos({
        page: validated.page,
        pageSize: validated.pageSize,
      });

    return {
      videos: result.data.map((v: any) => ({
        videoId: v.video_id,
        title: v.title,
        topics: v.topics,
        duration: v.duration_seconds ? formatDuration(v.duration_seconds) : null,
        chunkCount: v.chunk_count,
        embeddingStatus: v.embedding_status,
      })),
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        pageCount: Math.ceil(result.total / result.pageSize),
      },
    };
  },
  publicSafe: true,
};
