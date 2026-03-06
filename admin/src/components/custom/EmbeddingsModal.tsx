import React, { useState, useEffect } from "react";
import {
  unstable_useContentManagerContext as useContentManagerContext,
  useFetchClient,
  useNotification,
} from "@strapi/strapi/admin";
import {
  Button,
  Typography,
  Box,
} from "@strapi/design-system";
import { Plus } from "@strapi/icons";
import { PLUGIN_ID } from "../../pluginId";

const YT_TRANSCRIPT_UID = "plugin::yt-transcript-strapi-plugin.transcript";

export function EmbeddingsModal() {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();

  const context = useContentManagerContext();
  const { form, id, slug } = context;

  const [isLoading, setIsLoading] = useState(false);
  const [ytEmbedded, setYtEmbedded] = useState(false);
  const [chunkCount, setChunkCount] = useState<number | null>(null);

  // Check embedding status on mount
  useEffect(() => {
    if (!id || slug !== YT_TRANSCRIPT_UID) return;

    get(`/${PLUGIN_ID}/yt/status/${id}`)
      .then((res: any) => {
        const data = res?.data || res;
        if (data?.embedded) {
          setYtEmbedded(true);
          setChunkCount(data.chunkCount ?? null);
        }
      })
      .catch(() => {/* ignore — not yet embedded */});
  }, [id, slug]);

  // Only render for transcript content type
  if (!form || !id || slug !== YT_TRANSCRIPT_UID) {
    return null;
  }

  const isSaved = !!id;

  async function handleYtEmbed() {
    if (!id) return;
    setIsLoading(true);

    try {
      const result = await post(`/${PLUGIN_ID}/yt/embed`, { documentId: id });
      const data = result?.data || result;

      if (data?.skipped) {
        toggleNotification({
          type: "info",
          message: "Already embedded — transcript unchanged",
        });
      } else {
        const count = data?.chunkCount ?? 0;
        setChunkCount(count);
        toggleNotification({
          type: "success",
          message: `Embedded: ${count} chunks with timecodes, topics & summary extracted`,
        });
      }
      setYtEmbedded(true);
    } catch (error: any) {
      console.error("Failed to embed transcript:", error);
      toggleNotification({
        type: "danger",
        message: error?.response?.data?.error?.message || error.message || "Failed to embed transcript",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Box paddingTop={2}>
      <Button
        onClick={handleYtEmbed}
        startIcon={<Plus />}
        disabled={!isSaved || isLoading}
        loading={isLoading}
        fullWidth
      >
        {isLoading ? "Embedding..." : ytEmbedded ? "Re-embed Transcript" : "Create Embedding"}
      </Button>
      {!isSaved && (
        <Typography variant="pi" textColor="neutral600" style={{ display: "block", marginTop: "0.5rem" }}>
          Save transcript first
        </Typography>
      )}
      {isLoading && (
        <Typography variant="pi" textColor="neutral600" style={{ display: "block", marginTop: "0.5rem" }}>
          Chunking, embedding & extracting metadata...
        </Typography>
      )}
      {ytEmbedded && !isLoading && (
        <Typography variant="pi" textColor="success600" style={{ display: "block", marginTop: "0.5rem" }}>
          Embedded{chunkCount ? ` (${chunkCount} chunks)` : ""}
        </Typography>
      )}
    </Box>
  );
}
