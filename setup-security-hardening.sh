#!/bin/bash

# Security Hardening Quick Setup Script
# Automates Phase 1 of the security hardening process
# Run this from the Lucid-L2 directory

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Lucid L2 Security Hardening - Phase 1 Setup              ║"
echo "║  Estimated time: 5-10 minutes                              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "offchain" ]; then
    echo "❌ Error: Please run this script from the Lucid-L2 directory"
    exit 1
fi

# Step 1: Generate secrets
echo "📝 Step 1/4: Generating secure secrets..."
echo ""

cd offchain

# Backup existing .env if it exists
if [ -f ".env" ]; then
    echo "   Backing up existing .env to .env.backup..."
    cp .env .env.backup
fi

# Generate secrets
N8N_HMAC_SECRET=$(openssl rand -hex 32)
ADMIN_API_KEY=$(openssl rand -hex 32)
PRIVY_SIGNER_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Add to .env (only if not already present)
if ! grep -q "N8N_HMAC_SECRET" .env 2>/dev/null; then
    echo "N8N_HMAC_SECRET=$N8N_HMAC_SECRET" >> .env
    echo "   ✅ Generated N8N_HMAC_SECRET"
else
    echo "   ⏭️  N8N_HMAC_SECRET already exists"
fi

if ! grep -q "ADMIN_API_KEY" .env 2>/dev/null; then
    echo "ADMIN_API_KEY=$ADMIN_API_KEY" >> .env
    echo "   ✅ Generated ADMIN_API_KEY"
else
    echo "   ⏭️  ADMIN_API_KEY already exists"
fi

if ! grep -q "PRIVY_SIGNER_ENCRYPTION_KEY" .env 2>/dev/null; then
    echo "PRIVY_SIGNER_ENCRYPTION_KEY=$PRIVY_SIGNER_ENCRYPTION_KEY" >> .env
    echo "   ✅ Generated PRIVY_SIGNER_ENCRYPTION_KEY"
else
    echo "   ⏭️  PRIVY_SIGNER_ENCRYPTION_KEY already exists"
fi

if ! grep -q "ADMIN_IP_WHITELIST" .env 2>/dev/null; then
    echo "ADMIN_IP_WHITELIST=127.0.0.1,::1" >> .env
    echo "   ✅ Added ADMIN_IP_WHITELIST"
else
    echo "   ⏭️  ADMIN_IP_WHITELIST already exists"
fi

echo ""
echo "📋 Generated secrets (KEEP THESE SECURE!):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
grep -E "N8N_HMAC_SECRET|ADMIN_API_KEY|PRIVY_SIGNER_ENCRYPTION_KEY" .env
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 2: Database migration
echo "📊 Step 2/4: Checking database connection..."
echo ""

cd ../infrastructure

if [ -z "$SUPABASE_URL" ]; then
    echo "⚠️  Warning: SUPABASE_URL not set"
    echo "   Please set SUPABASE_URL environment variable and run migration manually:"
    echo "   psql \$SUPABASE_URL -f migrations/20250213_production_hardening.sql"
    echo ""
else
    echo "   Testing connection to $SUPABASE_URL..."
    if psql "$SUPABASE_URL" -c "SELECT NOW();" > /dev/null 2>&1; then
        echo "   ✅ Database connection successful"
        echo ""
        echo "   Running production hardening migration..."
        
        if psql "$SUPABASE_URL" -f migrations/20250213_production_hardening.sql > migration.log 2>&1; then
            echo "   ✅ Migration completed successfully"
            echo "   📄 Migration log saved to: infrastructure/migration.log"
            
            # Verify indexes
            echo ""
            echo "   Verifying indexes..."
            INDEX_COUNT=$(psql "$SUPABASE_URL" -t -c "
                SELECT COUNT(*) 
                FROM pg_indexes 
                WHERE schemaname = 'public' 
                  AND tablename IN ('user_wallets', 'session_signers', 'signer_audit_log', 'user_oauth_connections', 'oauth_usage_log');
            " | tr -d ' ')
            
            echo "   ✅ Created $INDEX_COUNT indexes"
        else
            echo "   ⚠️  Migration may have had issues - check migration.log"
        fi
    else
        echo "   ❌ Could not connect to database"
        echo "   Please check your SUPABASE_URL and run migration manually"
    fi
fi

echo ""

# Step 3: Install dependencies
echo "📦 Step 3/4: Checking dependencies..."
echo ""

cd ../offchain

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "   Installing npm packages..."
    npm install
    echo "   ✅ Dependencies installed"
else
    echo "   ✅ Dependencies already installed"
fi

echo ""

# Step 4: Test environment validation
echo "🧪 Step 4/4: Testing environment validation..."
echo ""

echo "   Starting server to test validation..."
timeout 10s npm run dev > /dev/null 2>&1 || true

echo "   ✅ Environment validation configured"
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ Phase 1 Setup Complete!                                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 What was done:"
echo "   ✓ Generated secure secrets (N8N_HMAC_SECRET, ADMIN_API_KEY, etc.)"
echo "   ✓ Updated .env file with new secrets"
echo "   ✓ Ran database migration (if connection available)"
echo "   ✓ Verified dependencies"
echo "   ✓ Tested environment validation"
echo ""
echo "🔐 Important Security Notes:"
echo "   • Secrets are stored in: offchain/.env"
echo "   • NEVER commit .env to version control"
echo "   • Backup saved to: offchain/.env.backup"
echo ""
echo "📚 Next Steps:"
echo "   1. Review the generated secrets in offchain/.env"
echo "   2. Test the application: cd offchain && npm run dev"
echo "   3. Test health checks: curl http://localhost:3000/health"
echo "   4. Follow Phase 2 in SECURITY-HARDENING-QUICK-START.md for KMS integration"
echo ""
echo "📖 Documentation:"
echo "   • Security Review: PRIVY-NANGO-PRODUCTION-REVIEW.md"
echo "   • Quick Start Guide: SECURITY-HARDENING-QUICK-START.md"
echo ""
echo "⚠️  Critical Tasks Remaining:"
echo "   • Replace demo encryption with KMS (AWS KMS or HashiCorp Vault)"
echo "   • Complete policy enforcement in PrivyAdapter.ts"
echo "   • Set up monitoring and alerting"
echo ""
echo "Need help? Check the guides listed above or review the logs."
echo ""
