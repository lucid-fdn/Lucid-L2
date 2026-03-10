# Chain Parity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Lucid-L2's SDK chain-agnostic — same call, same outcome, no mocks. Solana and EVM both work or throw typed errors.

**Architecture:** Domain sub-interfaces (`IEpochAdapter`, `IEscrowAdapter`, `IPassportAdapter`) sit between engine services and chain implementations. Capabilities derive from `ChainConfig` — if a contract address is configured, it works. DB is canonical, chains are anchors.

**Tech Stack:** TypeScript (engine), Solidity 0.8.24 (EVM contracts), Anchor/Rust (Solana programs), viem (EVM calls), @solana/web3.js (Solana calls), Hardhat (EVM deploy/test)

**Spec:** `docs/plans/2026-03-05-chain-parity-mvp-spec.md`

---

## Phase A: Adapter Honesty

### Task 1: Domain Sub-Interfaces

**Files:**
- Create: `offchain/packages/engine/src/chains/domain-interfaces.ts`
- Modify: `offchain/packages/engine/src/chains/adapter-interface.ts:22-87`

**Step 1: Create domain interfaces file**

```typescript
// offchain/packages/engine/src/chains/domain-interfaces.ts

import type { TxReceipt } from './types';

// --- Epoch anchoring (Solana: thought-epoch, EVM: EpochRegistry) ---

export interface IEpochAdapter {
  commitEpoch(agentId: string, root: string, epochId: number, leafCount: number, mmrSize: number): Promise<TxReceipt>;
  commitEpochBatch(epochs: { agentId: string; root: string; epochId: number; leafCount: number; mmrSize: number }[]): Promise<TxReceipt>;
  verifyEpoch(agentId: string, epochId: number, expectedRoot: string): Promise<boolean>;
}

// --- Escrow (Solana: lucid-agent-wallet, EVM: LucidEscrow) ---

export interface EscrowParams {
  beneficiary: string;
  token: string;
  amount: bigint;
  durationSeconds: number;
  expectedReceiptHash: string;
}

export interface IEscrowAdapter {
  createEscrow(params: EscrowParams): Promise<{ escrowId: string; tx: TxReceipt }>;
  releaseEscrow(escrowId: string, receiptHash: string, signature: string): Promise<TxReceipt>;
  claimTimeout(escrowId: string): Promise<TxReceipt>;
  disputeEscrow(escrowId: string, reason: string): Promise<TxReceipt>;
}

// --- Passport anchoring (Solana: lucid-passports, EVM: LucidPassportRegistry) ---

export interface IPassportAdapter {
  anchorPassport(passportId: string, contentHash: string, owner: string): Promise<TxReceipt>;
  updatePassportStatus(passportId: string, status: number): Promise<TxReceipt>;
  verifyAnchor(passportId: string, contentHash: string): Promise<boolean>;
  setPaymentGate(passportId: string, priceNative: bigint, priceLucid: bigint): Promise<TxReceipt>;
  payForAccess(passportId: string, duration: number): Promise<TxReceipt>;
  checkAccess(passportId: string, user: string): Promise<boolean>;
  withdrawRevenue(passportId: string): Promise<TxReceipt>;
}

// --- Agent wallet (Solana: lucid-agent-wallet PDA, EVM: TBA + session module) ---

export interface WalletPolicy {
  maxPerTx: bigint;
  dailyLimit: bigint;
  allowedTargets: string[];
  timeWindowStart: number;
  timeWindowEnd: number;
}

export interface IAgentWalletAdapter {
  createWallet(passportRef: string): Promise<{ walletAddress: string; tx: TxReceipt }>;
  execute(walletAddress: string, instruction: { to: string; data: string }): Promise<TxReceipt>;
  setPolicy(walletAddress: string, policy: WalletPolicy): Promise<TxReceipt>;
  createSession(walletAddress: string, delegate: string, permissions: number, expiresAt: number, maxAmount: bigint): Promise<TxReceipt>;
  revokeSession(walletAddress: string, delegate: string): Promise<TxReceipt>;
}

// --- Gas (Solana only: gas-utils) ---

export interface GasRecipient {
  address: string;
  bps: number;
}

export interface IGasAdapter {
  collectAndSplit(iGas: bigint, mGas: bigint, recipients: GasRecipient[], burnBps: number): Promise<TxReceipt>;
}
```

**Step 2: Extend IBlockchainAdapter with domain accessors**

Add to `offchain/packages/engine/src/chains/adapter-interface.ts` after line 85 (before the closing `}`):

