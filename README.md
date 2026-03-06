# Strapi Content Embeddings

A Strapi v5 plugin that creates vector embeddings from your content using OpenAI and stores them in Neon PostgreSQL with pgvector. Enables semantic search, RAG (Retrieval-Augmented Generation) chat, and MCP (Model Context Protocol) integration for AI assistants like Claude Desktop.

## Features

- **Vector Embeddings**: Generate embeddings from your content using OpenAI's embedding models
- **Neon PostgreSQL Storage**: Store embeddings in Neon DB with pgvector for efficient similarity search
- **RAG Chat Interface**: Built-in chat widget to ask questions about your content
- **MCP Server**: Expose your embeddings to AI assistants via Model Context Protocol
- **Content Manager Integration**: Create embeddings directly from any content type's edit view
- **Standalone Embeddings**: Create embeddings independent of content types
- **Multiple Embedding Models**: Support for OpenAI's text-embedding-3-small, text-embedding-3-large, and text-embedding-ada-002
- **Database Sync**: Sync embeddings from Neon DB to Strapi via admin UI or API endpoints
- **Automatic Chunking**: Split large content into multiple embeddings with overlap for context preservation
- **Content Preprocessing**: Automatically strips HTML and Markdown formatting for cleaner embeddings

## Requirements

- Strapi v5.x
- Node.js 18+
- OpenAI API key
- Neon PostgreSQL database with pgvector extension

## Installation

```bash
npm install strapi-content-embeddings
# or
yarn add strapi-content-embeddings
```

## Configuration

### 1. Enable the Plugin

Add the plugin to your `config/plugins.ts` (or `config/plugins.js`):

```typescript
export default ({ env }) => ({
  "strapi-content-embeddings": {
    enabled: true,
    config: {
      openAIApiKey: env("OPENAI_API_KEY"),
      neonConnectionString: env("NEON_CONNECTION_STRING"),
      // Optional: Choose embedding model (default: "text-embedding-3-small")
      embeddingModel: env("EMBEDDING_MODEL", "text-embedding-3-small"),
    },
  },
});
```

### 2. Set Environment Variables

Add the following to your `.env` file:

```bash
OPENAI_API_KEY=sk-your-openai-api-key
NEON_CONNECTION_STRING=postgresql://user:password@your-neon-host.neon.tech/dbname?sslmode=require
# Optional
EMBEDDING_MODEL=text-embedding-3-small
```

### 3. Get Your Neon Connection String

1. Sign up at [Neon](https://neon.tech)
2. Create a new project
3. Navigate to your project's **Connection Details**
4. Copy the connection string (it should look like `postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`)

The plugin will automatically:
- Enable the pgvector extension
- Create the `embeddings_documents` table
- Set up HNSW indexes for fast similarity search

## MCP Integration

This plugin exposes an MCP (Model Context Protocol) server that allows AI assistants like Claude Desktop to search your embeddings.

### MCP Endpoint

```
POST /api/strapi-content-embeddings/mcp
```

### Available MCP Tools

| Tool | Description | Trigger |
|------|-------------|---------|
| `rag_query` | Ask questions and get AI-generated answers from your content | `/rag [question]` |
| `semantic_search` | Find semantically similar content | `/rag search [query]` |
| `list_embeddings` | List all stored embeddings | - |
| `get_embedding` | Get a specific embedding by ID | - |
| `create_embedding` | Create a new embedding | - |

### Claude Desktop Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "strapi-content-embeddings": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-strapi-url.com/api/strapi-content-embeddings/mcp",
        "--header",
        "Authorization: Bearer YOUR_STRAPI_API_TOKEN"
      ]
    }
  }
}
```

### Usage in Claude Desktop

Type `/rag` followed by your question to search your embeddings:

```
/rag What is Strapi?
/rag Who is Paul Bratslavsky?
```

## Available Embedding Models

| Model | Dimensions | Description |
|-------|------------|-------------|
| `text-embedding-3-small` | 1536 | Fast, cost-effective (default) |
| `text-embedding-3-large` | 3072 | Higher accuracy, more expensive |
| `text-embedding-ada-002` | 1536 | Legacy model |

## Usage

### Admin Panel

#### Create Embeddings Page

Navigate to **Content Embeddings** in the Strapi admin sidebar to:
- View all existing embeddings
- Create new standalone embeddings
- Delete embeddings
- Search and filter embeddings

#### Content Manager Integration

When editing any content type, you'll see an **Embeddings** panel in the right sidebar:
- **Create Embedding**: Generate an embedding from the current content
- **View Embedding**: Navigate to the embedding details
- **Update Embedding**: Update the embedding with current content changes

#### Chat Widget

Click the robot icon in the bottom-right corner to open the RAG chat interface:
- Ask questions about your embedded content
- View source documents used to generate answers
- Navigate to source embeddings

### Programmatic Usage

#### Create an Embedding

```typescript
const result = await strapi
  .plugin("strapi-content-embeddings")
  .service("embeddings")
  .createEmbedding({
    data: {
      title: "My Document",
      content: "This is the content to embed...",
      collectionType: "api::article.article", // optional
      fieldName: "content", // optional
      metadata: { customField: "value" }, // optional
    },
  });
