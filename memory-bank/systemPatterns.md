# System Patterns: Lucid L2™ Architecture

## System Architecture (Phase 5 - MMR Integration)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Agent Vectors │    │   MMR Service    │    │  Solana Program │
│                 │    │                  │    │                 │
│ • Text inputs   │───▶│ • Hash vectors   │───▶│ • Store 32-byte │
│ • Per epoch     │    │ • Build MMR      │    │   MMR roots     │
│ • Batch process │    │ • Generate root  │    │ • Immutable log │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                          │
                              ▼                          ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   IPFS Storage  │    │ Dual-Gas System │
                       │                 │    │ iGas + mGas     │
                       │ • MMR state     │    │ $LUCID Burns    │
                       │ • Root history  │    │ [Compute+Burns] │
                       │ • Content addr. │    └─────────────────┘
                       └─────────────────┘
                              │
                              ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Memory Wallet   │◀───│  State Update    │◀───│ On-Chain PDA    │
│ (JSON File)     │    │  Local + Chain   │    │ Epoch Records   │
│ CDUauc4hYqP...  │    │                  │    │ Batch Records   │
└─────────────────┘    └──────────────────┘    └─────────────────┘

Traditional Flow (Phase 1-4):
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Text Input    │───▶│  Mock Inference  │───▶│   SHA-256 Hash  │
│ (API/CLI)       │    │   (inference.ts) │    │  (32 bytes)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Key Technical Decisions

### Blockchain Layer (Native Solana Program)
- **Program ID**: `8QRA7K4UHaFhsyRqrUAU7onsJhVHiP7FvwSHouD1dM29` (deployed and functional)
- **Program Derived Accounts (PDAs)**: Seeds = ["epoch", authority_pubkey]
- **Account Structure**: Simple data storage for merkle roots
- **Compute Budget**: Increased to 400k units (from default 200k) for complex operations
- **Direct Instruction Calls**: Native Solana program instructions

### Off-Chain Processing
- **Express.js Server**: REST API on port 3000 with dual-gas integration
- **TypeScript**: Type safety for Solana interactions
- **Anchor Client**: Structured Solana program interactions
- **SPL Token Integration**: @solana/spl-token for $LUCID burns
- **Centralized Gas Module**: Unified gas logic and configuration
- **Error Handling**: Comprehensive try-catch with meaningful error messages

### Data Flow Patterns
1. **Input Validation**: Text input sanitization and validation
2. **Hash Generation**: Deterministic SHA-256 for reproducible results
3. **PDA Derivation**: Consistent account addressing per user
4. **Transaction Building**: Pre-instructions for compute budget + main instruction
5. **State Synchronization**: On-chain commit followed by local wallet update

## Design Patterns in Use

### Program Derived Accounts (PDA) Pattern
```rust
#[account(
   init_if_needed,
   payer    = authority,
   space    = 8 + 32 + 32,
   seeds    = [b"epoch", authority.key().as_ref()],
   bump
)]
```
- Deterministic account addresses
- User-specific storage without collisions
- Automatic initialization on first use

### Dual-Gas Metering Pattern
```typescript
// 1. Compute budget (Solana CU)
const computeIx = makeComputeIx();

// 2. Dual-gas burns ($LUCID tokens)
const igasIx = makeBurnIx(userAta, LUCID_MINT, authority, iGasAmount);
const mgasIx = makeBurnIx(userAta, LUCID_MINT, authority, mGasAmount);

// 3. Transaction with pre-instructions
await program.methods
  .commitEpoch([...rootBytes])
  .preInstructions([computeIx, igasIx, mgasIx])
  .rpc();
```
- **iGas**: Compute operations (1 LUCID/call, 2 LUCID/batch)
- **mGas**: Memory writes (5 LUCID/root)
- **Transparency**: Gas cost breakdown displayed to users
- **Tunability**: Centralized configuration in gas.ts

