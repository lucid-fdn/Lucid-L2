# Lucid L2™ Clean Structure Guide

## Overview
This document describes the new clean architecture implemented for the Lucid L2 off-chain components, following modular design principles for maximum maintainability and scalability.

## New Directory Structure

```
offchain/src/
├── commands/           ← CLI sub-commands
│   ├── batch.ts        ← Batch commit operations
│   └── run.ts          ← Single commit operations
├── services/           ← HTTP handlers, webhooks
│   ├── api.ts          ← Express router and HTTP handlers
│   └── indexer.ts      ← Future Helius/Shyft webhook listener
├── solana/             ← All Solana/Anchor client logic
│   ├── client.ts       ← initSolana(), derivePDAs, connection management
│   └── gas.ts          ← makeComputeIx(), makeBurnIx(), gas calculations
├── utils/              ← Utilities, config, and helpers
│   ├── config.ts       ← Centralized configuration (Version 1.0)
│   ├── inference.ts    ← Mock inference logic
│   └── memoryStore.ts  ← Local JSON storage utilities
├── index.ts            ← Thin HTTP server bootstrap (12 lines)
└── cli.ts              ← Thin commander bootstrap
```

## Key Improvements

### 1. Centralized Configuration (`utils/config.ts`)
All configuration constants are now centralized:
- Gas rates: `IGAS_PER_CALL`, `MGAS_PER_ROOT`, `IGAS_PER_BATCH`
- Token configuration: `LUCID_MINT`, `LUCID_DECIMALS`
- Solana configuration: `PROGRAM_ID`, `RPC_URL`, `COMPUTE_UNITS`
- API configuration: `API_PORT`, `MAX_BATCH_SIZE`

### 2. Clean Gas Module (`solana/gas.ts`)
Unified gas handling with clean interfaces:
```typescript
makeComputeIx(): TransactionInstruction
makeBurnIx(type: 'iGas'|'mGas', userAta, mint, authority, amount): TransactionInstruction
calculateGasCost(type: 'single'|'batch', rootCount): {iGas, mGas, total}
```

### 3. Modular Commands (`commands/`)
- `run.ts`: Single thought epoch commits
- `batch.ts`: Batch thought epoch commits
- Clean separation of business logic from CLI interface

### 4. Service Layer (`services/`)
- `api.ts`: HTTP API handlers with proper error handling
- `indexer.ts`: Placeholder for future webhook indexing

### 5. Minimal Bootstrap Files
- `index.ts`: Pure HTTP server setup (12 lines)
- `cli.ts`: Pure CLI command routing

## Benefits

### Scalability
- Adding new features means creating a new helper file in the appropriate folder
- No single file ever balloons with mixed responsibilities
- Clear separation of concerns

### Maintainability
- Each module has a single responsibility
- Dependencies are explicit and minimal
- Configuration changes happen in one place

### Testability
- Each module can be tested independently
- Business logic separated from infrastructure concerns
- Mock-friendly interfaces

## Usage Examples

### Starting the API Server
```bash
npm start
# or for development with auto-reload
npm run dev
```

### Using the CLI
```bash
# Single commit
npm run cli run "Hello Lucid"

# Batch commit
npm run cli batch "Hello" "Lucid" "World"

# Check wallet
npm run cli wallet
```

### Adding New Features

#### New CLI Command
1. Create `commands/newfeature.ts`
2. Export main function
3. Import and wire in `cli.ts`

#### New API Endpoint
1. Add handler to `services/api.ts`
2. Or create new service file in `services/`
3. Wire into router

#### New Utility
1. Create in `utils/` folder
2. Import where needed
3. Update `config.ts` if new constants needed

## Configuration Management

The `utils/config.ts` file is versioned (currently v1.0) and contains all system constants:

```typescript
// Version 1.0 - Lucid L2 Configuration
export const CONFIG_VERSION = '1.0';

// Gas rates and costs
export const IGAS_PER_CALL = 1;      // 1 LUCID per inference call
export const MGAS_PER_ROOT = 5;      // 5 LUCID per memory write
export const IGAS_PER_BATCH = 2;     // 2 LUCID per batch operation

// Token configuration
export const LUCID_MINT = new PublicKey('G2bVsRy2xBiAAMeZDoFbH3526AKNPKa5SuCC9PCe2hTE');
```

## Migration Notes

### From Old Structure
The old flat structure has been completely reorganized:
- `gas.ts` → `solana/gas.ts` (enhanced with type parameter)
- `solanaClient.ts` → `solana/client.ts` (uses config)
- `batch.ts` → `commands/batch.ts` (uses new imports)
- `inference.ts` → `utils/inference.ts`
- `memoryWallet.ts` → `utils/memoryStore.ts`

### Import Updates
All imports have been updated to use the new structure:
```typescript
// Old
import { LUCID_MINT } from './gas';

// New
import { LUCID_MINT } from '../utils/config';
import { makeBurnIx } from '../solana/gas';
```

## Status: ✅ COMPLETE

The clean structure implementation is complete and fully functional:
- ✅ All files moved to appropriate folders
- ✅ Imports updated to new structure
- ✅ Configuration centralized
- ✅ Gas module enhanced with type safety
- ✅ API server starts successfully
- ✅ CLI commands work correctly
- ✅ TypeScript compilation successful (ignoring Anchor library issues)

The codebase is now ready for future enhancements with a clean, scalable architecture.
