# Product Context: Lucid L2™ MVP

## Why This Project Exists
Lucid L2™ addresses the need for a decentralized, verifiable system that can process thoughts/text inputs and create immutable records on blockchain. This MVP establishes the foundational infrastructure for AI-powered systems that require:
- Cryptographic proof of computation
- Decentralized storage of results
- Local memory management
- Fast iteration cycles for development

## Problems It Solves
1. **Verifiable AI Processing**: Creates cryptographic proof that specific text was processed
2. **Decentralized Memory**: Stores computation results on blockchain rather than centralized servers
3. **Local State Management**: Maintains user-specific memory wallets for quick access
4. **Development Velocity**: Provides complete working system in minutes for rapid prototyping

## How It Should Work
### User Experience Flow (Phase 3c - Dual-Gas)
1. User submits text input (via API or CLI)
2. System calculates gas costs (iGas + mGas) and displays to user
3. System processes text through "inference" (currently mock SHA-256)
4. Dual-gas burns ($LUCID tokens) are executed for compute and memory
5. Result hash is committed to Solana blockchain with gas metering
6. Local memory wallet is updated with the new hash
7. User receives confirmation with transaction signature, gas breakdown, and stored data

### Key Interactions
- **REST API**: `POST /run` with JSON payload containing text (shows gas costs)
- **CLI Interface**: `npm run cli run "text input"` (displays gas breakdown)
- **Batch Operations**: `npm run cli batch "text1" "text2" "text3"` (optimized gas costs)
- **Wallet Inspection**: `npm run cli wallet` to view stored hashes
- **Gas Configuration**: `node setup-lucid-mint.js <MINT_ADDRESS>` for LUCID setup
- **Blockchain Verification**: Transaction signatures can be verified on Solana

## User Experience Goals
- **Speed**: Complete text-to-blockchain loop in seconds
- **Simplicity**: Single API call or CLI command
- **Gas Transparency**: Clear display of iGas + mGas costs before execution
- **Cost Optimization**: Batch operations for reduced gas costs
- **Reliability**: Consistent results with proper error handling
- **Configurability**: Easy LUCID mint setup and gas parameter tuning
- **Extensibility**: Easy to swap mock inference for real AI models
- **Economic Clarity**: Users understand exactly what they're paying for

## Success Metrics
- Sub-5 second response times for text processing
- 100% success rate for valid inputs on localnet
- Clear error messages for failure cases
- Easy setup process (working system in under an hour)
- Clean separation between on-chain and off-chain components
- **Gas Cost Transparency**: Users see exact iGas + mGas breakdown
- **Batch Efficiency**: 66.7% gas savings demonstrated for batch operations
- **Configuration Simplicity**: One-command LUCID mint setup
- **Economic Predictability**: Consistent, tunable gas pricing model