### Dual Storage Pattern
- **On-Chain**: Immutable, verifiable, decentralized
- **Local**: Fast access, user-specific aggregation
- **Synchronization**: Local updates only after successful on-chain commits

## Component Relationships

### Core Components
- **thought-epoch program**: Anchor program with commit_epoch() and commit_epochs()
- **Express API**: HTTP interface with dual-gas integration
- **CLI Tool**: Command-line access with gas cost display
- **Memory Wallet**: Local JSON-based state management
- **Gas Module**: Centralized gas logic and configuration (gas.ts)
- **Setup Script**: LUCID mint configuration utility

### Data Dependencies
- Program ID must be deployed and configured in Anchor.toml
- Solana wallet must be configured and funded
- Local memory-wallet.json created on first use
- TypeScript compilation for all off-chain components

## Critical Implementation Paths

### Deployment Path (Phase 1 - Completed)
1. Start Solana test validator
2. Build native Solana program: `cargo build-sbf --manifest-path simple-program/Cargo.toml`
3. Deploy program: `solana program deploy simple-program/target/deploy/simple_program.so`
4. Capture Program ID: `8QRA7K4UHaFhsyRqrUAU7onsJhVHiP7FvwSHouD1dM29`
5. Configure wallet: `solana-keygen new --outfile ~/.config/solana/id.json`
6. Fund wallet: `solana airdrop 2 CDUauc4hYqPjBqZzhytmXd8DG4pjiwNjPn3cpCWNpToa`
7. Install off-chain dependencies: `cd offchain && npm install`
8. Start Express server: `npm start` (running on port 3001)

### Runtime Path (Dual-Gas) - FULLY OPERATIONAL
1. Receive text input via API/CLI
2. Generate SHA-256 hash
3. Calculate gas costs (iGas + mGas)
4. Derive PDA for current authority
5. Create ATA for LUCID token burns
6. **Two-Transaction Architecture**: 
   - First: Burn gas tokens (separate transaction)
   - Second: Execute program instruction with compute budget
7. Submit both transactions to Solana network
8. Update local memory wallet
9. Return success response with transaction signatures and gas breakdown

### Critical Bug Resolution Pattern
**Problem**: "Invalid instruction data" errors in combined transactions
**Root Cause**: Keypair mismatch - CLI loading different keypair than token owner
**Solution**: Dynamic keypair resolution using `solana config get`
**Implementation**: Updated `getKeypair()` in `solanaClient.ts`
**Result**: 100% success rate for both single and batch operations

### Error Recovery Paths
- Network failures: Retry logic with exponential backoff
- Compute budget exceeded: Automatic increase to 400k units
- Account initialization: Init-if-needed pattern handles first-time users
- Invalid input: Validation and sanitization before processing

## Clean Architecture Patterns (Phase 4 - Completed)

### Modular Structure Pattern
```
offchain/src/
├── commands/           ← CLI sub-commands (single responsibility)
│   ├── batch.ts        ← Batch commit operations
│   └── run.ts          ← Single commit operations
├── services/           ← HTTP handlers, webhooks (service layer)
│   ├── api.ts          ← Express router and HTTP handlers
│   └── indexer.ts      ← Future Helius/Shyft webhook listener
├── solana/             ← All Solana/Anchor client logic (blockchain layer)
│   ├── client.ts       ← initSolana(), derivePDAs, connection management
│   └── gas.ts          ← makeComputeIx(), makeBurnIx(), gas calculations
├── utils/              ← Utilities, config, and helpers (infrastructure)
│   ├── config.ts       ← Centralized configuration (Version 1.0)
│   ├── inference.ts    ← Mock inference logic
│   └── memoryStore.ts  ← Local JSON storage utilities
├── index.ts            ← Thin HTTP server bootstrap (12 lines)
└── cli.ts              ← Thin commander bootstrap
```

