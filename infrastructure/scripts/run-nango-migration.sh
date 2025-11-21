#!/bin/bash

# ============================================
# Nango Database Migration Script
# ============================================

set -e

echo "🗄️  Applying Nango database migration..."

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Check if PostgreSQL container is running
if ! docker compose ps supabase-db | grep -q "Up"; then
    echo -e "${RED}❌ PostgreSQL container is not running${NC}"
    echo "Start it with: docker compose up -d supabase-db"
    exit 1
fi

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
INFRASTRUCTURE_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
MIGRATIONS_DIR="$INFRASTRUCTURE_DIR/migrations"
ENV_FILE="$INFRASTRUCTURE_DIR/.env"

# Load environment variables if .env exists (safely, ignoring comments)
if [ -f "$ENV_FILE" ]; then
    echo "Loading environment from $ENV_FILE"
    export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)
fi

# Check for required password
if [ -z "$SUPABASE_DB_PASSWORD" ]; then
    echo -e "${RED}❌ SUPABASE_DB_PASSWORD not found${NC}"
    echo "Please set it in $ENV_FILE"
    exit 1
fi

# Apply migration using docker compose exec
echo "Applying migration to PostgreSQL container..."

docker compose exec -T supabase-db psql -U postgres -d postgres << 'EOF'
-- Check if tables already exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'oauth_states') THEN
        RAISE NOTICE 'Nango tables already exist, skipping migration';
    ELSE
        RAISE NOTICE 'Creating Nango tables...';
    END IF;
END $$;
EOF

# Run the actual migration
docker compose exec -T supabase-db psql -U postgres -d postgres < "$MIGRATIONS_DIR/20250210_nango_integration.sql"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migration applied successfully${NC}"
    
    # Verify tables were created
    echo ""
    echo "Verifying tables..."
    docker compose exec -T supabase-db psql -U postgres -d postgres -c "\dt oauth*"
    
    echo ""
    echo -e "${GREEN}✅ Nango database setup complete!${NC}"
else
    echo -e "${RED}❌ Migration failed${NC}"
    exit 1
fi
