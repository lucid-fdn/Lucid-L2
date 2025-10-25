# Lucid Extension

Modern browser extension for earning mGas tokens by interacting with AI models. Built with Privy authentication for secure Solana wallet connections.

## 🎯 Overview

Lucid Extension seamlessly integrates with ChatGPT, allowing users to:
- Connect Solana wallets via Privy (Phantom, Solflare, etc.)
- Process AI conversations and earn mGas rewards
- Track daily progress and maintain streaks
- View transaction history and achievements

## ⚡ Key Features

- **Modern Privy v3.1.0 Integration** - Proper wallet connector pattern with `toSolanaWalletConnectors()`
- **ChatGPT Integration** - Automatic conversation capture and processing
- **Real-time Rewards** - Earn mGas based on conversation quality
- **Daily Streaks** - Track your progress and maintain engagement streaks
- **Multi-environment Support** - Development, staging, and production configs
- **TypeScript** - Full type safety throughout the codebase
- **Versioned Storage** - Automatic data migration system

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ and npm
- Chrome/Chromium browser
- Lucid L2 API server running (default: http://localhost:3001)
- Privy App ID from [Privy Dashboard](https://dashboard.privy.io)

### Installation

1. **Clone and Navigate**
```bash
cd Lucid-L2/lucid-ext
```

2. **Install Dependencies**
```bash
npm install
```

3. **Configure Environment**
```bash
cp .env.example .env
```

Edit `.env` and add your Privy App ID:
```env
VITE_PRIVY_APP_ID=your_privy_app_id_here
```

4. **Build the Extension**
```bash
npm run build
```

This creates:
- `build/` - Popup UI (React app)
- `dist/` - Content script, background worker, auth handler

5. **Load in Chrome**
- Open `chrome://extensions/`
- Enable "Developer mode"
- Click "Load unpacked"
- Select the `lucid-ext` directory

## 📁 Project Structure

```
lucid-ext/
├── src/
│   ├── main.tsx              # Popup entry point with PrivyProvider
│   ├── App.tsx                # Main popup UI component
│   ├── auth.tsx               # Auth redirect handler
│   ├── content.ts             # ChatGPT conversation capture
│   ├── background.ts          # Service worker (API calls)
│   ├── config.ts              # Environment configuration
│   ├── storage-manager.ts     # Versioned storage system
│   └── error-handler.ts       # Error categorization
├── public/
│   ├── manifest.json          # Chrome extension manifest
│   ├── index.html             # Popup HTML
│   ├── auth.html              # Auth redirect page
│   └── icons/                 # Extension icons
├── package.json               # Dependencies
├── vite.config.ts             # Multi-target build config
├── tsconfig.json              # TypeScript config
└── README.md                  # This file
```

## 🔧 Configuration

### Environment Modes

The extension supports three environments via `src/config.ts`:

**Development** (default)
- API: `http://localhost:3001`
- Network: Solana Devnet
- Debug logging enabled

**Staging**
- API: `https://api.staging.lucid-l2.com`
- Network: Solana Testnet

**Production**
- API: `https://api.lucid-l2.com`
- Network: Solana Mainnet

Change environment by setting `NODE_ENV`:
```bash
NODE_ENV=production npm run build
```

### Build Scripts

- `npm run build` - Build all targets (popup, auth, content, background)
- `npm run build:clean` - Clean dist and build directories
- `npm run build:popup` - Build popup UI only
- `npm run build:auth` - Build auth handler only
- `npm run build:content` - Build content script only
- `npm run build:background` - Build background worker only
- `npm run watch` - Watch mode for popup
- `npm run dev` - Development server (for testing popup UI)

## 🏗️ Architecture

### Privy Integration

Uses the **correct pattern** for browser extensions:

```typescript
<PrivyProvider
  appId={config.privyAppId}
  config={{
    embeddedWallets: {
      solana: {
        createOnLogin: 'users-without-wallets',
      },
    },
    appearance: {
      walletChainType: 'solana-only',
    },
    externalWallets: {
      solana: {
        connectors: toSolanaWalletConnectors(),
      },
    },
  }}
>
  <App />
</PrivyProvider>
```

Key points:
- `toSolanaWalletConnectors()` automatically detects installed wallet extensions
- No direct wallet injection - communicates through browser wallet extensions
- OAuth flow via `auth.html` + `dist/auth.js`

### Data Flow

```
ChatGPT Page
    ↓ (content.ts captures messages)
Content Script
    ↓ (sends to background)
Background Worker (background.ts)
    ↓ (API call to Lucid backend)
Lucid L2 API
    ↓ (processes thought, calculates reward)
Solana Devnet Transaction
    ↓ (updates balance)
Chrome Storage + UI Update
```

### Storage System

Versioned storage with automatic migrations (`src/storage-manager.ts`):

```typescript
interface StorageSchema {
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

## 💡 Usage

1. **Install Extension** - Load unpacked in Chrome
2. **Connect Wallet** - Click extension icon, connect via Privy
3. **Visit ChatGPT** - Go to chatgpt.com or chat.openai.com
4. **Start Chatting** - Your conversations are automatically processed
5. **Earn Rewards** - Receive mGas tokens based on conversation quality
6. **Track Progress** - View balance, streak, and history in popup

## 🧪 Development

### Watch Mode

For active development:

```bash
# Terminal 1 - Watch popup
npm run watch

# Terminal 2 - Watch auth handler
npm run watch:auth

# Terminal 3 - Watch content script
npm run watch:content

# Terminal 4 - Watch background worker
npm run watch:background
```

After changes, reload the extension in `chrome://extensions/`

### Debug Mode

When in development environment:
- Detailed console logging
- Configuration displayed on load
- Error messages include full context

### Testing Locally

1. Start Lucid L2 API server:
```bash
cd ../offchain
npm start
```

2. Load extension in Chrome
3. Navigate to ChatGPT
4. Connect wallet via extension popup
5. Start chatting - conversations are processed automatically

## 📊 Key Improvements Over Old Extension

### What Changed

1. **Privy v3.1.0** - Modern authentication with proper Solana wallet connector pattern
2. **TypeScript** - Full type safety across all files
3. **Multi-target Vite Build** - Separate builds for popup, content, background, auth
4. **Cleaner Architecture** - Better separation of concerns
5. **Improved Storage** - Versioned storage with automatic migrations
6. **Better Error Handling** - Categorized errors with user-friendly messages

### Benefits

- **More Reliable** - Proper wallet communication through browser extensions
- **Easier to Maintain** - TypeScript + modular architecture
- **Better UX** - Automatic wallet detection, cleaner UI
- **Future-proof** - Modern patterns and dependencies

## 🐛 Troubleshooting

### Extension Not Loading
- Check manifest.json syntax
- Verify all built files exist in `build/` and `dist/`
- Check console for errors in `chrome://extensions/`

### Wallet Connection Fails
- Ensure Phantom/Solflare is installed
- Check if wallet is unlocked
- Verify network matches extension config (devnet/mainnet)
- Try refreshing the page

### API Connection Failed
- Confirm API server is running at configured URL
- Check browser console for CORS errors
- Verify firewall isn't blocking localhost:3001

### Messages Not Being Captured
- Ensure you're on chatgpt.com or chat.openai.com
- Check content script is injected (inspect page console)
- Verify wallet is connected
- Try reloading the page

### TypeScript Errors

TypeScript errors in the editor are normal before running `npm install`. The errors will resolve once dependencies are installed.

## 📝 API Integration

The extension communicates with Lucid backend via:

### Process Thought

**Endpoint:** `POST /api/thoughts/process`

**Request:**
```json
{
  "text": "User's chat message",
  "wallet": "wallet_address",
  "source": "chatgpt",
  "timestamp": 1234567890
}
```

**Response:**
```json
{
  "reward": 10,
  "mGasEarned": 10,
  "qualityScore": 0.85,
  "qualityTier": "high",
  "signature": "transaction_signature"
}
```

## 🔐 Security

### Permissions

Minimal permissions requested:
- `storage` - Local data persistence
- `identity` - OAuth authentication
- `activeTab` - Current tab access
- `alarms` - Background tasks (daily reset)
- `notifications` - User notifications

### Content Security Policy

Strict CSP enforced:
- Script sources: self + wasm-unsafe-eval
- Connect sources: self + specified APIs
- No unsafe-eval or inline scripts

## 🤝 Contributing

### Code Style

- Use TypeScript for all new files
- Follow existing patterns
- Add JSDoc comments for public functions
- Handle errors properly with error-handler.ts

### Testing Changes

1. Test in development environment
2. Verify build succeeds
3. Check for TypeScript errors
4. Test wallet connection flow
5. Test ChatGPT integration

## 📄 License

Part of the Lucid L2 project. See root LICENSE file for details.

## 🔗 Related

- [Lucid L2 Documentation](https://docs.lucid-l2.com)
- [Privy Documentation](https://docs.privy.io)
- [Privy React SDK](https://www.npmjs.com/package/@privy-io/react-auth)
- [Original Browser Extension](../browser-extension/README.md)

---

**Version:** 1.0.0  
**Last Updated:** October 2025  
**Status:** Ready for Testing