```typescript
  // =========================================================================
  // Domain Adapters (config-gated — throws if contract not configured)
  // =========================================================================

  /** Epoch anchoring. Throws if chain has no epoch program/contract. */
  epochs(): IEpochAdapter;

  /** Escrow operations. Throws if chain has no escrow program/contract. */
  escrow(): IEscrowAdapter;

  /** Passport anchoring + payment gate. Throws if not configured. */
  passports(): IPassportAdapter;

  /** Agent wallet. Returns undefined if chain has no wallet mechanism. */
  agentWallet?(): IAgentWalletAdapter;

  /** Gas burn/split. Returns undefined (only Solana has this). */
  gas?(): IGasAdapter;
```

Add import at top:
```typescript
import type { IEpochAdapter, IEscrowAdapter, IPassportAdapter, IAgentWalletAdapter, IGasAdapter } from './domain-interfaces';
```

**Step 3: Export from barrel**

Run: `grep -n "export" offchain/packages/engine/src/chains/index.ts` to find barrel, add:
```typescript
export * from './domain-interfaces';
```

**Step 4: Commit**

```bash
git add offchain/packages/engine/src/chains/domain-interfaces.ts offchain/packages/engine/src/chains/adapter-interface.ts
git commit -m "feat(chains): add domain sub-interfaces for chain-agnostic adapter layer"
```

---

### Task 2: Solana Adapter — Real Agent Wallet Instructions

**Files:**
- Modify: `offchain/packages/engine/src/chains/solana/adapter.ts:327-410`

The pattern for building Anchor instructions already exists in `receipt/anchoringService.ts:199-252`. We follow the same pattern: discriminator + serialized args + account metas.

**Step 1: Add instruction discriminators and builders**

Add after the imports (around line 33) in `chains/solana/adapter.ts`:

```typescript
import { TransactionInstruction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';

// Anchor discriminators for lucid-agent-wallet program
// sha256("global:<instruction_name>")[0:8]
const CREATE_WALLET_DISC = Buffer.from([0x2e, 0x0e, 0xd2, 0xa7, 0x20, 0x5a, 0x3f, 0xa2]);
const SET_POLICY_DISC = Buffer.from([0xd5, 0x44, 0xd6, 0x2c, 0x7f, 0x46, 0xa2, 0x8b]);
const CREATE_ESCROW_DISC = Buffer.from([0xe5, 0x78, 0x0c, 0x38, 0xf0, 0x6e, 0x73, 0x60]);
const RELEASE_ESCROW_DISC = Buffer.from([0x10, 0x0e, 0x07, 0xd8, 0x6f, 0x3d, 0x28, 0x72]);
```

Note: Exact discriminator bytes must be verified by running:
```bash
echo -n "global:create_wallet" | sha256sum | head -c 16
echo -n "global:set_policy" | sha256sum | head -c 16
echo -n "global:create_escrow" | sha256sum | head -c 16
echo -n "global:release_escrow" | sha256sum | head -c 16
```

**Step 2: Replace `createAgentWallet` mock (lines 327-342)**

Replace the mock with a real instruction builder:

```typescript
async createAgentWallet(passportMint: string): Promise<{ walletPda: string; txHash: string }> {
  this.ensureConnected();
  const agentWalletProgram = this._config?.agentWalletProgram;
  if (!agentWalletProgram) throw new Error('LucidAgentWallet program not configured');
  if (!this._keypair || !this._connection) throw new Error('Keypair or connection not available');

  const mintPubkey = new PublicKey(passportMint);
  const programId = new PublicKey(agentWalletProgram);
  const [walletPda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('agent_wallet'), mintPubkey.toBuffer()],
    programId,
  );

  // Check if wallet already exists
  const existing = await this._connection.getAccountInfo(walletPda);
  if (existing) {
    return { walletPda: walletPda.toBase58(), txHash: 'already_exists' };
  }

  const data = Buffer.concat([CREATE_WALLET_DISC, Buffer.from([bump])]);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: this._keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: walletPda, isSigner: false, isWritable: true },
      { pubkey: mintPubkey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(this._connection, tx, [this._keypair], {
    commitment: this._commitment,
  });

  return { walletPda: walletPda.toBase58(), txHash: signature };
}
```

**Step 3: Replace `setPolicy` mock (lines 347-359)**

