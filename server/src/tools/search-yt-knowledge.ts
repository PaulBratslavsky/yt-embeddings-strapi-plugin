import type { Core } from '@strapi/strapi';
import { SearchYtKnowledgeSchema } from '../mcp/schemas';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const searchYtKnowledgeTool = {
  name: 'searchYtKnowledge',
  description:
    'Semantically search YouTube video transcripts. Returns relevant passages with timestamps, deep links, video topics, and summary.',
  schema: SearchYtKnowledgeSchema,
  execute: async (args: unknown, strapi: Core.Strapi) => {
    const validated = SearchYtKnowledgeSchema.parse(args);

    const results = await strapi
      .plugin('yt-embeddings-strapi-plugin')
      .service('ytEmbeddings')
      .search(validated.query, {
        limit: validated.limit,
        minSimilarity: validated.minSimilarity,
        videoId: validated.videoId,
        topics: validated.topics,
        contextWindowSeconds: validated.contextWindowSeconds,
      });

    if (!results.length) {
      return { results: [], message: 'No relevant content found.' };
    }

    return {
      results: results.map((r: any, i: number) => ({
        rank: i + 1,
        similarity: r.similarity,
        title: r.title,
        topics: r.topics,
        videoSummary: r.videoSummary,
        timestamp: `${formatTime(r.startSeconds)} – ${formatTime(r.endSeconds)}`,
        deepLink: r.deepLink,
        contextText: r.contextText,
      })),
    };
  },
  publicSafe: true,
};
