# Strapi Content Embeddings - Architecture Guide

A comprehensive guide to understanding how the Strapi Content Embeddings plugin works, designed for new engineers and beginners.

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Core Concepts](#core-concepts)
4. [Embedding Creation Flow](#embedding-creation-flow)
5. [Content Chunking](#content-chunking)
6. [Content Preprocessing](#content-preprocessing)
7. [Vector Storage](#vector-storage)
8. [RAG Query Flow](#rag-query-flow)
9. [Database Sync](#database-sync)
10. [MCP Integration](#mcp-integration)

---

## Overview

This plugin enables **semantic search** and **RAG (Retrieval-Augmented Generation)** capabilities for Strapi CMS by:

1. Converting text content into **vector embeddings** using OpenAI
2. Storing embeddings in **Neon PostgreSQL** with pgvector
3. Enabling similarity search to find related content
4. Providing a chat interface that answers questions using your content

```mermaid
graph LR
    A[Strapi Content] --> B[OpenAI Embeddings API]
    B --> C[Vector Embedding]
    C --> D[Neon PostgreSQL + pgvector]
    D --> E[Semantic Search]
    E --> F[RAG Chat Responses]
```

---

## System Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph "Strapi CMS"
        A[Admin UI] --> B[Plugin Controllers]
        B --> C[Embeddings Service]
        C --> D[Sync Service]
    end

    subgraph "External Services"
        E[OpenAI API]
        F[Neon PostgreSQL]
    end

    subgraph "Plugin Manager"
        G[LangChain Integration]
        H[PGVector Store]
    end

    C --> G
    G --> E
    G --> H
    H --> F

    subgraph "Clients"
        I[Admin Panel]
        J[MCP Clients]
        K[API Consumers]
    end

    I --> A
    J --> B
    K --> B
```

### Component Overview

| Component | Purpose |
|-----------|---------|
| **Admin UI** | React components for managing embeddings |
| **Controllers** | HTTP request handlers (REST API) |
| **Embeddings Service** | Core business logic for CRUD operations |
| **Sync Service** | Database synchronization between Strapi and Neon |
| **Plugin Manager** | LangChain/OpenAI/PGVector integration |
| **Neon PostgreSQL** | Vector storage with pgvector extension |

---

## Core Concepts

### What is a Vector Embedding?

A vector embedding is a numerical representation of text that captures its semantic meaning. Similar texts have similar vectors.

```mermaid
graph LR
    subgraph "Text Input"
        A["'The cat sat on the mat'"]
        B["'A feline rested on the rug'"]
        C["'Database optimization techniques'"]
    end

    subgraph "Vector Space"
        D["[0.12, -0.45, 0.78, ...]"]
        E["[0.11, -0.43, 0.76, ...]"]
        F["[-0.67, 0.23, -0.12, ...]"]
    end

    A --> D
    B --> E
    C --> F

    D <-.->|"Similar"| E
    D <-.->|"Different"| F
```

### Dual Database Storage

The plugin stores data in **two databases**:

```mermaid
graph TB
    subgraph "Strapi PostgreSQL"
        A[Embeddings Table]
        A --> A1[documentId]
        A --> A2[title]
        A --> A3[content]
        A --> A4[metadata]
        A --> A5[embeddingId - reference to Neon]
    end

    subgraph "Neon PostgreSQL"
        B[embeddings_documents Table]
        B --> B1[id - UUID]
        B --> B2[content]
        B --> B3[metadata - JSONB]
        B --> B4[embedding - vector 1536/3072]
    end

    A5 -.->|"References"| B1
```

**Why two databases?**
- **Strapi DB**: Manages content, relationships, and admin features
- **Neon DB**: Optimized for vector similarity search with pgvector

---

## Embedding Creation Flow

### Step-by-Step Process

```mermaid
sequenceDiagram
    participant U as User
    participant A as Admin UI
    participant C as Controller
    participant S as Embeddings Service
    participant P as Plugin Manager
    participant O as OpenAI API
    participant N as Neon DB
    participant DB as Strapi DB

    U->>A: Create Embedding (title, content)
    A->>C: POST /embeddings/create-embedding
    C->>S: createEmbedding(data)

    Note over S: Preprocess content (strip HTML/Markdown)
    Note over S: Check if chunking needed

    alt Content > 4000 chars
        S->>S: createChunkedEmbedding()
        Note over S: Split into chunks with overlap
    end

    S->>DB: Create Strapi entry
    S->>P: createEmbedding(docData)
    P->>O: embeddings.embedQuery(content)
    O-->>P: Vector [1536 dimensions]
    P->>N: INSERT INTO embeddings_documents
    N-->>P: embeddingId (UUID)
    P-->>S: { embeddingId, embedding }
    S->>DB: Update with embeddingId
    S-->>C: Created embedding
    C-->>A: Success response
    A-->>U: Show confirmation
```

### Code Flow

```
User Input
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Controller: createEmbedding()                               │
│ server/src/controllers/controller.ts                        │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Service: createEmbedding()                                  │
│ server/src/services/embeddings.ts                           │
│                                                             │
│ 1. Preprocess content (strip HTML/Markdown)                 │
│ 2. Check if content needs chunking                          │
│ 3. Create Strapi DB entry                                   │
│ 4. Call Plugin Manager to create vector                     │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Plugin Manager: createEmbedding()                           │
│ server/src/plugin-manager.ts                                │
│                                                             │
│ 1. Call OpenAI embeddings API via LangChain                 │
│ 2. Insert vector into Neon DB                               │
│ 3. Return embeddingId and vector                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Content Chunking

### Why Chunk Content?

- Embedding models have **token limits** (~8000 tokens)
- Smaller chunks enable **more precise** search results
- Overlapping chunks preserve **context** between sections

### Chunking Algorithm

```mermaid
graph TB
    A[Input Content<br/>10,000 chars] --> B{Content > chunkSize?}
    B -->|No| C[Single Embedding]
    B -->|Yes| D[Split into Chunks]

    D --> E[Chunk 1<br/>0-4000 chars]
    D --> F[Chunk 2<br/>3800-7800 chars]
    D --> G[Chunk 3<br/>7600-10000 chars]

    E --> H[200 char overlap]
    F --> H

    subgraph "Smart Splitting"
        I[Try paragraph breaks first]
        J[Then sentence breaks]
        K[Then word breaks]
        L[Last resort: character]
    end

    D --> I --> J --> K --> L
```

### Chunk Configuration

```typescript
{
  chunkSize: 4000,      // Max characters per chunk
  chunkOverlap: 200,    // Overlap between chunks
  autoChunk: true       // Enable automatic chunking
}
```

### Chunk Metadata Structure

Each chunk stores metadata linking it to other chunks:

```json
{
  "isChunk": true,
  "chunkIndex": 1,
  "totalChunks": 3,
  "startOffset": 3800,
  "endOffset": 7800,
  "originalTitle": "My Long Document",
  "parentDocumentId": "abc-123",
  "estimatedTokens": 950
}
```

### Splitting Priority

```mermaid
graph LR
    A[Content] --> B{Has paragraphs?}
    B -->|Yes| C[Split on \\n\\n]
    B -->|No| D{Has sentences?}
    D -->|Yes| E[Split on . ! ?]
    D -->|No| F{Has words?}
    F -->|Yes| G[Split on spaces]
    F -->|No| H[Split on characters]
```

---

## Content Preprocessing

### Why Preprocess?

Raw HTML/Markdown adds noise without semantic value:

```
Before: "## Features\n- **Fast** search\n- <b>Reliable</b>"
After:  "Features: Fast search. Reliable"
```

Both mean the same thing, but the cleaned version creates better embeddings.

### Preprocessing Pipeline

```mermaid
graph TB
    A[Raw Content] --> B{Contains HTML?}
    B -->|Yes| C[Strip HTML Tags]
    B -->|No| D{Contains Markdown?}
    C --> D
    D -->|Yes| E[Strip Markdown Syntax]
    D -->|No| F[Normalize Whitespace]
    E --> F
    F --> G[Clean Content]

    subgraph "HTML Processing"
        C --> C1[Remove tags]
        C --> C2[Preserve text]
        C --> C3[Handle entities]
    end

    subgraph "Markdown Processing"
        E --> E1[Remove # headers]
        E --> E2[Remove ** bold]
        E --> E3[Remove links]
        E --> E4[Remove code blocks]
    end
```

### Detection Logic

```mermaid
graph TB
    A[Content] --> B[containsHtml?]
    A --> C[containsMarkdown?]

    B --> B1["/<[a-z][\\s\\S]*>/i"]
    C --> C1["/^#{1,6}\\s/m"]
    C --> C2["/\\*\\*[^*]+\\*\\*/"]
    C --> C3["/\\[.+\\]\\(.+\\)/"]
```

---

## Vector Storage

### Neon PostgreSQL Schema

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings table
CREATE TABLE embeddings_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT,
  metadata JSONB,
  embedding vector(1536)  -- or 3072 for large model
);

-- HNSW index for fast similarity search
CREATE INDEX ON embeddings_documents
  USING hnsw (embedding vector_cosine_ops);

-- GIN index for metadata filtering
CREATE INDEX ON embeddings_documents
  USING gin (metadata);
```

### Vector Dimensions by Model

| Model | Dimensions | Use Case |
|-------|------------|----------|
| `text-embedding-3-small` | 1536 | Fast, cost-effective (default) |
| `text-embedding-3-large` | 3072 | Higher accuracy |
| `text-embedding-ada-002` | 1536 | Legacy |

### Similarity Search

```mermaid
sequenceDiagram
    participant Q as Query
    participant E as OpenAI
    participant N as Neon DB
    participant R as Results

    Q->>E: "What is Strapi?"
    E-->>Q: Query Vector [0.12, -0.45, ...]
    Q->>N: Find similar vectors (cosine distance)

    Note over N: SELECT * FROM embeddings_documents<br/>ORDER BY embedding <=> query_vector<br/>LIMIT 4

    N-->>R: Top 4 similar documents
```

---

## RAG Query Flow

RAG (Retrieval-Augmented Generation) combines search with AI generation.

### Complete RAG Pipeline

```mermaid
sequenceDiagram
    participant U as User
    participant S as Service
    participant PM as Plugin Manager
    participant O as OpenAI
    participant N as Neon DB

    U->>S: "What features does Strapi have?"
    S->>PM: queryEmbeddings(question)

    rect rgb(240, 248, 255)
        Note over PM: Step 1: Embed the question
        PM->>O: embeddings.embedQuery(question)
        O-->>PM: Question vector
    end

    rect rgb(255, 248, 240)
        Note over PM: Step 2: Find similar content
        PM->>N: Similarity search (top 6)
        N-->>PM: Relevant documents
    end

    rect rgb(240, 255, 240)
        Note over PM: Step 3: Filter by threshold
        PM->>PM: Filter docs with similarity > threshold
    end

    rect rgb(255, 240, 255)
        Note over PM: Step 4: Generate answer
        PM->>O: GPT-4o-mini with context
        Note over O: System: You are a helpful assistant...<br/>Context: [retrieved documents]<br/>Question: What features does Strapi have?
        O-->>PM: Generated answer
    end

    PM-->>S: { answer, sourceDocuments }
    S-->>U: Display answer with sources
```

### RAG Prompt Structure

```
┌─────────────────────────────────────────────────────────────┐
│ SYSTEM PROMPT                                               │
│ You are a helpful assistant. Answer questions based on      │
│ the provided context. If you cannot find the answer in      │
│ the context, say "I cannot find the answer."                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CONTEXT (Retrieved Documents)                               │
│                                                             │
│ Document 1: Strapi is a headless CMS that provides...       │
│ Document 2: Key features include content types...           │
│ Document 3: The plugin system allows extending...           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ USER QUESTION                                               │
│ What features does Strapi have?                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ AI RESPONSE                                                 │
│ Strapi offers several key features including...             │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Sync

### Sync Operations

```mermaid
graph TB
    subgraph "Sync Operations"
        A[Check Status] --> A1[Compare counts]
        A --> A2[Find differences]

        B[Sync from Neon] --> B1[Create missing in Strapi]
        B --> B2[Update changed content]
        B --> B3[Remove orphans - optional]

        C[Recreate All] --> C1[Delete all from Neon]
        C --> C2[Re-embed from Strapi]
    end
```

### Sync Flow

```mermaid
sequenceDiagram
    participant U as User
    participant S as Sync Service
    participant N as Neon DB
    participant DB as Strapi DB

    U->>S: Sync from Neon

    par Fetch from both databases
        S->>N: Get all Neon embeddings
        S->>DB: Get all Strapi embeddings
    end

    S->>S: Compare by documentId

    loop For each Neon embedding
        alt Not in Strapi
            S->>DB: Create entry
        else Content differs
            S->>DB: Update entry
        end
    end

    opt Remove orphans enabled
        loop For each Strapi entry not in Neon
            S->>DB: Delete orphan
        end
    end

    S-->>U: Sync results
```

### Sync Status Response

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

---

## MCP Integration

### What is MCP?

MCP (Model Context Protocol) allows AI assistants like Claude Desktop to interact with external tools and data sources.

### MCP Architecture

```mermaid
graph TB
    subgraph "Claude Desktop"
        A[Claude AI]
        B[MCP Client]
    end

    subgraph "Strapi Plugin"
        C[MCP Endpoint]
        D[MCP Tools]
    end

    subgraph "Available Tools"
        E[rag_query]
        F[semantic_search]
        G[list_embeddings]
        H[get_embedding]
        I[create_embedding]
    end

    A --> B
    B <-->|"JSON-RPC"| C
    C --> D
    D --> E & F & G & H & I
```

### MCP Request/Response Flow

```mermaid
sequenceDiagram
    participant C as Claude Desktop
    participant M as MCP Endpoint
    participant T as Tools Handler
    participant S as Services

    C->>M: POST /api/strapi-content-embeddings/mcp
    Note over M: JSON-RPC request

    M->>T: Route to tool handler

    alt rag_query
        T->>S: queryEmbeddings(question)
        S-->>T: { answer, sources }
    else semantic_search
        T->>S: similaritySearch(query, k)
        S-->>T: Similar documents
    else list_embeddings
        T->>S: getEmbeddings()
        S-->>T: All embeddings
    end

    T-->>M: Tool result
    M-->>C: JSON-RPC response
```

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "strapi-content-embeddings": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-strapi.com/api/strapi-content-embeddings/mcp",
        "--header",
        "Authorization: Bearer YOUR_API_TOKEN"
      ]
    }
  }
}
```

---

## File Structure

```
strapi-content-embeddings/
├── admin/src/                    # Frontend (React)
│   ├── components/custom/        # UI Components
│   │   ├── ChatModal.tsx         # RAG chat interface
│   │   ├── EmbeddingsModal.tsx   # Create from content manager
│   │   ├── EmbeddingsTable.tsx   # List view
│   │   ├── MarkdownEditor.tsx    # Content editor
│   │   └── SyncModal.tsx         # Database sync UI
│   ├── pages/                    # Route pages
│   │   ├── HomePage.tsx          # Main listing
│   │   ├── CreateEmbeddings.tsx  # Create form
│   │   └── EmbeddingDetails.tsx  # Detail view
│   └── utils/api.ts              # API client functions
│
├── server/src/                   # Backend (Node.js)
│   ├── controllers/              # HTTP handlers
│   │   ├── controller.ts         # Main API endpoints
│   │   └── mcp.ts                # MCP protocol handler
│   ├── services/                 # Business logic
│   │   ├── embeddings.ts         # CRUD operations
│   │   └── sync.ts               # Database sync
│   ├── utils/                    # Utilities
│   │   ├── chunking.ts           # Text splitting
│   │   └── preprocessing.ts      # HTML/Markdown stripping
│   ├── plugin-manager.ts         # LangChain/OpenAI/Neon
│   ├── routes/                   # Route definitions
│   └── config/                   # Plugin configuration
│
└── docs/                         # Documentation
    └── ARCHITECTURE.md           # This file
```

---

## Key Technologies

| Technology | Purpose |
|------------|---------|
| **LangChain** | AI/LLM framework for embeddings and RAG |
| **OpenAI** | Embedding models (text-embedding-3-small/large) |
| **Neon PostgreSQL** | Serverless Postgres with pgvector |
| **pgvector** | Vector similarity search extension |
| **Strapi v5** | Headless CMS platform |
| **React** | Admin UI framework |

---

## Summary

```mermaid
graph TB
    subgraph "Input"
        A[User Content]
    end

    subgraph "Processing"
        B[Preprocess] --> C[Chunk if needed]
        C --> D[Generate Embeddings]
    end

    subgraph "Storage"
        E[Strapi DB - Metadata]
        F[Neon DB - Vectors]
    end

    subgraph "Retrieval"
        G[Similarity Search]
        H[RAG Generation]
    end

    subgraph "Output"
        I[Search Results]
        J[AI Answers]
    end

    A --> B
    D --> E & F
    E & F --> G
    G --> H
    G --> I
    H --> J
```

The plugin transforms your Strapi content into a semantic search engine with AI-powered Q&A capabilities, all while maintaining a clean separation between content management (Strapi) and vector operations (Neon).