```typescript
async setPolicy(walletPda: string, params: {
  maxPerTx: bigint;
  dailyLimit: bigint;
  allowedPrograms: string[];
  timeWindowStart?: number;
  timeWindowEnd?: number;
}): Promise<{ txHash: string }> {
  this.ensureConnected();
  if (!this._config?.agentWalletProgram) throw new Error('LucidAgentWallet program not configured');
  if (!this._keypair || !this._connection) throw new Error('Keypair or connection not available');

  const programId = new PublicKey(this._config.agentWalletProgram);
  const walletPubkey = new PublicKey(walletPda);
  const [policyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('policy'), walletPubkey.toBuffer()],
    programId,
  );

  // Serialize: max_per_tx(u64) + daily_limit(u64) + allowed_programs(Vec<Pubkey>) + time_window_start(i64) + time_window_end(i64)
  const maxPerTxBuf = Buffer.alloc(8); maxPerTxBuf.writeBigUInt64LE(params.maxPerTx);
  const dailyLimitBuf = Buffer.alloc(8); dailyLimitBuf.writeBigUInt64LE(params.dailyLimit);
  const programsVecLen = Buffer.alloc(4); programsVecLen.writeUInt32LE(params.allowedPrograms.length);
  const programsBuf = Buffer.concat(params.allowedPrograms.map(p => new PublicKey(p).toBuffer()));
  const twStart = Buffer.alloc(8); twStart.writeBigInt64LE(BigInt(params.timeWindowStart ?? 0));
  const twEnd = Buffer.alloc(8); twEnd.writeBigInt64LE(BigInt(params.timeWindowEnd ?? 0));

  const data = Buffer.concat([SET_POLICY_DISC, maxPerTxBuf, dailyLimitBuf, programsVecLen, programsBuf, twStart, twEnd]);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: this._keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: walletPubkey, isSigner: false, isWritable: false },
      { pubkey: policyPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(this._connection, tx, [this._keypair], {
    commitment: this._commitment,
  });

  return { txHash: signature };
}
```

**Step 4: Replace `createEscrow` mock (lines 364-376)**

```typescript
async createEscrow(walletPda: string, params: {
  beneficiary: string;
  tokenMint: string;
  amount: bigint;
  durationSeconds: number;
  expectedReceiptHash: Uint8Array;
}): Promise<{ escrowPda: string; txHash: string }> {
  this.ensureConnected();
  if (!this._config?.agentWalletProgram) throw new Error('LucidAgentWallet program not configured');
  if (!this._keypair || !this._connection) throw new Error('Keypair or connection not available');

  const programId = new PublicKey(this._config.agentWalletProgram);
  const walletPubkey = new PublicKey(walletPda);

  // Read current nonce from wallet account to derive escrow PDA
  const walletInfo = await this._connection.getAccountInfo(walletPubkey);
  if (!walletInfo) throw new Error(`Agent wallet not found: ${walletPda}`);
  // nonce is at offset 8 (discriminator) + 32 (owner) + 32 (passport_mint) = 72, 8 bytes
  const nonce = walletInfo.data.readBigUInt64LE(72);
  const nonceBuf = Buffer.alloc(8); nonceBuf.writeBigUInt64LE(nonce);

  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), walletPubkey.toBuffer(), nonceBuf],
    programId,
  );

  // Serialize: amount(u64) + duration_seconds(i64) + expected_receipt_hash([u8;32])
  const amountBuf = Buffer.alloc(8); amountBuf.writeBigUInt64LE(params.amount);
  const durationBuf = Buffer.alloc(8); durationBuf.writeBigInt64LE(BigInt(params.durationSeconds));
  const hashBuf = Buffer.from(params.expectedReceiptHash);

  const data = Buffer.concat([CREATE_ESCROW_DISC, amountBuf, durationBuf, hashBuf]);

  const beneficiaryPubkey = new PublicKey(params.beneficiary);
  const tokenMintPubkey = new PublicKey(params.tokenMint);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: this._keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: walletPubkey, isSigner: false, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: beneficiaryPubkey, isSigner: false, isWritable: false },
      { pubkey: tokenMintPubkey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(this._connection, tx, [this._keypair], {
    commitment: this._commitment,
  });

  return { escrowPda: escrowPda.toBase58(), txHash: signature };
}
```

**Step 5: Replace `releaseEscrow` mock (lines 381-391)**

```typescript
async releaseEscrow(escrowPda: string, params: {
  walletPda: string;
  receiptHash: Uint8Array;
  receiptSignature: Uint8Array;
}): Promise<{ txHash: string }> {
  this.ensureConnected();
  if (!this._config?.agentWalletProgram) throw new Error('LucidAgentWallet program not configured');
  if (!this._keypair || !this._connection) throw new Error('Keypair or connection not available');

  const programId = new PublicKey(this._config.agentWalletProgram);
  const data = Buffer.concat([
    RELEASE_ESCROW_DISC,
    Buffer.from(params.receiptHash),
    Buffer.from(params.receiptSignature),
  ]);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: this._keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(params.walletPda), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(escrowPda), isSigner: false, isWritable: true },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(this._connection, tx, [this._keypair], {
    commitment: this._commitment,
  });

  return { txHash: signature };
}
```

