import type { Core } from '@strapi/strapi';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const getYtVideoSummaryMcpTool = {
  name: 'get_yt_video_summary',
  description: 'Get a YouTube video\'s summary, topics, and key moments by video ID. Useful for understanding what a video covers without searching.',
  inputSchema: {
    type: 'object',
    properties: {
      videoId: {
        type: 'string',
        description: 'YouTube video ID',
      },
    },
    required: ['videoId'],
  },
};

export async function handleGetYtVideoSummary(
  strapi: Core.Strapi,
  args: { videoId: string }
) {
  const video = await strapi
    .plugin('yt-embeddings-strapi-plugin')
    .service('ytEmbeddings')
    .getVideo(args.videoId);

  if (!video) {
    return {
      content: [{ type: 'text', text: `Video ${args.videoId} not found.` }],
    };
  }

  const topics = video.topics?.length ? `Topics: ${video.topics.join(', ')}` : '';
  const summary = video.summary || 'No summary available.';

  let keyMoments = '';
  if (video.key_moments?.length) {
    keyMoments = '\n\nKey Moments:\n' + video.key_moments
      .map((km: any) => `  ${formatTime(km.timestampSeconds)} — ${km.label}`)
      .join('\n');
  }

  const watchLink = `https://www.youtube.com/watch?v=${video.video_id}`;

  return {
    content: [{
      type: 'text',
      text: `"${video.title}"
${topics}
Chunks: ${video.chunk_count} | Status: ${video.embedding_status}
Watch: ${watchLink}

Summary:
${summary}${keyMoments}`,
    }],
  };
}
