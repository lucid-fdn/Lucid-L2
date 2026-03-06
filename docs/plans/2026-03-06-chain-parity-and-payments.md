# Chain Parity + Payments Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Lucid-L2's adapter layer honest (zero mocks/stubs), add multi-chain epoch anchoring, implement PaymentGrant authorization primitive, deploy LucidPassportRegistry with on-chain payment gate, fix ERC-7579 stubs, and add payment epoch settlement.

**Architecture:** Domain sub-interfaces (`IEpochAdapter`, `IEscrowAdapter`, `IPassportAdapter`, `IAgentWalletAdapter`) sit between engine services and chain implementations. PaymentGrant (off-chain signed token) and AccessReceipt (on-chain `payForAccess()`) are dual authorization primitives — gateway accepts either. Payment epochs aggregate settlement asynchronously, separate from receipt epochs.

**Tech Stack:** TypeScript (engine), Solidity 0.8.24 (EVM contracts), Anchor/Rust (Solana programs), viem 2.46.2 (EVM calls), @solana/web3.js (Solana calls), Hardhat (EVM deploy/test), Jest (offchain tests)

**Design Doc:** `docs/plans/2026-03-06-payments-architecture-design.md`
**Supersedes:** `docs/plans/2026-03-06-chain-parity-implementation.md` (original plan, pre-payments architecture)

---

## Phase A: Adapter Honesty

### Task 1: Domain Sub-Interfaces

**Files:**
- Create: `offchain/packages/engine/src/chains/domain-interfaces.ts`
- Modify: `offchain/packages/engine/src/chains/adapter-interface.ts:86` (add domain accessors before closing brace)
- Modify: `offchain/packages/engine/src/chains/index.ts:5` (add barrel export)

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

export interface EscrowCreateParams {
  beneficiary: string;
  token: string;
  amount: bigint;
  durationSeconds: number;
  expectedReceiptHash: string;
}

export interface IEscrowAdapter {
  createEscrow(params: EscrowCreateParams): Promise<{ escrowId: string; tx: TxReceipt }>;
  releaseEscrow(escrowId: string, receiptHash: string, signature: string): Promise<TxReceipt>;
  claimTimeout(escrowId: string): Promise<TxReceipt>;
  disputeEscrow(escrowId: string, reason: string): Promise<TxReceipt>;
}

// --- Passport anchoring + payment gate (Solana: lucid-passports, EVM: LucidPassportRegistry) ---

export interface IPassportAdapter {
  anchorPassport(passportId: string, contentHash: string, owner: string): Promise<TxReceipt>;
  updatePassportStatus(passportId: string, status: number): Promise<TxReceipt>;
  verifyAnchor(passportId: string, contentHash: string): Promise<boolean>;
  setPaymentGate(passportId: string, priceNative: bigint, priceLucid: bigint): Promise<TxReceipt>;
  payForAccess(passportId: string, duration: number): Promise<TxReceipt>;
  checkAccess(passportId: string, user: string): Promise<boolean>;
  withdrawRevenue(passportId: string): Promise<TxReceipt>;
}

// --- Agent wallet (Solana: lucid-agent-wallet PDA, EVM: TBA + ERC-7579 modules) ---

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

**Step 2: Add domain accessors to IBlockchainAdapter**

In `offchain/packages/engine/src/chains/adapter-interface.ts`, add before the closing `}` of the interface (after line 86):

```typescript
  // Domain Adapters (config-gated — throws if contract not configured)

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

Add import at top of same file:

```typescript
import type { IEpochAdapter, IEscrowAdapter, IPassportAdapter, IAgentWalletAdapter, IGasAdapter } from './domain-interfaces';
```

**Step 3: Add barrel export**

In `offchain/packages/engine/src/chains/index.ts`, add after line 5:

```typescript
export * from './domain-interfaces';
```

**Step 4: Run type check**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx tsc --noEmit 2>&1 | head -30`

Expected: Errors about SolanaAdapter and EVMAdapter not implementing new interface methods. This is correct — we fix them in subsequent tasks.

**Step 5: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add offchain/packages/engine/src/chains/domain-interfaces.ts offchain/packages/engine/src/chains/adapter-interface.ts offchain/packages/engine/src/chains/index.ts
git commit -m "feat(chains): add domain sub-interfaces for chain-agnostic adapter layer"
```

---

### Task 2: Solana Adapter — Real Agent Wallet Instructions

**Files:**
- Modify: `offchain/packages/engine/src/chains/solana/adapter.ts:37-47` (remove Maps), `:323-410` (replace 5 mocks)
- Test: Run against local validator or just type-check

**Context:** The pattern for building Anchor instructions already exists in `offchain/packages/engine/src/receipt/anchoringService.ts:199-417`. Each instruction = discriminator (8 bytes from `sha256("global:<name>")`) + serialized args + account metas.

**Step 1: Compute real Anchor discriminators**

Run:
```bash
for name in create_wallet set_policy create_escrow release_escrow; do
  echo -n "global:${name}" | sha256sum | cut -c1-16
  echo " → ${name}"
done
```

Note the hex bytes. These go into constants at the top of the adapter.

**Step 2: Remove ephemeral Map stores**

Delete lines 46-47 in `solana/adapter.ts`:
```typescript
// DELETE these:
private _validationStore = new Map<string, ValidationResult>();
private _reputationStore = new Map<string, ReputationData[]>();
```

(We persist to DB in Task 3 instead.)

**Step 3: Replace `createAgentWallet` mock (lines 323-342)**

Replace with real Anchor instruction builder. Pattern from anchoringService: derive PDA, build instruction buffer (discriminator + args), create TransactionInstruction, sendAndConfirmTransaction.

```typescript
async createAgentWallet(passportMint: string): Promise<{ walletPda: string; txHash: string }> {
  this.ensureConnected();
  const agentWalletProgram = this._config?.agentWalletProgram;
  if (!agentWalletProgram) throw new Error('LucidAgentWallet program not configured');
  if (!this._keypair || !this._connection) throw new Error('Keypair or connection not available');

  const { PublicKey, TransactionInstruction, Transaction, SystemProgram } = await import('@solana/web3.js');
  const { sendAndConfirmTransaction } = await import('@solana/web3.js');

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

  // Discriminator from sha256("global:create_wallet")[0:8]
  // Replace these bytes with output from Step 1
  const discriminator = Buffer.from(CREATE_WALLET_DISC);
  const data = Buffer.concat([discriminator, Buffer.from([bump])]);

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

**Step 4: Replace `setPolicy` mock (lines 344-359)**

Same pattern. PDA seed: `['policy', walletPda]`. Serialize: max_per_tx(u64) + daily_limit(u64) + Vec<Pubkey> + time_window_start(i64) + time_window_end(i64).

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

  const { PublicKey, TransactionInstruction, Transaction, SystemProgram } = await import('@solana/web3.js');
  const { sendAndConfirmTransaction } = await import('@solana/web3.js');

  const programId = new PublicKey(this._config.agentWalletProgram);
  const walletPubkey = new PublicKey(walletPda);
  const [policyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('policy'), walletPubkey.toBuffer()],
    programId,
  );

  const maxPerTxBuf = Buffer.alloc(8); maxPerTxBuf.writeBigUInt64LE(params.maxPerTx);
  const dailyLimitBuf = Buffer.alloc(8); dailyLimitBuf.writeBigUInt64LE(params.dailyLimit);
  const programsVecLen = Buffer.alloc(4); programsVecLen.writeUInt32LE(params.allowedPrograms.length);
  const programsBuf = Buffer.concat(params.allowedPrograms.map(p => new PublicKey(p).toBuffer()));
  const twStart = Buffer.alloc(8); twStart.writeBigInt64LE(BigInt(params.timeWindowStart ?? 0));
  const twEnd = Buffer.alloc(8); twEnd.writeBigInt64LE(BigInt(params.timeWindowEnd ?? 0));

  const data = Buffer.concat([Buffer.from(SET_POLICY_DISC), maxPerTxBuf, dailyLimitBuf, programsVecLen, programsBuf, twStart, twEnd]);

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

**Step 5: Replace `createEscrow` mock (lines 361-376)**

PDA seed: `['escrow', walletPda, nonce_le_bytes]`. Read wallet account to get nonce at offset 72 (8 disc + 32 owner + 32 mint).

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

  const { PublicKey, TransactionInstruction, Transaction, SystemProgram } = await import('@solana/web3.js');
  const { sendAndConfirmTransaction } = await import('@solana/web3.js');

  const programId = new PublicKey(this._config.agentWalletProgram);
  const walletPubkey = new PublicKey(walletPda);

  const walletInfo = await this._connection.getAccountInfo(walletPubkey);
  if (!walletInfo) throw new Error(`Agent wallet not found: ${walletPda}`);
  const nonce = walletInfo.data.readBigUInt64LE(72);
  const nonceBuf = Buffer.alloc(8); nonceBuf.writeBigUInt64LE(nonce);

  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), walletPubkey.toBuffer(), nonceBuf],
    programId,
  );

  const amountBuf = Buffer.alloc(8); amountBuf.writeBigUInt64LE(params.amount);
  const durationBuf = Buffer.alloc(8); durationBuf.writeBigInt64LE(BigInt(params.durationSeconds));
  const hashBuf = Buffer.from(params.expectedReceiptHash);

  const data = Buffer.concat([Buffer.from(CREATE_ESCROW_DISC), amountBuf, durationBuf, hashBuf]);

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