**Step 6: Remove `verifyZkMLProof` (lines 396-410)**

Delete the method entirely. Replace with a comment:
```typescript
// zkML verification removed from adapter — PoER ≠ correctness proof.
// Contracts remain deployed for future use. See chain-parity-mvp-spec.md §6.
```

**Step 7: Verify discriminator bytes**

Run this from the Lucid-L2 root to compute actual discriminators:
```bash
cd /home/debian/Lucid/Lucid-L2
for name in create_wallet set_policy create_escrow release_escrow; do
  echo -n "global:${name}" | sha256sum | cut -c1-16
  echo " → ${name}"
done
```

Compare output to the hardcoded constants and fix if needed.

**Step 8: Commit**

```bash
git add offchain/packages/engine/src/chains/solana/adapter.ts
git commit -m "feat(solana): replace mock agent-wallet methods with real Anchor instructions"
```

---

### Task 3: EVM Escrow — Replace Stub Calldata with viem

**Files:**
- Modify: `offchain/packages/engine/src/finance/escrowService.ts:387-399`

**Step 1: Add viem import**

At top of `escrowService.ts`, add:
```typescript
import { encodeFunctionData } from 'viem';
```

**Step 2: Replace `encodeFunctionCall` stub (lines 387-399)**

Delete the old function. Replace with:

```typescript
function encodeEscrowCall(funcName: string, params: unknown[]): string {
  const func = ESCROW_ABI.find((f) => f.name === funcName && f.type === 'function');
  if (!func) throw new Error(`Unknown escrow function: ${funcName}`);

  return encodeFunctionData({
    abi: [func],
    functionName: funcName,
    args: params,
  });
}
```

**Step 3: Update all callsites**

Replace `encodeFunctionCall(` with `encodeEscrowCall(` at lines 126, 178, 221, 252.

**Step 4: Run type check**

```bash
cd offchain && npx tsc --noEmit
```

Expected: No errors related to escrowService.

**Step 5: Commit**

```bash
git add offchain/packages/engine/src/finance/escrowService.ts
git commit -m "fix(escrow): replace stub calldata with real viem ABI encoding"
```

---

### Task 4: EVM Dispute — Replace Stub Calldata with viem

**Files:**
- Modify: `offchain/packages/engine/src/finance/disputeService.ts`

**Step 1: Add viem import and replace stubs**

Same pattern as Task 3. Add `import { encodeFunctionData } from 'viem'` at top.

Replace all `0x${funcName}_stub` patterns (lines 122, 165, 189, 218) with real `encodeFunctionData()` calls using the existing `ARBITRATION_ABI` constant (lines 11-85).

```typescript
function encodeArbitrationCall(funcName: string, params: unknown[]): string {
  const func = ARBITRATION_ABI.find((f: any) => f.name === funcName && f.type === 'function');
  if (!func) throw new Error(`Unknown arbitration function: ${funcName}`);

  return encodeFunctionData({
    abi: [func],
    functionName: funcName,
    args: params,
  });
}
```

**Step 2: Run type check**

```bash
cd offchain && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add offchain/packages/engine/src/finance/disputeService.ts
git commit -m "fix(dispute): replace stub calldata with real viem ABI encoding"
```

---

### Task 5: Solana Validation/Reputation — Persist to DB

**Files:**
- Modify: `offchain/packages/engine/src/chains/solana/adapter.ts:45-47` (Map stores)
- Create: `infrastructure/migrations/20260306_validation_reputation.sql`

**Step 1: Write migration**

```sql
-- 20260306_validation_reputation.sql
-- Persist validation and reputation records (previously ephemeral Map in SolanaAdapter)

CREATE TABLE IF NOT EXISTS validations (
  validation_id TEXT PRIMARY KEY,
  agent_token_id TEXT NOT NULL,
  validator TEXT NOT NULL,
  valid BOOLEAN NOT NULL,
  receipt_hash TEXT,
  metadata TEXT,
  chain_id TEXT NOT NULL DEFAULT 'solana-devnet',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_validations_agent ON validations(agent_token_id);

CREATE TABLE IF NOT EXISTS reputation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_token_id TEXT NOT NULL,
  from_address TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 100),
  category TEXT,
  comment_hash TEXT,
  chain_id TEXT NOT NULL DEFAULT 'solana-devnet',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reputation_agent ON reputation_scores(agent_token_id);
```

**Step 2: Replace Map stores with DB calls in SolanaAdapter**

