export default [
  // MCP routes - auth handled by middleware
  {
    method: 'POST',
    path: '/mcp',
    handler: 'mcp.handle',
    config: {
      auth: false,
      policies: [],
    },
  },
  {
    method: 'GET',
    path: '/mcp',
    handler: 'mcp.handle',
    config: {
      auth: false,
      policies: [],
    },
  },
  {
    method: 'DELETE',
    path: '/mcp',
    handler: 'mcp.handle',
    config: {
      auth: false,
      policies: [],
    },
  },
  // YouTube Knowledge Base API routes
  {
    method: 'POST',
    path: '/yt/ingest',
    handler: 'ytController.ingest',
    config: {
      description: 'Ingest a transcript by documentId',
    },
  },
  {
    method: 'GET',
    path: '/yt/videos',
    handler: 'ytController.listVideos',
    config: {
      description: 'List all ingested videos with metadata',
    },
  },
  {
    method: 'GET',
    path: '/yt/videos/:videoId',
    handler: 'ytController.getVideo',
    config: {
      description: 'Get a single video with metadata',
    },
  },
  {
    method: 'DELETE',
    path: '/yt/videos/:videoId',
    handler: 'ytController.deleteVideo',
    config: {
      description: 'Delete a video and all its chunks',
    },
  },
  {
    method: 'GET',
    path: '/yt/search',
    handler: 'ytController.search',
    config: {
      description: 'Semantic search across transcripts',
    },
  },
  {
    method: 'GET',
    path: '/yt/videos/:videoId/chunks',
    handler: 'ytController.getVideoChunks',
    config: {
      description: 'Get chunks for a video by time range',
    },
  },
  {
    method: 'POST',
    path: '/yt/recompute',
    handler: 'ytController.recompute',
    config: {
      description: 'Re-embed all transcripts',
    },
  },
]