### Configuration Centralization Pattern
```typescript
// utils/config.ts - Version 1.0
export const CONFIG_VERSION = '1.0';

// Gas rates and costs
export const IGAS_PER_CALL = 1;      // 1 LUCID per inference call
export const MGAS_PER_ROOT = 5;      // 5 LUCID per memory write
export const IGAS_PER_BATCH = 2;     // 2 LUCID per batch operation

// Token configuration
export const LUCID_MINT = new PublicKey('G2bVsRy2xBiAAMeZDoFbH3526AKNPKa5SuCC9PCe2hTE');
export const LUCID_DECIMALS = 9;

// Solana configuration
export const PROGRAM_ID = new PublicKey('8QRA7K4UHaFhsyRqrUAU7onsJhVHiP7FvwSHouD1dM29');
export const RPC_URL = 'http://127.0.0.1:8899';
export const COMPUTE_UNITS = 400_000;
```

### Enhanced Gas Module Pattern
```typescript
// solana/gas.ts - Type-safe gas operations
export function makeComputeIx(): TransactionInstruction {
  return ComputeBudgetProgram.requestUnits({
    units: COMPUTE_UNITS,
    additionalFee: 0,
  });
}

export function makeBurnIx(
  type: 'iGas' | 'mGas',
  userAta: PublicKey,
  mint: PublicKey,
  authority: PublicKey,
  amount: number
): TransactionInstruction {
  return createBurnCheckedInstruction(
    userAta,
    mint,
    authority,
    amount,
    LUCID_DECIMALS
  );
}

export function calculateGasCost(
  type: 'single' | 'batch',
  rootCount: number = 1
): { iGas: number; mGas: number; total: number } {
  const iGas = type === 'single' ? IGAS_PER_CALL : IGAS_PER_BATCH;
  const mGas = MGAS_PER_ROOT * rootCount;
  return { iGas, mGas, total: iGas + mGas };
}
```

### Minimal Bootstrap Pattern
```typescript
// index.ts - Pure HTTP server setup (12 lines)
import express from 'express';
import { apiRouter } from './services/api';
import { API_PORT } from './utils/config';

const app = express();
app.use(express.json());
app.use('/', apiRouter);

app.listen(API_PORT, () => {
  console.log(`▶️  Lucid L2 API listening on http://localhost:${API_PORT}`);
});
```

### Benefits Achieved
- **Scalability**: Adding features = create helper file in appropriate folder
- **Maintainability**: Single responsibility per module, configuration in one place
- **Testability**: Each module can be tested independently
- **Type Safety**: Enhanced with proper TypeScript interfaces
- **Clean Imports**: Clear dependency relationships
- **Future-Proof**: Ready for UI integration, real AI, production deployment

## GasUtils + CPI Pattern (Phase 7 - In Progress)

### Utility Library + Cross-Program Invocation Architecture
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Request  │───▶│  Core Programs   │───▶│   GasUtils CPI  │
│ (commit_epoch)  │    │ (thought-epoch)  │    │ collect_and_split│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                          │
                              ▼                          ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │ Business Logic  │    │ Gas Distribution│
                       │ • Store roots   │    │ • Model: 50%    │
                       │ • Update state  │    │ • Memory: 20%   │
                       │ • Emit events   │    │ • Validator: 30%│
                       └─────────────────┘    └─────────────────┘

Evolution from Client-Side to On-Chain Gas Management:

BEFORE (Phase 6):                    AFTER (Phase 7):
┌─────────────────┐                 ┌─────────────────┐
│   Client Code   │                 │   Client Code   │
│ • makeBurnIx()  │                 │ • Simple call   │
│ • Pre-instruct. │────────────────▶│ • No gas logic  │
│ • Gas calc.     │                 │ • Clean & simple│
└─────────────────┘                 └─────────────────┘
         │                                   │
         ▼                                   ▼
┌─────────────────┐                 ┌─────────────────┐
│ Solana Program  │                 │ Core Program    │
│ • commit_epoch  │                 │ • CPI to GasUtils│
│ • No gas logic  │                 │ • commit_epoch  │
└─────────────────┘                 │ • Cleaner logic │
                                    └─────────────────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │   GasUtils      │
                                    │ • collect_split │
                                    │ • Recipient mgmt│
                                    │ • Upgradeable   │
                                    └─────────────────┘
```

