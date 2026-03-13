#!/bin/bash

# =============================================================================
# Lucid OAuth Infrastructure - Key Generation Script
# =============================================================================
# This script generates secure keys for the OAuth infrastructure
#
# Usage:
#   chmod +x scripts/generate-keys.sh
#   ./scripts/generate-keys.sh
# =============================================================================

set -e

echo "🔐 Lucid OAuth - Generating Secure Keys"
echo "========================================"
echo ""

# Check if openssl is installed
if ! command -v openssl &> /dev/null; then
    echo "❌ Error: openssl is not installed"
    echo "   Install it with: sudo apt install openssl (Ubuntu/Debian)"
    exit 1
fi

# Generate secure random keys
echo "📝 Generating secure keys..."
echo ""

DB_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
NANGO_SECRET=$(openssl rand -hex 32)

echo "✅ Keys generated successfully!"
echo ""
echo "========================================"
echo "Keys ready (values hidden for security)."
echo "Use the write-to-file option below to save them."
echo "========================================"
echo ""

# Generate Supabase JWT tokens
echo "📝 Generating Supabase JWT tokens..."
echo ""

# Function to generate JWT
generate_jwt() {
    local role=$1
    local secret=$2
    local header='{"alg":"HS256","typ":"JWT"}'
    local payload="{\"iss\":\"supabase-local\",\"role\":\"$role\",\"exp\":1983812996}"
    
    # Base64 encode (URL-safe)
    local header_b64=$(echo -n "$header" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
    local payload_b64=$(echo -n "$payload" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
    
    # Create signature
    local signature=$(echo -n "$header_b64.$payload_b64" | openssl dgst -sha256 -hmac "$secret" -binary | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
    
    echo "$header_b64.$payload_b64.$signature"
}

ANON_KEY=$(generate_jwt "anon" "$JWT_SECRET")
SERVICE_KEY=$(generate_jwt "service_role" "$JWT_SECRET")

echo "✅ JWT tokens generated!"
echo ""

# Option to write to .env file
read -p "💾 Write these values to infrastructure/.env? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f "../.env" ]; then
        echo "⚠️  .env file already exists!"
        read -p "   Overwrite? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "❌ Cancelled. Keys not written to file."
            exit 0
        fi
    fi
    
    # Copy example and update with generated values
    cp ../.env.example ../.env
    
    # Update values in .env (macOS and Linux compatible)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|SUPABASE_DB_PASSWORD=.*|SUPABASE_DB_PASSWORD=$DB_PASSWORD|" ../.env
        sed -i '' "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" ../.env
        sed -i '' "s|NANGO_SECRET_KEY=.*|NANGO_SECRET_KEY=$NANGO_SECRET|" ../.env
        sed -i '' "s|SUPABASE_ANON_KEY=.*|SUPABASE_ANON_KEY=$ANON_KEY|" ../.env
        sed -i '' "s|SUPABASE_SERVICE_KEY=.*|SUPABASE_SERVICE_KEY=$SERVICE_KEY|" ../.env
    else
        # Linux
        sed -i "s|SUPABASE_DB_PASSWORD=.*|SUPABASE_DB_PASSWORD=$DB_PASSWORD|" ../.env
        sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" ../.env
        sed -i "s|NANGO_SECRET_KEY=.*|NANGO_SECRET_KEY=$NANGO_SECRET|" ../.env
        sed -i "s|SUPABASE_ANON_KEY=.*|SUPABASE_ANON_KEY=$ANON_KEY|" ../.env
        sed -i "s|SUPABASE_SERVICE_KEY=.*|SUPABASE_SERVICE_KEY=$SERVICE_KEY|" ../.env
    fi
    
    echo "✅ Keys written to infrastructure/.env"
    echo ""
    echo "⚠️  IMPORTANT: Don't forget to also set:"
    echo "   - PRIVY_APP_ID (from https://dashboard.privy.io)"
    echo "   - PRIVY_APP_SECRET (from https://dashboard.privy.io)"
    echo "   - FRONTEND_APP_URL (your frontend application URL)"
    echo ""
else
    echo "ℹ️  Keys not written to file. Copy them manually."
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update remaining values in infrastructure/.env"
echo "2. Run: cd infrastructure && docker-compose up -d"
echo "3. Access Supabase Studio at: http://localhost:3010"
echo "4. Access Nango at: http://localhost:3003"
echo ""