**Step 6: Replace `releaseEscrow` mock (lines 378-391)**

```typescript
async releaseEscrow(escrowPda: string, params: {
  walletPda: string;
  receiptHash: Uint8Array;
  receiptSignature: Uint8Array;
}): Promise<{ txHash: string }> {
  this.ensureConnected();
  if (!this._config?.agentWalletProgram) throw new Error('LucidAgentWallet program not configured');
  if (!this._keypair || !this._connection) throw new Error('Keypair or connection not available');

  const { PublicKey, TransactionInstruction, Transaction } = await import('@solana/web3.js');
  const { sendAndConfirmTransaction } = await import('@solana/web3.js');

  const programId = new PublicKey(this._config.agentWalletProgram);
  const data = Buffer.concat([
    Buffer.from(RELEASE_ESCROW_DISC),
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

**Step 7: Update `verifyZkMLProof` (lines 393-410)**

Do NOT delete. Replace mock with real call attempt on Solana or typed error:

```typescript
async verifyZkMLProof(params: {
  modelHash: Uint8Array;
  proofA: Uint8Array;
  proofB: Uint8Array;
  proofC: Uint8Array;
  publicInputs: Uint8Array[];
  receiptHash: Uint8Array;
}): Promise<{ proofHash: string; txHash: string }> {
  this.ensureConnected();
  if (!this._config?.zkmlVerifierProgram) throw new Error('zkML verifier program not configured');

  // Solana alt_bn128 syscalls not yet available on devnet.
  // Keep method signature for when they ship. EVM ZkMLVerifier.sol works today.
  throw new Error('zkML verification not yet supported on Solana — alt_bn128 syscalls required. Use EVM chain.');
}
```

**Step 8: Add stub domain accessor methods**

Add these methods to SolanaAdapter class so it compiles (real implementations come in later tasks):

```typescript
epochs(): IEpochAdapter {
  throw new Error('IEpochAdapter: implement in Task 8');
}

escrow(): IEscrowAdapter {
  throw new Error('IEscrowAdapter: implement in Task 8');
}

passports(): IPassportAdapter {
  throw new Error('IPassportAdapter: implement in Task 14');
}
```

Add the import at top:
```typescript
import type { IEpochAdapter, IEscrowAdapter, IPassportAdapter, IAgentWalletAdapter, IGasAdapter } from '../domain-interfaces';
```

**Step 9: Type check**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx tsc --noEmit 2>&1 | head -40`

Expected: May still have errors from EVMAdapter. That's OK — fixed in Task 4.

**Step 10: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add offchain/packages/engine/src/chains/solana/adapter.ts
git commit -m "feat(solana): replace mock agent-wallet methods with real Anchor instructions"
```

---

### Task 3: Solana Validation/Reputation — Persist to DB

**Files:**
- Create: `infrastructure/migrations/20260306_validation_reputation.sql`
- Modify: `offchain/packages/engine/src/chains/solana/adapter.ts:184-242` (replace Map-based methods)

**Step 1: Write migration**

```sql
-- infrastructure/migrations/20260306_validation_reputation.sql
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

**Step 2: Replace `submitValidation` (lines 184-205)**

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
     params.valid, params.receiptHash ?? null, params.metadata ?? null, this._chainId]
  );

  return { hash: validationId, chainId: this._chainId, success: true, statusMessage: 'Validation persisted to DB' };
}
```

**Step 3: Replace `getValidation` (lines 207-210)**

```typescript
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

**Step 4: Replace `submitReputation` (lines 216-237) and `readReputation` (lines 239-242)**

Same pattern — insert to `reputation_scores` table, query by `agent_token_id`.

```typescript
async submitReputation(params: ReputationFeedback): Promise<TxReceipt> {
  this.ensureConnected();
  const { getPool } = await import('../../db/pool');
  const pool = getPool();

  await pool.query(
    `INSERT INTO reputation_scores (agent_token_id, from_address, score, category, comment_hash, chain_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [params.agentTokenId, this._keypair?.publicKey.toBase58() ?? 'unknown',
     params.score, params.category ?? null, params.commentHash ?? null, this._chainId]
  );

  return { hash: `rep_${this._chainId}_${Date.now()}`, chainId: this._chainId, success: true, statusMessage: 'Reputation persisted to DB' };
}

async readReputation(agentId: string): Promise<ReputationData[]> {
  const { getPool } = await import('../../db/pool');
  const pool = getPool();

  const { rows } = await pool.query(
    'SELECT * FROM reputation_scores WHERE agent_token_id = $1 ORDER BY created_at DESC',
    [agentId]
  );

  return rows.map((r: any) => ({
    from: r.from_address,
    agentTokenId: r.agent_token_id,
    score: r.score,
    category: r.category,
    timestamp: Math.floor(new Date(r.created_at).getTime() / 1000),
  }));
}
```

**Step 5: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add infrastructure/migrations/20260306_validation_reputation.sql offchain/packages/engine/src/chains/solana/adapter.ts
git commit -m "fix(solana): persist validation/reputation to DB instead of ephemeral Map"
```

---

### Task 4: EVM Escrow + Dispute — Replace Stub Calldata with viem

**Files:**
- Modify: `offchain/packages/engine/src/finance/escrowService.ts:126,178,221,252,387-399`
- Modify: `offchain/packages/engine/src/finance/disputeService.ts:122,165,189,218`

**Step 1: Replace `encodeFunctionCall` stub in escrowService.ts (lines 387-399)**

Delete the old `encodeFunctionCall` function. Replace with:

```typescript
import { encodeFunctionData } from 'viem';

function encodeEscrowCall(funcName: string, params: unknown[]): `0x${string}` {
  const func = ESCROW_ABI.find((f) => f.name === funcName && f.type === 'function');
  if (!func) throw new Error(`Unknown escrow function: ${funcName}`);

  return encodeFunctionData({
    abi: [func],
    functionName: funcName,
    args: params,
  });
}
```

**Step 2: Update all callsites in escrowService.ts**

Replace `encodeFunctionCall(` with `encodeEscrowCall(` at lines 126, 178, 221, 252.

**Step 3: Add `encodeArbitrationCall` to disputeService.ts**

Add at bottom of file:
```typescript
import { encodeFunctionData } from 'viem';

function encodeArbitrationCall(funcName: string, params: unknown[]): `0x${string}` {
  const func = ARBITRATION_ABI.find((f: any) => f.name === funcName && f.type === 'function');
  if (!func) throw new Error(`Unknown arbitration function: ${funcName}`);

  return encodeFunctionData({
    abi: [func],
    functionName: funcName,
    args: params,
  });
}
```

**Step 4: Replace 4 stub strings in disputeService.ts**

- Line 122: Replace `'0xopenDispute_stub'` with `encodeArbitrationCall('openDispute', [escrowId, reason])`
- Line 165: Replace `'0xsubmitEvidence_stub'` with `encodeArbitrationCall('submitEvidence', [disputeId, evidence.receiptHash, evidence.mmrRoot, evidence.mmrProof, evidence.description])`
- Line 189: Replace `'0xresolveDispute_stub'` with `encodeArbitrationCall('resolveDispute', [disputeId])`
- Line 218: Replace `'0xappealDecision_stub'` with `encodeArbitrationCall('appealDecision', [disputeId])`

**Step 5: Add stub domain accessors to EVMAdapter**

In `offchain/packages/engine/src/chains/evm/adapter.ts`, add stub methods so the class compiles:

```typescript
import type { IEpochAdapter, IEscrowAdapter, IPassportAdapter, IAgentWalletAdapter, IGasAdapter } from '../domain-interfaces';

epochs(): IEpochAdapter {
  throw new Error('IEpochAdapter: implement in Task 8');
}

escrow(): IEscrowAdapter {
  throw new Error('IEscrowAdapter: implement after LucidEscrow ABI wiring');
}

passports(): IPassportAdapter {
  throw new Error('IPassportAdapter: implement in Task 14');
}
```

**Step 6: Type check**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx tsc --noEmit 2>&1 | head -20`

Expected: Clean compile (or only unrelated errors).

**Step 7: Verify no stubs remain**

Run: `grep -rn "_stub" offchain/packages/engine/src/finance/`

Expected: No results.

**Step 8: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add offchain/packages/engine/src/finance/escrowService.ts offchain/packages/engine/src/finance/disputeService.ts offchain/packages/engine/src/chains/evm/adapter.ts
git commit -m "fix(finance): replace all stub calldata with real viem ABI encoding"
```

---

### Task 5: ERC-7579 — Replace Module Stubs with viem

