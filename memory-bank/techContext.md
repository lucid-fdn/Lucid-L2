# Technical Context: Lucid L2™ Stack

## Technologies Used

### Blockchain Stack
- **Solana**: High-performance blockchain for fast, low-cost transactions (v2.0.26)
- **Anchor Framework**: Structured Solana program development with IDL generation
- **Rust**: Systems programming language for on-chain programs
- **@solana/web3.js**: Official Solana JavaScript SDK for blockchain interactions
- **@solana/spl-token**: SPL token library for $LUCID token burns

### Off-Chain Stack
- **Node.js**: JavaScript runtime for server-side applications
- **TypeScript**: Type-safe JavaScript for better development experience
- **Express.js**: Web framework for REST API with dual-gas integration
- **ts-node**: TypeScript execution environment for development
- **SPL Token Integration**: Native $LUCID token burning for gas metering
- **MMR Implementation**: Merkle Mountain Range for cryptographic proof-of-contribution
- **IPFS Storage**: Content-addressed storage for off-chain MMR state
- **Crypto Libraries**: SHA-256 hashing for vector commitment and MMR operations

### AI & LLM Integration Stack (Phase 8)
- **OpenAI API**: GPT-4 and GPT-3.5 integration for real AI inference
- **Multi-LLM Architecture**: Provider-agnostic interface for multiple AI models
- **Quality Scoring**: AI response assessment and validation systems
- **Token Usage Tracking**: Cost calculation and optimization for LLM providers
- **Provider Router**: Intelligent routing between different LLM providers
- **Fallback Systems**: Graceful degradation when providers are unavailable

### Browser Extension Stack (Phase 8.3 - Advanced Rewards Complete)
- **Chrome Extension APIs**: Manifest V3 for modern browser extension development
- **Solana Wallet Adapter**: Integration with Phantom, Solflare, and other wallets
- **Extension Storage**: Chrome storage API for user data and earning history
- **Content Scripts**: Page interaction and floating button integration
- **Background Scripts**: Service worker for persistent tasks and wallet connection
- **Popup UI**: HTML/CSS/JavaScript for extension interface with gradient styling
- **Context Menus**: Right-click integration for text processing
- **Keyboard Shortcuts**: Ctrl+Shift+L for quick text processing
- **Notification System**: Chrome notifications API for user feedback
- **Daily Task System**: Progress tracking and mGas earning mechanics
- **Professional UI**: Modern design with animations and responsive layout
- **Advanced Rewards**: RewardSystem class with quality assessment and achievements
- **Modal System**: Achievement and leaderboard overlay interfaces
- **Conversion System**: mGas to LUCID token conversion with transaction handling
- **Social Features**: Content sharing and referral system integration
- **Event System**: Seasonal events and challenges with dynamic multipliers
- **Gamification**: 8 progressive achievements with streak bonuses

### Anti-Cheat & Security Stack (Phase 8.3 - Advanced Complete)
- **Rate Limiting**: Request throttling and cooldown mechanisms implemented
- **Quality Validation**: Advanced 5-dimension AI-generated content assessment
- **Behavioral Analysis**: Pattern recognition for fraud detection (foundation)
- **Wallet Clustering**: Transaction pattern analysis for farming detection (planned)
- **Proof-of-Human**: Challenge systems requiring human insight (planned)
- **Multi-Layer Detection**: Comprehensive fraud prevention system (foundation)
- **Storage Security**: Chrome storage API with proper data isolation
- **Error Handling**: Comprehensive try-catch blocks and graceful degradation
- **Advanced Quality Scoring**: Multi-dimensional assessment system for content quality
- **Streak Validation**: Anti-gaming measures for streak bonus systems
- **Conversion Limits**: Minimum thresholds and rate limiting for mGas conversion

### Development Tools
- **Solana CLI**: Command-line tools for Solana development
- **Anchor CLI**: Build and deployment tools for Anchor programs
- **Commander.js**: CLI framework for command-line interfaces
- **Cargo**: Rust package manager and build system

## Development Setup

### Prerequisites
```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Solana CLI (v1.17.15)
sh -c "$(curl -sSfL https://release.solana.com/v1.17.15/install)"

# Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked

# Node.js (v16+)
# Install via nvm, package manager, or official installer
```

