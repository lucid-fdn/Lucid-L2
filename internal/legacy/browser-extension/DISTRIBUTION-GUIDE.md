# Browser Extension Distribution Guide

## Quick Answer

To distribute the extension, you need to create a **ZIP file** containing all the necessary files from the `browser-extension` folder.

## Files to Include

### Required Files (Must Include)
```
manifest.json           # Extension configuration
background.js          # Service worker
content.js             # Content script for ChatGPT capture
popup.html             # Popup UI
popup.js               # Popup logic
popup-styles.css       # Popup styling
sidebar.js             # Sidebar functionality
sidebar-styles.css     # Sidebar styling
reward-system.js       # Reward system logic
auth.html              # Privy authentication page
auth-redirect.js       # Auth redirect handler
privy-api-bridge.js    # Privy API integration
icons/                 # All icon files (*.png)
```

### Optional But Recommended
```
content-simple.js      # Backup content script
injected.js            # Injected script if needed
wallet-connection.js   # Wallet connection helpers
devnet-transaction-handler.js  # Devnet transaction logic
```

### Documentation (Optional for Users)
```
README.md
CHATGPT-CAPTURE-FIX.md
FINAL-SYNC-FIX.md
```

## How to Create Distribution Package

### Method 1: ZIP File (Recommended for Testing)

1. **Navigate to the browser-extension folder**:
   ```bash
   cd Lucid-L2/browser-extension
   ```

2. **Create a ZIP file** with required files:
   ```bash
   zip -r lucid-extension.zip \
     manifest.json \
     background.js \
     content.js \
     popup.html \
     popup.js \
     popup-styles.css \
     sidebar.js \
     sidebar-styles.css \
     reward-system.js \
     auth.html \
     auth-redirect.js \
     privy-api-bridge.js \
     icons/ \
     -x "*.md" "*.txt" "node_modules/*" "src/*" "*.ts" "*.json" "*.lock"
   ```

3. **The resulting file**: `lucid-extension.zip`

### Method 2: Chrome "Pack Extension" (For .crx file)

1. Go to **chrome://extensions/**
2. Enable **Developer mode**
3. Click **"Pack extension"**
4. Select the `browser-extension` folder
5. Click **"Pack Extension"**
6. This creates two files:
   - `browser-extension.crx` (the packed extension)
   - `browser-extension.pem` (private key - KEEP SECRET!)

### Method 3: Chrome Web Store (Public Distribution)

1. Create a ZIP file (Method 1)
2. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
3. Pay one-time $5 developer fee (if first time)
4. Click "New Item"
5. Upload the ZIP file
6. Fill in store listing details
7. Submit for review

## Installation Instructions for Users

### From ZIP File (Development/Testing)

**For Testers:**
1. Download `lucid-extension.zip`
2. Extract to a folder
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked"
6. Select the extracted folder
7. Extension is installed!

**For Quick Distribution:**
Share the ZIP file via:
- Email
- Dropbox/Google Drive
- GitHub releases
- Your own website

### From .crx File

**Warning**: Chrome has security restrictions on .crx files downloaded from outside Chrome Web Store.

Users need to:
1. Download the .crx file
2. Go to `chrome://extensions/`
3. Drag and drop the .crx file onto the page

## Creating the Distribution Package (Script)

Create a simple script to automate packaging:

```bash
#!/bin/bash
# File: package-extension.sh

cd "$(dirname "$0")"

# Remove old package
rm -f lucid-extension.zip

# Create new package
zip -r lucid-extension.zip \
  manifest.json \
  background.js \
  content.js \
  popup.html \
  popup.js \
  popup-styles.css \
  sidebar.js \
  sidebar-styles.css \
  reward-system.js \
  auth.html \
  auth-redirect.js \
  privy-api-bridge.js \
  icons/ \
  README.md \
  -x "*.md" "node_modules/*" "src/*" "*.ts" "tsconfig.*" "package*.json" "vite.config.*"

echo "✅ Extension packaged as lucid-extension.zip"
echo "📦 Ready for distribution!"
```

Make it executable:
```bash
chmod +x package-extension.sh
./package-extension.sh
```

## What NOT to Include

❌ Don't include:
- `node_modules/` (if you have it)
- `src/` (TypeScript source files)
- `*.ts` files
- `tsconfig.json`
- `package.json`, `package-lock.json`
- `vite.config.ts`
- Build tools and configs
- Documentation markdown files (unless you want users to read them)

## Distribution Recommendations

### For Internal Testing
- Share ZIP file directly
- Users load as "unpacked extension"
- Easy to update and iterate

### For Beta Testing
- Pack as .crx file
- Distribute via private link
- More polished than unpacked

### For Public Release
- Publish to Chrome Web Store
- Most trustworthy for users
- Automatic updates
- Better security

## Update Process

When you make changes and want to distribute updates:

1. **Development**: Users reload extension in chrome://extensions/
2. **CRX File**: Create new .crx file with updated version number
3. **Chrome Web Store**: Upload new version (auto-updates for users)

## Version Management

Before distribution, update version in `manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "Lucid-Extension",
  "version": "1.0.1",  // ← Increment this
  ...
}
```

Follow semantic versioning:
- `1.0.0` → `1.0.1` (bug fixes)
- `1.0.0` → `1.1.0` (new features)
- `1.0.0` → `2.0.0` (breaking changes)

## Security Notes

1. **Keep .pem file secret** - This is your extension's private key
2. **Don't include sensitive data** in the ZIP
3. **Review all files** before distribution
4. **Test thoroughly** before public release

## Quick Start for Distribution

**Fastest method right now:**

```bash
cd Lucid-L2/browser-extension
zip -r ../lucid-extension.zip . -x "node_modules/*" "*.md" "src/*" "*.ts" "*.json" "*.lock" "vite.config.ts"
```

This creates `lucid-extension.zip` one level up, ready to share!
