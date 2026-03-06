import type { Core } from '@strapi/strapi';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const getVideoTranscriptRangeMcpTool = {
  name: 'get_video_transcript_range',
  description: 'Get the raw transcript text for a specific time range in a YouTube video. Useful for "what was said around 5:30" type queries.',
  inputSchema: {
    type: 'object',
    properties: {
      videoId: {
        type: 'string',
        description: 'YouTube video ID',
      },
      startSeconds: {
        type: 'number',
        description: 'Start of range in seconds',
      },
      endSeconds: {
        type: 'number',
        description: 'End of range in seconds',
      },
    },
    required: ['videoId', 'startSeconds', 'endSeconds'],
  },
};

export async function handleGetVideoTranscriptRange(
  strapi: Core.Strapi,
  args: { videoId: string; startSeconds: number; endSeconds: number }
) {
  const rows = await strapi
    .plugin('yt-embeddings-strapi-plugin')
    .service('ytEmbeddings')
    .getTranscriptRange(args.videoId, args.startSeconds, args.endSeconds);

  if (!rows.length) {
    return {
      content: [{
        type: 'text',
        text: `No transcript found for video ${args.videoId} in that time range.`,
      }],
    };
  }

  const text = rows
    .flatMap((r: any) => r.segments)
    .filter((s: any) => s.end / 1000 > args.startSeconds && s.start / 1000 < args.endSeconds)
    .map((s: any) => s.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const deepLink = `https://www.youtube.com/watch?v=${args.videoId}&t=${Math.floor(args.startSeconds)}`;

  return {
    content: [{
      type: 'text',
      text: `Transcript ${formatTime(args.startSeconds)}–${formatTime(args.endSeconds)}:\n\n${text}\n\nWatch: ${deepLink}`,
    }],
  };
}