### Environment Configuration (Phase 8.4 - Devnet Migration)
- **Current Target**: Devnet migration for real wallet testing
- **Solana Cluster**: Transitioning from localnet to devnet
- **RPC Endpoint**: Migrating from `http://127.0.0.1:8899` to `https://api.devnet.solana.com`
- **Wallet Integration**: Real Phantom wallet connection (replacing mock)
- **Program Deployment**: Need to redeploy programs to devnet
- **LUCID Token**: Need to create new LUCID mint on devnet
- **API Endpoint**: http://localhost:3001 (updated for devnet integration)
- **Browser Extension**: Real wallet connection with devnet support

### Current Network Configuration
- **Development**: localnet (`http://127.0.0.1:8899`)
- **Testing Target**: devnet (`https://api.devnet.solana.com`)
- **Production Future**: mainnet (`https://api.mainnet-beta.solana.com`)
- **Wallet**: ~/.config/solana/id.json (for local development)
- **Program ID**: `8QRA7K4UHaFhsyRqrUAU7onsJhVHiP7FvwSHouD1dM29` (localnet)
- **LUCID Mint**: Configurable via setup-lucid-mint.js script

### Project Structure (Phase 4 - Clean Architecture)
```
Lucid-L2-main/
├── Anchor.toml                 # Anchor workspace configuration
├── programs/
│   └── thought-epoch/
│       ├── Cargo.toml         # Rust dependencies
│       └── src/lib.rs         # Anchor program source
├── tests/
│   └── commit-epoch.js        # Anchor test suite
└── offchain/
    ├── package.json           # Node.js dependencies (enhanced scripts)
    ├── tsconfig.json          # TypeScript configuration
    ├── memory-wallet.json     # Local state storage
    ├── setup-lucid-mint.js    # LUCID mint configuration script
    └── src/                   # Clean modular architecture
        ├── commands/          # CLI sub-commands
        │   ├── batch.ts       # Batch commit operations
        │   ├── run.ts         # Single commit operations
        │   └── mmr.ts         # MMR operations (init, epoch, proof, stats)
        ├── services/          # HTTP handlers, webhooks
        │   ├── api.ts         # Express router and HTTP handlers
        │   ├── indexer.ts     # Future Helius/Shyft webhook listener
        │   └── mmrService.ts  # MMR service layer integration
        ├── solana/            # All Solana/Anchor client logic
        │   ├── client.ts      # initSolana(), derivePDAs, connection mgmt
        │   └── gas.ts         # makeComputeIx(), makeBurnIx(), calculations
        ├── utils/             # Utilities, config, and helpers
        │   ├── config.ts      # Centralized configuration (Version 1.0)
        │   ├── inference.ts   # Mock inference logic
        │   ├── memoryStore.ts # Local JSON storage utilities
        │   ├── mmr.ts         # Merkle Mountain Range implementation
        │   └── ipfsStorage.ts # IPFS storage simulation
        ├── index.ts           # Thin HTTP server bootstrap (12 lines)
        └── cli.ts             # Thin commander bootstrap
```

## Technical Constraints

### Solana Limitations
- **Compute Budget**: Default 200k units, increased to 400k for complex operations
- **Account Size**: Fixed at creation time (72 bytes for EpochRecord)
- **Transaction Size**: Maximum 1232 bytes per transaction
- **Network Fees**: SOL required for transaction fees and account rent

### Development Constraints
- **Local Development**: Requires running Solana test validator
- **Program Deployment**: Immutable once deployed (upgrades require new program ID)
- **Wallet Management**: Requires funded Solana wallet for transactions
- **Network Dependency**: Off-chain components require network access to Solana RPC

### Performance Considerations
- **Block Time**: ~400ms on Solana mainnet, faster on localnet
- **Finality**: Immediate on localnet, ~13 seconds on mainnet
- **Throughput**: Limited by Solana network capacity
- **Storage Costs**: Rent-exempt minimum balance required for accounts

## Dependencies

### On-Chain Dependencies (simple-program/Cargo.toml)
```toml
[dependencies]
solana-program = "1.18.26"
```