### GasUtils Program Structure
```rust
#[program]
pub mod gas_utils {
    use super::*;
    
    pub fn collect_and_split(
        ctx: Context<CollectAndSplit>,
        m_gas_amount: u64,
        i_gas_amount: u64,
        recipients: Vec<(Pubkey, u8)>, // (recipient, percentage)
    ) -> Result<()> {
        // 1. Validate percentages sum to 100
        // 2. Collect total gas from user
        // 3. Distribute to recipients based on percentages
        // 4. Handle any remainder
    }
}

#[derive(Accounts)]
pub struct CollectAndSplit<'info> {
    #[account(mut)]
    pub user_ata: Account<'info, TokenAccount>,
    
    pub lucid_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    // Dynamic recipient accounts
    // ... (recipient ATAs based on instruction data)
    
    pub token_program: Program<'info, Token>,
}
```

### CPI Integration in Core Programs
```rust
// In thought-epoch program
use gas_utils;

pub fn commit_epoch(ctx: Context<CommitEpoch>, root: [u8; 32]) -> Result<()> {
    // 1. Calculate gas costs and recipients
    let recipients = vec![
        (ctx.accounts.model_publisher_ata.key(), 50),  // 50%
        (ctx.accounts.memory_provider_ata.key(), 20),  // 20%
        (ctx.accounts.validator_ata.key(), 30),        // 30%
    ];
    
    // 2. CPI call to GasUtils
    let cpi_accounts = gas_utils::cpi::accounts::CollectAndSplit {
        user_ata: ctx.accounts.user_ata.to_account_info(),
        lucid_mint: ctx.accounts.lucid_mint.to_account_info(),
        user: ctx.accounts.authority.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new(
        ctx.accounts.gas_utils_program.to_account_info(),
        cpi_accounts
    );
    
    gas_utils::cpi::collect_and_split(
        cpi_ctx,
        5, // mGas amount
        1, // iGas amount  
        recipients
    )?;
    
    // 3. Execute core business logic
    let rec = &mut ctx.accounts.epoch_record;
    rec.merkle_root = root;
    rec.authority = *ctx.accounts.authority.key;
    
    Ok(())
}
```

### Enhanced Account Context Pattern
```rust
#[derive(Accounts)]
pub struct CommitEpoch<'info> {
    // Existing accounts
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 32 + 32,
        seeds = [b"epoch", authority.key().as_ref()],
        bump
    )]
    pub epoch_record: Account<'info, EpochRecord>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    
    // New GasUtils integration accounts
    pub gas_utils_program: Program<'info, GasUtils>,
    
    #[account(mut)]
    pub user_ata: Account<'info, TokenAccount>,
    
    pub lucid_mint: Account<'info, Mint>,
    
    // Recipient accounts (dynamic based on operation)
    #[account(mut)]
    pub model_publisher_ata: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub memory_provider_ata: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub validator_ata: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}
```

### Client Integration Simplification
```typescript
// BEFORE: Complex client-side gas management
const computeIx = makeComputeIx();
const igasIx = makeBurnIx('iGas', userAta, LUCID_MINT, authority, 1);
const mgasIx = makeBurnIx('mGas', userAta, LUCID_MINT, authority, 5);

await program.methods
  .commitEpoch([...rootBytes])
  .accounts({...})
  .preInstructions([computeIx, igasIx, mgasIx])
  .rpc();

// AFTER: Simple CPI-based approach
await program.methods
  .commitEpoch([...rootBytes])
  .accounts({
    // ... existing accounts
    gasUtilsProgram: GAS_UTILS_PROGRAM_ID,
    userAta,
    lucidMint: LUCID_MINT,
    modelPublisherAta,
    memoryProviderAta,
    validatorAta,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
```

