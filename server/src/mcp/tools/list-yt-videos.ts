import type { Core } from '@strapi/strapi';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}

export const listYtVideosMcpTool = {
  name: 'list_yt_videos',
  description: 'List all ingested YouTube videos with their topics, chunk count, and duration. Useful for discovering available content before searching.',
  inputSchema: {
    type: 'object',
    properties: {
      page: {
        type: 'number',
        description: 'Page number (default: 1)',
      },
      pageSize: {
        type: 'number',
        description: 'Results per page (default: 25)',
      },
    },
    required: [],
  },
};

export async function handleListYtVideos(
  strapi: Core.Strapi,
  args: { page?: number; pageSize?: number }
) {
  const result = await strapi
    .plugin('yt-embeddings-strapi-plugin')
    .service('ytEmbeddings')
    .listVideos({
      page: args.page ?? 1,
      pageSize: args.pageSize ?? 25,
    });

  if (!result.data.length) {
    return {
      content: [{ type: 'text', text: 'No videos have been ingested yet.' }],
    };
  }

  const formatted = result.data.map((v: any, i: number) => {
    const topics = v.topics?.length ? `Topics: ${v.topics.join(', ')}` : '';
    const duration = v.duration_seconds ? `Duration: ${formatDuration(v.duration_seconds)}` : '';
    return `${i + 1}. "${v.title}"
   Video ID: ${v.video_id}
   ${[topics, duration, `Chunks: ${v.chunk_count}`, `Status: ${v.embedding_status}`].filter(Boolean).join(' | ')}`;
  }).join('\n\n');

  return {
    content: [{
      type: 'text',
      text: `${result.total} videos (page ${result.page}/${Math.ceil(result.total / result.pageSize)}):\n\n${formatted}`,
    }],
  };
}
