#!/bin/bash
# Script de packaging pour Chrome Web Store
# Crée un package propre sans fichiers de développement
# Updated: December 2025

set -e

echo "🔧 Building Chrome Web Store package..."
echo ""

# Get version from manifest.json
VERSION=$(grep '"version"' manifest.json | sed 's/.*"version": *"\([^"]*\)".*/\1/')
echo "📋 Version detected: $VERSION"

# Nettoyer ancien package
rm -rf chrome-store-package
rm -f lucid-chrome-store.zip

# Créer structure propre
mkdir -p chrome-store-package

# ============================================
# SECURITY CHECK: Verify no development URLs
# ============================================
echo ""
echo "🔒 Security Check: Scanning for development URLs..."

DEV_URLS_FOUND=0
DEV_URL_PATTERN="http://[0-9]\|http://localhost\|http://127\.0\.0\.1"

# Check core JS files (excluding config.js which has legitimate localnet entries)
for file in background.js content.js popup.js sidebar.js reward-system.js; do
    if [ -f "$file" ]; then
        if grep -q "$DEV_URL_PATTERN" "$file" 2>/dev/null; then
            echo "⚠️  WARNING: Development HTTP URL found in $file"
            grep -n "$DEV_URL_PATTERN" "$file" | head -3
            DEV_URLS_FOUND=1
        fi
    fi
done

# Special check for config.js - verify default environment is production
if [ -f "config.js" ]; then
    DEFAULT_ENV=$(grep "currentEnvironment = " config.js | head -1)
    if echo "$DEFAULT_ENV" | grep -q "localnet"; then
        echo "⚠️  WARNING: config.js default environment is set to 'localnet' (development)"
        DEV_URLS_FOUND=1
    else
        echo "   ✅ config.js default environment: $(echo $DEFAULT_ENV | sed "s/.*'\([^']*\)'.*/\1/")"
    fi
fi

if [ $DEV_URLS_FOUND -eq 1 ]; then
    echo ""
    echo "❌ ERROR: Development configuration detected!"
    echo "   Please ensure default environment is 'devnet' or 'testnet' for production."
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ No development URLs found in core files"
fi

# ============================================
# Copy essential files
# ============================================
echo ""
echo "📁 Copying essential files..."

# Core files
cp manifest.json chrome-store-package/
cp background.js chrome-store-package/
cp content.js chrome-store-package/
cp popup.html chrome-store-package/
cp popup.js chrome-store-package/
cp popup-styles.css chrome-store-package/
cp sidebar.html chrome-store-package/
cp sidebar.js chrome-store-package/
cp sidebar-styles.css chrome-store-package/
cp auth.html chrome-store-package/
cp auth-redirect.js chrome-store-package/
cp config.js chrome-store-package/
cp reward-system.js chrome-store-package/
cp privy-api-bridge.js chrome-store-package/

# Privacy policy (optional but recommended)
if [ -f "privacy-policy.html" ]; then
    cp privacy-policy.html chrome-store-package/
    echo "   ✅ privacy-policy.html included"
fi

# Copier dossiers nécessaires
echo "📂 Copying directories..."
cp -r icons chrome-store-package/

if [ -d "dist" ]; then
    cp -r dist chrome-store-package/
    echo "   ✅ dist/ folder included"
else
    echo "   ⚠️  Warning: dist/ folder not found - run 'npm run build' first"
fi

# ============================================
# Generate user README with dynamic version
# ============================================
cat > chrome-store-package/README.md << EOF
# Lucid AI Memory Extension

Connect your ChatGPT conversations to earn crypto rewards on Lucid L2 blockchain.

## Quick Start

1. Click the extension icon in your browser
2. Connect your Solana wallet via Privy
3. Visit ChatGPT and start chatting
4. Earn mGas tokens automatically

## Features

- 🔐 Secure wallet connection via Privy
- 💬 Automatic ChatGPT conversation capture
- ⚡ Earn mGas tokens for AI interactions
- 💎 Convert mGas to LUCID tokens
- 📊 Track rewards and achievements

## Support

- Website: https://www.lucid.foundation
- Privacy Policy: https://www.lucid.foundation/privacy
- Email: support@lucid.foundation

## Version

$VERSION
EOF

