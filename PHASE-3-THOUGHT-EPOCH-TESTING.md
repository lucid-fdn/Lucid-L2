# Phase 3 Testing Guide — thought-epoch v2 Anchoring

This guide walks through testing the new `commit_epoch_v2` flow on **testnet**.

## Prerequisites

- Solana CLI installed
- Anchor installed
- Local validator running

## 1) Build the program

If you see an error like:
```
error: no such command: `+1.84.1-sbpf-solana-v1.51`
```
it means the Solana toolchain override needs to be installed via `rustup`.

✅ **This does not replace your current toolchain.** It installs a **side‑by‑side** toolchain used only for Solana builds, so it won’t break existing Rust projects.

If you already have the Solana toolchain installed, you can skip this step.

Run:

```bash
rustup toolchain install 1.84.1
rustup component add rust-src --toolchain 1.84.1
```

Then retry:

```bash
cd Lucid-L2
anchor build
```

## 2) Deploy the program (testnet)

```bash
anchor deploy --provider.cluster testnet
```

Note the program ID printed by Anchor and update:
- `programs/thought-epoch/src/lib.rs` (`declare_id!`)
- `offchain/src/services/anchoringService.ts` (testnet entry in `THOUGHT_EPOCH_PROGRAM_IDS`)

## 3) Get the real Anchor discriminator for commit_epoch_v2

Use Anchor to print the IDL and discriminator:

```bash
anchor idl parse -f target/idl/thought_epoch.json
```

Then compute the discriminator:

```bash
python - <<'PY'
import hashlib
name = "global:commit_epoch_v2"
print(list(hashlib.sha256(name.encode()).digest()[:8]))
PY
```

Update `COMMIT_EPOCH_V2_DISCRIMINATOR` in:
- `offchain/src/services/anchoringService.ts`

## 4) Run a minimal anchoring flow (mock receipts)

### Option A: Mock mode (fast sanity check)

```ts
import { enableMockMode, commitEpochRoot } from './services/anchoringService';
import { createEpoch } from './services/epochService';

enableMockMode();
const epoch = createEpoch();
// manually add receipts / MMR roots if needed

const result = await commitEpochRoot(epoch.epoch_id);
console.log(result);
```

### Option B: Real testnet commit

```ts
import { setAnchoringConfig, commitEpochRoot } from './services/anchoringService';
import { createEpoch } from './services/epochService';
import { Keypair } from '@solana/web3.js';

// Use your local keypair
const authority = Keypair.fromSecretKey(Uint8Array.from(/* secret key */));
setAnchoringConfig({
  network: 'testnet',
  authority_keypair: authority,
});

const epoch = createEpoch();
const result = await commitEpochRoot(epoch.epoch_id);
console.log(result);
```

## 5) Verify on-chain account

```bash
solana account <epoch_v2_pda>
```

You can compute the PDA with:

```ts
import { deriveEpochRecordV2PDA } from './services/anchoringService';
const [pda] = deriveEpochRecordV2PDA(authority.publicKey);
console.log(pda.toBase58());
```

## 6) Run verification helper

```ts
import { verifyEpochAnchor } from './services/anchoringService';
const verify = await verifyEpochAnchor(epoch.epoch_id);
console.log(verify);
```

## Expected Results

- `commit_epoch_v2` transaction succeeds on testnet
- PDA `epoch_v2` account exists and stores root + metadata
- `verifyEpochAnchor()` returns `{ valid: true }`

---

## Common Issues

### 1) Discriminator mismatch
If transactions fail with “instruction not recognized”, update the discriminator in `anchoringService.ts`.

### 2) PDA mismatch
Make sure the PDA seeds match:
- `epoch_v2`
- authority pubkey

### 3) Authority not funded
Fund with:
```bash
solana airdrop 2 --url https://api.testnet.solana.com
```