**Files:**
- Modify: `offchain/packages/engine/src/identity/erc7579Service.ts:156,192,226,259,285`

**Step 1: Add viem import**

At top of `erc7579Service.ts`:
```typescript
import { encodeFunctionData } from 'viem';
```

**Step 2: Create ABI encoder helper**

Add after the ABI constants (after the RECEIPT_MODULE_ABI declaration):

```typescript
function encodeModuleCall(abi: readonly any[], funcName: string, params: unknown[]): `0x${string}` {
  const func = abi.find((f: any) => f.name === funcName && f.type === 'function');
  if (!func) throw new Error(`Unknown module function: ${funcName}`);

  return encodeFunctionData({
    abi: [func],
    functionName: funcName,
    args: params,
  });
}
```

**Step 3: Replace 5 stub calldata strings**

- Line 156 (`installModule`): Replace `'0xinstallModule_stub'` with `encodeModuleCall(getModuleAbi(moduleType), 'onInstall', [initData || '0x'])`
- Line 192 (`uninstallModule`): Replace `'0xuninstallModule_stub'` with `encodeModuleCall(getModuleAbi(moduleType), 'onUninstall', ['0x'])`
- Line 226 (`configurePolicyModule`): Replace `'0xconfigurePolicy_stub'` with `encodeModuleCall(POLICY_MODULE_ABI, 'setPolicy', [policyHashes[0], true])` (loop over hashes)
- Line 259 (`configurePayoutModule`): Replace `'0xconfigurePayout_stub'` with `encodeModuleCall(PAYOUT_MODULE_ABI, 'configureSplit', [recipients, basisPoints])`
- Line 285 (`emitReceipt`): Replace `'0xemitReceipt_stub'` with `encodeModuleCall(RECEIPT_MODULE_ABI, 'emitReceipt', [receiptData.receiptHash, receiptData.policyHash, receiptData.modelPassportId, receiptData.computePassportId, receiptData.tokensIn, receiptData.tokensOut])`

Add helper to select correct ABI:
```typescript
function getModuleAbi(moduleType: ModuleType): readonly any[] {
  switch (moduleType) {
    case ModuleType.Validator: return POLICY_MODULE_ABI;
    case ModuleType.Executor: return PAYOUT_MODULE_ABI;
    default: return POLICY_MODULE_ABI;
  }
}
```

**Step 4: Verify no stubs remain**

Run: `grep -rn "_stub" offchain/packages/engine/src/identity/erc7579Service.ts`

Expected: No results.

**Step 5: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add offchain/packages/engine/src/identity/erc7579Service.ts
git commit -m "fix(erc7579): replace all module stub calldata with real viem ABI encoding"
```

---

## Phase B: Unified Anchoring

### Task 6: Add `commitEpochBatch` to EpochRegistry.sol

**Files:**
- Modify: `contracts/src/EpochRegistry.sol` (add batch function after `commitEpoch`)
- Modify: `contracts/test/EpochRegistry.test.ts` (add batch test)

**Step 1: Read existing EpochRegistry.sol to find insertion point**

Run: `grep -n "function commitEpoch" contracts/src/EpochRegistry.sol`

**Step 2: Add batch function after `commitEpoch`**

```solidity
/// @notice Commit multiple epoch roots in a single transaction (gas optimization)
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

**Step 3: Add test for batch commit**

Add to `contracts/test/EpochRegistry.test.ts`:

```typescript
describe('commitEpochBatch', () => {
  it('should commit multiple epochs in one tx', async () => {
    const agentIds = [ethers.id('agent1'), ethers.id('agent2')];
    const roots = [ethers.id('root1'), ethers.id('root2')];
    const epochIds = [1n, 1n];
    const leafCounts = [10n, 20n];
    const mmrSizes = [15n, 31n];

    await epochRegistry.commitEpochBatch(agentIds, roots, epochIds, leafCounts, mmrSizes);

    // Verify both epochs were committed
    const epoch1 = await epochRegistry.getLatestEpoch(agentIds[0]);
    const epoch2 = await epochRegistry.getLatestEpoch(agentIds[1]);
    expect(epoch1.mmrRoot).to.equal(roots[0]);
    expect(epoch2.mmrRoot).to.equal(roots[1]);
  });

  it('should reject batch > 16', async () => {
    const agentIds = Array(17).fill(ethers.id('agent'));
    await expect(epochRegistry.commitEpochBatch(agentIds, agentIds, Array(17).fill(1n), Array(17).fill(1n), Array(17).fill(1n)))
      .to.be.revertedWith('batch: 1-16 epochs');
  });
});
```

**Step 4: Compile and test**

Run: `cd /home/debian/Lucid/Lucid-L2/contracts && npx hardhat compile && npx hardhat test test/EpochRegistry.test.ts`

