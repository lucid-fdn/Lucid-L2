#!/bin/bash
# Speakeasy Build Wrapper Script
#
# This script handles the Speakeasy SDK generation workflow while preserving
# custom backend code compatibility.
#
# Steps:
# 1. Run Speakeasy generation (without compile)
# 2. Patch tsconfig.json to exclude custom code
# 3. Patch package.json to include the patch step
# 4. Run the build manually
#
# Usage: ./scripts/speakeasy-build.sh

# Don't use set -e because we expect Speakeasy run to fail on compile
# We'll handle errors manually

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🚀 Starting Speakeasy SDK generation with custom code compatibility..."

# Step 1: Run Speakeasy run (will likely fail on compile, but that's OK - generation happens first)
echo ""
echo "📦 Step 1: Running Speakeasy SDK generation..."
if [ -z "$SPEAKEASY_API_KEY" ]; then
    SPEAKEASY_API_KEY="$(grep '^SPEAKEASY_API_KEY=' .env | cut -d= -f2-)"
fi

if [ -z "$SPEAKEASY_API_KEY" ]; then
    echo "❌ Error: SPEAKEASY_API_KEY not found. Set it in .env or as environment variable."
    exit 1
fi

# Run speakeasy - it may fail on compile step, which is expected
# The generation happens before compile, so files will be updated
echo "   (Note: Compile errors are expected and will be fixed in subsequent steps)"
SPEAKEASY_API_KEY="$SPEAKEASY_API_KEY" ./.speakeasy/bin/speakeasy run 2>&1 || {
    echo "⚠️ Speakeasy run completed with errors (expected due to custom code conflicts)"
}

# Step 2: Patch tsconfig.json to exclude custom code
echo ""
echo "📝 Step 2: Patching tsconfig.json..."
node scripts/patch-tsconfig.mjs

# Step 3: Patch package.json to include the patch step in build
echo ""
echo "📝 Step 3: Ensuring package.json has patch step..."
# Read current package.json and add patch step if not present
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Add patch step to build scripts if not present
const patchCmd = 'node scripts/patch-tsconfig.mjs && ';

if (pkg.scripts.build && !pkg.scripts.build.includes('patch-tsconfig')) {
  // Insert patch before tsc
  pkg.scripts.build = pkg.scripts.build.replace('&& tsc', '&& ' + patchCmd.trim() + ' tsc');
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log('  Added patch step to build script');
} else {
  console.log('  Build script already has patch step');
}

if (pkg.scripts['mcpb:build'] && !pkg.scripts['mcpb:build'].includes('patch-tsconfig')) {
  pkg.scripts['mcpb:build'] = pkg.scripts['mcpb:build'].replace('&& tsc', '&& ' + patchCmd.trim() + ' tsc');
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log('  Added patch step to mcpb:build script');
}
"

# Step 4: Run the build
echo ""
echo "🔨 Step 4: Building SDK..."
npm run build

echo ""
echo "✅ Speakeasy SDK generation complete!"
echo ""
echo "Note: Custom backend code directories are excluded from the SDK build."
echo "      Use tsconfig.custom.json if you need to compile custom code separately."