```

#### Query Embeddings (RAG)

```typescript
const response = await strapi
  .plugin("strapi-content-embeddings")
  .service("embeddings")
  .queryEmbeddings("What is this document about?");

// response.text - The AI-generated answer
// response.sourceDocuments - The documents used for context
```

#### Similarity Search

```typescript
const documents = await strapi
  .plugin("strapi-content-embeddings")
  .service("embeddings")
  .similaritySearch("search query", 4); // returns top 4 similar documents
```

## API Endpoints

All endpoints require admin authentication.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/strapi-content-embeddings/embeddings/create-embedding` | Create a new embedding |
| `PUT` | `/strapi-content-embeddings/embeddings/update-embedding/:id` | Update an existing embedding |
| `DELETE` | `/strapi-content-embeddings/embeddings/delete-embedding/:id` | Delete an embedding |
| `GET` | `/strapi-content-embeddings/embeddings/find` | List all embeddings |
| `GET` | `/strapi-content-embeddings/embeddings/find/:id` | Get a single embedding |
| `GET` | `/strapi-content-embeddings/embeddings/embeddings-query?query=...` | RAG query |

## Database Sync (Neon to Strapi)

The plugin provides endpoints to sync embeddings from Neon DB (source of truth) to Strapi. These endpoints are designed to be triggered manually or via cron jobs.

### Sync Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/POST` | `/api/strapi-content-embeddings/sync` | Sync embeddings from Neon to Strapi |
| `GET` | `/api/strapi-content-embeddings/sync/status` | Check sync status without making changes |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dryRun` | boolean | `false` | Preview changes without applying them |
| `removeOrphans` | boolean | `false` | Remove Strapi entries that don't exist in Neon |

### Usage Examples

**Check sync status:**
```bash
curl "http://localhost:1337/api/strapi-content-embeddings/sync/status" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

Response:
```json
{
  "neonCount": 150,
  "strapiCount": 145,
  "inSync": false,
  "missingInStrapi": 5,
  "missingInNeon": 0,
  "contentDifferences": 2
}
```

**Dry run (preview changes):**
```bash
curl "http://localhost:1337/api/strapi-content-embeddings/sync?dryRun=true" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

**Run sync:**
```bash
curl "http://localhost:1337/api/strapi-content-embeddings/sync" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

**Sync and remove orphans:**
```bash
curl "http://localhost:1337/api/strapi-content-embeddings/sync?removeOrphans=true" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

### Sync Response

```json
{
  "success": true,
  "timestamp": "2024-01-07T12:00:00.000Z",
  "neonCount": 150,
  "strapiCount": 150,
  "actions": {
    "created": 5,
    "updated": 2,
    "orphansRemoved": 0
  },
  "details": {
    "created": ["doc1 (Title 1)", "doc2 (Title 2)"],
    "updated": ["doc3 (Title 3)"],
    "orphansRemoved": []
  },
  "errors": []
}
```

### Cron Job Example

```bash
# Sync every hour
0 * * * * curl -s "https://your-strapi.com/api/strapi-content-embeddings/sync" \
  -H "Authorization: Bearer YOUR_API_TOKEN" >> /var/log/embeddings-sync.log
```

## Content Chunking

For large content that exceeds the recommended size for embeddings (~4000 characters / ~1000 tokens), the plugin supports automatic chunking.

### How Chunking Works

1. **Smart Splitting**: Content is split at natural boundaries (paragraphs, sentences, words) to preserve meaning
2. **Overlap**: Chunks include overlapping content (default: 200 chars) to maintain context between chunks
3. **Metadata**: Each chunk stores metadata linking it to the original content and other chunks
4. **Titles**: Chunk titles include part numbers (e.g., "My Document [Part 1/3]")

### Configuration

Add chunking options to your plugin config:

```typescript
// config/plugins.ts
export default ({ env }) => ({
  "strapi-content-embeddings": {
    enabled: true,
    config: {
      openAIApiKey: env("OPENAI_API_KEY"),
      neonConnectionString: env("NEON_CONNECTION_STRING"),
      // Chunking options
      chunkSize: 4000,      // Max characters per chunk (default: 4000)
      chunkOverlap: 200,    // Overlap between chunks (default: 200)
      autoChunk: false,     // Auto-chunk large content globally (default: false)
    },
  },
});
```

### Using Chunking

#### Via MCP Tool

```json
{
  "tool": "create_embedding",
  "arguments": {
    "title": "My Long Document",
    "content": "... very long content ...",
    "autoChunk": true
  }
}
```

#### Programmatic Usage

```typescript
// Create with automatic chunking
const result = await strapi
  .plugin("strapi-content-embeddings")
  .service("embeddings")
  .createChunkedEmbedding({
    data: {
      title: "My Long Document",
      content: "... very long content ...",
    },
  });

