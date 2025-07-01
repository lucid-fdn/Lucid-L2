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

## 💡 Next Steps

**Phase 3 (UI):** Next.js + Tailwind page calling `/run` or `lucid-cli run`.

**Real AI:** Swap `runMockInference` for real model inference.

**Memory Map & Gas:** Implement dual-gas accounting & Thought Epoch batching.

**Virtual Humans:** Add sub-100 ms RCS streams & avatar sync.

---

## 🤝 Contributing

- Branch from `main`.
- One feature per PR.
- Tag `@lead-dev` for review.
- Keep CI green & tests passing.

---

🎉 You're all set—ship your first "Hello, Lucid!" in under an hour and iterate fast.

