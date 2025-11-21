#!/bin/bash

# Simple Database Password Fix Script
# This script fixes the password authentication issue by recreating the database

set -e

echo "🔧 Supabase Database Password Fix"
echo "================================="
echo ""
echo "This script will fix the password authentication issue by:"
echo "1. Stopping all containers"
echo "2. Removing the old database volume"
echo "3. Restarting containers with the correct password from .env"
echo ""
echo "⚠️  WARNING: This will delete all existing database data!"
echo ""
read -p "Do you want to proceed? Type 'yes' to continue: " -r
echo ""

if [[ ! $REPLY == "yes" ]]; then
    echo "Operation cancelled."
    exit 0
fi

echo ""
echo "Step 1: Stopping containers..."
docker compose down
echo "✓ Containers stopped"
echo ""

echo "Step 2: Removing database volume..."
docker volume ls | grep -q "supabase_db_data" && \
  docker volume rm $(docker volume ls -q | grep "supabase_db_data") && \
  echo "✓ Database volume removed" || \
  echo "✓ No database volume found"
echo ""

echo "Step 3: Starting containers..."
docker compose up -d
echo "✓ Containers starting..."
echo ""

echo "Step 4: Waiting for database to initialize (45 seconds)..."
sleep 45
echo ""

echo "Step 5: Checking container status..."
docker compose ps
echo ""

echo "Step 6: Checking PostgREST logs..."
echo "-----------------------------------"
docker logs lucid-supabase-rest --tail 20
echo ""

echo "✨ Fix complete!"
echo ""
echo"📋 Next Steps:"
echo "1. Wait another 30 seconds for services to fully stabilize"
echo "2. Run: node test-supabase-connection.js localhost"
echo "3. If successful, your API should now be accessible"
echo ""
echo "If you still see errors, check:"
echo "   docker logs lucid-supabase-rest"
echo "   docker logs lucid-supabase-db"