# ============================================
# Create ZIP package
# ============================================
echo ""
echo "📦 Creating ZIP package..."
cd chrome-store-package
zip -r ../lucid-chrome-store.zip . -x "*.DS_Store" -x "*.map" -q
cd ..

# ============================================
# Display results
# ============================================
echo ""
echo "✅ Package created successfully!"
echo "📦 File: lucid-chrome-store.zip"

# Cross-platform file size (works on both Linux and macOS)
if command -v stat &> /dev/null; then
    # Try Linux syntax first, fallback to macOS
    SIZE_BYTES=$(stat -c%s lucid-chrome-store.zip 2>/dev/null || stat -f%z lucid-chrome-store.zip 2>/dev/null || echo "0")
    if [ "$SIZE_BYTES" != "0" ]; then
        SIZE_KB=$((SIZE_BYTES / 1024))
        SIZE_MB=$((SIZE_BYTES / 1024 / 1024))
        if [ $SIZE_MB -gt 0 ]; then
            echo "📊 Size: ${SIZE_MB} MB (${SIZE_KB} KB)"
        else
            echo "📊 Size: ${SIZE_KB} KB"
        fi
    else
        echo "📊 Size: $(ls -lh lucid-chrome-store.zip | awk '{print $5}')"
    fi
fi

# ============================================
# Package contents listing
# ============================================
echo ""
echo "📋 Package contents:"
unzip -l lucid-chrome-store.zip | grep -E "^\s+[0-9]" | awk '{print "   " $4}'

# ============================================
# Verification checks
# ============================================
echo ""
echo "🔍 Verification checks:"

# Check manifest.json
if unzip -l lucid-chrome-store.zip | grep -q "manifest.json"; then
    echo "   ✅ manifest.json present"
else
    echo "   ❌ ERROR: manifest.json MISSING"
    exit 1
fi

# Check icons
ICONS_OK=1
for icon in icon16.png icon32.png icon48.png icon128.png; do
    if ! unzip -l lucid-chrome-store.zip | grep -q "icons/$icon"; then
        echo "   ⚠️  Warning: icons/$icon missing"
        ICONS_OK=0
    fi
done
if [ $ICONS_OK -eq 1 ]; then
    echo "   ✅ All required icons present (16, 32, 48, 128)"
fi

# Check dist/
if unzip -l lucid-chrome-store.zip | grep -q "dist/"; then
    echo "   ✅ dist/ bundle present"
else
    echo "   ❌ ERROR: dist/ folder missing - run 'npm run build' first"
    exit 1
fi

# Check for dev files that shouldn't be included
echo ""
echo "🔒 Checking for excluded development files:"
DEV_FILES_FOUND=0
for pattern in "package.json" "node_modules" "tsconfig" "vite.config" ".map"; do
    if unzip -l lucid-chrome-store.zip | grep -q "$pattern"; then
        echo "   ⚠️  WARNING: $pattern found in package!"
        DEV_FILES_FOUND=1
    fi
done
if [ $DEV_FILES_FOUND -eq 0 ]; then
    echo "   ✅ No development files detected"
fi

# Size check (Chrome limit is 128 MB, warning at 50 MB)
if [ "$SIZE_BYTES" != "0" ] && [ "$SIZE_BYTES" != "" ]; then
    if [ $SIZE_BYTES -gt 134217728 ]; then
        echo ""
        echo "   ❌ ERROR: Package too large (${SIZE_MB} MB > 128 MB Chrome limit)"
        exit 1
    elif [ $SIZE_BYTES -gt 52428800 ]; then
        echo "   ⚠️  Warning: Package is large (${SIZE_MB} MB) - consider optimization"
    else
        echo "   ✅ Size OK (under Chrome's 128 MB limit)"
    fi
fi

# ============================================
# Success message and next steps
# ============================================
echo ""
echo "🎉 Package ready for Chrome Web Store submission!"
echo ""
echo "📝 Next steps:"
echo "   1. Verify Privacy Policy is published: https://www.lucid.foundation/privacy"
echo "   2. Prepare 3-5 screenshots (1280x800 or 640x400)"
echo "   3. Go to: https://chrome.google.com/webstore/devconsole/"
echo "   4. Upload: lucid-chrome-store.zip"
echo "   5. Fill in listing information"
echo ""
echo "📄 Package location: $(pwd)/lucid-chrome-store.zip"
echo ""