### Benefits of GasUtils + CPI Pattern
- **Maintainability**: Single program for all gas logic updates
- **Flexibility**: Easy recipient configuration changes
- **Modularity**: Clean separation of gas handling from business logic
- **Upgradability**: Independent gas program updates
- **Efficiency**: CPI overhead ~50-100μs (negligible vs sub-100ms goal)
- **Scalability**: Supports complex recipient configurations
- **Security**: Centralized validation of gas distribution logic

## MMR Integration Patterns (Phase 5 - Completed)

### Per-Agent MMR Management Pattern
```typescript
// Each agent maintains isolated MMR state
export class AgentMMR {
  private agentId: string;
  private mmr: MerkleTree;
  private rootHistory: { epoch: number; root: Buffer; timestamp: number }[];
  
  processEpoch(vectors: Buffer[], epochNumber: number): Buffer {
    // 1. Hash vectors with SHA-256
    // 2. Append to MMR structure
    // 3. Generate new root
    // 4. Store in history
    // 5. Return root for on-chain commitment
  }
}
```

### IPFS Storage Pattern (File-Based Simulation)
```typescript
// Content-addressed storage with deterministic CIDs
export class IPFSStorageManager {
  async storeAgentMMR(agentMMR: AgentMMR): Promise<string> {
    // 1. Serialize MMR data with Buffer handling
    // 2. Generate content-addressed ID (CID simulation)
    // 3. Store to file system
    // 4. Return CID for reference
  }
  
  private generateCID(data: Buffer): string {
    const hash = createHash('sha256').update(data).digest('hex');
    return `Qm${hash.substring(0, 44)}`; // Simulate IPFS CID format
  }
}
```

### MMR Service Integration Pattern
```typescript
// High-level service integrating MMR with existing Lucid L2
export class MMRService {
  async processAgentEpoch(epochData: AgentEpochData): Promise<MMRCommitResult> {
    // 1. Process vectors through MMR
    // 2. Store updated MMR on IPFS
    // 3. Calculate gas costs
    // 4. Commit root to Solana using existing program
    // 5. Return comprehensive result
  }
}
```

### CLI Command Pattern for MMR
```typescript
// Modular CLI commands following existing patterns
export async function processEpoch(agentId: string, vectors: string[], epochNumber?: number): Promise<void> {
  // 1. Validate inputs
  // 2. Process through MMR service
  // 3. Display results with gas breakdown
  // 4. Handle errors gracefully
}
```

### MMR Data Structures
```typescript
interface MMRState {
  size: number;                    // Number of leaves in MMR
  peaks: Buffer[];                 // Current peak hashes
  nodes: Map<number, Buffer>;      // All MMR nodes
}

interface MMRProof {
  leafIndex: number;               // Position of leaf in MMR
  leafHash: Buffer;                // Hash of the leaf
  siblings: Buffer[];              // Sibling hashes for path
  peaks: Buffer[];                 // Peak hashes for bagging
  mmrSize: number;                 // MMR size at proof time
}

interface StoredMMRData {
  agentId: string;                 // Agent identifier
  mmrState: MMRState;              // Complete MMR state
  rootHistory: {                   // Historic roots
    epoch: number;
    root: Buffer;
    timestamp: number;
  }[];
  lastUpdated: number;             // Last modification time
  version: string;                 // Data format version
}
```

### MMR Integration Benefits
- **Per-Agent Isolation**: Each agent has independent MMR state
- **Cryptographic Proofs**: Mathematical verification of contributions
- **Immutable Timeline**: Historic roots preserved for proof-of-contribution
- **Off-Chain Efficiency**: Complete MMR state stored off-chain
- **On-Chain Verification**: Only 32-byte roots committed on-chain
- **Existing Integration**: Uses current dual-gas system and Solana program
- **Scalable Architecture**: Supports unlimited agents and vectors
