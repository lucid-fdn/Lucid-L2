#!/bin/bash

# Diagnostic and Fix Script for Supabase Database Connection Issues
# This script will diagnose and fix password authentication problems

set -e

echo "🔍 Supabase Database Connection Diagnostic"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f .env ]; then
    source .env
    echo -e "${GREEN}✓${NC} Found .env file"
else
    echo -e "${RED}✗${NC} .env file not found!"
    exit 1
fi

echo ""
echo "📊 Current Configuration:"
echo "------------------------"
echo "Database Password: ${SUPABASE_DB_PASSWORD:0:10}..."
echo "JWT Secret: ${JWT_SECRET:0:10}..."
echo ""

echo "🐳 Docker Container Status:"
echo "-------------------------"
docker compose ps
echo ""

echo "📝 Checking PostgREST Logs:"
echo "-------------------------"
docker logs lucid-supabase-rest --tail 10 2>&1 | grep -i "password\|error" || true
echo ""

echo "🔍 Root Cause Analysis:"
echo "---------------------"
echo -e "${YELLOW}The PostgREST container cannot authenticate with the database.${NC}"
echo "This usually happens when:"
echo "  1. The database volume was created with a different password"
echo "  2. The .env file was updated after containers were started"
echo ""

echo "💡 Recommended Solution:"
echo "----------------------"
echo "We need to recreate the database with the correct password."
echo ""
echo -e "${YELLOW}⚠️  WARNING: This will delete all existing data!${NC}"
echo ""
read -p "Do you want to proceed with the fix? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Operation cancelled."
    exit 0
fi

echo ""
echo "🔧 Applying Fix:"
echo "--------------"

# Step 1: Stop all containers
echo "1. Stopping all containers..."
docker compose down
echo -e "${GREEN}✓${NC} Containers stopped"
echo ""

# Step 2: Remove database volume
echo "2. Removing old database volume..."
docker volume rm lucid-oauth-network_supabase_db_data 2>/dev/null || docker volume rm infrastructure_supabase_db_data 2>/dev/null || echo "No volume found to remove"
echo -e "${GREEN}✓${NC} Database volume removed"
echo ""

# Step 3: Start containers
echo "3. Starting containers with correct password..."
docker compose up -d
echo -e "${GREEN}✓${NC} Containers started"
echo ""

# Step 4: Wait for database to be ready
echo "4. Waiting for database to initialize (30 seconds)..."
sleep 30
echo ""

# Step 5: Check if PostgREST is now running
echo "5. Checking PostgREST status..."
if docker ps --filter "name=lucid-supabase-rest" --filter "status=running" | grep -q lucid-supabase-rest; then
    echo -e "${GREEN}✓${NC} PostgREST is running!"
else
    echo -e "${YELLOW}⚠${NC} PostgREST is still starting, checking logs..."
    docker logs lucid-supabase-rest --tail 20
fi
echo ""

# Step 6: Run migrations if they exist
echo "6. Checking for migrations..."
if [ -d "migrations" ]; then
    echo "Found migrations directory. You may need to run migrations manually:"
    echo "  ./scripts/run-migrations.sh"
else
    echo "No migrations directory found."
fi
echo ""

echo "✨ Fix Complete!"
echo "--------------"
echo ""
echo "📋 Next Steps:"
echo "1. Wait 30-60 seconds for all services to fully initialize"
echo "2. Run the connection test:"
echo "   node test-supabase-connection.js localhost"
echo ""
echo "3. If test passes, update your connection guide to use your server IP"
echo ""
echo "4. Run any pending migrations to set up your database schema"
echo ""

echo "🔒 Security Reminder:"
echo "For production, remember to:"
echo "  - Generate new JWT secrets"
echo "  - Update API keys with proper expiration"
echo "  - Set up SSL/TLS"
echo "  - Configure firewall rules"
