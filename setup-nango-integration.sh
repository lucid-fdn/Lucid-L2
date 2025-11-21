#!/bin/bash

# ============================================
# Nango + n8n Integration Setup Script
# ============================================

set -e  # Exit on error

echo "🚀 Starting Nango + n8n Integration Setup"
echo "=========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Generate secrets
echo ""
echo "📝 Step 1: Generating secrets..."
echo "Please save these values in your .env file:"
echo ""

NANGO_SECRET_KEY=$(openssl rand -hex 32)
NANGO_ENCRYPTION_KEY=$(openssl rand -hex 32)
NANGO_DB_PASSWORD=$(openssl rand -base64 16)

echo "${YELLOW}NANGO_SECRET_KEY=${NC}${NANGO_SECRET_KEY}"
echo "${YELLOW}NANGO_ENCRYPTION_KEY=${NC}${NANGO_ENCRYPTION_KEY}"
echo "${YELLOW}NANGO_DB_PASSWORD=${NC}${NANGO_DB_PASSWORD}"
echo ""

# Step 2: Update .env file
echo "📄 Step 2: Updating .env file..."

cd "$(dirname "$0")/offchain"

if [ ! -f ".env" ]; then
    echo "${RED}Error: .env file not found${NC}"
    exit 1
fi

# Backup existing .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo "${GREEN}✓${NC} Backup created"

# Append Nango configuration if not already present
if ! grep -q "NANGO_SECRET_KEY" .env; then
    cat >> .env << EOF

# ===================================
# Nango Configuration
# ===================================
NANGO_SECRET_KEY=${NANGO_SECRET_KEY}
NANGO_ENCRYPTION_KEY=${NANGO_ENCRYPTION_KEY}
NANGO_DB_USER=nango
NANGO_DB_PASSWORD=${NANGO_DB_PASSWORD}
NANGO_API_URL=http://localhost:3003
NANGO_DASHBOARD_URL=http://localhost:3007
NANGO_CALLBACK_URL=http://localhost:3001/api/oauth/callback

# Redis Configuration (for token caching)
REDIS_URL=redis://localhost:6379

# Rate Limiting
OAUTH_RATE_LIMIT_WINDOW=3600000
OAUTH_RATE_LIMIT_MAX_REQUESTS=300
EOF
    echo "${GREEN}✓${NC} Nango configuration added to .env"
else
    echo "${YELLOW}⚠${NC} Nango configuration already exists in .env"
fi

# Step 3: Install dependencies
echo ""
echo "📦 Step 3: Installing dependencies..."
npm install --save @nangohq/node ioredis
echo "${GREEN}✓${NC} Dependencies installed"

# Step 4: Apply database migration
echo ""
echo "🗄️ Step 4: Applying database migration..."
cd ../infrastructure

if command -v npx &> /dev/null && command -v supabase &> /dev/null; then
    npx supabase db push
    echo "${GREEN}✓${NC} Database migration applied"
else
    echo "${YELLOW}⚠${NC} Supabase CLI not found. Please apply migration manually:"
    echo "   cd infrastructure && npx supabase db push"
fi

# Step 5: Update docker-compose.yml
echo ""
echo "🐳 Step 5: Checking docker-compose.yml..."

if grep -q "nango:" docker-compose.yml; then
    echo "${YELLOW}⚠${NC} Nango service already exists in docker-compose.yml"
else
    echo "${YELLOW}⚠${NC} Please add Nango service to docker-compose.yml manually"
    echo "   See: Lucid-L2/NANGO-N8N-INTEGRATION-GUIDE.md"
fi

# Step 6: Start Nango
echo ""
echo "🚀 Step 6: Starting Nango service..."

if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
    cd $(dirname "$0")/infrastructure
    docker-compose up -d nango
    
    echo "Waiting for Nango to be ready..."
    sleep 10
    
    if curl -f http://localhost:3003/health &> /dev/null; then
        echo "${GREEN}✓${NC} Nango is running"
    else
        echo "${YELLOW}⚠${NC} Nango may still be starting. Check logs with: docker-compose logs nango"
    fi
else
    echo "${YELLOW}⚠${NC} Docker not found. Please start Nango manually:"
    echo "   cd infrastructure && docker-compose up -d nango"
fi

# Step 7: Build backend
echo ""
echo "🔨 Step 7: Building backend..."
cd ../offchain

if [ -f "package.json" ]; then
    npm run build 2>/dev/null || echo "${YELLOW}⚠${NC} Build script not found, skipping..."
    echo "${GREEN}✓${NC} Backend built"
else
    echo "${YELLOW}⚠${NC} package.json not found"
fi

# Summary
echo ""
echo "=========================================="
echo "${GREEN}✅ Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Access Nango Dashboard: ${YELLOW}http://localhost:3007${NC}"
echo "2. Configure OAuth providers (Twitter, Discord, etc.)"
echo "3. Register OAuth callbacks with providers"
echo "4. Test OAuth flow: ${YELLOW}http://localhost:3001/api/oauth/providers${NC}"
echo "5. Import example n8n workflows from: ${YELLOW}Lucid-L2/n8n/workflows/${NC}"
echo ""
echo "Documentation: ${YELLOW}Lucid-L2/NANGO-N8N-INTEGRATION-GUIDE.md${NC}"
echo ""
echo "⚠️  Remember to:"
echo "  - Add Nango service to docker-compose.yml if not done"
echo "  - Configure OAuth providers in Nango Dashboard"
echo "  - Update n8n workflows to use new credential endpoints"
echo ""
