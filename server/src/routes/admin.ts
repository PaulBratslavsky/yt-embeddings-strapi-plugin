export default [
{
  method: 'GET',
  path: '/yt/videos',
  handler: 'controller.ytListVideos',
  config: {
    policies: [
      {
        name: 'admin::hasPermissions',
        config: { actions: ['plugin::yt-embeddings-strapi-plugin.read'] }
      },
    ]
  },
},
{
  method: 'GET',
  path: '/yt/videos/:videoId',
  handler: 'controller.ytGetVideo',
  config: {
    policies: [
      {
        name: 'admin::hasPermissions',
        config: { actions: ['plugin::yt-embeddings-strapi-plugin.read'] }
      },
    ]
  },
},
{
  method: 'GET',
  path: '/yt/videos/:videoId/chunks',
  handler: 'controller.ytGetVideoChunks',
  config: {
    policies: [
      {
        name: 'admin::hasPermissions',
        config: { actions: ['plugin::yt-embeddings-strapi-plugin.read'] }
      },
    ]
  },
},
{
  method: 'GET',
  path: '/yt/status/:documentId',
  handler: 'controller.ytStatus',
  config: {
    policies: [
      {
        name: 'admin::hasPermissions',
        config: { actions: ['plugin::yt-embeddings-strapi-plugin.read'] }
      },
    ]
  },
},
{
  method: 'POST',
  path: '/yt/embed',
  handler: 'controller.ytEmbed',
  config: {
    policies: [
      {
        name: 'admin::hasPermissions',
        config: { actions: ['plugin::yt-embeddings-strapi-plugin.create'] }
      },
    ]
  },
},
{
  method: 'POST',
  path: '/yt/recompute',
  handler: 'controller.ytRecompute',
  config: {
    policies: [
      {
        name: 'admin::hasPermissions',
        config: { actions: ['plugin::yt-embeddings-strapi-plugin.update'] }
      },
    ]
  },
},
{
  method: 'GET',
  path: '/embeddings/embeddings-query',
  handler: 'controller.queryEmbeddings',
  config: {
    policies: [
      {
        name: 'admin::hasPermissions',
        config: { actions: ['plugin::yt-embeddings-strapi-plugin.chat'] }
      },
    ]
  },
},
]
