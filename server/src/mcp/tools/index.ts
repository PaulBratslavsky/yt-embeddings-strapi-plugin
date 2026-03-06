import type { Core } from '@strapi/strapi';
import { validateToolInput } from '../schemas';
import { searchYtKnowledgeMcpTool, handleSearchYtKnowledge } from './search-yt-knowledge';
import { getVideoTranscriptRangeMcpTool, handleGetVideoTranscriptRange } from './get-video-transcript-range';
import { listYtVideosMcpTool, handleListYtVideos } from './list-yt-videos';
import { getYtVideoSummaryMcpTool, handleGetYtVideoSummary } from './get-yt-video-summary';

export const tools = [
  searchYtKnowledgeMcpTool,
  getVideoTranscriptRangeMcpTool,
  listYtVideosMcpTool,
  getYtVideoSummaryMcpTool,
];

const toolHandlers: Record<
  string,
  (strapi: Core.Strapi, args: unknown) => Promise<any>
> = {
  search_yt_knowledge: handleSearchYtKnowledge,
  get_video_transcript_range: handleGetVideoTranscriptRange,
  list_yt_videos: handleListYtVideos,
  get_yt_video_summary: handleGetYtVideoSummary,
};

export async function handleToolCall(
  strapi: Core.Strapi,
  request: { params: { name: string; arguments?: unknown } }
) {
  const { name, arguments: args } = request.params;

  const handler = toolHandlers[name];
  if (!handler) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: true,
            message: `Unknown tool: ${name}`,
            availableTools: Object.keys(toolHandlers),
          }),
        },
      ],
    };
  }

  try {
    const validatedArgs = validateToolInput(name, args || {});
    const result = await handler(strapi, validatedArgs);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    strapi.log.error(`[yt-embeddings-strapi-plugin] Tool ${name} error:`, { error: errorMessage });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: true,
            tool: name,
            message: errorMessage,
          }, null, 2),
        },
      ],
    };
  }
}