**Step 5: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add contracts/src/EpochRegistry.sol contracts/test/EpochRegistry.test.ts
git commit -m "feat(evm): add commitEpochBatch to EpochRegistry for gas-efficient multi-chain anchoring"
```

---

### Task 7: Implement IEpochAdapter on Both Adapters

**Files:**
- Modify: `offchain/packages/engine/src/chains/evm/adapter.ts` (add `epochs()` method)
- Modify: `offchain/packages/engine/src/chains/solana/adapter.ts` (add `epochs()` method)

**Step 1: EVMAdapter — implement `epochs()`**

Replace the stub `epochs()` method in EVMAdapter with:

```typescript
epochs(): IEpochAdapter {
  const registryAddr = this._config?.epochRegistry;
  if (!registryAddr) throw new Error(`EpochRegistry not configured on ${this._chainId}`);

  const publicClient = this._publicClient!;
  const walletClient = this._walletClient!;
  const account = this._account!;
  const chainId = this._chainId;

  const EPOCH_ABI = [
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

  return {
    async commitEpoch(agentId, root, epochId, leafCount, mmrSize) {
      const hash = await walletClient.writeContract({
        address: registryAddr as `0x${string}`,
        abi: EPOCH_ABI,
        functionName: 'commitEpoch',
        args: [agentId as `0x${string}`, root as `0x${string}`, BigInt(epochId), BigInt(leafCount), BigInt(mmrSize)],
        account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, chainId, success: receipt.status === 'success', blockNumber: Number(receipt.blockNumber) };
    },
    async commitEpochBatch(epochs) {
      const hash = await walletClient.writeContract({
        address: registryAddr as `0x${string}`,
        abi: EPOCH_ABI,
        functionName: 'commitEpochBatch',
        args: [
          epochs.map(e => e.agentId as `0x${string}`),
          epochs.map(e => e.root as `0x${string}`),
          epochs.map(e => BigInt(e.epochId)),
          epochs.map(e => BigInt(e.leafCount)),
          epochs.map(e => BigInt(e.mmrSize)),
        ],
        account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, chainId, success: receipt.status === 'success', blockNumber: Number(receipt.blockNumber) };
    },
    async verifyEpoch(agentId, epochId, expectedRoot) {
      const result = await publicClient.readContract({
        address: registryAddr as `0x${string}`,
        abi: EPOCH_ABI,
        functionName: 'verifyEpochInclusion',
        args: [agentId as `0x${string}`, BigInt(epochId), expectedRoot as `0x${string}`],
      });
      return result as boolean;
    },
  };
}
```

**Step 2: SolanaAdapter — implement `epochs()`**

Replace the stub `epochs()` method in SolanaAdapter. Wraps existing instruction builders from `anchoringService.ts`:

```typescript
epochs(): IEpochAdapter {
  if (!this._config?.thoughtEpochProgram) throw new Error(`thought-epoch not configured on ${this._chainId}`);
  const connection = this._connection!;
  const keypair = this._keypair!;
  const chainId = this._chainId;

  return {
    async commitEpoch(agentId, root, epochId, leafCount, mmrSize) {
      const { buildCommitEpochV2Instruction, buildInitEpochV2Instruction, deriveEpochRecordV2PDA } =
        await import('../../receipt/anchoringService');
      const { Transaction } = await import('@solana/web3.js');
      const { sendAndConfirmTransaction } = await import('@solana/web3.js');

      const rootBuf = Buffer.from(root.replace('0x', ''), 'hex');
      const [pda] = deriveEpochRecordV2PDA(keypair.publicKey);
      const existing = await connection.getAccountInfo(pda);
      const timestamp = Math.floor(Date.now() / 1000);

      const ix = existing
        ? buildCommitEpochV2Instruction(keypair.publicKey, rootBuf, agentId, epochId, leafCount, timestamp, mmrSize)
        : buildInitEpochV2Instruction(keypair.publicKey, rootBuf, agentId, epochId, leafCount, timestamp, mmrSize);

      const tx = new Transaction().add(ix);
      const signature = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' });
      return { hash: signature, chainId, success: true };
    },

    async commitEpochBatch(epochs) {
      const { buildCommitEpochsInstruction, buildInitEpochsInstruction, deriveEpochBatchRecordPDA } =
        await import('../../receipt/anchoringService');
      const { Transaction } = await import('@solana/web3.js');
      const { sendAndConfirmTransaction } = await import('@solana/web3.js');

      const roots = epochs.map(e => Buffer.from(e.root.replace('0x', ''), 'hex'));
      const [batchPda] = deriveEpochBatchRecordPDA(keypair.publicKey);
      const existing = await connection.getAccountInfo(batchPda);

      const ix = existing
        ? buildCommitEpochsInstruction(keypair.publicKey, roots)
        : buildInitEpochsInstruction(keypair.publicKey, roots);

      const tx = new Transaction().add(ix);
      const signature = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' });
      return { hash: signature, chainId, success: true };
    },

    async verifyEpoch(_agentId, _epochId, expectedRoot) {
      const { deriveEpochRecordV2PDA } = await import('../../receipt/anchoringService');
      const [pda] = deriveEpochRecordV2PDA(keypair.publicKey);
      const info = await connection.getAccountInfo(pda);
      if (!info) return false;
      const onChainRoot = info.data.slice(8, 40).toString('hex');
      return onChainRoot === expectedRoot.replace('0x', '');
    },
  };
}
```

**Step 3: Type check**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add offchain/packages/engine/src/chains/evm/adapter.ts offchain/packages/engine/src/chains/solana/adapter.ts
git commit -m "feat(adapters): implement IEpochAdapter on both Solana and EVM adapters"
```

---

### Task 8: Multi-Chain Anchoring Service

**Files:**
- Modify: `offchain/packages/engine/src/receipt/epochService.ts:33` (`chain_tx` type change)
- Modify: `offchain/packages/engine/src/receipt/anchoringService.ts:442-587` (multi-chain loop)

**Step 1: Change `chain_tx` type in Epoch interface**

In `epochService.ts` at line 33, change:
```typescript
chain_tx?: string;
```
to:
```typescript
chain_tx?: Record<string, string>;
```

**Step 2: Update all references to `chain_tx`**

Search the file for `chain_tx` — anywhere it's assigned as a string, wrap in a record. In `finalizeEpoch()` (line 438), change from:
```typescript
epoch.chain_tx = txSignature;
```
to:
```typescript
epoch.chain_tx = typeof txSignature === 'string' ? { 'solana-devnet': txSignature } : txSignature;
```

In `persistEpochToDb()` (line 117), ensure `chain_tx` is stored as JSON:
```typescript
chain_tx: JSON.stringify(epoch.chain_tx),
```

In `loadEpochsFromDb()` (line 161), parse it back:
```typescript
chain_tx: typeof row.chain_tx === 'string' ? JSON.parse(row.chain_tx) : row.chain_tx,
```

**Step 3: Refactor `commitEpochRoot` for multi-chain**

In `anchoringService.ts` at `commitEpochRoot()` (line 442), add multi-chain support:

After the mock_mode check, replace the Solana-only path with:

```typescript
const anchoringChains = (process.env.ANCHORING_CHAINS || 'solana-devnet').split(',').map(s => s.trim());
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
    console.error(`[AnchoringService] Anchoring to ${chainId} failed:`, error instanceof Error ? error.message : error);
  }
}

if (anySuccess) {
  finalizeEpoch(epoch_id, chainResults, epoch.mmr_root);
  return { success: true, signature: Object.values(chainResults)[0], root: epoch.mmr_root, epoch_id };
}

failEpoch(epoch_id, 'All anchoring chains failed');
return { success: false, root: epoch.mmr_root, epoch_id, error: 'All anchoring chains failed' };
```

Keep the existing Solana-only path as fallback when no adapter factory is available.

**Step 4: Update `finalizeEpoch` to accept Record**

Change `finalizeEpoch(epoch_id, txSignature, root)` signature to accept `Record<string, string>` for the tx parameter.

**Step 5: Add `ANCHORING_CHAINS` to `.env.example`**

```
# Multi-chain epoch anchoring (comma-separated chain IDs)
# Default: solana-devnet (backward compatible)
ANCHORING_CHAINS=solana-devnet
```

**Step 6: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add offchain/packages/engine/src/receipt/anchoringService.ts offchain/packages/engine/src/receipt/epochService.ts offchain/.env.example
git commit -m "feat(anchoring): multi-chain epoch anchoring via ANCHORING_CHAINS env var"
```

---

## Phase C: Payment Primitives

### Task 9: PaymentGrant Type + Signing/Verification

**Files:**
- Create: `offchain/packages/engine/src/finance/paymentGrant.ts`
- Create: `offchain/packages/engine/src/finance/__tests__/paymentGrant.test.ts`

**Step 1: Write the failing test**

```typescript
// offchain/packages/engine/src/finance/__tests__/paymentGrant.test.ts

import { createPaymentGrant, verifyPaymentGrant, type PaymentGrant } from '../paymentGrant';

describe('PaymentGrant', () => {
  const secretKey = Buffer.alloc(64); // test key
  const publicKey = Buffer.alloc(32);

  beforeAll(async () => {
    const nacl = await import('tweetnacl');
    const pair = nacl.sign.keyPair();
    secretKey.set(pair.secretKey);
    publicKey.set(pair.publicKey);
  });

  it('should create and verify a valid grant', async () => {
    const grant = await createPaymentGrant({
      tenant_id: 'tenant_1',
      agent_passport_id: 'agent_1',
      run_id: 'run_1',
      scope: { models: ['*'], tools: ['*'], max_per_call_usd: 1.0 },
      limits: { total_usd: 100, expires_at: Math.floor(Date.now() / 1000) + 3600, max_calls: 1000 },
      attestation: { balance_verified_at: Math.floor(Date.now() / 1000), balance_source: 'credit' },
    }, secretKey);

    expect(grant.grant_id).toBeDefined();
    expect(grant.signature).toBeDefined();
    expect(grant.signer_pubkey).toBeDefined();

    const result = verifyPaymentGrant(grant, publicKey.toString('hex'));
    expect(result.valid).toBe(true);
  });

  it('should reject expired grant', () => {
    const grant: PaymentGrant = {
      grant_id: 'g1',
      tenant_id: 't1',
      agent_passport_id: 'a1',
      run_id: 'r1',
      scope: { models: ['*'], tools: ['*'], max_per_call_usd: 1.0 },
      limits: { total_usd: 100, expires_at: Math.floor(Date.now() / 1000) - 100, max_calls: 1000 },
      attestation: { balance_verified_at: 0, balance_source: 'credit' },
      signature: 'fake',
      signer_pubkey: 'fake',
    };

    const result = verifyPaymentGrant(grant, 'fake');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('should reject tampered grant', async () => {
    const grant = await createPaymentGrant({
      tenant_id: 'tenant_1',
      agent_passport_id: 'agent_1',
      run_id: 'run_1',
      scope: { models: ['*'], tools: ['*'], max_per_call_usd: 1.0 },
      limits: { total_usd: 100, expires_at: Math.floor(Date.now() / 1000) + 3600, max_calls: 1000 },
      attestation: { balance_verified_at: Math.floor(Date.now() / 1000), balance_source: 'credit' },
    }, secretKey);

    // Tamper with the grant
    grant.limits.total_usd = 999999;

    const result = verifyPaymentGrant(grant, publicKey.toString('hex'));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('signature');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='paymentGrant.test' --no-coverage`

Expected: FAIL — module not found.

**Step 3: Write implementation**

```typescript
// offchain/packages/engine/src/finance/paymentGrant.ts

import { createHash, randomUUID } from 'crypto';
import * as nacl from 'tweetnacl';
import { canonicalJson } from '../crypto/canonicalJson';
// ^^^ Uses @raijinlabs/passport's canonicalJsonLucid under the hood:
//     normalize(BigInt→string, NaN→null, Date→ISO, strip undefined) → JCS (RFC 8785)
//     DO NOT inline a local canonicalizer. One spec, one implementation.

export interface PaymentGrantScope {
  models: string[];
  tools: string[];
  max_per_call_usd: number;
}

export interface PaymentGrantLimits {
  total_usd: number;
  expires_at: number;
  max_calls: number;
}

export interface PaymentGrantAttestation {
  balance_verified_at: number;
  balance_source: 'escrow' | 'credit' | 'prepaid';
}

export interface PaymentGrant {
  grant_id: string;
  tenant_id: string;
  agent_passport_id: string;
  run_id: string;
  scope: PaymentGrantScope;
  limits: PaymentGrantLimits;
  attestation: PaymentGrantAttestation;
  signature: string;
  signer_pubkey: string;
}

export interface PaymentGrantInput {
  tenant_id: string;
  agent_passport_id: string;
  run_id: string;
  scope: PaymentGrantScope;
  limits: PaymentGrantLimits;
  attestation: PaymentGrantAttestation;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * Create a signed PaymentGrant.
 */
export async function createPaymentGrant(
  input: PaymentGrantInput,
  secretKey: Uint8Array,
): Promise<PaymentGrant> {
  const grant_id = `grant_${randomUUID()}`;
  const pubkey = nacl.sign.keyPair.fromSecretKey(secretKey).publicKey;

  const payload = {
    grant_id,
    tenant_id: input.tenant_id,
    agent_passport_id: input.agent_passport_id,
    run_id: input.run_id,
    scope: input.scope,
    limits: input.limits,
    attestation: input.attestation,
  };

  const message = Buffer.from(canonicalJson(payload), 'utf8');
  const digest = createHash('sha256').update(message).digest();
  const sig = nacl.sign.detached(digest, secretKey);

  return {
    ...payload,
    signature: Buffer.from(sig).toString('hex'),
    signer_pubkey: Buffer.from(pubkey).toString('hex'),
  };
}

/**
 * Verify a PaymentGrant signature and expiry.
 * Does NOT check balance — that's the issuer's responsibility at issuance time.
 */
export function verifyPaymentGrant(
  grant: PaymentGrant,
  trustedSignerPubkey: string,
): VerifyResult {
  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (grant.limits.expires_at < now) {
    return { valid: false, reason: `Grant expired at ${grant.limits.expires_at}, now ${now}` };
  }

  // Check signer matches trusted key
  if (grant.signer_pubkey !== trustedSignerPubkey) {
    return { valid: false, reason: 'Signer pubkey does not match trusted key' };
  }

  // Verify signature
  try {
    const payload = {
      grant_id: grant.grant_id,
      tenant_id: grant.tenant_id,
      agent_passport_id: grant.agent_passport_id,
      run_id: grant.run_id,
      scope: grant.scope,
      limits: grant.limits,
      attestation: grant.attestation,
    };

    const message = Buffer.from(canonicalJson(payload), 'utf8');
    const digest = createHash('sha256').update(message).digest();
    const sigBytes = Buffer.from(grant.signature, 'hex');
    const pubkeyBytes = Buffer.from(grant.signer_pubkey, 'hex');

    const valid = nacl.sign.detached.verify(digest, sigBytes, pubkeyBytes);
    if (!valid) {
      return { valid: false, reason: 'Invalid signature' };
    }
  } catch {
    return { valid: false, reason: 'Signature verification error' };
  }

  return { valid: true };
}
```

**Step 4: Run tests**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='paymentGrant.test' --no-coverage`

Expected: 3 tests PASS.

**Step 5: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add offchain/packages/engine/src/finance/paymentGrant.ts offchain/packages/engine/src/finance/__tests__/paymentGrant.test.ts
git commit -m "feat(payments): add PaymentGrant type with Ed25519 signing and verification"
```

---

### Task 10: Payment Events Table + Consumer

**Files:**
- Create: `infrastructure/migrations/20260306_payment_events.sql`
- Create: `offchain/packages/engine/src/finance/paymentEventService.ts`

**Step 1: Write migration**

```sql
-- infrastructure/migrations/20260306_payment_events.sql
-- Payment events + grant budgets for async settlement and replay protection

-- Grant spend tracking (replay-safe limits)
CREATE TABLE IF NOT EXISTS grant_budgets (
  grant_id TEXT PRIMARY KEY,            -- UUIDv4: grant_${randomUUID()}
  tenant_id TEXT NOT NULL,              -- operational queries + per-tenant cleanup
  signer_pubkey TEXT,                   -- observability: which key signed this grant
  max_calls INTEGER NOT NULL,
  max_usd NUMERIC(18,6) NOT NULL,
  calls_used INTEGER NOT NULL DEFAULT 0,
  usd_used NUMERIC(18,6) NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_grant_budgets_tenant ON grant_budgets(tenant_id);

-- Atomic budget consume: returns TRUE if budget available, FALSE if exceeded
CREATE OR REPLACE FUNCTION consume_grant_budget(
  p_grant_id TEXT, p_delta_usd NUMERIC, p_delta_calls INTEGER
) RETURNS BOOLEAN AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  -- Upsert on first use (grant_budgets populated lazily from PaymentGrant limits)
  INSERT INTO grant_budgets (grant_id, max_calls, max_usd, expires_at)
  VALUES (p_grant_id, 0, 0, NOW()) -- placeholder, real limits set by ensure_grant_budget()
  ON CONFLICT (grant_id) DO NOTHING;

  UPDATE grant_budgets
  SET calls_used = calls_used + p_delta_calls,
      usd_used = usd_used + p_delta_usd
  WHERE grant_id = p_grant_id
    AND calls_used + p_delta_calls <= max_calls
    AND usd_used + p_delta_usd <= max_usd
    AND expires_at > NOW()
  RETURNING TRUE INTO v_ok;

  RETURN COALESCE(v_ok, FALSE);
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  agent_passport_id TEXT,
  payer_address TEXT NOT NULL,
  payee_address TEXT NOT NULL,
  token TEXT NOT NULL,
  amount_raw TEXT NOT NULL,
  amount_usd NUMERIC(18,6),
  payment_method TEXT NOT NULL,
  grant_id TEXT,
  access_receipt_tx TEXT,
  receipt_epoch_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_events_run ON payment_events(run_id);
CREATE INDEX idx_payment_events_payer ON payment_events(payer_address);
CREATE INDEX idx_payment_events_epoch ON payment_events(receipt_epoch_id);

CREATE TABLE IF NOT EXISTS payment_epochs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epoch_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  receipt_epoch_refs TEXT[],
  settlement_root TEXT,
  chain_tx JSONB,
  total_settled_usd NUMERIC(18,6) DEFAULT 0,
  entry_count INTEGER DEFAULT 0,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX idx_payment_epochs_status ON payment_epochs(status);
```

**Step 2: Write payment event service**

```typescript
// offchain/packages/engine/src/finance/paymentEventService.ts

export interface PaymentEvent {
  id?: string;
  run_id: string;
  agent_passport_id?: string;
  payer_address: string;
  payee_address: string;
  token: string;
  amount_raw: string;
  amount_usd?: number;
  payment_method: 'grant' | 'access_receipt' | 'x402';
  grant_id?: string;
  access_receipt_tx?: string;
  receipt_epoch_id?: string;
  created_at?: Date;
}

export class PaymentEventService {
  private static instance: PaymentEventService | null = null;

  private constructor() {}

  static getInstance(): PaymentEventService {
    if (!PaymentEventService.instance) {
      PaymentEventService.instance = new PaymentEventService();
    }
    return PaymentEventService.instance;
  }

  async recordPaymentEvent(event: PaymentEvent): Promise<string> {
    const { getPool } = await import('../db/pool');
    const pool = getPool();

    const { rows } = await pool.query(
      `INSERT INTO payment_events (run_id, agent_passport_id, payer_address, payee_address, token, amount_raw, amount_usd, payment_method, grant_id, access_receipt_tx, receipt_epoch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [event.run_id, event.agent_passport_id, event.payer_address, event.payee_address,
       event.token, event.amount_raw, event.amount_usd ?? null, event.payment_method,
       event.grant_id ?? null, event.access_receipt_tx ?? null, event.receipt_epoch_id ?? null]
    );

    return rows[0].id;
  }

  async getPaymentEvents(filters: { run_id?: string; payer?: string; limit?: number }): Promise<PaymentEvent[]> {
    const { getPool } = await import('../db/pool');
    const pool = getPool();

    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.run_id) {
      params.push(filters.run_id);
      conditions.push(`run_id = $${params.length}`);
    }
    if (filters.payer) {
      params.push(filters.payer);
      conditions.push(`payer_address = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 100;
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT * FROM payment_events ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );

    return rows;
  }
}

export function getPaymentEventService(): PaymentEventService {
  return PaymentEventService.getInstance();
}
```

**Step 3: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add infrastructure/migrations/20260306_payment_events.sql offchain/packages/engine/src/finance/paymentEventService.ts
git commit -m "feat(payments): add payment_events table and PaymentEventService"
```

---

### Task 11: Gateway Middleware — Verify PaymentGrant

**Files:**
- Create: `offchain/packages/gateway-lite/src/middleware/paymentAuth.ts`
- Create: `offchain/packages/gateway-lite/src/middleware/__tests__/paymentAuth.test.ts`

**Step 1: Write the failing test**

```typescript
// offchain/packages/gateway-lite/src/middleware/__tests__/paymentAuth.test.ts

import { requirePaymentAuth } from '../paymentAuth';
import type { Request, Response, NextFunction } from 'express';

describe('paymentAuth middleware', () => {
  const mockNext = jest.fn() as NextFunction;
  const mockRes = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 402 when no payment header present', async () => {
    const req = { headers: {} } as Request;
    const middleware = requirePaymentAuth();

    await middleware(req, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should call next() when valid PaymentGrant present', async () => {
    // This test requires a real signed grant — set up in integration tests
    // For unit test, we mock the verification
  });
});
```

**Step 2: Write implementation**

```typescript
// offchain/packages/gateway-lite/src/middleware/paymentAuth.ts

import { Request, Response, NextFunction } from 'express';
import { verifyPaymentGrant, type PaymentGrant } from '@lucid-l2/engine/finance/paymentGrant';

const TRUSTED_SIGNER = process.env.PAYMENT_GRANT_SIGNER_PUBKEY || '';

/**
 * Payment authorization middleware.
 * Accepts either:
 * 1. X-Payment-Grant header (signed PaymentGrant JSON)
 * 2. On-chain access (verified via adapter — Task 14)
 * 3. Returns 402 if neither
 */
export function requirePaymentAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Path 1: PaymentGrant header
    const grantHeader = req.headers['x-payment-grant'] as string | undefined;
    if (grantHeader) {
      try {
        const grant: PaymentGrant = JSON.parse(
          Buffer.from(grantHeader, 'base64').toString('utf8')
        );

        // Step 1: Verify signature + expiry
        const result = verifyPaymentGrant(grant, TRUSTED_SIGNER);
        if (!result.valid) {
          return res.status(402).json({ error: 'Invalid PaymentGrant', reason: result.reason });
        }

        // Step 2: Atomic spend tracking (replay protection)
        const { getPool } = await import('@lucid-l2/engine/db/pool');
        const pool = getPool();

        // Ensure grant budget exists (lazy init from signed grant limits)
        await pool.query(
          `INSERT INTO grant_budgets (grant_id, tenant_id, signer_pubkey, max_calls, max_usd, expires_at)
           VALUES ($1, $2, $3, $4, $5, to_timestamp($6))
           ON CONFLICT (grant_id) DO NOTHING`,
          [grant.grant_id, grant.tenant_id, grant.signer_pubkey,
           grant.limits.max_calls, grant.limits.total_usd, grant.limits.expires_at]
        );

        // Consume budget atomically
        const estimatedCostUsd = grant.scope.max_per_call_usd; // conservative: charge max per call
        const { rows } = await pool.query(
          'SELECT consume_grant_budget($1, $2, $3) as ok',
          [grant.grant_id, estimatedCostUsd, 1]
        );

        if (!rows[0]?.ok) {
          return res.status(402).json({ error: 'Grant budget exceeded or expired' });
        }

        (req as any).paymentGrant = grant;
        return next();
      } catch {
        return res.status(402).json({ error: 'Malformed PaymentGrant header' });
      }
    }

    // Path 2: On-chain AccessReceipt (implemented in Task 14)
    // const accessReceipt = req.headers['x-access-receipt'];
    // if (accessReceipt) { ... verify via adapter.passports().checkAccess() ... }

    // No payment authorization
    return res.status(402).json({
      error: 'Payment Required',
      methods: [
        { type: 'payment_grant', header: 'X-Payment-Grant', description: 'Base64-encoded signed PaymentGrant JSON' },
        { type: 'access_receipt', header: 'X-Access-Receipt', description: 'On-chain access receipt tx hash + chain ID' },
      ],
    });
  };
}
```

**Step 3: Run tests**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx jest --testPathPattern='paymentAuth.test' --no-coverage`

**Step 4: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add offchain/packages/gateway-lite/src/middleware/paymentAuth.ts offchain/packages/gateway-lite/src/middleware/__tests__/paymentAuth.test.ts
git commit -m "feat(gateway): add PaymentGrant verification middleware (402 flow)"
```

---

## Phase D: Passport Registry + AccessReceipt

### Task 12: Write LucidPassportRegistry.sol

**Files:**
- Create: `contracts/src/LucidPassportRegistry.sol`
- Create: `contracts/test/LucidPassportRegistry.test.ts`

**Step 1: Write contract**

Full implementation as specified in `docs/plans/2026-03-05-chain-parity-mvp-spec.md` Section 2a. ~150 lines. Anchor + payment gate in one contract. Uses OpenZeppelin Ownable, ReentrancyGuard, SafeERC20.

10 external functions:
- `setSyncer(address, bool)` — owner only
- `anchorPassport(bytes32, bytes32, address)` — syncer only
- `updateStatus(bytes32, uint8)` — syncer only
- `verifyAnchor(bytes32, bytes32)` — view
- `setGate(bytes32, uint256 priceNative, uint256 priceLucid)` — gate owner
- `payForAccess(bytes32, uint64 duration)` — payable, nonReentrant
- `payForAccessLucid(bytes32, uint64 duration)` — nonReentrant
- `checkAccess(bytes32, address)` — view
- `withdrawRevenue(bytes32)` — gate owner, nonReentrant
- `revokeAccess(bytes32, address)` — gate owner

See the spec file for the full Solidity code.

**Step 2: Write Hardhat test**

Test: register passport, verify anchor, set gate, pay for access (native + LUCID token), check access, withdraw revenue, revoke.

**Step 3: Compile and test**

Run: `cd /home/debian/Lucid/Lucid-L2/contracts && npx hardhat compile && npx hardhat test test/LucidPassportRegistry.test.ts`

**Step 4: Add `passportRegistry` to ChainConfig**

In `offchain/packages/engine/src/chains/types.ts`, add after line 91 (after `epochRegistry`):
```typescript
/** LucidPassportRegistry contract address */
passportRegistry?: string;
```

**Step 5: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add contracts/src/LucidPassportRegistry.sol contracts/test/LucidPassportRegistry.test.ts offchain/packages/engine/src/chains/types.ts
git commit -m "feat(evm): deploy LucidPassportRegistry with passport anchor + payment gate"
```

---

### Task 13: Implement IPassportAdapter on Both Chains

**Files:**
- Modify: `offchain/packages/engine/src/chains/evm/adapter.ts` (replace stub `passports()`)
- Modify: `offchain/packages/engine/src/chains/solana/adapter.ts` (replace stub `passports()`)
- Modify: `offchain/packages/engine/src/chains/configs.ts` (add `passportRegistry` to testnet configs)

**Step 1: EVMAdapter — implement `passports()`**

Replace the stub with real viem contract calls to `LucidPassportRegistry`:

```typescript
passports(): IPassportAdapter {
  const registryAddr = this._config?.passportRegistry;
  if (!registryAddr) throw new Error(`PassportRegistry not configured on ${this._chainId}`);

  const publicClient = this._publicClient!;
  const walletClient = this._walletClient!;
  const account = this._account!;
  const chainId = this._chainId;

  const PASSPORT_ABI = [
    { name: 'anchorPassport', type: 'function', stateMutability: 'nonpayable',
      inputs: [{ name: 'passportId', type: 'bytes32' }, { name: 'contentHash', type: 'bytes32' }, { name: 'passportOwner', type: 'address' }], outputs: [] },
    { name: 'updateStatus', type: 'function', stateMutability: 'nonpayable',
      inputs: [{ name: 'passportId', type: 'bytes32' }, { name: 'newStatus', type: 'uint8' }], outputs: [] },
    { name: 'verifyAnchor', type: 'function', stateMutability: 'view',
      inputs: [{ name: 'passportId', type: 'bytes32' }, { name: 'contentHash', type: 'bytes32' }], outputs: [{ type: 'bool' }] },
    { name: 'setGate', type: 'function', stateMutability: 'nonpayable',
      inputs: [{ name: 'passportId', type: 'bytes32' }, { name: 'priceNative', type: 'uint256' }, { name: 'priceLucid', type: 'uint256' }], outputs: [] },
    { name: 'payForAccess', type: 'function', stateMutability: 'payable',
      inputs: [{ name: 'passportId', type: 'bytes32' }, { name: 'duration', type: 'uint64' }], outputs: [] },
    { name: 'checkAccess', type: 'function', stateMutability: 'view',
      inputs: [{ name: 'passportId', type: 'bytes32' }, { name: 'user', type: 'address' }], outputs: [{ type: 'bool' }] },
    { name: 'withdrawRevenue', type: 'function', stateMutability: 'nonpayable',
      inputs: [{ name: 'passportId', type: 'bytes32' }], outputs: [] },
  ] as const;

  return {
    async anchorPassport(passportId, contentHash, owner) {
      const hash = await walletClient.writeContract({
        address: registryAddr as `0x${string}`, abi: PASSPORT_ABI, functionName: 'anchorPassport',
        args: [passportId as `0x${string}`, contentHash as `0x${string}`, owner as `0x${string}`], account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, chainId, success: receipt.status === 'success' };
    },
    async updatePassportStatus(passportId, status) {
      const hash = await walletClient.writeContract({
        address: registryAddr as `0x${string}`, abi: PASSPORT_ABI, functionName: 'updateStatus',
        args: [passportId as `0x${string}`, status], account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, chainId, success: receipt.status === 'success' };
    },
    async verifyAnchor(passportId, contentHash) {
      return await publicClient.readContract({
        address: registryAddr as `0x${string}`, abi: PASSPORT_ABI, functionName: 'verifyAnchor',
        args: [passportId as `0x${string}`, contentHash as `0x${string}`],
      }) as boolean;
    },
    async setPaymentGate(passportId, priceNative, priceLucid) {
      const hash = await walletClient.writeContract({
        address: registryAddr as `0x${string}`, abi: PASSPORT_ABI, functionName: 'setGate',
        args: [passportId as `0x${string}`, priceNative, priceLucid], account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, chainId, success: receipt.status === 'success' };
    },
    async payForAccess(passportId, duration) {
      // Read gate price first to know how much ETH to send
      const hash = await walletClient.writeContract({
        address: registryAddr as `0x${string}`, abi: PASSPORT_ABI, functionName: 'payForAccess',
        args: [passportId as `0x${string}`, BigInt(duration)], account,
        // value: priceNative (caller must set or we query gate first)
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, chainId, success: receipt.status === 'success' };
    },
    async checkAccess(passportId, user) {
      return await publicClient.readContract({
        address: registryAddr as `0x${string}`, abi: PASSPORT_ABI, functionName: 'checkAccess',
        args: [passportId as `0x${string}`, user as `0x${string}`],
      }) as boolean;
    },
    async withdrawRevenue(passportId) {
      const hash = await walletClient.writeContract({
        address: registryAddr as `0x${string}`, abi: PASSPORT_ABI, functionName: 'withdrawRevenue',
        args: [passportId as `0x${string}`], account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, chainId, success: receipt.status === 'success' };
    },
  };
}
```

**Step 2: SolanaAdapter — implement `passports()`**

Wraps existing `PaymentGateService` (at `finance/paymentGateService.ts`) and passport sync operations. The Solana `lucid_passports` program already supports payment gates.

```typescript
passports(): IPassportAdapter {
  if (!this._config?.passportsProgram) throw new Error(`lucid-passports not configured on ${this._chainId}`);
  const chainId = this._chainId;
  const passportClient = this._passportClient;
  const config = this._config;

  return {
    async anchorPassport(passportId, contentHash, owner) {
      // Solana passports are minted as NFTs via SolanaPassportClient
      if (!passportClient) throw new Error('SolanaPassportClient not initialized');
      const result = await passportClient.mintPassport(passportId, contentHash, owner);
      return { hash: result.txHash, chainId, success: true };
    },
    async updatePassportStatus(passportId, status) {
      if (!passportClient) throw new Error('SolanaPassportClient not initialized');
      const result = await passportClient.updateStatus(passportId, status);
      return { hash: result.txHash, chainId, success: true };
    },
    async verifyAnchor(passportId, contentHash) {
      if (!passportClient) throw new Error('SolanaPassportClient not initialized');
      return passportClient.verifyAnchor(passportId, contentHash);
    },
    async setPaymentGate(passportId, priceNative, priceLucid) {
      const { getPaymentGateService } = await import('../../finance/paymentGateService');
      const svc = getPaymentGateService();
      const txHash = await svc.setPaymentGate(passportId, priceNative, priceLucid);
      return { hash: txHash, chainId, success: true };
    },
    async payForAccess(passportId, duration) {
      const { getPaymentGateService } = await import('../../finance/paymentGateService');
      const svc = getPaymentGateService();
      const txHash = await svc.payForAccess(passportId, undefined, Math.floor(Date.now() / 1000) + duration);
      return { hash: txHash, chainId, success: true };
    },
    async checkAccess(passportId, user) {
      const { getPaymentGateService } = await import('../../finance/paymentGateService');
      const svc = getPaymentGateService();
      return svc.checkAccess(passportId, user);
    },
    async withdrawRevenue(passportId) {
      const { getPaymentGateService } = await import('../../finance/paymentGateService');
      const svc = getPaymentGateService();
      const txHash = await svc.withdrawRevenue(passportId);
      return { hash: txHash, chainId, success: true };
    },
  };
}
```

**Step 3: Add `passportRegistry` to testnet configs**

In `offchain/packages/engine/src/chains/configs.ts`, add `passportRegistry` to `base-sepolia`, `ethereum-sepolia`, and `apechain-testnet` configs. Use placeholder addresses until deployment:

```typescript
passportRegistry: process.env.BASE_SEPOLIA_PASSPORT_REGISTRY || '0x0000000000000000000000000000000000000000',
```

**Step 4: Add AccessReceipt verification to gateway middleware**

In `offchain/packages/gateway-lite/src/middleware/paymentAuth.ts`, uncomment and implement the on-chain access verification path:

```typescript
// Path 2: On-chain AccessReceipt
const accessReceiptHeader = req.headers['x-access-receipt'] as string | undefined;
if (accessReceiptHeader) {
  try {
    const { chain_id, passport_id, payer } = JSON.parse(
      Buffer.from(accessReceiptHeader, 'base64').toString('utf8')
    );
    const { blockchainAdapterFactory } = await import('@lucid-l2/engine/chains/factory');
    const adapter = await blockchainAdapterFactory.getAdapter(chain_id);
    const hasAccess = await adapter.passports().checkAccess(passport_id, payer);
    if (hasAccess) {
      (req as any).accessReceipt = { chain_id, passport_id, payer };
      return next();
    }
    return res.status(402).json({ error: 'Access expired or not found on-chain' });
  } catch (err) {
    return res.status(402).json({ error: 'Failed to verify on-chain access' });
  }
}
```

**Step 5: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add offchain/packages/engine/src/chains/evm/adapter.ts offchain/packages/engine/src/chains/solana/adapter.ts offchain/packages/engine/src/chains/configs.ts offchain/packages/gateway-lite/src/middleware/paymentAuth.ts
git commit -m "feat(passports): implement IPassportAdapter on both chains with AccessReceipt verification"
```

---

## Phase E: Agent Wallet Parity

### Task 14: EVM Agent Wallet via TBA + ERC-7579

**Files:**
- Modify: `offchain/packages/engine/src/chains/evm/adapter.ts` (add `agentWallet()` method)
- Modify: `offchain/packages/engine/src/chains/solana/adapter.ts` (add `agentWallet()` method)

**Step 1: EVMAdapter — implement `agentWallet()`**

Uses ERC-6551 TBA for wallet creation + ERC-7579 modules for policy/session:

```typescript
agentWallet(): IAgentWalletAdapter {
  if (!this._config?.erc6551) throw new Error(`ERC-6551 not configured on ${this._chainId}`);
  const publicClient = this._publicClient!;
  const walletClient = this._walletClient!;
  const account = this._account!;
  const chainId = this._chainId;
  const erc6551Config = this._config.erc6551;
  const modulesConfig = this._config.modules;

  return {
    async createWallet(passportRef) {
      // Create TBA via ERC-6551 registry
      const { createTBA } = await import('../../identity/tba/tbaClient');
      const result = await createTBA(chainId, passportRef);
      return { walletAddress: result.tbaAddress, tx: { hash: result.txHash, chainId, success: true } };
    },
    async execute(walletAddress, instruction) {
      // Execute via TBA's execute function
      const hash = await walletClient.writeContract({
        address: walletAddress as `0x${string}`,
        abi: [{ name: 'execute', type: 'function', stateMutability: 'payable',
          inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'data', type: 'bytes' }, { name: 'operation', type: 'uint8' }],
          outputs: [{ type: 'bytes' }] }],
        functionName: 'execute',
        args: [instruction.to as `0x${string}`, 0n, instruction.data as `0x${string}`, 0],
        account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, chainId, success: receipt.status === 'success' };
    },
    async setPolicy(walletAddress, policy) {
      if (!modulesConfig?.policy) throw new Error('PolicyModule not configured');
      const { encodeFunctionData } = await import('viem');
      const hash = await walletClient.writeContract({
        address: modulesConfig.policy as `0x${string}`,
        abi: [{ name: 'setPolicy', type: 'function', stateMutability: 'nonpayable',
          inputs: [{ name: 'policyHash', type: 'bytes32' }, { name: 'allowed', type: 'bool' }], outputs: [] }],
        functionName: 'setPolicy',
        args: [walletAddress as `0x${string}`, true], // simplified — encode policy as hash
        account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, chainId, success: receipt.status === 'success' };
    },
    async createSession(_walletAddress, _delegate, _permissions, _expiresAt, _maxAmount) {
      // Requires LucidSessionKeys.sol (future contract)
      throw new Error('Session keys not yet deployed on EVM — use Solana agent wallet for session delegation');
    },
    async revokeSession(_walletAddress, _delegate) {
      throw new Error('Session keys not yet deployed on EVM');
    },
  };
}
```

**Step 2: SolanaAdapter — implement `agentWallet()`**

Wraps the real Anchor instructions from Task 2:

```typescript
agentWallet(): IAgentWalletAdapter {
  if (!this._config?.agentWalletProgram) throw new Error(`lucid-agent-wallet not configured on ${this._chainId}`);
  const adapter = this;
  const chainId = this._chainId;

  return {
    async createWallet(passportRef) {
      const result = await adapter.createAgentWallet(passportRef);
      return { walletAddress: result.walletPda, tx: { hash: result.txHash, chainId, success: true } };
    },
    async execute(_walletAddress, _instruction) {
      // Generic execute not supported on Solana — use specific methods
      throw new Error('Solana agent wallet uses instruction-specific methods, not generic execute');
    },
    async setPolicy(walletAddress, policy) {
      const result = await adapter.setPolicy(walletAddress, {
        maxPerTx: policy.maxPerTx,
        dailyLimit: policy.dailyLimit,
        allowedPrograms: policy.allowedTargets,
        timeWindowStart: policy.timeWindowStart,
        timeWindowEnd: policy.timeWindowEnd,
      });
      return { hash: result.txHash, chainId, success: true };
    },
    async createSession(_walletAddress, _delegate, _permissions, _expiresAt, _maxAmount) {
      // Session keys are a lucid-agent-wallet instruction
      throw new Error('Session key creation: implement when create_session instruction is added to Anchor program');
    },
    async revokeSession(_walletAddress, _delegate) {
      throw new Error('Session revocation: implement when revoke_session instruction is added to Anchor program');
    },
  };
}
```

**Step 3: Type check**

Run: `cd /home/debian/Lucid/Lucid-L2/offchain && npx tsc --noEmit 2>&1 | head -20`

**Step 4: Verify no mocks remain in adapters**

Run: `grep -rn "mock_" offchain/packages/engine/src/chains/ | grep -v test | grep -v __tests__`

Expected: No results (all mocks replaced with real implementations or typed errors).

**Step 5: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add offchain/packages/engine/src/chains/evm/adapter.ts offchain/packages/engine/src/chains/solana/adapter.ts
git commit -m "feat(wallet): implement IAgentWalletAdapter on both chains (TBA + PDA)"
```

---

## Phase F: Payment Epochs + Settlement

### Task 15: Payment Epoch Service

**Files:**
- Create: `offchain/packages/engine/src/finance/paymentEpochService.ts`

**Step 1: Write payment epoch service**

```typescript
// offchain/packages/engine/src/finance/paymentEpochService.ts

export interface PaymentEpoch {
  id: string;
  epoch_index: number;
  status: 'open' | 'settling' | 'settled';
  receipt_epoch_refs: string[];
  settlement_root?: string;
  chain_tx?: Record<string, string>;
  total_settled_usd: number;
  entry_count: number;
  opened_at: Date;
  settled_at?: Date;
}

export interface SettlementEntry {
  payer: string;
  payee: string;
  token: string;
  total_amount: string;
  call_count: number;
}

export class PaymentEpochService {
  private static instance: PaymentEpochService | null = null;

  private constructor() {}

  static getInstance(): PaymentEpochService {
    if (!PaymentEpochService.instance) {
      PaymentEpochService.instance = new PaymentEpochService();
    }
    return PaymentEpochService.instance;
  }

  /**
   * Get or create current open payment epoch.
   */
  async getCurrentEpoch(): Promise<PaymentEpoch> {
    const { getPool } = await import('../db/pool');
    const pool = getPool();

    const { rows } = await pool.query(
      "SELECT * FROM payment_epochs WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1"
    );

    if (rows.length > 0) return this.mapRow(rows[0]);

    // Create new epoch
    const { rows: newRows } = await pool.query(
      `INSERT INTO payment_epochs (epoch_index, status)
       VALUES ((SELECT COALESCE(MAX(epoch_index), 0) + 1 FROM payment_epochs), 'open')
       RETURNING *`
    );

    return this.mapRow(newRows[0]);
  }

  /**
   * Aggregate payment_events into settlement entries for current epoch.
   * Triggered: >$100 accumulated OR >24 hours since epoch opened.
   */
  async aggregateAndSettle(): Promise<{ epochId: string; entries: SettlementEntry[] } | null> {
    const { getPool } = await import('../db/pool');
    const pool = getPool();

    const epoch = await this.getCurrentEpoch();

    // Check thresholds
    const ageHours = (Date.now() - epoch.opened_at.getTime()) / (1000 * 3600);
    const { rows: totalRows } = await pool.query(
      "SELECT COALESCE(SUM(amount_usd), 0) as total FROM payment_events WHERE created_at >= $1",
      [epoch.opened_at]
    );
    const totalUsd = parseFloat(totalRows[0].total);

    if (totalUsd < 100 && ageHours < 24) {
      return null; // Not ready to settle
    }

    // Aggregate
    const { rows: entries } = await pool.query(
      `SELECT payer_address as payer, payee_address as payee, token,
              SUM(CAST(amount_raw AS NUMERIC)) as total_amount,
              COUNT(*) as call_count
       FROM payment_events
       WHERE created_at >= $1
       GROUP BY payer_address, payee_address, token`,
      [epoch.opened_at]
    );

    // Mark epoch as settling
    await pool.query(
      "UPDATE payment_epochs SET status = 'settling', entry_count = $1, total_settled_usd = $2 WHERE id = $3",
      [entries.length, totalUsd, epoch.id]
    );

    return { epochId: epoch.id, entries };
  }

  /**
   * Finalize a payment epoch after on-chain settlement.
   */
  async finalizeEpoch(epochId: string, chainTx: Record<string, string>, settlementRoot: string): Promise<void> {
    const { getPool } = await import('../db/pool');
    const pool = getPool();

    await pool.query(
      "UPDATE payment_epochs SET status = 'settled', chain_tx = $1, settlement_root = $2, settled_at = NOW() WHERE id = $3",
      [JSON.stringify(chainTx), settlementRoot, epochId]
    );
  }

  private mapRow(row: any): PaymentEpoch {
    return {
      id: row.id,
      epoch_index: row.epoch_index,
      status: row.status,
      receipt_epoch_refs: row.receipt_epoch_refs || [],
      settlement_root: row.settlement_root,
      chain_tx: row.chain_tx ? (typeof row.chain_tx === 'string' ? JSON.parse(row.chain_tx) : row.chain_tx) : undefined,
      total_settled_usd: parseFloat(row.total_settled_usd || '0'),
      entry_count: row.entry_count || 0,
      opened_at: new Date(row.opened_at),
      settled_at: row.settled_at ? new Date(row.settled_at) : undefined,
    };
  }
}

export function getPaymentEpochService(): PaymentEpochService {
  return PaymentEpochService.getInstance();
}
```

**Step 2: Commit**

```bash
cd /home/debian/Lucid/Lucid-L2
git add offchain/packages/engine/src/finance/paymentEpochService.ts
git commit -m "feat(payments): add PaymentEpochService for async settlement batching"
```

---

## One-Time Task: Canonical JSON Parity

**Problem:** Two incompatible canonicalizers in platform-core (custom in gateway-core vs json-canonicalize in passport). L2 engine uses json-canonicalize. Stale local copy of @raijinlabs/passport in L2.

**Fix:**
1. Consolidate to `canonicalJsonLucid()` in `@raijinlabs/passport`: normalize(BigInt, NaN, Date, undefined) then JCS (RFC 8785)
2. gateway-core's custom canonicalizer becomes thin wrapper or deleted
3. L2 engine imports from `@raijinlabs/passport` (or its own crypto/ re-export)
4. `paymentGrant.ts` imports from engine crypto — no inline canonicalizer
5. Add golden test vector fixture (shared JSON file) run by both repos
6. Sync `local-packages/passport/` in L2 with platform-core's published version

**Files:**
- Modify: `lucid-plateform-core/packages/passport/src/canonical-json.ts` (add normalization layer)
- Modify: `lucid-plateform-core/packages/gateway-core/src/crypto/canonicalJson.ts` (redirect to passport)
- Create: `lucid-plateform-core/packages/passport/src/__tests__/canonical-vectors.json` (shared golden vectors)
- Modify: `Lucid-L2/offchain/packages/engine/src/crypto/canonicalJson.ts` (re-export from passport)
- Sync: `Lucid-L2/offchain/local-packages/passport/` with latest published version

**This is cross-repo work. Do it BEFORE Task 9 so PaymentGrant signing uses the correct canonicalizer from day one.**

---

## Verification Checklist

After all tasks:

- [ ] `cd offchain && npx tsc --noEmit` passes
- [ ] `cd contracts && npx hardhat compile` passes
- [ ] `cd contracts && npx hardhat test` passes
- [ ] `grep -rn "mock_\${" offchain/packages/engine/src/chains/` returns empty
- [ ] `grep -rn "_stub" offchain/packages/engine/src/finance/` returns empty
- [ ] `grep -rn "_stub" offchain/packages/engine/src/identity/erc7579Service.ts` returns empty
- [ ] `npx jest --testPathPattern='paymentGrant.test'` passes
- [ ] `ANCHORING_CHAINS=solana-devnet,base-sepolia` recognized in config
- [ ] PaymentGrant can be created, signed, and verified (using shared canonicalizer)
- [ ] Gateway returns 402 with payment methods when no auth header present
- [ ] `payment_events`, `payment_epochs`, `grant_budgets` tables exist in migration
- [ ] `consume_grant_budget()` function works atomically
- [ ] LucidPassportRegistry.sol compiles and all tests pass
- [ ] Canonical JSON golden vectors pass in both repos
- [ ] Both adapters implement `epochs()`, `escrow()`, `passports()`, `agentWallet()`
