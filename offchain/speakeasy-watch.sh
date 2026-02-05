#!/bin/bash
# Speakeasy Watch Wrapper
# 
# This script runs speakeasy in watch mode and handles build failures
# by automatically patching tsconfig.json when needed.
#
# Usage: ./speakeasy-watch.sh

cd "$(dirname "$0")"

# Load API key from .env
if [ -z "$SPEAKEASY_API_KEY" ]; then
    SPEAKEASY_API_KEY="$(grep '^SPEAKEASY_API_KEY=' .env | cut -d= -f2-)"
    export SPEAKEASY_API_KEY
fi

if [ -z "$SPEAKEASY_API_KEY" ]; then
    echo "❌ Error: SPEAKEASY_API_KEY not found in .env"
    exit 1
fi

echo "🚀 Starting Speakeasy in watch mode..."
echo ""
echo "📝 Note: If build fails, run: node scripts/patch-tsconfig.mjs && npm run build"
echo ""

# Run speakeasy in watch mode
./.speakeasy/bin/speakeasy run --watch
