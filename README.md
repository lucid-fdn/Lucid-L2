# Lucid L2™ Phase 1 & Phase 2 MVP Starter Kit

> **Text → Thought Epoch hash → on-chain commit → local memory wallet**  
> Get a working end-to-end loop in minutes.

---

## 📂 Repository Layout

```
.
├── Anchor.toml
├── programs
│   └── thought-epoch
│       ├── Cargo.toml
│       └── src
│           └── lib.rs
├── tests
│   └── commit-epoch.js
└── offchain
    ├── package.json
    ├── tsconfig.json
    ├── memory-wallet.json
    └── src
        ├── index.ts
        ├── cli.ts
        ├── solanaClient.ts
        ├── inference.ts
        └── memoryWallet.ts
```

---

## 🔧 Prerequisites

- **Rust** & **Cargo** (via [rustup](https://rustup.rs/))
- **Solana CLI**  
  ```bash
  sh -c "$(curl -sSfL https://release.solana.com/v1.17.15/install)"
  ```
- **Anchor CLI**
  ```bash
  cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked
  ```
- **Node.js & npm/yarn** (v16+)

---

## ⚙️ Phase 1: On-Chain "Thought Epoch" Program

### 1. Configure Anchor.toml

```toml
[provider]
cluster = "localnet"
wallet = "~/.config/solana/id.json"

[programs.localnet]
thought_epoch = "REPLACE_WITH_YOUR_PROGRAM_ID"
```

After your first `anchor deploy`, replace `REPLACE_WITH_YOUR_PROGRAM_ID` with the printed ID.

### 2. Build & Deploy

```bash
# Start a fresh localnet
solana-test-validator --reset --quiet &

# Build & deploy the Anchor program
cd programs/thought-epoch
anchor build
anchor deploy --provider.cluster localnet
```

### 3. Run Automated Test

```bash
# From project root
anchor test
```

You should see:

```
✅ Stored root: [7,7,…,7]
```

---

## 🚀 Phase 2: Off-Chain Mock Inference → On-Chain Commit

### 1. Install Dependencies

```bash
cd offchain
npm install
# or yarn install
```

### 2. Start the Off-Chain Service

```bash
npm start
# or yarn start
```

Listens on `http://localhost:3000`.

### 3. Test the Loop

```bash
curl -X POST http://localhost:3000/run \
  -H "Content-Type: application/json" \
  -d '{"text":"Hi Lucid!"}'
```

**Sample Response:**

```json
{
  "success": true,
  "txSignature": "5G…TxSig",
  "root": "a3f1…9b7c",
  "store": {
    "YourPubkey": "a3f1…9b7c"
  }
}
```

- `root` = SHA-256(text)
- `txSignature` = on-chain commit
- `store` = contents of memory-wallet.json

---

## ⚡ Internal CLI

We provide a small CLI to streamline development.

### Install CLI deps

```bash
cd offchain
npm install commander ts-node --save-dev
# or yarn add commander ts-node --dev
```

### Hook CLI in package.json

```diff
{
  "scripts": {
    "start": "ts-node src/index.ts",
+   "cli":   "ts-node src/cli.ts"
  },
  "devDependencies": {
    "ts-node": "^10.x",
+   "commander": "^9.x"
  }
}
```

### Usage

```bash
# Run inference → commit → wallet update
npm run cli run "Hello, Lucid!"

# Show local memory wallet
npm run cli wallet
```

---

## ⚡ Compute-Budget Injection

Solana's default compute limit is 200k units. We bump this to 400k in both server & CLI:

```ts
import { ComputeBudgetProgram } from '@solana/web3.js'

// before commitEpoch():
const computeIx = ComputeBudgetProgram.requestUnits({
  units:         400_000,
  additionalFee: 0
});

// then:
program.methods
  .commitEpoch([...root])
  .accounts({...})
  .preInstructions([computeIx])
  .rpc();
```

---

## 📖 File Descriptions

- **`programs/thought-epoch/src/lib.rs`**  
  Anchor program with `commit_epoch(root: [u8;32])`

- **`tests/commit-epoch.js`**  
  Anchor-JS test for on-chain storage

- **`offchain/src/index.ts`**  
  Express server: mock inference → on-chain commit → memory-wallet update

- **`offchain/src/cli.ts`**  
  Internal CLI: `run` & `wallet` commands

- **`offchain/src/inference.ts`**  
  `runMockInference(input: string): Uint8Array` (SHA-256)

- **`offchain/src/solanaClient.ts`**  
  Anchor client + PDA derivation

- **`offchain/src/memoryWallet.ts`**  
  JSON store for latest root per user

- **`offchain/memory-wallet.json`**  
  Initially:
  
  ```json
  {}
  ```

---

## 🚀 Phase 3: Advanced Features & Optimizations

### 3c **Dual-Gas Metering in $LUCID** ✅

Under the hood we burn native $LUCID tokens for both:
- **iGas** (compute):  _1 LUCID_ per inference call
- **mGas** (memory):  _5 LUCID_ per vector write

All burns happen off-chain via SPL-token `burn` instructions in the same TX
that calls your Anchor program. You still inject `ComputeBudgetProgram` for Solana CU,
but your front-end and CLI display a single "cost" in $LUCID, split into iGas/mGas for
transparency and tunability.

**Implementation:**
- ✅ Rust program with `commit_epochs(roots: Vec<[u8;32]>)` function
- ✅ TypeScript batch client in `offchain/src/batch.ts`
- ✅ Centralized gas module in `offchain/src/gas.ts`
- ✅ CLI command: `npm run cli batch "Hello" "Lucid" "World"`
- ✅ **66.7% gas savings** demonstrated (3 thoughts: 15,000 → 5,000 lamports)
- ✅ **Dual-gas metering**: iGas + mGas burns in native $LUCID tokens

**Files:**
- `programs/thought-epoch/src/lib.rs` - Batching program
- `offchain/src/batch.ts` - Batch commit client
- `offchain/src/gas.ts` - Centralized gas logic and configuration
- `demo-batch-savings.js` - Gas savings demonstration

**Gas Configuration:**
```typescript
// Configurable rates in offchain/src/gas.ts
export const IGAS_PER_CALL = 1;      // 1 LUCID per inference call
export const MGAS_PER_ROOT = 5;      // 5 LUCID per memory write
export const IGAS_PER_BATCH = 2;     // 2 LUCID per batch operation
```

**Status:** Implementation complete, ready for $LUCID mint configuration.

---

## 🎨 Phase 3a: Next.js Frontend ✅

**Status:** COMPLETED - Full web interface with Solana wallet integration

### Features
- **Modern UI**: Next.js 15.3.4 with TypeScript and Tailwind CSS
- **Wallet Integration**: Phantom, Solflare, and other Solana wallets
- **Dual Interface**: Single thought and batch thought commitment tabs
- **Real-time Gas Display**: iGas + mGas breakdown with savings calculations
- **Transaction History**: View committed thoughts with blockchain explorer links
- **Responsive Design**: Optimized for desktop and mobile

### Quick Start
```bash
# Start frontend (requires backend API running)
cd frontend
npm install
npm run dev
# Frontend available at http://localhost:3000
```

### Usage
1. **Connect Wallet**: Click "Select Wallet" to connect Solana wallet
2. **Single Thoughts**: Enter text, see gas cost (6 $LUCID), commit to blockchain
3. **Batch Thoughts**: Add multiple thoughts, see gas savings, commit in one transaction
4. **View History**: See all committed thought epochs with transaction links

**Files:**
- `frontend/src/components/LucidInterface.tsx` - Main UI component
- `frontend/src/components/WalletContextProvider.tsx` - Wallet setup
- `offchain/src/services/api.ts` - Enhanced with `/batch` endpoint
- `PHASE-3A-GUIDE.md` - Complete implementation documentation

## 💡 Next Steps

**Phase 3b (Real AI):** Swap `runMockInference` for real model inference + Vector Store RAG

**Virtual Humans:** Add sub-100 ms RCS streams & avatar sync

**Production:** Deploy to devnet/mainnet with enhanced wallet management

---

## 🤝 Contributing

- Branch from `main`.
- One feature per PR.
- Tag `@lead-dev` for review.
- Keep CI green & tests passing.

---

🎉 You're all set—ship your first "Hello, Lucid!" in under an hour and iterate fast.