Replace `submitValidation()` and `submitReputation()` methods (which currently use `this._validationStore` and `this._reputationStore` Maps) with calls to the Supabase pool:

```typescript
async submitValidation(params: ValidationSubmission): Promise<TxReceipt> {
  this.ensureConnected();
  const { getPool } = await import('../../db/pool');
  const pool = getPool();

  const validationId = `val_${this._chainId}_${Date.now()}_${params.agentTokenId.slice(0, 8)}`;
  await pool.query(
    `INSERT INTO validations (validation_id, agent_token_id, validator, valid, receipt_hash, metadata, chain_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [validationId, params.agentTokenId, this._keypair?.publicKey.toBase58() ?? 'unknown',
     params.valid, params.receiptHash, params.metadata ?? null, this._chainId]
  );

  return { hash: validationId, chainId: this._chainId, success: true, statusMessage: 'Validation persisted to DB' };
}

async getValidation(validationId: string): Promise<ValidationResult | null> {
  const { getPool } = await import('../../db/pool');
  const pool = getPool();

  const { rows } = await pool.query('SELECT * FROM validations WHERE validation_id = $1', [validationId]);
  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    validationId: r.validation_id,
    agentTokenId: r.agent_token_id,
    validator: r.validator,
    valid: r.valid,
    timestamp: Math.floor(new Date(r.created_at).getTime() / 1000),
    metadata: r.metadata,
  };
}
```

Apply same pattern for `submitReputation` / `readReputation`.

**Step 3: Remove the Map declarations (lines 45-47)**

Delete:
```typescript
private _validationStore = new Map<string, ValidationResult>();
private _reputationStore = new Map<string, ReputationData[]>();
```

**Step 4: Commit**

```bash
git add infrastructure/migrations/20260306_validation_reputation.sql offchain/packages/engine/src/chains/solana/adapter.ts
git commit -m "fix(solana): persist validation/reputation to DB instead of ephemeral Map"
```

---

## Phase B: Unified Anchoring + Batch Epoch

### Task 6: Add `commitEpochBatch` to EpochRegistry.sol

**Files:**
- Modify: `contracts/src/EpochRegistry.sol:133` (after `commitEpoch`)

**Step 1: Add batch function**

Insert after line 133 (after `commitEpoch`):

```solidity
/// @notice Commit multiple epoch roots in a single transaction (gas optimization).
/// @param agentIds Array of agent identifiers
/// @param mmrRoots Array of MMR roots
/// @param epochIds Array of epoch sequence numbers
/// @param leafCounts Array of leaf counts
/// @param mmrSizes Array of MMR sizes
function commitEpochBatch(
    bytes32[] calldata agentIds,
    bytes32[] calldata mmrRoots,
    uint64[] calldata epochIds,
    uint64[] calldata leafCounts,
    uint64[] calldata mmrSizes
) external onlyAuthorized {
    uint256 len = agentIds.length;
    require(len > 0 && len <= 16, "batch: 1-16 epochs");
    require(len == mmrRoots.length && len == epochIds.length
         && len == leafCounts.length && len == mmrSizes.length, "batch: length mismatch");

    for (uint256 i = 0; i < len; i++) {
        if (mmrRoots[i] == bytes32(0)) revert InvalidRoot();
        if (epochIds[i] == 0) revert InvalidEpochId();

        uint64 latest = latestEpoch[agentIds[i]];
        if (epochIds[i] <= latest) revert EpochAlreadyExists();

        agentEpochs[agentIds[i]].push(EpochData({
            mmrRoot: mmrRoots[i],
            epochId: epochIds[i],
            leafCount: leafCounts[i],
            timestamp: block.timestamp,
            mmrSize: mmrSizes[i],
            finalized: true
        }));
        latestEpoch[agentIds[i]] = epochIds[i];

        emit EpochCommitted(agentIds[i], epochIds[i], mmrRoots[i], leafCounts[i], mmrSizes[i], block.timestamp);
    }
}
```

**Step 2: Compile**

```bash
cd contracts && npx hardhat compile
```

Expected: Compilation successful.

**Step 3: Deploy to testnets**

```bash
cd contracts && npx hardhat run scripts/deploy-epoch-registry.ts --network baseSepolia
```

**Step 4: Commit**

```bash
git add contracts/src/EpochRegistry.sol
git commit -m "feat(evm): add commitEpochBatch to EpochRegistry for gas-efficient multi-chain anchoring"
```

---

### Task 7: Implement IEpochAdapter on Both Adapters

**Files:**
- Modify: `offchain/packages/engine/src/chains/evm/adapter.ts`
- Modify: `offchain/packages/engine/src/chains/solana/adapter.ts`

**Step 1: EVMAdapter — implement `epochs()`**

Add method to EVMAdapter class. Uses viem `writeContract` and `readContract`:

```typescript
import { encodeFunctionData, type Abi } from 'viem';
import type { IEpochAdapter, IEscrowAdapter, IPassportAdapter } from '../domain-interfaces';

