#!/bin/bash

# Content Embeddings - Database Setup Script
# This script sets up the Neon database for RAG with pgvector

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="$SCRIPT_DIR/setup-db.sql"

# Check if connection string is provided
if [ -z "$1" ]; then
  echo "Usage: ./setup-db.sh <neon-connection-string>"
  echo ""
  echo "Example:"
  echo "  ./setup-db.sh 'postgresql://user:pass@host/db?sslmode=require'"
  echo ""
  echo "Or set NEON_CONNECTION_STRING environment variable:"
  echo "  export NEON_CONNECTION_STRING='postgresql://...'"
  echo "  ./setup-db.sh"
  exit 1
fi

CONNECTION_STRING="${1:-$NEON_CONNECTION_STRING}"

echo "Setting up database for Content Embeddings plugin..."
echo ""

# Run the SQL script
psql "$CONNECTION_STRING" -f "$SQL_FILE"

echo ""
echo "Database setup complete!"
echo ""
echo "Next steps:"
echo "1. Add the following to your Strapi config/plugins.js:"
echo ""
echo "   module.exports = ({ env }) => ({"
echo "     'content-embeddings': {"
echo "       enabled: true,"
echo "       config: {"
echo "         openAIApiKey: env('OPENAI_API_KEY'),"
echo "         neonConnectionString: env('NEON_CONNECTION_STRING'),"
echo "       },"
echo "     },"
echo "   });"
echo ""
echo "2. Set environment variables in your .env file:"
echo "   OPENAI_API_KEY=sk-..."
echo "   NEON_CONNECTION_STRING=postgresql://..."
