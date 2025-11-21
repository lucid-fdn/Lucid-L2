#!/bin/bash

# Production Hardening Database Migration
# For Supabase Cloud
# Run this from the Lucid-L2 directory

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Production Hardening Database Migration                  ║"
echo "║  Supabase Cloud                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -d "infrastructure/migrations" ]; then
    echo "❌ Error: Please run this script from the Lucid-L2 directory"
    exit 1
fi

# Load environment from offchain/.env
if [ -f "offchain/.env" ]; then
    echo "📝 Loading environment from offchain/.env..."
    set -a
    source offchain/.env
    set +a
    echo "   ✅ Environment loaded"
else
    echo "❌ Error: offchain/.env not found"
    exit 1
fi

# Check if SUPABASE_URL is set
if [ -z "$SUPABASE_URL" ]; then
    echo ""
    echo "❌ Error: SUPABASE_URL not set in offchain/.env"
    echo ""
    echo "   Please add your Supabase connection string to offchain/.env:"
    echo "   SUPABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
    echo ""
    echo "   Get it from: Supabase Dashboard > Settings > Database > Connection string"
    echo ""
    exit 1
fi

echo ""
echo "🌐 Supabase Connection Details:"
echo "   URL: ${SUPABASE_URL:0:50}..."
echo ""

# Test connection
echo "🔌 Testing connection..."
if psql "$SUPABASE_URL" -c "SELECT NOW();" > /dev/null 2>&1; then
    echo "   ✅ Connection successful"
else
    echo ""
    echo "❌ Error: Could not connect to Supabase"
    echo ""
    echo "   Troubleshooting:"
    echo "   1. Check your connection string in offchain/.env"
    echo "   2. Verify password is correct"
    echo "   3. Check if IP is whitelisted in Supabase Dashboard"
    echo "   4. Try using the Supabase Dashboard SQL Editor instead"
    echo ""
    echo "   📚 See: SUPABASE-CLOUD-MIGRATION-GUIDE.md for alternatives"
    exit 1
fi

echo ""
echo "📊 Running production hardening migration..."
echo ""

# Run the migration
if psql "$SUPABASE_URL" -f infrastructure/migrations/20250213_production_hardening.sql > infrastructure/migration-output.log 2>&1; then
    echo "   ✅ Migration completed successfully!"
    echo ""
    
    # Verify indexes
    echo "🔍 Verifying indexes..."
    INDEX_COUNT=$(psql "$SUPABASE_URL" -t -c "
        SELECT COUNT(*) 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
          AND tablename IN ('user_wallets', 'session_signers', 'signer_audit_log', 
                            'user_oauth_connections', 'oauth_usage_log', 'oauth_states');
    " | tr -d ' ')
    
    echo "   ✅ Created/verified $INDEX_COUNT indexes"
    echo ""
    
    # Verify views
    echo "🔍 Verifying views..."
    VIEW_COUNT=$(psql "$SUPABASE_URL" -t -c "
        SELECT COUNT(*) 
        FROM information_schema.views 
        WHERE table_schema = 'public' 
          AND table_name IN ('recent_failed_transactions', 'oauth_connection_health', 'system_health_summary');
    " | tr -d ' ')
    
    echo "   ✅ Created/verified $VIEW_COUNT monitoring views"
    echo ""
    
    # Verify functions
    echo "🔍 Verifying cleanup functions..."
    FUNC_COUNT=$(psql "$SUPABASE_URL" -t -c "
        SELECT COUNT(*) 
        FROM information_schema.routines 
        WHERE routine_schema = 'public' 
          AND routine_name IN ('cleanup_expired_signers', 'cleanup_old_audit_logs', 
                               'cleanup_expired_oauth_states', 'refresh_user_wallet_stats');
    " | tr -d ' ')
    
    echo "   ✅ Created/verified $FUNC_COUNT cleanup functions"
    echo ""
    
    # Test system health view
    echo "🏥 Testing system health view..."
    if psql "$SUPABASE_URL" -c "SELECT * FROM system_health_summary;" > /dev/null 2>&1; then
        echo "   ✅ System health view is working"
    else
        echo "   ⚠️  System health view may need data"
    fi
    
else
    echo "   ❌ Migration failed!"
    echo ""
    echo "   📄 Check the log file: infrastructure/migration-output.log"
    echo ""
    cat infrastructure/migration-output.log
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ Database Migration Complete!                           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Summary:"
echo "   • $INDEX_COUNT performance indexes created"
echo "   • $VIEW_COUNT monitoring views created"
echo "   • $FUNC_COUNT cleanup functions created"
echo "   • Materialized view for analytics (user_wallet_stats)"
echo ""
echo "📋 What's Available Now:"
echo ""
echo "   Monitoring Views:"
echo "   • system_health_summary - Real-time health metrics"
echo "   • recent_failed_transactions - Last 24h failures"
echo "   • oauth_connection_health - OAuth connection status"
echo "   • user_wallet_stats - User statistics (materialized)"
echo ""
echo "   Cleanup Functions:"
echo "   • cleanup_expired_signers() - Remove old signers"
echo "   • cleanup_old_audit_logs() - Archive logs > 90 days"
echo "   • cleanup_expired_oauth_states() - Remove expired states"
echo "   • refresh_user_wallet_stats() - Update analytics view"
echo ""
echo "🔧 Next Steps:"
echo ""
echo "   1. Set up pg_cron jobs (optional but recommended):"
echo "      • Go to Supabase Dashboard > Database > Extensions"
echo "      • Enable 'pg_cron' extension"
echo "      • See: SUPABASE-CLOUD-MIGRATION-GUIDE.md for cron job setup"
echo ""
echo "   2. Test health check endpoints:"
echo "      cd offchain && npm run dev"
echo "      curl http://localhost:3000/health/database"
echo ""
echo "   3. View system health in Supabase Dashboard:"
echo "      SQL Editor > Run: SELECT * FROM system_health_summary;"
echo ""
echo "📄 Full log saved to: infrastructure/migration-output.log"
echo ""
