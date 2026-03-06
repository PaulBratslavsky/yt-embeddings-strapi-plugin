import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Main,
  Box,
  Flex,
  Typography,
  Badge,
  Loader,
  Table,
  Thead,
  Tbody,
  Tr,
  Td,
  Th,
} from "@strapi/design-system";
import { useFetchClient, Layouts } from "@strapi/strapi/admin";

import { PLUGIN_ID } from "../pluginId";
import { BackLink } from "../components/custom/BackLink";

interface YtVideo {
  video_id: string;
  title: string;
  topics: string[];
  summary: string;
  key_moments: Array<{ label: string; startSeconds: number; summary: string }>;
  duration_seconds: number;
  chunk_count: number;
  language: string;
  embedded_at: string;
}

interface YtChunk {
  id: string;
  text: string;
  start_seconds: number;
  end_seconds: number;
  chunk_index: number;
  tokens: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoDetails() {
  const { videoId } = useParams<{ videoId: string }>();
  const { get } = useFetchClient();

  const [video, setVideo] = useState<YtVideo | null>(null);
  const [chunks, setChunks] = useState<YtChunk[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!videoId) return;

    Promise.all([
      get(`/${PLUGIN_ID}/yt/videos/${videoId}`),
      get(`/${PLUGIN_ID}/yt/videos/${videoId}/chunks`),
    ])
      .then(([videoRes, chunksRes]) => {
        const v = videoRes?.data?.data || videoRes?.data || null;
        if (v && typeof v.key_moments === 'string') {
          try { v.key_moments = JSON.parse(v.key_moments); } catch { v.key_moments = []; }
        }
        setVideo(v);
        setChunks(chunksRes?.data?.data || chunksRes?.data || []);
      })
      .catch((err) => console.error("Failed to load video:", err))
      .finally(() => setIsLoading(false));
  }, [videoId, get]);

  if (isLoading) {
    return (
      <Main>
        <Layouts.Header
          title="Loading..."
          navigationAction={<BackLink to={`/plugins/${PLUGIN_ID}`} />}
        />
        <Layouts.Content>
          <Flex justifyContent="center" padding={8}>
            <Loader>Loading video details...</Loader>
          </Flex>
        </Layouts.Content>
      </Main>
    );
  }

  if (!video) {
    return (
      <Main>
        <Layouts.Header
          title="Video Not Found"
          navigationAction={<BackLink to={`/plugins/${PLUGIN_ID}`} />}
        />
        <Layouts.Content>
          <Box padding={8} textAlign="center">
            <Typography>Video not found in the vector store.</Typography>
          </Box>
        </Layouts.Content>
      </Main>
    );
  }

  return (
    <Main>
      <Layouts.Header
        title={video.title}
        subtitle={`${video.chunk_count} chunks | ${formatTime(video.duration_seconds || 0)} duration`}
        navigationAction={<BackLink to={`/plugins/${PLUGIN_ID}`} />}
      />
      <Layouts.Content>
        {/* Summary & Topics */}
        <Box background="neutral0" padding={4} hasRadius marginBottom={4}>
          <Typography variant="delta" style={{ display: "block", marginBottom: "0.5rem" }}>
            Summary
          </Typography>
          <Typography textColor="neutral700" style={{ display: "block", marginBottom: "1rem" }}>
            {video.summary}
          </Typography>
          <Flex gap={1} wrap="wrap">
            {(video.topics || []).map((topic, i) => (
              <Badge key={i}>{topic}</Badge>
            ))}
          </Flex>
        </Box>

        {/* Key Moments */}
        {video.key_moments?.length > 0 && (
          <Box background="neutral0" padding={4} hasRadius marginBottom={4}>
            <Typography variant="delta" style={{ display: "block", marginBottom: "0.5rem" }}>
              Key Moments
            </Typography>
            <Table colCount={3} rowCount={video.key_moments.length + 1}>
              <Thead>
                <Tr>
                  <Th><Typography variant="sigma">Time</Typography></Th>
                  <Th><Typography variant="sigma">Label</Typography></Th>
                  <Th><Typography variant="sigma">Summary</Typography></Th>
                </Tr>
              </Thead>
              <Tbody>
                {video.key_moments.map((moment, i) => (
                  <Tr key={i}>
                    <Td><Badge>{formatTime(moment.startSeconds)}</Badge></Td>
                    <Td><Typography fontWeight="semiBold">{moment.label}</Typography></Td>
                    <Td><Typography variant="pi" textColor="neutral600">{moment.summary}</Typography></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}

        {/* Chunks Table */}
        <Box background="neutral0" padding={4} hasRadius>
          <Typography variant="delta" style={{ display: "block", marginBottom: "0.75rem" }}>
            Chunks ({chunks.length})
          </Typography>
          <Table colCount={4} rowCount={chunks.length + 1}>
            <Thead>
              <Tr>
                <Th><Typography variant="sigma">#</Typography></Th>
                <Th><Typography variant="sigma">Time Range</Typography></Th>
                <Th><Typography variant="sigma">Text</Typography></Th>
                <Th><Typography variant="sigma">Tokens</Typography></Th>
              </Tr>
            </Thead>
            <Tbody>
              {chunks.map((chunk) => (
                <Tr key={chunk.id}>
                  <Td>
                    <Typography textColor="neutral600">{chunk.chunk_index}</Typography>
                  </Td>
                  <Td>
                    <Badge>
                      {formatTime(chunk.start_seconds)} - {formatTime(chunk.end_seconds)}
                    </Badge>
                  </Td>
                  <Td>
                    <Typography textColor="neutral700" style={{ fontSize: "0.8125rem", lineHeight: 1.4 }}>
                      {chunk.text.length > 200 ? chunk.text.slice(0, 200) + "..." : chunk.text}
                    </Typography>
                  </Td>
                  <Td>
                    <Typography variant="pi" textColor="neutral500">~{chunk.tokens}</Typography>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      </Layouts.Content>
    </Main>
  );
}