console.log(result);
// {
//   entity: { ... first chunk ... },
//   chunks: [ ... all chunks ... ],
//   totalChunks: 5,
//   wasChunked: true
// }

// Or use createEmbedding with autoChunk flag
const embedding = await strapi
  .plugin("strapi-content-embeddings")
  .service("embeddings")
  .createEmbedding({
    data: {
      title: "My Document",
      content: "... long content ...",
      autoChunk: true,  // Enable chunking
    },
  });
```

### Chunk Metadata

Each chunk embedding includes metadata:

```json
{
  "isChunk": true,
  "chunkIndex": 0,
  "totalChunks": 5,
  "startOffset": 0,
  "endOffset": 4200,
  "originalTitle": "My Long Document",
  "parentDocumentId": "abc123",
  "estimatedTokens": 1050
}
```

## Content Preprocessing

The plugin automatically preprocesses content before creating embeddings to improve semantic search quality. This is enabled by default.

### What Gets Cleaned

- **HTML tags**: Stripped while preserving text content
- **Markdown syntax**: Headers (`#`), bold (`**`), italic (`*`), links, lists, code blocks
- **Whitespace**: Normalized (multiple spaces/newlines collapsed)

### Why Preprocess?

Raw markdown/HTML formatting adds noise to embeddings without adding semantic meaning:

```
Input:  "## Features\n- **Fast** search\n- <b>Reliable</b>"
Output: "Features: Fast search. Reliable"
```

Both produce the same semantic meaning, but the cleaned version creates better embeddings for search.

### Configuration

Preprocessing is enabled by default. To disable:

```typescript
// config/plugins.ts
export default ({ env }) => ({
  "strapi-content-embeddings": {
    enabled: true,
    config: {
      openAIApiKey: env("OPENAI_API_KEY"),
      neonConnectionString: env("NEON_CONNECTION_STRING"),
      preprocessContent: false,  // Disable preprocessing
    },
  },
});
```

> **Note**: The original content is always preserved in Strapi. Preprocessing only affects the text sent to OpenAI for embedding generation.

## Admin Sync UI

The plugin includes a built-in sync interface accessible from the admin panel. Click the **Sync** button in the Content Embeddings page header.

### Available Operations

| Operation | Description |
|-----------|-------------|
| **Check Status** | Compare Neon and Strapi databases, shows counts and differences |
| **Sync from Neon** | Import embeddings from Neon to Strapi (with preview option) |
| **Recreate All** | Delete all Neon embeddings and recreate from Strapi data |

### Sync Workflow

1. Click **Sync** button to open the sync modal
2. View current sync status (Neon vs Strapi counts)
3. Select **Sync from Neon** operation
4. Click **Preview Sync** to see what changes would be made
5. Review the results (Created/Updated/Removed counts)
6. Click **Apply Changes** to execute the sync

### Sync Options

- **Dry Run**: Preview changes without applying them (enabled by default)
- **Remove Orphans**: Delete Strapi entries that don't exist in Neon

## How It Works

1. **Embedding Creation**: When you create an embedding, the content is sent to OpenAI's embedding API to generate a vector representation (1536 or 3072 dimensions depending on the model).

2. **Storage**: The embedding vector is stored in Neon PostgreSQL using the pgvector extension, along with the content and metadata.

3. **Similarity Search**: When querying, the search query is converted to an embedding and compared against stored embeddings using cosine similarity via pgvector's HNSW index.

4. **RAG Response**: For chat queries, the most relevant documents are retrieved and passed to GPT-4o-mini as context to generate an accurate response.

## Database Schema

The plugin creates an `embeddings_documents` table in your Neon database:

```sql
CREATE TABLE embeddings_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT,
  metadata JSONB,
  embedding vector(1536)  -- or 3072 for text-embedding-3-large
);
```

Indexes:
- HNSW index on `embedding` for fast similarity search
- GIN index on `metadata` for filtering

## Permissions

The plugin registers the following RBAC permissions:
- `plugin::strapi-content-embeddings.read` - View embeddings
- `plugin::strapi-content-embeddings.create` - Create embeddings
- `plugin::strapi-content-embeddings.update` - Update embeddings
- `plugin::strapi-content-embeddings.delete` - Delete embeddings
- `plugin::strapi-content-embeddings.chat` - Use the RAG chat feature

Configure these in **Settings > Roles** for each admin role.

## Troubleshooting

### Embeddings not being created

1. Check that `OPENAI_API_KEY` is set correctly
2. Check that `NEON_CONNECTION_STRING` is valid
3. Look for errors in the Strapi console

### Chat returns "cannot find the answer"

1. Ensure embeddings exist in the database
2. Try creating more specific content
3. Check that the embedding model matches between creation and query

### Connection errors

1. Verify your Neon connection string includes `?sslmode=require`
2. Check that your Neon project is active (not paused)
3. Ensure the pgvector extension is enabled

### MCP not connecting

1. Verify the MCP endpoint URL is correct
2. Check the Authorization header has a valid Strapi API token
3. Ensure the plugin is properly configured and Strapi is running

## License

MIT
# yt-embeddings-strapi-plugin
