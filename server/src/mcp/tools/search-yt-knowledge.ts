import type { Core } from '@strapi/strapi';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const searchYtKnowledgeMcpTool = {
  name: 'search_yt_knowledge',
  description: 'Semantically search YouTube video transcripts. Returns relevant passages with timestamps, deep links, video topics, and summary. IMPORTANT: After receiving results, use the contextText to directly answer the user\'s question. Cite the video title, timestamp, and deep link. Do not just list results — synthesize an answer from the transcript content.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What to search for',
      },
      limit: {
        type: 'number',
        description: 'Number of results (default: 5)',
      },
      videoId: {
        type: 'string',
        description: 'Optional: limit search to one video',
      },
      topics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: filter to videos covering these topics (e.g. ["RAG", "MCP"])',
      },
      contextWindowSeconds: {
        type: 'number',
        description: 'Seconds of context around match (default: 30)',
      },
      minSimilarity: {
        type: 'number',
        description: 'Minimum similarity 0-1 (default: 0.65)',
      },
    },
    required: ['query'],
  },
};

export async function handleSearchYtKnowledge(
  strapi: Core.Strapi,
  args: {
    query: string;
    limit?: number;
    videoId?: string;
    topics?: string[];
    contextWindowSeconds?: number;
    minSimilarity?: number;
  }
) {
  const results = await strapi
    .plugin('yt-embeddings-strapi-plugin')
    .service('ytEmbeddings')
    .search(args.query, {
      limit:                args.limit ?? 5,
      minSimilarity:        args.minSimilarity ?? 0.3,
      videoId:              args.videoId,
      topics:               args.topics,
      contextWindowSeconds: args.contextWindowSeconds ?? 30,
    });

  if (!results.length) {
    return {
      content: [{ type: 'text', text: 'No relevant content found.' }],
    };
  }

  const formatted = results.map((r: any, i: number) => {
    const topicLine = r.topics?.length ? `Topics: ${r.topics.join(', ')}\n` : '';
    const summaryLine = r.videoSummary ? `Summary: ${r.videoSummary}\n` : '';

    return `
--- Result ${i + 1} (similarity: ${r.similarity}) ---
Video: "${r.title}"
${topicLine}${summaryLine}Timestamp: ${formatTime(r.startSeconds)} – ${formatTime(r.endSeconds)}
Watch: ${r.deepLink}

${r.contextText}
    `.trim();
  }).join('\n\n');

  return {
    content: [{ type: 'text', text: formatted }],
  };
}
