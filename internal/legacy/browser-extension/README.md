# Lucid L2™ Browser Extension

A Chrome browser extension that enables users to earn mGas tokens by interacting with AI models and processing thoughts through the Lucid L2™ network.

## 🎯 Overview

The Lucid L2™ Browser Extension seamlessly integrates with ChatGPT and other AI platforms, allowing users to:
- Connect Solana wallets via Privy authentication
- Process AI conversations and earn mGas rewards
- Track daily progress and maintain streaks
- Convert mGas to $LUCID tokens
- View transaction history and achievements

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- Chrome/Chromium browser
- Lucid L2 API server running (default: http://localhost:3001)

### Installation

1. **Install Dependencies**
```bash
cd browser-extension
npm install
```

2. **Build the Extension**
```bash
npm run build
```

This will build both required bundles:
- `dist/auth.js` - Privy authentication component
- `dist/bridge.js` - Bridge script for in-page integration

3. **Load in Chrome**
- Open `chrome://extensions/`
- Enable "Developer mode"
- Click "Load unpacked"
- Select the `browser-extension` directory

## 📁 Project Structure

```
browser-extension/
├── src/
│   ├── auth.tsx              # Privy authentication (React)
│   ├── bridge.tsx            # Bridge for in-page wallet
│   ├── config.ts             # Environment configuration
│   ├── storage-manager.ts    # Versioned storage system
│   └── error-handler.ts      # Standardized error handling
├── background.js             # Service worker
├── content.js                # Content script (ChatGPT integration)
├── popup.js                  # Extension popup logic
├── popup.html                # Extension popup UI
├── styles.css                # Styling
├── manifest.json             # Extension manifest
├── package.json              # Dependencies
├── vite.config.ts            # Build configuration
└── icons/                    # Extension icons
```

## 🔧 Configuration

### Environment Configuration

The extension supports three environments via `src/config.ts`:

**Development** (default)
- API: `http://localhost:3001`
- Network: Solana Devnet
- Debug mode enabled

**Staging**
- API: `https://api.staging.lucid-l2.com`
- Network: Solana Testnet

**Production**
- API: `https://api.lucid-l2.com`
- Network: Solana Mainnet

To change environment, set `NODE_ENV` during build:
```bash
NODE_ENV=production npm run build
```

### Build Scripts

- `npm run build` - Build both auth and bridge bundles
- `npm run build:clean` - Clean dist directory
- `npm run build:auth` - Build auth component only
- `npm run build:bridge` - Build bridge component only
- `npm run watch` - Watch mode for development

## 🏗️ Architecture

### Core Components

**1. Authentication (auth.tsx)**
- Privy-based Solana wallet connection
- Supports Phantom, Solflare, and other Solana wallets
- Handles login/logout flows
- Stores session in chrome.storage.local

**2. Content Script (content.js)**
- Injects sidebar UI into web pages
- Captures ChatGPT conversations
- Processes messages through Lucid L2 API
- Displays real-time stats and rewards

**3. Background Service Worker (background.js)**
- Manages auth popup windows
- Proxies API requests to avoid CORS
- Relays messages between components

**4. Popup (popup.js)**
- Main extension interface
- Wallet management
- Balance display
- Task tracking
- History view

### Data Flow

```
Web Page (ChatGPT)
    ↓
Content Script (captures messages)
    ↓
Background Worker (proxies API call)
    ↓
Lucid L2 API
    ↓
Solana Devnet (transaction)
    ↓
Update Balances & UI
```

## 💾 Storage Management

The extension uses a versioned storage system (`src/storage-manager.ts`) that:
- Automatically migrates data between versions
- Provides type-safe access to stored data
- Supports import/export functionality
- Tracks storage usage statistics

### Storage Schema

```typescript
{
  version: number;
  wallet: { address: string; publicKey?: string } | null;
  balance: { mGas: number; lucid: number; sol: number };
  dailyProgress: { completed: number; total: number };
  streak: number;
  tasks: Array<Task>;
  history: Array<HistoryItem>;
  settings: { notifications: boolean; autoProcess: boolean };
  // ... more fields
}
```

## 🛡️ Error Handling

Standardized error handling via `src/error-handler.ts`:

**Error Categories**
- Network errors (connection, timeout)
- Wallet errors (authentication, signature)
- API errors (4xx, 5xx responses)
- Storage errors (quota, save/load)
- Authentication errors (session, token)

**Usage Example**
```typescript
import { handleAsync } from './src/error-handler';

const result = await handleAsync(
  () => processThought(text),
  'Process Thought'
);
```

## 🔐 Security

### Permissions
The extension requests minimal permissions:
- `storage` - Local data persistence
- `identity` - OAuth authentication
- `activeTab` - Current tab access
- `alarms` - Background tasks
- `notifications` - User notifications

### Content Security Policy
Strict CSP enforced in manifest.json:
- Script sources: self + wasm
- Connect sources: self + specified APIs
- No unsafe-eval or inline scripts

## 🧪 Development

### Debug Mode

When in development environment:
1. Extension automatically logs configuration
2. Detailed console output for all operations
3. Error messages include full context

### Testing Locally

1. Start Lucid L2 API server:
```bash
cd ../offchain
npm start
```

2. Load extension in Chrome
3. Navigate to ChatGPT
4. Connect wallet via extension popup
5. Start chatting - conversations are automatically processed

### Hot Reload

Use watch mode for development:
```bash
npm run watch
```

Then reload extension in Chrome after changes.

## 📝 Key Features

### ✅ Implemented
- ✅ Privy wallet authentication (Solana-only)
- ✅ ChatGPT conversation capture
- ✅ Real-time mGas earning
- ✅ Daily progress tracking
- ✅ Streak system
- ✅ Task completion
- ✅ Transaction history
- ✅ Quality-based rewards
- ✅ Environment configuration
- ✅ Versioned storage
- ✅ Error handling
- ✅ Network indicator (devnet/testnet/mainnet)

### 🚧 Roadmap
- Multi-language support
- Custom themes
- Batch processing
- Analytics dashboard
- Social sharing features
- Mobile browser support

## 🐛 Troubleshooting

### Extension Not Loading
- Check manifest.json syntax
- Verify all required files exist
- Check console for errors in `chrome://extensions/`

### Wallet Connection Fails
- Ensure Phantom/Solflare is installed
- Check if wallet is unlocked
- Verify network matches extension config
- Try refreshing the page

### API Connection Failed
- Confirm API server is running
- Check API URL in config
- Verify no firewall blocking localhost:3001
- Check browser console for CORS errors

### Messages Not Being Captured
- Ensure you're on chat.openai.com or chatgpt.com
- Check content script is injected (inspect page)
- Look for wallet connection status
- Try reloading the page

## 📊 Architecture Improvements

### Recent Refactoring

**What Changed:**
1. **Build System** - Automated dual-bundle build process
2. **Configuration** - Environment-based config system
3. **Storage** - Versioned storage with migrations
4. **Error Handling** - Standardized error categorization
5. **Code Cleanup** - Removed anti-cheat and MetaMask code
6. **Documentation** - Consolidated scattered docs
7. **Privy Configuration** - Fixed to only show installed wallets

**Benefits:**
- Easier deployment to different environments
- Better data persistence and migration
- Improved user error messages
- Cleaner, more maintainable codebase
- Phantom extension detected automatically (no redirect to website)

## 🤝 Contributing

### Code Style
- Use TypeScript for new files
- Follow existing patterns
- Add JSDoc comments
- Handle errors properly

### Submitting Changes
1. Test thoroughly in development
2. Verify build succeeds
3. Check for TypeScript errors
4. Update documentation

## 📄 License

Part of the Lucid L2™ project. See root LICENSE file for details.

## 🔗 Links

- [Lucid L2 Documentation](https://docs.lucid-l2.com)
- [API Reference](../offchain/README.md)
- [Phase 8.2 Guide](../PHASE-8.2-BROWSER-EXTENSION-GUIDE.md)

## 💡 Support

For issues or questions:
1. Check troubleshooting section above
2. Review browser console for errors
3. Verify API server is accessible
4. Check wallet connection status

---

**Version:** 1.2.0  
**Last Updated:** October 2025  
**Status:** Production Ready (with noted improvements)