// ABI fragment for EpochRegistry
const EPOCH_REGISTRY_ABI = [
  { name: 'commitEpoch', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'bytes32' }, { name: 'mmrRoot', type: 'bytes32' },
      { name: 'epochId', type: 'uint64' }, { name: 'leafCount', type: 'uint64' },
      { name: 'mmrSize', type: 'uint64' },
    ], outputs: [] },
  { name: 'commitEpochBatch', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentIds', type: 'bytes32[]' }, { name: 'mmrRoots', type: 'bytes32[]' },
      { name: 'epochIds', type: 'uint64[]' }, { name: 'leafCounts', type: 'uint64[]' },
      { name: 'mmrSizes', type: 'uint64[]' },
    ], outputs: [] },
  { name: 'verifyEpochInclusion', type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'bytes32' }, { name: 'epochId', type: 'uint64' },
      { name: 'mmrRoot', type: 'bytes32' },
    ], outputs: [{ name: 'valid', type: 'bool' }] },
] as const;

// Inside EVMAdapter class:
epochs(): IEpochAdapter {
  const registryAddr = this._config?.epochRegistry;
  if (!registryAddr) throw new Error(`EpochRegistry not configured on ${this._chainId}`);

  const publicClient = this._publicClient!;
  const walletClient = this._walletClient!;
  const chainId = this._chainId;

  return {
    async commitEpoch(agentId, root, epochId, leafCount, mmrSize) {
      const hash = await walletClient.writeContract({
        address: registryAddr as `0x${string}`,
        abi: EPOCH_REGISTRY_ABI,
        functionName: 'commitEpoch',
        args: [agentId as `0x${string}`, root as `0x${string}`, BigInt(epochId), BigInt(leafCount), BigInt(mmrSize)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, chainId, success: receipt.status === 'success', blockNumber: Number(receipt.blockNumber) };
    },
    async commitEpochBatch(epochs) {
      const hash = await walletClient.writeContract({
        address: registryAddr as `0x${string}`,
        abi: EPOCH_REGISTRY_ABI,
        functionName: 'commitEpochBatch',
        args: [
          epochs.map(e => e.agentId as `0x${string}`),
          epochs.map(e => e.root as `0x${string}`),
          epochs.map(e => BigInt(e.epochId)),
          epochs.map(e => BigInt(e.leafCount)),
          epochs.map(e => BigInt(e.mmrSize)),
        ],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, chainId, success: receipt.status === 'success', blockNumber: Number(receipt.blockNumber) };
    },
    async verifyEpoch(agentId, epochId, expectedRoot) {
      const result = await publicClient.readContract({
        address: registryAddr as `0x${string}`,
        abi: EPOCH_REGISTRY_ABI,
        functionName: 'verifyEpochInclusion',
        args: [agentId as `0x${string}`, BigInt(epochId), expectedRoot as `0x${string}`],
      });
      return result as boolean;
    },
  };
}
```

**Step 2: SolanaAdapter — implement `epochs()`**

Wraps existing instruction builders from `anchoringService.ts`:

```typescript
import type { IEpochAdapter } from '../domain-interfaces';
import {
  buildCommitEpochV2Instruction,
  buildInitEpochV2Instruction,
  deriveEpochRecordV2PDA,
} from '../../receipt/anchoringService';

// Inside SolanaAdapter class:
epochs(): IEpochAdapter {
  if (!this._config?.thoughtEpochProgram) throw new Error(`thought-epoch not configured on ${this._chainId}`);
  const conn = this._connection!;
  const keypair = this._keypair!;
  const chainId = this._chainId;

  return {
    async commitEpoch(agentId, root, epochId, leafCount, mmrSize) {
      const rootBuf = Buffer.from(root.replace('0x', ''), 'hex');
      const [pda] = deriveEpochRecordV2PDA(keypair.publicKey);
      const existing = await conn.getAccountInfo(pda);
      const timestamp = Math.floor(Date.now() / 1000);

      const ix = existing
        ? buildCommitEpochV2Instruction(keypair.publicKey, rootBuf, agentId, epochId, leafCount, timestamp, mmrSize)
        : buildInitEpochV2Instruction(keypair.publicKey, rootBuf, agentId, epochId, leafCount, timestamp, mmrSize);

      const tx = new Transaction().add(ix);
      const signature = await sendAndConfirmTransaction(conn, tx, [keypair], { commitment: 'confirmed' });
      return { hash: signature, chainId, success: true };
    },
    async commitEpochBatch(epochs) {
      const roots = epochs.map(e => Buffer.from(e.root.replace('0x', ''), 'hex'));
      const { buildCommitEpochsInstruction, buildInitEpochsInstruction, deriveEpochBatchRecordPDA } = await import('../../receipt/anchoringService');
      const [batchPda] = deriveEpochBatchRecordPDA(keypair.publicKey);
      const existing = await conn.getAccountInfo(batchPda);
      const ix = existing
        ? buildCommitEpochsInstruction(keypair.publicKey, roots)
        : buildInitEpochsInstruction(keypair.publicKey, roots);
      const tx = new Transaction().add(ix);
      const signature = await sendAndConfirmTransaction(conn, tx, [keypair], { commitment: 'confirmed' });
      return { hash: signature, chainId, success: true };
    },
    async verifyEpoch(agentId, epochId, expectedRoot) {
      const [pda] = deriveEpochRecordV2PDA(keypair.publicKey);
      const info = await conn.getAccountInfo(pda);
      if (!info) return false;
      const onChainRoot = info.data.slice(8, 40).toString('hex');
      return onChainRoot === expectedRoot.replace('0x', '');
    },
  };
}
```

**Step 3: Commit**

```bash
git add offchain/packages/engine/src/chains/evm/adapter.ts offchain/packages/engine/src/chains/solana/adapter.ts
git commit -m "feat(adapters): implement IEpochAdapter on both Solana and EVM adapters"
```

---

### Task 8: Multi-Chain Anchoring Service

**Files:**
- Modify: `offchain/packages/engine/src/receipt/anchoringService.ts:442-587`
- Modify: `offchain/packages/engine/src/receipt/epochService.ts:33` (`chain_tx` field)

**Step 1: Change `chain_tx` type in Epoch interface**

In `epochService.ts` line 33, change:
```typescript
chain_tx?: string;          // Solana transaction signature
```
to:
```typescript
chain_tx?: Record<string, string>;  // chainId → transaction hash
```

Update all references to `chain_tx` throughout the file (string → Record).

**Step 2: Refactor `commitEpochRoot` for multi-chain**

In `anchoringService.ts`, refactor `commitEpochRoot()` (line 442) to:

1. Read `ANCHORING_CHAINS` env var (default: `solana-devnet`)
2. For each chain, get adapter via `blockchainAdapterFactory`
3. Call `adapter.epochs().commitEpoch()`
4. Collect results per chain
5. `anchored` when >= 1 chain succeeds

```typescript
export async function commitEpochRoot(epoch_id: string): Promise<AnchorResult> {
  const anchoringChains = (process.env.ANCHORING_CHAINS || 'solana-devnet').split(',').map(s => s.trim());
  // ... prepare epoch as before ...

  if (config.mock_mode) { /* ... existing mock logic ... */ }

  const { blockchainAdapterFactory } = await import('../chains/factory');
  const chainResults: Record<string, string> = {};
  let anySuccess = false;

  for (const chainId of anchoringChains) {
    try {
      const adapter = await blockchainAdapterFactory.getAdapter(chainId);
      const epochAdapter = adapter.epochs();
      const result = await epochAdapter.commitEpoch(
        epoch.agent_passport_id || 'default',
        epoch.mmr_root,
        epoch.epoch_index,
        epoch.leaf_count,
        epoch.end_leaf_index ? epoch.end_leaf_index + 1 : epoch.leaf_count,
      );
      if (result.success) {
        chainResults[chainId] = result.hash;
        anySuccess = true;
      }
    } catch (error) {
      console.error(`Anchoring to ${chainId} failed:`, error instanceof Error ? error.message : error);
    }
  }

  if (anySuccess) {
    finalizeEpoch(epoch_id, chainResults, epoch.mmr_root);
    return { success: true, signature: Object.values(chainResults)[0], root: epoch.mmr_root, epoch_id };
  }

  failEpoch(epoch_id, 'All anchoring chains failed');
  return { success: false, root: epoch.mmr_root, epoch_id, error: 'All anchoring chains failed' };
}
```

**Step 3: Commit**

```bash
git add offchain/packages/engine/src/receipt/anchoringService.ts offchain/packages/engine/src/receipt/epochService.ts
git commit -m "feat(anchoring): multi-chain epoch anchoring via ANCHORING_CHAINS env var"
```

---

## Phase C: Passport Registry on EVM

### Task 9: Write LucidPassportRegistry.sol

**Files:**
- Create: `contracts/src/LucidPassportRegistry.sol`
- Create: `contracts/test/LucidPassportRegistry.test.ts`

**Step 1: Write the contract**

Full implementation of `LucidPassportRegistry.sol` as specified in the parity spec §2a.
Anchor + payment gate in one contract. ~150 lines. Uses OpenZeppelin Ownable, ReentrancyGuard, SafeERC20.

**Step 2: Write Hardhat test**

Test: register passport, verify anchor, set gate, pay for access (native + LUCID), withdraw, revoke.

**Step 3: Compile and test**

```bash
cd contracts && npx hardhat compile && npx hardhat test
```

**Step 4: Deploy to testnets**

```bash
cd contracts && npx hardhat run scripts/deploy-passport-registry.ts --network baseSepolia
cd contracts && npx hardhat run scripts/deploy-passport-registry.ts --network sepolia
cd contracts && npx hardhat run scripts/deploy-passport-registry.ts --network apechainTestnet
```

**Step 5: Update chain configs with deployed addresses**

Update `chains/configs.ts` with new `passportRegistry` addresses for each testnet.

**Step 6: Commit**

```bash
git add contracts/src/LucidPassportRegistry.sol contracts/test/ contracts/scripts/ offchain/packages/engine/src/chains/configs.ts
git commit -m "feat(evm): deploy LucidPassportRegistry with passport anchor + payment gate"
```

---

### Task 10: Implement IPassportAdapter on Both Adapters

**Files:**
- Modify: `offchain/packages/engine/src/chains/evm/adapter.ts`
- Modify: `offchain/packages/engine/src/chains/solana/adapter.ts`
- Modify: `offchain/packages/engine/src/chains/types.ts` (add `passportRegistry` to ChainConfig)

**Step 1: Add `passportRegistry` to ChainConfig**

In `chains/types.ts`, add after line 91:
```typescript
/** LucidPassportRegistry contract address */
passportRegistry?: string;
```

**Step 2: EVMAdapter — implement `passports()`**

Uses viem to call `LucidPassportRegistry` contract.

**Step 3: SolanaAdapter — implement `passports()`**

Wraps existing `lucid-passports` PDA-based instructions + `paymentGateService`.

**Step 4: Wire `passportSyncService` to use `IPassportAdapter`**

Add `PASSPORT_SYNC_CHAINS` env var. For each chain, call `adapter.passports().anchorPassport()`.

**Step 5: Wire `paymentGateService` to use `IPassportAdapter`**

Replace Solana-only calls with chain-routed `adapter.passports().setPaymentGate()`.

**Step 6: Commit**

```bash
git add offchain/packages/engine/src/chains/
git commit -m "feat(passports): implement IPassportAdapter on both chains, multi-chain passport sync"
```

---

## Phase D: Agent Wallet Outcome Parity

### Task 11: EVM Session Key Support

**Files:**
- Create: `contracts/src/LucidSessionKeys.sol`
- Modify: `offchain/packages/engine/src/chains/evm/adapter.ts`

**Step 1: Write `LucidSessionKeys.sol`**

Standalone contract that TBAs delegate to. Stores session keys per wallet:
- `createSession(address wallet, address delegate, uint16 permissions, uint256 expiresAt, uint256 maxAmount)`
- `revokeSession(address wallet, address delegate)`
- `validateSession(address wallet, address delegate)` (view)

**Step 2: Implement `IAgentWalletAdapter` on EVMAdapter**

TBA `execute()` + session key management via `LucidSessionKeys`.

**Step 3: Implement `IAgentWalletAdapter` on SolanaAdapter**

Wraps the real Anchor instructions from Task 2.

**Step 4: Commit**

```bash
git add contracts/src/LucidSessionKeys.sol offchain/packages/engine/src/chains/
git commit -m "feat(wallet): agent wallet outcome parity — session keys on both chains"
```

---

## Verification Checklist

After all tasks:

- [ ] `npx tsc --noEmit` passes in `offchain/`
- [ ] `npx hardhat compile` passes in `contracts/`
- [ ] `npx hardhat test` passes in `contracts/`
- [ ] No string contains `mock_` in adapter files (except test fixtures)
- [ ] No string contains `_stub` in finance service files
- [ ] `grep -r "mock_\${Date" offchain/packages/engine/src/chains/` returns empty
- [ ] `grep -r "0x\${funcName}_stub" offchain/packages/engine/src/finance/` returns empty
- [ ] `ANCHORING_CHAINS=solana-devnet,base-sepolia` works in dev environment
- [ ] `PASSPORT_SYNC_CHAINS=solana-devnet,base-sepolia` works in dev environment
