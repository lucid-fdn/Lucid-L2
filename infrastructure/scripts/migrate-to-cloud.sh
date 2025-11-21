#!/bin/bash
# Migration script to run all migrations on Supabase cloud

set -e

SUPABASE_HOST="db.kwihlcnapmkaivijyiif.supabase.co"
SUPABASE_PORT="5432"
SUPABASE_DB="postgres"
SUPABASE_USER="postgres"
SUPABASE_PASSWORD="Tk5JbpMcX!qdEvE"

echo "🚀 Starting migration to Supabase Cloud..."
echo "Target: $SUPABASE_HOST"
echo ""

# Set PGPASSWORD to avoid password prompt
export PGPASSWORD="$SUPABASE_PASSWORD"

echo "📊 Running migrations..."
echo ""

# Run each migration
for migration in \
  "001_oauth_credentials.sql" \
  "20250131_privy_wallets.sql" \
  "20250206_rewards_system.sql" \
  "20250210_nango_integration.sql"
do
  echo "  → Running $migration..."
  psql -h "$SUPABASE_HOST" \
       -p "$SUPABASE_PORT" \
       -U "$SUPABASE_USER" \
       -d "$SUPABASE_DB" \
       -f "Lucid-L2/infrastructure/migrations/$migration" \
       --quiet
  
  if [ $? -eq 0 ]; then
    echo "    ✅ $migration completed"
  else
    echo "    ❌ $migration failed"
    exit 1
  fi
done

echo ""
echo "✅ All migrations completed successfully!"
echo ""
echo "🔍 Verifying tables..."
psql -h "$SUPABASE_HOST" \
     -p "$SUPABASE_PORT" \
     -U "$SUPABASE_USER" \
     -d "$SUPABASE_DB" \
     -c "\dt" \
     --quiet

unset PGPASSWORD
