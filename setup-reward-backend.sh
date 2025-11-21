#!/bin/bash
# Lucid L2 Reward System Backend Setup Script

set -e

echo "🚀 Setting up Lucid L2 Reward System Backend..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check if .env exists
if [ ! -f "offchain/.env" ]; then
    echo -e "${RED}❌ Error: offchain/.env not found${NC}"
    echo "Please create offchain/.env with required variables:"
    echo "  SUPABASE_URL=https://your-project.supabase.co"
    echo "  SUPABASE_SERVICE_KEY=your-service-key"
    exit 1
fi

# Check if Supabase credentials are set
source offchain/.env
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo -e "${RED}❌ Error: SUPABASE_URL or SUPABASE_SERVICE_KEY not set in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Environment variables configured${NC}"

# Install dependencies
echo ""
echo "📦 Installing backend dependencies..."
cd offchain

if ! npm list @supabase/supabase-js &>/dev/null; then
    npm install @supabase/supabase-js
    echo -e "${GREEN}✅ Installed @supabase/supabase-js${NC}"
else
    echo -e "${GREEN}✅ @supabase/supabase-js already installed${NC}"
fi

cd ..

# Database migration
echo ""
echo "🗄️  Running database migration..."
echo -e "${YELLOW}⚠️  This requires psql and database credentials${NC}"

read -p "Do you want to run the database migration now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter database host (e.g., db.xxx.supabase.co): " DB_HOST
    read -p "Enter database name (default: postgres): " DB_NAME
    DB_NAME=${DB_NAME:-postgres}
    
    echo "Running migration..."
    psql -h "$DB_HOST" -U postgres -d "$DB_NAME" -f infrastructure/migrations/20250206_rewards_system.sql
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Database migration completed${NC}"
    else
        echo -e "${RED}❌ Database migration failed${NC}"
        echo "You can run it manually later with:"
        echo "psql -h $DB_HOST -U postgres -d $DB_NAME -f infrastructure/migrations/20250206_rewards_system.sql"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping database migration${NC}"
    echo "Run it manually later with:"
    echo "psql -h your-host -U postgres -d your-db -f infrastructure/migrations/20250206_rewards_system.sql"
fi

# Test API endpoints
echo ""
echo "🧪 Testing API endpoints..."
echo "Starting backend server for testing..."

cd offchain
npm run dev &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Test health endpoint
echo "Testing system stats endpoint..."
STATS_RESPONSE=$(curl -s http://localhost:3000/api/rewards/stats)

if echo "$STATS_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ API is responding correctly${NC}"
    echo "Response: $STATS_RESPONSE"
else
    echo -e "${RED}❌ API test failed${NC}"
    echo "Response: $STATS_RESPONSE"
fi

# Stop test server
kill $SERVER_PID 2>/dev/null || true

cd ..

# Generate test command
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📚 Next Steps:"
echo ""
echo "1. Start the backend server:"
echo "   cd offchain && npm run dev"
echo ""
echo "2. Test the API:"
echo "   curl -X POST http://localhost:3000/api/rewards/process-conversation \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"userId\": \"test\", \"messageType\": \"user\", \"content\": \"test\", \"inputTokens\": 10}'"
echo ""
echo "3. Load the browser extension:"
echo "   - Open chrome://extensions/"
echo "   - Enable Developer mode"
echo "   - Click 'Load unpacked'"
echo "   - Select: $(pwd)/browser-extension"
echo ""
echo "4. Test end-to-end:"
echo "   - Authenticate with Privy in extension"
echo "   - Visit https://chat.openai.com"
echo "   - Send a message"
echo "   - Check extension popup for rewards"
echo ""
echo "📖 Documentation:"
echo "   - Architecture: BROWSER-EXTENSION-BACKEND-INTEGRATION.md"
echo "   - Testing Guide: TESTING-BACKEND-REWARD-INTEGRATION.md"
echo ""
echo "🎉 Happy testing!"
