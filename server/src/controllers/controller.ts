import type { Core } from "@strapi/strapi";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { pluginManager } from "../plugin-manager";

const PLUGIN_ID = "yt-embeddings-strapi-plugin";
const YT_TRANSCRIPT_UID = "plugin::yt-transcript-strapi-plugin.transcript";

const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  async ytEmbed(ctx: any) {
    try {
      const { documentId } = ctx.request.body;

      if (!documentId) {
        ctx.throw(400, "documentId is required");
        return;
      }

      const transcript = await strapi.documents(YT_TRANSCRIPT_UID as any)
        .findOne({ documentId, fields: ['documentId', 'videoId', 'title', 'fullTranscript', 'transcriptWithTimeCodes'] as any });

      if (!transcript) {
        ctx.throw(404, `Transcript ${documentId} not found`);
        return;
      }

      const t = transcript as any;
      const result = await strapi
        .plugin(PLUGIN_ID)
        .service("ytEmbeddings")
        .embedTranscript({
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
      console.error("[ytEmbed] Error:", error.message);
      ctx.throw(500, error.message || "Failed to embed transcript");
    }
  },

  async ytListVideos(ctx: any) {
    try {
      const { page, pageSize, status } = ctx.query;
      const result = await strapi
        .plugin(PLUGIN_ID)
        .service("ytEmbeddings")
        .listVideos({
          page: page ? parseInt(page, 10) : 1,
          pageSize: pageSize ? parseInt(pageSize, 10) : 100,
          status,
        });

      ctx.body = result;
    } catch (error: any) {
      console.error("[ytListVideos] Error:", error.message);
      ctx.throw(500, error.message || "Failed to list videos");
    }
  },

  async ytGetVideo(ctx: any) {
    try {
      const { videoId } = ctx.params;
      const result = await strapi
        .plugin(PLUGIN_ID)
        .service("ytEmbeddings")
        .getVideo(videoId);

      if (!result) {
        ctx.throw(404, "Video not found");
        return;
      }

      ctx.body = { data: result };
    } catch (error: any) {
      if (error.status) throw error;
      ctx.throw(500, error.message || "Failed to get video");
    }
  },

  async ytGetVideoChunks(ctx: any) {
    try {
      const { videoId } = ctx.params;
      const { start, end } = ctx.query;
      const result = await strapi
        .plugin(PLUGIN_ID)
        .service("ytEmbeddings")
        .getVideoChunks(videoId, {
          start: start ? parseFloat(start) : undefined,
          end: end ? parseFloat(end) : undefined,
        });

      ctx.body = { data: result };
    } catch (error: any) {
      ctx.throw(500, error.message || "Failed to get video chunks");
    }
  },

  async ytRecompute(ctx: any) {
    try {
      const result = await strapi
        .plugin(PLUGIN_ID)
        .service("ytEmbeddings")
        .recomputeAll();

      ctx.body = result;
    } catch (error: any) {
      console.error("[ytRecompute] Error:", error.message);
      ctx.throw(500, error.message || "Failed to recompute embeddings");
    }
  },

  async ytStatus(ctx: any) {
    try {
      const { documentId } = ctx.params;

      if (!documentId) {
        ctx.throw(400, "documentId is required");
        return;
      }

      const result = await strapi
        .plugin(PLUGIN_ID)
        .service("ytEmbeddings")
        .getStatusByDocumentId(documentId);

      ctx.body = result;
    } catch (error: any) {
      if (error.status) throw error;
      console.error("[ytStatus] Error:", error.message);
      ctx.throw(500, error.message || "Failed to get status");
    }
  },

  async queryEmbeddings(ctx: any) {
    try {
      const { query } = ctx.query;

      if (!query?.trim()) {
        ctx.body = { error: "Please provide a query" };
        return;
      }

      // Use YT search to find relevant chunks
      const ytResults = await strapi
        .plugin(PLUGIN_ID)
        .service("ytEmbeddings")
        .search(query, { limit: 3, minSimilarity: 0.2, contextWindowSeconds: 30 });

      if (!ytResults.length) {
        ctx.body = { text: "No relevant transcript content found for your question.", sourceDocuments: [] };
        return;
      }

      // Build context from YT results
      const context = ytResults.map((r: any) =>
        `Video: "${r.title}" (${r.deepLink})\nTopics: ${(r.topics || []).join(', ')}\n\n${r.contextText || r.chunkText}`
      ).join('\n\n---\n\n');

      // Use AI SDK for RAG answer
      const config = strapi.config.get('plugin::yt-embeddings-strapi-plugin') as any;

      if (!config?.openAIApiKey) {
        // No API key — return raw results
        ctx.body = {
          text: ytResults.map((r: any) => `**${r.title}** (${r.deepLink})\n${r.chunkText}`).join('\n\n'),
          sourceDocuments: ytResults.map((r: any) => ({
            pageContent: r.chunkText,
            metadata: { id: r.videoId, title: r.title, deepLink: r.deepLink },
          })),
        };
        return;
      }

      const openai = createOpenAI({ apiKey: config.openAIApiKey });
      const { text } = await generateText({
        model: openai('gpt-4o-mini'),
        system: `You are a helpful assistant that answers questions based on YouTube transcript content.
Include timestamps and video links when relevant. Be concise and accurate.
If you cannot find the answer in the context, say so.

Context:
${context}`,
        prompt: query,
      });

      ctx.body = {
        text,
        sourceDocuments: ytResults.map((r: any) => ({
          pageContent: r.chunkText,
          metadata: { id: r.videoId, title: r.title, deepLink: r.deepLink },
        })),
      };
    } catch (error: any) {
      console.error("[queryEmbeddings] Error:", error.message);
      ctx.throw(500, error.message || "Failed to query embeddings");
    }
  },
});

export default controller;
