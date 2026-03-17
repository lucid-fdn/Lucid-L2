#!/bin/bash
# Run Reward System Migration on Docker Supabase
# This script runs the reward system migration on the dockerized Supabase PostgreSQL database

set -e

echo "🗄️  Running Reward System Migration..."
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$(dirname "$SCRIPT_DIR")/migrations"
MIGRATION_FILE="$MIGRATIONS_DIR/20250206_rewards_system.sql"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}❌ Migration file not found: $MIGRATION_FILE${NC}"
    exit 1
fi

echo "✅ Migration file found: 20250206_rewards_system.sql"
echo ""

# Check if Supabase container is running
if ! docker ps | grep -q lucid-supabase-db; then
    echo -e "${RED}❌ Supabase database container is not running${NC}"
    echo "Start it with: cd infrastructure && docker-compose up -d supabase-db"
    exit 1
fi

echo "✅ Supabase database container is running"
echo ""

# Run the migration
echo "🚀 Executing migration..."
echo ""

docker exec -i lucid-supabase-db psql -U postgres -d postgres < "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ Migration completed successfully!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "📊 Verifying tables..."
    docker exec -i lucid-supabase-db psql -U postgres -d postgres -c "\dt" | grep -E "users|rewards|conversations|reward_transactions|user_achievements|mgas_conversions"
    echo ""
    echo "✅ Reward system tables created:"
    echo "   • users"
    echo "   • rewards"
    echo "   • conversations"
    echo "   • reward_transactions"
    echo "   • user_achievements"
    echo "   • mgas_conversions"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Start backend: cd offchain && npm run dev"
    echo "   2. Test API: curl http://localhost:3000/api/rewards/stats"
    echo "   3. Load extension in Chrome"
    echo ""
else
    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}❌ Migration failed!${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Check the error messages above."
    echo "You can also run the migration manually with:"
    echo "docker exec -i lucid-supabase-db psql -U postgres -d postgres < $MIGRATION_FILE"
    echo ""
    exit 1
fi
