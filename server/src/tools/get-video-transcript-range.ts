import type { Core } from '@strapi/strapi';
import { GetVideoTranscriptRangeSchema } from '../mcp/schemas';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const getVideoTranscriptRangeTool = {
  name: 'getVideoTranscriptRange',
  description:
    'Get the raw transcript text for a specific time range in a YouTube video. Useful for "what was said around 5:30" type queries.',
  schema: GetVideoTranscriptRangeSchema,
  execute: async (args: unknown, strapi: Core.Strapi) => {
    const validated = GetVideoTranscriptRangeSchema.parse(args);

    const rows = await strapi
      .plugin('yt-embeddings-strapi-plugin')
      .service('ytEmbeddings')
      .getTranscriptRange(validated.videoId, validated.startSeconds, validated.endSeconds);

    if (!rows.length) {
      return {
        transcript: null,
        message: `No transcript found for video ${validated.videoId} in that time range.`,
      };
    }

    const text = rows
      .flatMap((r: any) => r.segments)
      .filter((s: any) => s.end / 1000 > validated.startSeconds && s.start / 1000 < validated.endSeconds)
      .map((s: any) => s.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      videoId: validated.videoId,
      range: `${formatTime(validated.startSeconds)}–${formatTime(validated.endSeconds)}`,
      transcript: text,
      deepLink: `https://www.youtube.com/watch?v=${validated.videoId}&t=${Math.floor(validated.startSeconds)}`,
    };
  },
  publicSafe: true,
};
