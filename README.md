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

## 🚀 Phase 2: Developer UX & Ecosystem Enhancements

### 2a. Developer-UX Layer

Turn your manual `curl` + `anchor` commands into a one-step, end-to-end workflow:

**Express Service (POST /run)**
- Mocks AI inference (SHA-256 → 32-byte root)
- Derives PDA, injects a `ComputeBudgetProgram.requestUnits({ units: 400_000 })` instruction
- Calls Anchor `commit_epoch`
- Updates `memory-wallet.json`

**Internal CLI (lucid-cli)**

```bash
# Run inference → commit → wallet update
npm run cli run "Hello, Lucid!"

# Show local memory wallet
npm run cli wallet
```

**Setup**

Install dependencies & start server:

```bash
cd offchain
npm install    # or yarn install
npm start      # or yarn start
```

Install CLI dev‐deps:

```bash
npm install commander ts-node --save-dev
# or
yarn add commander ts-node --dev
```

Add to package.json:

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

### 2b. Ecosystem & Testing Enhancements

**Helius / Shyft Webhooks**
- Push‐notifications for your `thought_epoch` program logs or PDA updates
- Power off-chain Memory Map indexing or analytics dashboards
- Script: `npm run indexer` (see `offchain/src/indexer.ts`)

**Rich Local Testing**
- Solana-Program-Test in Rust for fast, in-process validator tests
- Triton (JS) for multi-validator, fork-mainnet CI scenarios
- Add `solana-program-test = "1.17"` and `solana-sdk = "1.17"` under `[dev-dependencies]` in `programs/thought-epoch/Cargo.toml`

---

## ⚡ Compute-Budget Injection

Solana's default compute limit is 200k units. We bump it to 400k:

```ts
import { ComputeBudgetProgram } from '@solana/web3.js'

const computeIx = ComputeBudgetProgram.requestUnits({
  units:         400_000,
  additionalFee: 0
});

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

- **`offchain/src/indexer.ts`**  
  Helius/Shyft webhook indexer (Phase 2b)

- **`offchain/memory-wallet.json`**  
  Initially:
  
  ```json
  {}
  ```

---

## 💡 Next Steps

**Phase 3 (UI):** Next.js + Tailwind dashboard calling `/run` or `lucid-cli run`

**Real AI:** Swap `runMockInference` for real model inference

**Memory Map & Gas:** Implement dual-gas (iGas/mGas) & Thought Epoch batching

**Virtual Humans & RCS:** Add sub-100 ms real-time streams & avatar sync

---

## 🤝 Contributing

- Branch from `main`
- One feature per PR
- Tag `@lead-dev` for review
- Keep CI green & tests passing

---

🎉 You're all set—ship your first "Hello, Lucid!" in under an hour and iterate fast.