### Off-Chain Dependencies (offchain/package.json)
```json
{
  "dependencies": {
    "@coral-xyz/anchor": "^0.30.1",
    "@solana/web3.js": "^1.95.0",
    "@solana/spl-token": "^0.4.8",
    "express": "^4.18.2",
    "body-parser": "^1.20.2"
  },
  "devDependencies": {
    "ts-node": "^10.9.1",
    "commander": "^9.5.0",
    "@types/express": "^4.17.21",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

## Tool Usage Patterns

### Development Workflow (Phase 3c - Dual-Gas) - FULLY OPERATIONAL
1. **Start Test Validator**: `solana-test-validator --reset --quiet &`
2. **Build Anchor Program**: `cd programs/thought-epoch && anchor build`
3. **Deploy Program**: `anchor deploy --provider.cluster localnet`
4. **Configure Wallet**: Dynamic keypair resolution via `solana config get`
5. **Fund Wallet**: `solana airdrop 2 <wallet-address>`
6. **Install Dependencies**: `cd offchain && npm install`
7. **Configure LUCID Mint**: `node setup-lucid-mint.js <MINT_ADDRESS>`
8. **Start Server**: `npm start` (runs on port 3000)
9. **Test CLI**: `npm run cli run "Hello Lucid!"` ✅ Working (6 LUCID gas)
10. **Test Batch**: `npm run cli batch "Hello" "Lucid" "World"` ✅ Working (17 LUCID gas)
11. **Test API**: `curl -X POST http://localhost:3000/run -H "Content-Type: application/json" -d '{"text": "test"}'`

### Critical Bug Resolution (Completed)
- **Issue**: "Invalid instruction data" errors in CLI operations
- **Root Cause**: Keypair mismatch between CLI and token owner
- **Solution**: Updated `getKeypair()` to use `solana config get` for dynamic path resolution
- **Result**: 100% success rate for all operations
- **Validation**: Real LUCID token burns confirmed via balance checks

### Testing Patterns
- **Unit Tests**: Anchor test framework with JavaScript/TypeScript
- **Integration Tests**: Full end-to-end API testing
- **Manual Testing**: CLI commands and curl requests
- **Blockchain Verification**: Transaction signature verification on Solana explorer

### Debugging Tools
- **Solana Logs**: `solana logs` for real-time transaction logs
- **Anchor Console**: Built-in logging in Anchor programs
- **TypeScript Debugging**: Source maps and error stack traces
- **Network Inspection**: RPC call monitoring and response analysis

## Security Considerations
- **Private Key Management**: Secure storage of Solana wallet keys
- **Input Validation**: Sanitization of text inputs before processing
- **Transaction Verification**: Confirmation of successful on-chain commits
- **Token Security**: Secure handling of $LUCID token burns and ATA management
- **Gas Validation**: Proper calculation and verification of gas costs
- **Error Handling**: Graceful failure modes without exposing sensitive data

## Gas Metering Architecture
- **iGas (Inference Gas)**: 1 LUCID per single call, 2 LUCID per batch
- **mGas (Memory Gas)**: 5 LUCID per thought epoch root stored
- **Transparency**: All operations display gas cost breakdown
- **Configurability**: Centralized gas parameters in gas.ts
- **SPL Token Burns**: Client-side token burns in transaction pre-instructions
- **Future Evolution**: Ready for on-chain gas validation and dynamic pricing

## Clean Architecture Benefits (Phase 4 - Completed)

### Enhanced Development Scripts
```json
{
  "scripts": {
    "start": "ts-node src/index.ts",
    "dev": "ts-node --watch src/index.ts",
    "cli": "ts-node src/cli.ts",
    "build": "tsc",
    "type-check": "tsc --noEmit",
    "test": "echo \"No tests yet\" && exit 0"
  }
}
```

### Centralized Configuration Management
- **Version Control**: Configuration versioned (v1.0) for migration tracking
- **Single Source of Truth**: All constants in `utils/config.ts`
- **Environment Flexibility**: Easy switching between localnet/devnet/mainnet
- **Type Safety**: Full TypeScript interfaces for all configuration

### Modular Development Benefits
- **Feature Addition**: Create file in appropriate folder → wire into bootstrap
- **Testing**: Each module independently testable
- **Maintenance**: Single responsibility per file
- **Scaling**: No file ever balloons with mixed concerns
- **Team Development**: Clear ownership boundaries

### Future-Ready Architecture
- **UI Integration**: Ready for Next.js frontend with Wallet-Adapter
- **Real AI**: Mock inference easily replaceable with actual models
- **Production**: Configuration-driven deployment to any Solana cluster
- **Advanced Features**: Clean foundation for virtual humans, avatar sync
