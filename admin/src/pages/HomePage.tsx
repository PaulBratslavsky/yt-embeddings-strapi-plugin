import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import {
  Main,
  Box,
  Button,
  Flex,
  Loader,
  Typography,
  Table,
  Thead,
  Tbody,
  Tr,
  Td,
  Th,
  Badge,
} from '@strapi/design-system';
import { ArrowClockwise } from '@strapi/icons';
import { useFetchClient, Layouts } from '@strapi/strapi/admin';

const ClickableTr = styled(Tr)`
  cursor: pointer;
  &:hover { background-color: #f0f0ff; }
`;

import { PLUGIN_ID } from '../pluginId';
import { ChatModal } from '../components/custom/ChatModal';

interface YtVideo {
  video_id: string;
  strapi_document_id: string;
  title: string;
  topics: string[];
  summary: string;
  chunk_count: number;
  duration_seconds: number;
  embedding_status: string;
  embedded_at: string;
  created_at: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function HomePage() {
  const navigate = useNavigate();
  const { get, post } = useFetchClient();

  const [videos, setVideos] = useState<YtVideo[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecomputing, setIsRecomputing] = useState(false);

  const fetchVideos = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await get(`/${PLUGIN_ID}/yt/videos?pageSize=100`);
      const data = response?.data || response;
      setVideos(data?.data || []);
      setTotal(data?.total || 0);
    } catch (error) {
      console.error('Failed to fetch videos:', error);
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  }, [get]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const handleRecompute = async () => {
    if (!confirm('This will delete ALL embeddings and re-embed every transcript. Continue?')) return;
    setIsRecomputing(true);
    try {
      await post(`/${PLUGIN_ID}/yt/recompute`);
      await fetchVideos();
    } catch (error) {
      console.error('Recompute failed:', error);
    } finally {
      setIsRecomputing(false);
    }
  };

  const headerActions = (
    <Flex gap={2}>
      <Button
        variant="secondary"
        startIcon={<ArrowClockwise />}
        onClick={handleRecompute}
        loading={isRecomputing}
        disabled={isRecomputing}
      >
        {isRecomputing ? 'Re-embedding...' : 'Re-embed All'}
      </Button>
    </Flex>
  );

  if (isLoading) {
    return (
      <Main>
        <Layouts.Header
          title="YouTube Embeddings"
          subtitle="Embedded transcripts in vector store"
          primaryAction={headerActions}
        />
        <Layouts.Content>
          <Flex justifyContent="center" padding={8}>
            <Loader>Loading...</Loader>
          </Flex>
        </Layouts.Content>
      </Main>
    );
  }

  return (
    <Main>
      <Layouts.Header
        title="YouTube Embeddings"
        subtitle={`${total} video${total !== 1 ? 's' : ''} embedded`}
        primaryAction={headerActions}
      />
      <Layouts.Content>
        {videos.length === 0 ? (
          <Box padding={8} background="neutral100" hasRadius>
            <Flex direction="column" alignItems="center" gap={4}>
              <Typography variant="beta" textColor="neutral600">
                No embedded videos yet
              </Typography>
              <Typography variant="pi" textColor="neutral500">
                Open a Transcript entry and click "Create Embedding" to get started.
              </Typography>
            </Flex>
          </Box>
        ) : (
          <Table colCount={5} rowCount={videos.length + 1}>
            <Thead>
              <Tr>
                <Th><Typography variant="sigma">Title</Typography></Th>
                <Th><Typography variant="sigma">Topics</Typography></Th>
                <Th><Typography variant="sigma">Chunks</Typography></Th>
                <Th><Typography variant="sigma">Duration</Typography></Th>
                <Th><Typography variant="sigma">Embedded</Typography></Th>
              </Tr>
            </Thead>
            <Tbody>
              {videos.map((video) => (
                <ClickableTr key={video.video_id} onClick={() => navigate(`/plugins/${PLUGIN_ID}/video/${video.video_id}`)}>
                  <Td>
                    <Typography textColor="neutral800" fontWeight="semiBold">
                      {video.title}
                    </Typography>
                    <Typography variant="pi" textColor="neutral500">
                      {video.video_id}
                    </Typography>
                  </Td>
                  <Td>
                    <Flex gap={1} wrap="wrap">
                      {(video.topics || []).slice(0, 3).map((topic, i) => (
                        <Badge key={i}>{topic}</Badge>
                      ))}
                      {(video.topics || []).length > 3 && (
                        <Typography variant="pi" textColor="neutral500">
                          +{video.topics.length - 3}
                        </Typography>
                      )}
                    </Flex>
                  </Td>
                  <Td>
                    <Typography textColor="neutral800">{video.chunk_count}</Typography>
                  </Td>
                  <Td>
                    <Typography textColor="neutral800">
                      {video.duration_seconds ? formatDuration(video.duration_seconds) : '-'}
                    </Typography>
                  </Td>
                  <Td>
                    <Typography variant="pi" textColor="neutral500">
                      {formatDate(video.embedded_at || video.created_at)}
                    </Typography>
                  </Td>
                </ClickableTr>
              ))}
            </Tbody>
          </Table>
        )}
      </Layouts.Content>
      <ChatModal />
    </Main>
  );
}
