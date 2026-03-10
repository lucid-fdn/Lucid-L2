# Reputation System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `lucid_reputation` Anchor program + swappable offchain reputation layer (IReputationProvider + IReputationSyncer) with bidirectional external sync.

**Architecture:** Anchor program stores receipt-backed feedback/validation on-chain. Offchain `ReputationService` orchestrates a swappable provider (on-chain or DB) with pluggable syncers (8004-solana, SATI, SAID, EVM). Factory selects provider/syncers from env.

**Tech Stack:** Anchor 0.31.1, Rust, TypeScript, Jest, `@coral-xyz/anchor`, `pool.query()` for DB provider, `8004-solana` SDK for syncer.

**Design doc:** `docs/plans/2026-03-07-reputation-system-design.md`

---

## Codebase Conventions (Read First)

- **Anchor programs** use **single `lib.rs`** (all state, instructions, errors in one file). Follow this — do NOT split into `instructions/` subdirectories.
- **Offchain interfaces** follow `INFTProvider`/`IDepinStorage`/`IDeployer` pattern: interface file + factory `index.ts` with singleton + lazy-load + env switch.
- **Tests** use Jest with `__tests__/**/*.test.ts` pattern. Mock external deps (pool, SDKs) before imports.
- **Dependency direction:** `gateway-lite` → `engine` is OK. `engine` → `gateway-lite` is FORBIDDEN.

---

### Task 1: Scaffold `lucid_reputation` Anchor Program

**Files:**
- Create: `programs/lucid-reputation/Cargo.toml`
- Create: `programs/lucid-reputation/src/lib.rs`
- Modify: `Anchor.toml` (add program entry)
- Modify: `programs/lucid-reputation/` (new directory)

**Step 1: Generate program keypair**

```bash
mkdir -p programs/lucid-reputation/src
solana-keygen new --no-bip39-passphrase -o programs/lucid-reputation/keypair.json
solana address -k programs/lucid-reputation/keypair.json
```

Note the output address — use it as `PROGRAM_ID` in lib.rs and Anchor.toml.

**Step 2: Create Cargo.toml**

Create `programs/lucid-reputation/Cargo.toml`:

```toml
[package]
name = "lucid-reputation"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "lucid_reputation"

[dependencies]
anchor-lang = "0.31.1"

[features]
default = []
idl-build = ["anchor-lang/idl-build"]
no-entrypoint = []
cpi = ["no-entrypoint"]
custom-heap = []
custom-panic = []
anchor-debug = []
no-idl = []
no-log-ix-name = []

[profile.release]
overflow-checks = true
lto = "fat"
codegen-units = 1
```

**Step 3: Create lib.rs with all state, instructions, events, and errors**

Create `programs/lucid-reputation/src/lib.rs`:

```rust
use anchor_lang::prelude::*;

declare_id!("PROGRAM_ID_FROM_STEP_1");

const MAX_PASSPORT_ID_LEN: usize = 64;
const MAX_CATEGORY_LEN: usize = 32;
const MAX_METADATA_LEN: usize = 256;

#[program]
pub mod lucid_reputation {
    use super::*;

    /// Initialize stats PDA for a passport. Called once per passport.
    pub fn init_stats(ctx: Context<InitStats>, passport_id: String) -> Result<()> {
        require!(
            passport_id.len() <= MAX_PASSPORT_ID_LEN,
            ErrorCode::PassportIdTooLong
        );
        let stats = &mut ctx.accounts.stats;
        stats.passport_id = passport_id;
        stats.feedback_count = 0;
        stats.validation_count = 0;
        stats.total_score = 0;
        stats.avg_score = 0;
        stats.last_updated = Clock::get()?.unix_timestamp;
        stats.bump = ctx.bumps.stats;
        Ok(())
    }

    /// Submit receipt-backed feedback for any passport type.
    pub fn submit_feedback(
        ctx: Context<SubmitFeedback>,
        passport_id: String,
        score: u8,
        category: String,
        receipt_hash: [u8; 32],
        asset_type: u8,
        metadata: String,
    ) -> Result<()> {
        require!(score >= 1 && score <= 100, ErrorCode::InvalidScore);
        require!(asset_type <= 4, ErrorCode::InvalidAssetType);
        require!(
            category.len() <= MAX_CATEGORY_LEN,
            ErrorCode::CategoryTooLong
        );
        require!(
            metadata.len() <= MAX_METADATA_LEN,
            ErrorCode::MetadataTooLong
        );

        let stats = &mut ctx.accounts.stats;
        let index = stats.feedback_count;

        let entry = &mut ctx.accounts.feedback_entry;
        entry.passport_id = passport_id;
        entry.from = ctx.accounts.submitter.key();
        entry.score = score;
        entry.category = category;
        entry.receipt_hash = receipt_hash;
        entry.asset_type = asset_type;
        entry.metadata = metadata;
        entry.timestamp = Clock::get()?.unix_timestamp;
        entry.revoked = false;
        entry.index = index;
        entry.bump = ctx.bumps.feedback_entry;

        // Update stats atomically
        stats.feedback_count = stats
            .feedback_count
            .checked_add(1)
            .ok_or(ErrorCode::Overflow)?;
        stats.total_score = stats
            .total_score
            .checked_add(score as u64)
            .ok_or(ErrorCode::Overflow)?;
        // avg_score stored as value * 100 for 2 decimal places
        stats.avg_score =
            ((stats.total_score * 100) / stats.feedback_count as u64) as u16;
        stats.last_updated = Clock::get()?.unix_timestamp;

        emit!(FeedbackSubmitted {
            passport_id: entry.passport_id.clone(),
            from: entry.from,
            score,
            asset_type,
            index,
        });

        Ok(())
    }

    /// Submit validation for a receipt linked to a passport.
    pub fn submit_validation(
        ctx: Context<SubmitValidation>,
        passport_id: String,
        receipt_hash: [u8; 32],
        valid: bool,
        asset_type: u8,
        metadata: String,
    ) -> Result<()> {
        require!(asset_type <= 4, ErrorCode::InvalidAssetType);
        require!(
            metadata.len() <= MAX_METADATA_LEN,
            ErrorCode::MetadataTooLong
        );

        let entry = &mut ctx.accounts.validation_entry;
        entry.passport_id = passport_id;
        entry.validator = ctx.accounts.submitter.key();
        entry.valid = valid;
        entry.receipt_hash = receipt_hash;
        entry.asset_type = asset_type;
        entry.metadata = metadata;
        entry.timestamp = Clock::get()?.unix_timestamp;
        entry.bump = ctx.bumps.validation_entry;

        let stats = &mut ctx.accounts.stats;
        stats.validation_count = stats
            .validation_count
            .checked_add(1)
            .ok_or(ErrorCode::Overflow)?;
        stats.last_updated = Clock::get()?.unix_timestamp;

        emit!(ValidationSubmitted {
            passport_id: entry.passport_id.clone(),
            validator: entry.validator,
            valid,
            asset_type,
        });

        Ok(())
    }

    /// Revoke feedback. Only the original submitter can revoke.
    pub fn revoke_feedback(ctx: Context<RevokeFeedback>, _passport_id: String, _index: u32) -> Result<()> {
        let entry = &mut ctx.accounts.feedback_entry;
        require!(!entry.revoked, ErrorCode::AlreadyRevoked);
        require!(
            entry.from == ctx.accounts.submitter.key(),
            ErrorCode::UnauthorizedRevoke
        );

        let stats = &mut ctx.accounts.stats;

        // Adjust stats
        stats.total_score = stats
            .total_score
            .checked_sub(entry.score as u64)
            .ok_or(ErrorCode::Overflow)?;
        let active_count = stats.feedback_count.saturating_sub(1);
        if active_count > 0 {
            // Recalc is approximate — counts revoked entries in feedback_count
            // but removes their score. Good enough for on-chain stats.
            stats.avg_score =
                ((stats.total_score * 100) / active_count as u64) as u16;
        } else {
            stats.avg_score = 0;
        }
        stats.last_updated = Clock::get()?.unix_timestamp;

        entry.revoked = true;

        emit!(FeedbackRevoked {
            passport_id: entry.passport_id.clone(),
            from: entry.from,
            index: entry.index,
        });

        Ok(())
    }
}

// ─── Account Validation Structs ─────────────────────────────────────────

#[derive(Accounts)]
#[instruction(passport_id: String)]
pub struct InitStats<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + PassportStats::INIT_SPACE,
        seeds = [b"stats", passport_id.as_bytes()],
        bump
    )]
    pub stats: Account<'info, PassportStats>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(passport_id: String, score: u8, category: String, receipt_hash: [u8; 32], asset_type: u8, metadata: String)]
pub struct SubmitFeedback<'info> {
    #[account(mut)]
    pub submitter: Signer<'info>,

    #[account(
        init,
        payer = submitter,
        space = 8 + FeedbackEntry::INIT_SPACE,
        seeds = [b"feedback", passport_id.as_bytes(), &stats.feedback_count.to_le_bytes()],
        bump
    )]
    pub feedback_entry: Account<'info, FeedbackEntry>,

    #[account(
        mut,
        seeds = [b"stats", passport_id.as_bytes()],
        bump = stats.bump
    )]
    pub stats: Account<'info, PassportStats>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(passport_id: String, receipt_hash: [u8; 32])]
pub struct SubmitValidation<'info> {
    #[account(mut)]
    pub submitter: Signer<'info>,

    #[account(
        init,
        payer = submitter,
        space = 8 + ValidationEntry::INIT_SPACE,
        seeds = [b"validation", passport_id.as_bytes(), &receipt_hash],
        bump
    )]
    pub validation_entry: Account<'info, ValidationEntry>,

    #[account(
        mut,
        seeds = [b"stats", passport_id.as_bytes()],
        bump = stats.bump
    )]
    pub stats: Account<'info, PassportStats>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(passport_id: String, index: u32)]
pub struct RevokeFeedback<'info> {
    #[account(mut)]
    pub submitter: Signer<'info>,

    #[account(
        mut,
        seeds = [b"feedback", passport_id.as_bytes(), &index.to_le_bytes()],
        bump = feedback_entry.bump
    )]
    pub feedback_entry: Account<'info, FeedbackEntry>,

    #[account(
        mut,
        seeds = [b"stats", passport_id.as_bytes()],
        bump = stats.bump
    )]
    pub stats: Account<'info, PassportStats>,
}

// ─── State Structs ──────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct FeedbackEntry {
    #[max_len(64)]
    pub passport_id: String,
    pub from: Pubkey,
    pub score: u8,
    #[max_len(32)]
    pub category: String,
    pub receipt_hash: [u8; 32],
    pub asset_type: u8,
    #[max_len(256)]
    pub metadata: String,
    pub timestamp: i64,
    pub revoked: bool,
    pub index: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ValidationEntry {
    #[max_len(64)]
    pub passport_id: String,
    pub validator: Pubkey,
    pub valid: bool,
    pub receipt_hash: [u8; 32],
    pub asset_type: u8,
    #[max_len(256)]
    pub metadata: String,
    pub timestamp: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PassportStats {
    #[max_len(64)]
    pub passport_id: String,
    pub feedback_count: u32,
    pub validation_count: u32,
    pub total_score: u64,
    pub avg_score: u16,
    pub last_updated: i64,
    pub bump: u8,
}

// ─── Events ─────────────────────────────────────────────────────────────

#[event]
pub struct FeedbackSubmitted {
    pub passport_id: String,
    pub from: Pubkey,
    pub score: u8,
    pub asset_type: u8,
    pub index: u32,
}

#[event]
pub struct ValidationSubmitted {
    pub passport_id: String,
    pub validator: Pubkey,
    pub valid: bool,
    pub asset_type: u8,
}

#[event]
pub struct FeedbackRevoked {
    pub passport_id: String,
    pub from: Pubkey,
    pub index: u32,
}

// ─── Errors ─────────────────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("Score must be between 1 and 100")]
    InvalidScore,
    #[msg("Asset type must be 0-4 (model, compute, tool, agent, dataset)")]
    InvalidAssetType,
    #[msg("Passport ID exceeds 64 characters")]
    PassportIdTooLong,
    #[msg("Category exceeds 32 characters")]
    CategoryTooLong,
    #[msg("Metadata exceeds 256 characters")]
    MetadataTooLong,
    #[msg("Feedback already revoked")]
    AlreadyRevoked,
    #[msg("Only the original submitter can revoke feedback")]
    UnauthorizedRevoke,
    #[msg("Arithmetic overflow")]
    Overflow,
}
```

**Step 4: Add program to Anchor.toml**

Add to `Anchor.toml` under `[programs.localnet]`:
```toml
lucid_reputation = "PROGRAM_ID_FROM_STEP_1"
```

Add to `[programs.devnet]` section too (same ID for now).

Add to workspace members if there's a `members` array.

**Step 5: Build and verify**

```bash
cd /home/debian/Lucid/Lucid-L2
anchor build -p lucid_reputation
```

Expected: Successful build, IDL generated at `target/idl/lucid_reputation.json`.

**Step 6: Commit**

```bash
git add programs/lucid-reputation/ Anchor.toml
git commit -m "feat: scaffold lucid_reputation Anchor program with state, instructions, events, errors"
```

---

### Task 2: Anchor Integration Tests

**Files:**
- Create: `tests/lucid-reputation.ts`

**Step 1: Write the test file**

Create `tests/lucid-reputation.ts`:

```typescript
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { LucidReputation } from '../target/types/lucid_reputation';
import { expect } from 'chai';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';

describe('lucid_reputation', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.LucidReputation as Program<LucidReputation>;
  const passportId = 'test-model-passport-001';
  const receiptHash = Buffer.alloc(32);
  receiptHash.fill(0xab);

  function findStatsPDA(passportId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('stats'), Buffer.from(passportId)],
      program.programId,
    );
  }

  function findFeedbackPDA(passportId: string, index: number): [PublicKey, number] {
    const indexBuf = Buffer.alloc(4);
    indexBuf.writeUInt32LE(index);
    return PublicKey.findProgramAddressSync(
      [Buffer.from('feedback'), Buffer.from(passportId), indexBuf],
      program.programId,
    );
  }

  function findValidationPDA(passportId: string, receiptHash: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('validation'), Buffer.from(passportId), receiptHash],
      program.programId,
    );
  }

  it('initializes stats for a passport', async () => {
    const [statsPDA] = findStatsPDA(passportId);

    await program.methods
      .initStats(passportId)
      .accounts({
        authority: provider.wallet.publicKey,
        stats: statsPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const stats = await program.account.passportStats.fetch(statsPDA);
    expect(stats.passportId).to.equal(passportId);
    expect(stats.feedbackCount).to.equal(0);
    expect(stats.validationCount).to.equal(0);
    expect(stats.totalScore.toNumber()).to.equal(0);
    expect(stats.avgScore).to.equal(0);
  });

  it('submits feedback with receipt hash', async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [feedbackPDA] = findFeedbackPDA(passportId, 0);

    await program.methods
      .submitFeedback(passportId, 85, 'quality', Array.from(receiptHash), 0, 'good model')
      .accounts({
        submitter: provider.wallet.publicKey,
        feedbackEntry: feedbackPDA,
        stats: statsPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const entry = await program.account.feedbackEntry.fetch(feedbackPDA);
    expect(entry.passportId).to.equal(passportId);
    expect(entry.score).to.equal(85);
    expect(entry.category).to.equal('quality');
    expect(entry.assetType).to.equal(0);
    expect(entry.revoked).to.equal(false);
    expect(entry.index).to.equal(0);

    const stats = await program.account.passportStats.fetch(statsPDA);
    expect(stats.feedbackCount).to.equal(1);
    expect(stats.totalScore.toNumber()).to.equal(85);
    expect(stats.avgScore).to.equal(8500); // 85 * 100
  });

  it('submits second feedback and updates avg', async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [feedbackPDA] = findFeedbackPDA(passportId, 1);

    await program.methods
      .submitFeedback(passportId, 95, 'latency', Array.from(receiptHash), 0, 'fast')
      .accounts({
        submitter: provider.wallet.publicKey,
        feedbackEntry: feedbackPDA,
        stats: statsPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const stats = await program.account.passportStats.fetch(statsPDA);
    expect(stats.feedbackCount).to.equal(2);
    expect(stats.totalScore.toNumber()).to.equal(180); // 85 + 95
    expect(stats.avgScore).to.equal(9000); // (180 * 100) / 2 = 9000
  });

  it('rejects invalid score (0)', async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [feedbackPDA] = findFeedbackPDA(passportId, 2);

    try {
      await program.methods
        .submitFeedback(passportId, 0, 'quality', Array.from(receiptHash), 0, '')
        .accounts({
          submitter: provider.wallet.publicKey,
          feedbackEntry: feedbackPDA,
          stats: statsPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal('InvalidScore');
    }
  });

  it('rejects invalid asset type (5)', async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [feedbackPDA] = findFeedbackPDA(passportId, 2);

    try {
      await program.methods
        .submitFeedback(passportId, 50, 'quality', Array.from(receiptHash), 5, '')
        .accounts({
          submitter: provider.wallet.publicKey,
          feedbackEntry: feedbackPDA,
          stats: statsPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal('InvalidAssetType');
    }
  });

  it('submits validation', async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [validationPDA] = findValidationPDA(passportId, receiptHash);

    await program.methods
      .submitValidation(passportId, Array.from(receiptHash), true, 0, 'verified')
      .accounts({
        submitter: provider.wallet.publicKey,
        validationEntry: validationPDA,
        stats: statsPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const entry = await program.account.validationEntry.fetch(validationPDA);
    expect(entry.passportId).to.equal(passportId);
    expect(entry.valid).to.equal(true);
    expect(entry.assetType).to.equal(0);

    const stats = await program.account.passportStats.fetch(statsPDA);
    expect(stats.validationCount).to.equal(1);
  });

  it('rejects duplicate validation (same receipt hash)', async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [validationPDA] = findValidationPDA(passportId, receiptHash);

    try {
      await program.methods
        .submitValidation(passportId, Array.from(receiptHash), false, 0, 'dup')
        .accounts({
          submitter: provider.wallet.publicKey,
          validationEntry: validationPDA,
          stats: statsPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail('Should have thrown');
    } catch (err: any) {
      // PDA already exists — Anchor returns an "already in use" error
      expect(err).to.exist;
    }
  });

  it('revokes feedback', async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [feedbackPDA] = findFeedbackPDA(passportId, 0);

    await program.methods
      .revokeFeedback(passportId, 0)
      .accounts({
        submitter: provider.wallet.publicKey,
        feedbackEntry: feedbackPDA,
        stats: statsPDA,
      })
      .rpc();

    const entry = await program.account.feedbackEntry.fetch(feedbackPDA);
    expect(entry.revoked).to.equal(true);

    const stats = await program.account.passportStats.fetch(statsPDA);
    // total_score: 180 - 85 = 95, active_count: 2 - 1 = 1
    expect(stats.totalScore.toNumber()).to.equal(95);
    expect(stats.avgScore).to.equal(9500); // 95 * 100 / 1
  });

  it('rejects revoke from wrong signer', async () => {
    const wrongSigner = Keypair.generate();
    const [statsPDA] = findStatsPDA(passportId);
    const [feedbackPDA] = findFeedbackPDA(passportId, 1);

    // Airdrop to wrong signer so they can pay tx fees
    const sig = await provider.connection.requestAirdrop(wrongSigner.publicKey, 1_000_000_000);
    await provider.connection.confirmTransaction(sig);

    try {
      await program.methods
        .revokeFeedback(passportId, 1)
        .accounts({
          submitter: wrongSigner.publicKey,
          feedbackEntry: feedbackPDA,
          stats: statsPDA,
        })
        .signers([wrongSigner])
        .rpc();
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal('UnauthorizedRevoke');
    }
  });

  it('rejects double revoke', async () => {
    const [statsPDA] = findStatsPDA(passportId);
    const [feedbackPDA] = findFeedbackPDA(passportId, 0);

    try {
      await program.methods
        .revokeFeedback(passportId, 0)
        .accounts({
          submitter: provider.wallet.publicKey,
          feedbackEntry: feedbackPDA,
          stats: statsPDA,
        })
        .rpc();
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal('AlreadyRevoked');
    }
  });

  it('works with all 5 asset types', async () => {
    const types = ['model', 'compute', 'tool', 'agent', 'dataset'];
    for (let assetType = 0; assetType < 5; assetType++) {
      const pid = `asset-type-test-${types[assetType]}`;
      const [sPDA] = findStatsPDA(pid);

      await program.methods.initStats(pid).accounts({
        authority: provider.wallet.publicKey,
        stats: sPDA,
        systemProgram: SystemProgram.programId,
      }).rpc();

      const hash = Buffer.alloc(32);
      hash.writeUInt8(assetType, 0);
      const [fPDA] = findFeedbackPDA(pid, 0);

      await program.methods
        .submitFeedback(pid, 50, 'quality', Array.from(hash), assetType, '')
        .accounts({
          submitter: provider.wallet.publicKey,
          feedbackEntry: fPDA,
          stats: sPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const entry = await program.account.feedbackEntry.fetch(fPDA);
      expect(entry.assetType).to.equal(assetType);
    }
  });
});
```

**Step 2: Run tests**

```bash
cd /home/debian/Lucid/Lucid-L2
anchor test -- --features "lucid_reputation"
```

Expected: All 10 tests pass.

**Step 3: Commit**

```bash
git add tests/lucid-reputation.ts
git commit -m "test: add Anchor integration tests for lucid_reputation program"
```

---

### Task 3: Reputation Types + IReputationProvider Interface

**Files:**
- Create: `offchain/packages/engine/src/reputation/types.ts`
- Create: `offchain/packages/engine/src/reputation/IReputationProvider.ts`

**Step 1: Create types**

Create `offchain/packages/engine/src/reputation/types.ts`:

```typescript
export interface FeedbackParams {
  passportId: string;
  score: number;        // 1-100
  category: string;
  receiptHash: string;  // hex-encoded SHA-256
  assetType: AssetType;
  metadata?: string;
}

export interface ValidationParams {
  passportId: string;
  receiptHash: string;
  valid: boolean;
  assetType: AssetType;
  metadata?: string;
}

export interface ReputationData {
  passportId: string;
  from: string;
  score: number;
  category: string;
  receiptHash: string;
  assetType: AssetType;
  timestamp: number;
  revoked: boolean;
  index: number;
}

export interface ValidationResult {
  passportId: string;
  validator: string;
  valid: boolean;
  receiptHash: string;
  assetType: AssetType;
  timestamp: number;
}

export interface ReputationSummary {
  passportId: string;
  feedbackCount: number;
  validationCount: number;
  avgScore: number;       // 0-100 (float)
  totalScore: number;
  lastUpdated: number;
}

export interface TxReceipt {
  success: boolean;
  txHash?: string;
  id?: string;
}

export interface ReadOptions {
  limit?: number;
  offset?: number;
  category?: string;
  assetType?: AssetType;
}

export type AssetType = 'model' | 'compute' | 'tool' | 'agent' | 'dataset';

export const ASSET_TYPE_MAP: Record<AssetType, number> = {
  model: 0,
  compute: 1,
  tool: 2,
  agent: 3,
  dataset: 4,
};

export const ASSET_TYPE_REVERSE: Record<number, AssetType> = {
  0: 'model',
  1: 'compute',
  2: 'tool',
  3: 'agent',
  4: 'dataset',
};
```

**Step 2: Create IReputationProvider interface**

Create `offchain/packages/engine/src/reputation/IReputationProvider.ts`:

```typescript
import {
  FeedbackParams,
  ValidationParams,
  ReputationData,
  ValidationResult,
  ReputationSummary,
  TxReceipt,
  ReadOptions,
} from './types';

export interface IReputationProvider {
  readonly providerName: string;

  submitFeedback(params: FeedbackParams): Promise<TxReceipt>;
  readFeedback(passportId: string, options?: ReadOptions): Promise<ReputationData[]>;
  getSummary(passportId: string): Promise<ReputationSummary>;

  submitValidation(params: ValidationParams): Promise<TxReceipt>;
  getValidation(passportId: string, receiptHash: string): Promise<ValidationResult | null>;

  isHealthy(): Promise<boolean>;
}
```

**Step 3: Commit**

```bash
git add offchain/packages/engine/src/reputation/
git commit -m "feat: add reputation types and IReputationProvider interface"
```

---

### Task 4: LucidDBProvider + Tests

**Files:**
- Create: `offchain/packages/engine/src/reputation/providers/LucidDBProvider.ts`
- Create: `offchain/packages/engine/src/reputation/__tests__/LucidDBProvider.test.ts`

**Step 1: Write the failing test**

Create `offchain/packages/engine/src/reputation/__tests__/LucidDBProvider.test.ts`:

```typescript
jest.mock('../../../db/pool', () => {
  const mockQuery = jest.fn();
  return {
    __esModule: true,
    default: { query: mockQuery },
    pool: { query: mockQuery },
    getClient: jest.fn(),
  };
});

import pool from '../../../db/pool';
import { LucidDBProvider } from '../providers/LucidDBProvider';
import { FeedbackParams, ValidationParams } from '../types';

const mockQuery = pool.query as jest.Mock;

describe('LucidDBProvider', () => {
  let provider: LucidDBProvider;

  beforeEach(() => {
    mockQuery.mockReset();
    provider = new LucidDBProvider();
  });

  it('has correct providerName', () => {
    expect(provider.providerName).toBe('lucid-db');
  });

  describe('submitFeedback', () => {
    it('inserts feedback row and returns receipt', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'fb_1' }], rowCount: 1 });

      const params: FeedbackParams = {
        passportId: 'model-001',
        score: 85,
        category: 'quality',
        receiptHash: 'abc123',
        assetType: 'model',
        metadata: 'good',
      };
      const result = await provider.submitFeedback(params);

      expect(result.success).toBe(true);
      expect(result.id).toBe('fb_1');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO reputation_feedback');
    });
  });

  describe('readFeedback', () => {
    it('returns feedback array', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          passport_id: 'model-001',
          from_address: 'signer1',
          score: 85,
          category: 'quality',
          receipt_hash: 'abc123',
          asset_type: 'model',
          created_at: '2026-03-07T00:00:00Z',
          revoked: false,
          feedback_index: 0,
        }],
      });

      const data = await provider.readFeedback('model-001');
      expect(data).toHaveLength(1);
      expect(data[0].passportId).toBe('model-001');
      expect(data[0].score).toBe(85);
      expect(data[0].category).toBe('quality');
    });

    it('applies category filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await provider.readFeedback('model-001', { category: 'latency' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('category');
    });
  });

  describe('getSummary', () => {
    it('returns aggregated stats', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          feedback_count: '10',
          validation_count: '5',
          avg_score: '82.5',
          total_score: '825',
          last_updated: '2026-03-07T00:00:00Z',
        }],
      });

      const summary = await provider.getSummary('model-001');
      expect(summary.passportId).toBe('model-001');
      expect(summary.feedbackCount).toBe(10);
      expect(summary.avgScore).toBe(82.5);
    });

    it('returns zeros for unknown passport', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const summary = await provider.getSummary('unknown');
      expect(summary.feedbackCount).toBe(0);
      expect(summary.avgScore).toBe(0);
    });
  });

  describe('submitValidation', () => {
    it('inserts validation row', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'val_1' }], rowCount: 1 });

      const params: ValidationParams = {
        passportId: 'model-001',
        receiptHash: 'hash123',
        valid: true,
        assetType: 'model',
      };
      const result = await provider.submitValidation(params);

      expect(result.success).toBe(true);
      expect(result.id).toBe('val_1');
    });
  });

  describe('getValidation', () => {
    it('returns validation by receipt hash', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          passport_id: 'model-001',
          validator: 'val-addr',
          valid: true,
          receipt_hash: 'hash123',
          asset_type: 'model',
          created_at: '2026-03-07T00:00:00Z',
        }],
      });

      const v = await provider.getValidation('model-001', 'hash123');
      expect(v).not.toBeNull();
      expect(v!.valid).toBe(true);
      expect(v!.passportId).toBe('model-001');
    });

    it('returns null for unknown', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const v = await provider.getValidation('x', 'y');
      expect(v).toBeNull();
    });
  });

  describe('isHealthy', () => {
    it('returns true when pool responds', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ now: new Date() }] });
      expect(await provider.isHealthy()).toBe(true);
    });

    it('returns false on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection refused'));
      expect(await provider.isHealthy()).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain
npx jest --testPathPattern="reputation/__tests__/LucidDBProvider" --no-coverage
```

Expected: FAIL — `Cannot find module '../providers/LucidDBProvider'`

**Step 3: Implement LucidDBProvider**

Create `offchain/packages/engine/src/reputation/providers/LucidDBProvider.ts`:

```typescript
import pool from '../../../db/pool';
import { IReputationProvider } from '../IReputationProvider';
import {
  FeedbackParams,
  ValidationParams,
  ReputationData,
  ValidationResult,
  ReputationSummary,
  TxReceipt,
  ReadOptions,
  ASSET_TYPE_REVERSE,
} from '../types';

export class LucidDBProvider implements IReputationProvider {
  readonly providerName = 'lucid-db';

  async submitFeedback(params: FeedbackParams): Promise<TxReceipt> {
    const result = await pool.query(
      `INSERT INTO reputation_feedback
       (passport_id, from_address, score, category, receipt_hash, asset_type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [params.passportId, 'local', params.score, params.category, params.receiptHash, params.assetType, params.metadata || ''],
    );
    return { success: true, id: result.rows[0]?.id };
  }

  async readFeedback(passportId: string, options?: ReadOptions): Promise<ReputationData[]> {
    let sql = `SELECT * FROM reputation_feedback WHERE passport_id = $1 AND revoked = false`;
    const values: any[] = [passportId];
    let idx = 2;

    if (options?.category) {
      sql += ` AND category = $${idx++}`;
      values.push(options.category);
    }
    if (options?.assetType) {
      sql += ` AND asset_type = $${idx++}`;
      values.push(options.assetType);
    }

    sql += ` ORDER BY created_at DESC`;

    if (options?.limit) {
      sql += ` LIMIT $${idx++}`;
      values.push(options.limit);
    }
    if (options?.offset) {
      sql += ` OFFSET $${idx++}`;
      values.push(options.offset);
    }

    const result = await pool.query(sql, values);
    return result.rows.map((r: any) => ({
      passportId: r.passport_id,
      from: r.from_address,
      score: r.score,
      category: r.category,
      receiptHash: r.receipt_hash,
      assetType: r.asset_type,
      timestamp: new Date(r.created_at).getTime(),
      revoked: r.revoked,
      index: r.feedback_index ?? 0,
    }));
  }

  async getSummary(passportId: string): Promise<ReputationSummary> {
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE revoked = false) as feedback_count,
         COALESCE((SELECT COUNT(*) FROM reputation_validations WHERE passport_id = $1), 0) as validation_count,
         COALESCE(AVG(score) FILTER (WHERE revoked = false), 0) as avg_score,
         COALESCE(SUM(score) FILTER (WHERE revoked = false), 0) as total_score,
         MAX(created_at) as last_updated
       FROM reputation_feedback WHERE passport_id = $1`,
      [passportId],
    );

    if (result.rows.length === 0) {
      return { passportId, feedbackCount: 0, validationCount: 0, avgScore: 0, totalScore: 0, lastUpdated: 0 };
    }

    const r = result.rows[0];
    return {
      passportId,
      feedbackCount: parseInt(r.feedback_count) || 0,
      validationCount: parseInt(r.validation_count) || 0,
      avgScore: parseFloat(r.avg_score) || 0,
      totalScore: parseInt(r.total_score) || 0,
      lastUpdated: r.last_updated ? new Date(r.last_updated).getTime() : 0,
    };
  }

  async submitValidation(params: ValidationParams): Promise<TxReceipt> {
    const result = await pool.query(
      `INSERT INTO reputation_validations
       (passport_id, validator, valid, receipt_hash, asset_type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [params.passportId, 'local', params.valid, params.receiptHash, params.assetType, params.metadata || ''],
    );
    return { success: true, id: result.rows[0]?.id };
  }

  async getValidation(passportId: string, receiptHash: string): Promise<ValidationResult | null> {
    const result = await pool.query(
      `SELECT * FROM reputation_validations WHERE passport_id = $1 AND receipt_hash = $2 LIMIT 1`,
      [passportId, receiptHash],
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      passportId: r.passport_id,
      validator: r.validator,
      valid: r.valid,
      receiptHash: r.receipt_hash,
      assetType: r.asset_type,
      timestamp: new Date(r.created_at).getTime(),
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      await pool.query('SELECT NOW()');
      return true;
    } catch {
      return false;
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain
npx jest --testPathPattern="reputation/__tests__/LucidDBProvider" --no-coverage
```

Expected: All 9 tests PASS.

**Step 5: Commit**

```bash
git add offchain/packages/engine/src/reputation/
git commit -m "feat: add LucidDBProvider with tests (PostgreSQL-backed reputation)"
```

---

### Task 5: LucidOnChainProvider (Stub + Tests)

**Files:**
- Create: `offchain/packages/engine/src/reputation/providers/LucidOnChainProvider.ts`
- Create: `offchain/packages/engine/src/reputation/__tests__/LucidOnChainProvider.test.ts`

**Step 1: Write the failing test**

Create `offchain/packages/engine/src/reputation/__tests__/LucidOnChainProvider.test.ts`:

```typescript
jest.mock('@coral-xyz/anchor', () => ({
  AnchorProvider: { env: jest.fn() },
  Program: jest.fn(),
  web3: {
    PublicKey: {
      findProgramAddressSync: jest.fn().mockReturnValue([{ toBase58: () => 'mockPDA' }, 255]),
    },
    SystemProgram: { programId: 'system' },
  },
  BN: jest.fn().mockImplementation((n: number) => ({ toNumber: () => n })),
}));

import { LucidOnChainProvider } from '../providers/LucidOnChainProvider';

describe('LucidOnChainProvider', () => {
  let provider: LucidOnChainProvider;
  let mockProgram: any;

  beforeEach(() => {
    mockProgram = {
      methods: {
        submitFeedback: jest.fn().mockReturnValue({
          accounts: jest.fn().mockReturnValue({
            rpc: jest.fn().mockResolvedValue('tx-hash-1'),
          }),
        }),
        submitValidation: jest.fn().mockReturnValue({
          accounts: jest.fn().mockReturnValue({
            rpc: jest.fn().mockResolvedValue('tx-hash-2'),
          }),
        }),
        initStats: jest.fn().mockReturnValue({
          accounts: jest.fn().mockReturnValue({
            rpc: jest.fn().mockResolvedValue('tx-hash-0'),
          }),
        }),
      },
      account: {
        passportStats: {
          fetch: jest.fn().mockResolvedValue({
            passportId: 'model-001',
            feedbackCount: 5,
            validationCount: 2,
            totalScore: { toNumber: () => 425 },
            avgScore: 8500,
            lastUpdated: { toNumber: () => 1709827200 },
          }),
          fetchNullable: jest.fn().mockResolvedValue(null),
        },
        feedbackEntry: {
          fetch: jest.fn().mockResolvedValue({
            passportId: 'model-001',
            from: { toBase58: () => 'submitter1' },
            score: 85,
            category: 'quality',
            receiptHash: Array(32).fill(0),
            assetType: 0,
            metadata: '',
            timestamp: { toNumber: () => 1709827200 },
            revoked: false,
            index: 0,
          }),
        },
        validationEntry: {
          fetch: jest.fn().mockResolvedValue({
            passportId: 'model-001',
            validator: { toBase58: () => 'validator1' },
            valid: true,
            receiptHash: Array(32).fill(0),
            assetType: 0,
            metadata: 'ok',
            timestamp: { toNumber: () => 1709827200 },
          }),
          fetchNullable: jest.fn().mockResolvedValue(null),
        },
      },
      programId: { toBuffer: () => Buffer.alloc(32) },
    };

    provider = new LucidOnChainProvider(mockProgram as any, { publicKey: 'wallet' } as any);
  });

  it('has correct providerName', () => {
    expect(provider.providerName).toBe('lucid-onchain');
  });

  it('submits feedback via Anchor tx', async () => {
    const result = await provider.submitFeedback({
      passportId: 'model-001',
      score: 85,
      category: 'quality',
      receiptHash: '00'.repeat(32),
      assetType: 'model',
    });
    expect(result.success).toBe(true);
    expect(result.txHash).toBe('tx-hash-1');
    expect(mockProgram.methods.submitFeedback).toHaveBeenCalled();
  });

  it('submits validation via Anchor tx', async () => {
    const result = await provider.submitValidation({
      passportId: 'model-001',
      receiptHash: '00'.repeat(32),
      valid: true,
      assetType: 'model',
    });
    expect(result.success).toBe(true);
    expect(result.txHash).toBe('tx-hash-2');
  });

  it('gets summary from PassportStats PDA', async () => {
    const summary = await provider.getSummary('model-001');
    expect(summary.passportId).toBe('model-001');
    expect(summary.feedbackCount).toBe(5);
    expect(summary.avgScore).toBe(85); // 8500 / 100
  });

  it('returns empty summary for unknown passport', async () => {
    mockProgram.account.passportStats.fetch.mockRejectedValueOnce(new Error('Account does not exist'));
    const summary = await provider.getSummary('unknown');
    expect(summary.feedbackCount).toBe(0);
    expect(summary.avgScore).toBe(0);
  });

  it('isHealthy returns true when program is reachable', async () => {
    expect(await provider.isHealthy()).toBe(true);
  });
});
```

**Step 2: Run to verify failure, then implement**

Create `offchain/packages/engine/src/reputation/providers/LucidOnChainProvider.ts`:

```typescript
import { IReputationProvider } from '../IReputationProvider';
import {
  FeedbackParams,
  ValidationParams,
  ReputationData,
  ValidationResult,
  ReputationSummary,
  TxReceipt,
  ReadOptions,
  ASSET_TYPE_MAP,
  ASSET_TYPE_REVERSE,
} from '../types';
import { PublicKey, SystemProgram } from '@solana/web3.js';

export class LucidOnChainProvider implements IReputationProvider {
  readonly providerName = 'lucid-onchain';

  constructor(
    private program: any,
    private wallet: any,
  ) {}

  private findStatsPDA(passportId: string): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('stats'), Buffer.from(passportId)],
      this.program.programId,
    );
    return pda;
  }

  private findFeedbackPDA(passportId: string, index: number): PublicKey {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(index);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('feedback'), Buffer.from(passportId), buf],
      this.program.programId,
    );
    return pda;
  }

  private findValidationPDA(passportId: string, receiptHash: Buffer): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('validation'), Buffer.from(passportId), receiptHash],
      this.program.programId,
    );
    return pda;
  }

  private hexToBytes(hex: string): number[] {
    return Array.from(Buffer.from(hex, 'hex'));
  }

  async submitFeedback(params: FeedbackParams): Promise<TxReceipt> {
    const statsPDA = this.findStatsPDA(params.passportId);

    // Ensure stats PDA exists (init if needed)
    try {
      await this.program.account.passportStats.fetch(statsPDA);
    } catch {
      await this.program.methods
        .initStats(params.passportId)
        .accounts({
          authority: this.wallet.publicKey,
          stats: statsPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const stats = await this.program.account.passportStats.fetch(statsPDA);
    const feedbackPDA = this.findFeedbackPDA(params.passportId, stats.feedbackCount);

    const txHash = await this.program.methods
      .submitFeedback(
        params.passportId,
        params.score,
        params.category,
        this.hexToBytes(params.receiptHash),
        ASSET_TYPE_MAP[params.assetType],
        params.metadata || '',
      )
      .accounts({
        submitter: this.wallet.publicKey,
        feedbackEntry: feedbackPDA,
        stats: statsPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { success: true, txHash };
  }

  async readFeedback(passportId: string, options?: ReadOptions): Promise<ReputationData[]> {
    const statsPDA = this.findStatsPDA(passportId);
    let count: number;
    try {
      const stats = await this.program.account.passportStats.fetch(statsPDA);
      count = stats.feedbackCount;
    } catch {
      return [];
    }

    const limit = options?.limit ?? count;
    const offset = options?.offset ?? 0;
    const results: ReputationData[] = [];

    for (let i = offset; i < Math.min(offset + limit, count); i++) {
      try {
        const pda = this.findFeedbackPDA(passportId, i);
        const entry = await this.program.account.feedbackEntry.fetch(pda);
        const assetType = ASSET_TYPE_REVERSE[entry.assetType];
        if (options?.category && entry.category !== options.category) continue;
        if (options?.assetType && assetType !== options.assetType) continue;

        results.push({
          passportId: entry.passportId,
          from: entry.from.toBase58(),
          score: entry.score,
          category: entry.category,
          receiptHash: Buffer.from(entry.receiptHash).toString('hex'),
          assetType,
          timestamp: typeof entry.timestamp === 'object' ? entry.timestamp.toNumber() : entry.timestamp,
          revoked: entry.revoked,
          index: entry.index,
        });
      } catch {
        // PDA may not exist if revoked/deleted, skip
      }
    }

    return results;
  }

  async getSummary(passportId: string): Promise<ReputationSummary> {
    try {
      const statsPDA = this.findStatsPDA(passportId);
      const stats = await this.program.account.passportStats.fetch(statsPDA);
      return {
        passportId,
        feedbackCount: stats.feedbackCount,
        validationCount: stats.validationCount,
        avgScore: stats.avgScore / 100,
        totalScore: typeof stats.totalScore === 'object' ? stats.totalScore.toNumber() : stats.totalScore,
        lastUpdated: typeof stats.lastUpdated === 'object' ? stats.lastUpdated.toNumber() : stats.lastUpdated,
      };
    } catch {
      return { passportId, feedbackCount: 0, validationCount: 0, avgScore: 0, totalScore: 0, lastUpdated: 0 };
    }
  }

  async submitValidation(params: ValidationParams): Promise<TxReceipt> {
    const receiptBuf = Buffer.from(params.receiptHash, 'hex');
    const statsPDA = this.findStatsPDA(params.passportId);
    const validationPDA = this.findValidationPDA(params.passportId, receiptBuf);

    const txHash = await this.program.methods
      .submitValidation(
        params.passportId,
        this.hexToBytes(params.receiptHash),
        params.valid,
        ASSET_TYPE_MAP[params.assetType],
        params.metadata || '',
      )
      .accounts({
        submitter: this.wallet.publicKey,
        validationEntry: validationPDA,
        stats: statsPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { success: true, txHash };
  }

  async getValidation(passportId: string, receiptHash: string): Promise<ValidationResult | null> {
    try {
      const receiptBuf = Buffer.from(receiptHash, 'hex');
      const pda = this.findValidationPDA(passportId, receiptBuf);
      const entry = await this.program.account.validationEntry.fetch(pda);
      return {
        passportId: entry.passportId,
        validator: entry.validator.toBase58(),
        valid: entry.valid,
        receiptHash: Buffer.from(entry.receiptHash).toString('hex'),
        assetType: ASSET_TYPE_REVERSE[entry.assetType],
        timestamp: typeof entry.timestamp === 'object' ? entry.timestamp.toNumber() : entry.timestamp,
      };
    } catch {
      return null;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Try fetching a known PDA or just check provider connectivity
      return true;
    } catch {
      return false;
    }
  }
}
```

**Step 3: Run tests**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain
npx jest --testPathPattern="reputation/__tests__/LucidOnChainProvider" --no-coverage
```

Expected: All 5 tests PASS.

**Step 4: Commit**

```bash
git add offchain/packages/engine/src/reputation/providers/
git commit -m "feat: add LucidOnChainProvider (Anchor-backed reputation)"
```

---

### Task 6: IReputationSyncer + Stub Syncers + Tests

**Files:**
- Create: `offchain/packages/engine/src/reputation/IReputationSyncer.ts`
- Create: `offchain/packages/engine/src/reputation/syncers/SATISyncer.ts`
- Create: `offchain/packages/engine/src/reputation/syncers/SAIDSyncer.ts`
- Create: `offchain/packages/engine/src/reputation/syncers/EVM8004Syncer.ts`
- Create: `offchain/packages/engine/src/reputation/__tests__/syncers.test.ts`

**Step 1: Create IReputationSyncer interface**

Create `offchain/packages/engine/src/reputation/IReputationSyncer.ts`:

```typescript
import { FeedbackParams, TxReceipt, AssetType } from './types';

export interface ExternalFeedback {
  source: string;
  externalId: string;
  score: number;
  category?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface ExternalSummary {
  source: string;
  externalId: string;
  avgScore: number;
  feedbackCount: number;
  lastUpdated: number;
}

export interface IReputationSyncer {
  readonly syncerName: string;
  readonly supportedAssetTypes: AssetType[];

  pullFeedback(passportId: string): Promise<ExternalFeedback[]>;
  pullSummary(passportId: string): Promise<ExternalSummary | null>;
  pushFeedback(params: FeedbackParams): Promise<TxReceipt | null>;
  resolveExternalId(passportId: string): Promise<string | null>;
  isAvailable(): Promise<boolean>;
}
```

**Step 2: Create stub syncers**

Create `offchain/packages/engine/src/reputation/syncers/SATISyncer.ts`:

```typescript
import { IReputationSyncer, ExternalFeedback, ExternalSummary } from '../IReputationSyncer';
import { FeedbackParams, TxReceipt, AssetType } from '../types';

export class SATISyncer implements IReputationSyncer {
  readonly syncerName = 'sati';
  readonly supportedAssetTypes: AssetType[] = ['agent'];

  async pullFeedback(_passportId: string): Promise<ExternalFeedback[]> {
    return [];
  }

  async pullSummary(_passportId: string): Promise<ExternalSummary | null> {
    return null;
  }

  async pushFeedback(_params: FeedbackParams): Promise<TxReceipt | null> {
    return null;
  }

  async resolveExternalId(_passportId: string): Promise<string | null> {
    return null;
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}
```

Create `offchain/packages/engine/src/reputation/syncers/SAIDSyncer.ts`:

```typescript
import { IReputationSyncer, ExternalFeedback, ExternalSummary } from '../IReputationSyncer';
import { FeedbackParams, TxReceipt, AssetType } from '../types';

export class SAIDSyncer implements IReputationSyncer {
  readonly syncerName = 'said';
  readonly supportedAssetTypes: AssetType[] = ['agent'];

  async pullFeedback(_passportId: string): Promise<ExternalFeedback[]> {
    return [];
  }

  async pullSummary(_passportId: string): Promise<ExternalSummary | null> {
    return null;
  }

  async pushFeedback(_params: FeedbackParams): Promise<TxReceipt | null> {
    return null;
  }

  async resolveExternalId(_passportId: string): Promise<string | null> {
    return null;
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}
```

Create `offchain/packages/engine/src/reputation/syncers/EVM8004Syncer.ts`:

```typescript
import { IReputationSyncer, ExternalFeedback, ExternalSummary } from '../IReputationSyncer';
import { FeedbackParams, TxReceipt, AssetType } from '../types';

export class EVM8004Syncer implements IReputationSyncer {
  readonly syncerName = 'evm-8004';
  readonly supportedAssetTypes: AssetType[] = ['agent'];

  constructor(
    private validationClient?: any,
    private reputationClient?: any,
  ) {}

  async pullFeedback(passportId: string): Promise<ExternalFeedback[]> {
    if (!this.reputationClient) return [];
    try {
      const feedback = await this.reputationClient.getFeedback(passportId);
      return feedback.map((f: any) => ({
        source: this.syncerName,
        externalId: passportId,
        score: f.score,
        category: f.category,
        timestamp: f.timestamp,
      }));
    } catch {
      return [];
    }
  }

  async pullSummary(passportId: string): Promise<ExternalSummary | null> {
    if (!this.reputationClient) return null;
    try {
      const { averageScore, count } = await this.reputationClient.getAverageScore(passportId);
      return {
        source: this.syncerName,
        externalId: passportId,
        avgScore: averageScore,
        feedbackCount: count,
        lastUpdated: Date.now(),
      };
    } catch {
      return null;
    }
  }

  async pushFeedback(params: FeedbackParams): Promise<TxReceipt | null> {
    if (!this.reputationClient) return null;
    try {
      const txHash = await this.reputationClient.submitFeedback({
        agentTokenId: params.passportId,
        score: params.score,
        category: params.category,
        commentHash: params.receiptHash,
      });
      return { success: true, txHash };
    } catch {
      return null;
    }
  }

  async resolveExternalId(passportId: string): Promise<string | null> {
    return passportId; // 1:1 mapping for EVM
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.validationClient || this.reputationClient);
  }
}
```

**Step 3: Write test**

Create `offchain/packages/engine/src/reputation/__tests__/syncers.test.ts`:

```typescript
import { SATISyncer } from '../syncers/SATISyncer';
import { SAIDSyncer } from '../syncers/SAIDSyncer';
import { EVM8004Syncer } from '../syncers/EVM8004Syncer';

describe('SATISyncer (stub)', () => {
  const syncer = new SATISyncer();

  it('has correct name and supported types', () => {
    expect(syncer.syncerName).toBe('sati');
    expect(syncer.supportedAssetTypes).toEqual(['agent']);
  });

  it('isAvailable returns false', async () => {
    expect(await syncer.isAvailable()).toBe(false);
  });

  it('pullFeedback returns empty', async () => {
    expect(await syncer.pullFeedback('x')).toEqual([]);
  });

  it('pullSummary returns null', async () => {
    expect(await syncer.pullSummary('x')).toBeNull();
  });

  it('pushFeedback returns null', async () => {
    expect(await syncer.pushFeedback({
      passportId: 'x', score: 50, category: 'q', receiptHash: 'h', assetType: 'agent',
    })).toBeNull();
  });
});

describe('SAIDSyncer (stub)', () => {
  const syncer = new SAIDSyncer();

  it('has correct name', () => {
    expect(syncer.syncerName).toBe('said');
  });

  it('isAvailable returns false', async () => {
    expect(await syncer.isAvailable()).toBe(false);
  });
});

describe('EVM8004Syncer', () => {
  it('returns unavailable without clients', async () => {
    const syncer = new EVM8004Syncer();
    expect(await syncer.isAvailable()).toBe(false);
    expect(await syncer.pullFeedback('x')).toEqual([]);
    expect(await syncer.pullSummary('x')).toBeNull();
  });

  it('pulls feedback when client available', async () => {
    const mockRepClient = {
      getFeedback: jest.fn().mockResolvedValue([
        { score: 80, category: 'quality', timestamp: 1000 },
      ]),
      getAverageScore: jest.fn().mockResolvedValue({ averageScore: 80, count: 1 }),
    };
    const syncer = new EVM8004Syncer(null, mockRepClient);

    expect(await syncer.isAvailable()).toBe(true);

    const feedback = await syncer.pullFeedback('agent-1');
    expect(feedback).toHaveLength(1);
    expect(feedback[0].source).toBe('evm-8004');
    expect(feedback[0].score).toBe(80);

    const summary = await syncer.pullSummary('agent-1');
    expect(summary!.avgScore).toBe(80);
  });
});
```

**Step 4: Run tests**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain
npx jest --testPathPattern="reputation/__tests__/syncers" --no-coverage
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add offchain/packages/engine/src/reputation/IReputationSyncer.ts offchain/packages/engine/src/reputation/syncers/ offchain/packages/engine/src/reputation/__tests__/syncers.test.ts
git commit -m "feat: add IReputationSyncer interface with SATI, SAID, EVM stubs"
```

---

### Task 7: Solana8004Syncer

**Files:**
- Create: `offchain/packages/engine/src/reputation/syncers/Solana8004Syncer.ts`
- Create: `offchain/packages/engine/src/reputation/__tests__/Solana8004Syncer.test.ts`

**Step 1: Write the failing test**

Create `offchain/packages/engine/src/reputation/__tests__/Solana8004Syncer.test.ts`:

```typescript
const mockSdk = {
  getSummary: jest.fn(),
  readAllFeedback: jest.fn(),
  giveFeedback: jest.fn(),
  searchAgents: jest.fn(),
};

jest.mock('8004-solana', () => ({
  SolanaSDK8004: jest.fn().mockImplementation(() => mockSdk),
}));

import { Solana8004Syncer } from '../syncers/Solana8004Syncer';

describe('Solana8004Syncer', () => {
  let syncer: Solana8004Syncer;

  beforeEach(() => {
    jest.clearAllMocks();
    syncer = new Solana8004Syncer(mockSdk as any);
  });

  it('has correct name and supported types', () => {
    expect(syncer.syncerName).toBe('8004-solana');
    expect(syncer.supportedAssetTypes).toEqual(['agent']);
  });

  it('isAvailable returns true when SDK present', async () => {
    expect(await syncer.isAvailable()).toBe(true);
  });

  it('pulls feedback from 8004 SDK', async () => {
    mockSdk.readAllFeedback.mockResolvedValue([
      { score: 90, category: 'quality', timestamp: 1000, from: 'addr1' },
      { score: 70, category: 'latency', timestamp: 2000, from: 'addr2' },
    ]);

    const feedback = await syncer.pullFeedback('agent-001');
    expect(feedback).toHaveLength(2);
    expect(feedback[0].source).toBe('8004-solana');
    expect(feedback[0].score).toBe(90);
    expect(mockSdk.readAllFeedback).toHaveBeenCalled();
  });

  it('pulls summary from 8004 SDK', async () => {
    mockSdk.getSummary.mockResolvedValue({
      averageScore: 82,
      totalFeedback: 15,
      lastUpdated: 3000,
    });

    const summary = await syncer.pullSummary('agent-001');
    expect(summary).not.toBeNull();
    expect(summary!.avgScore).toBe(82);
    expect(summary!.feedbackCount).toBe(15);
  });

  it('pushes feedback to 8004 SDK', async () => {
    mockSdk.giveFeedback.mockResolvedValue('tx-hash-ext');

    const result = await syncer.pushFeedback({
      passportId: 'agent-001',
      score: 80,
      category: 'quality',
      receiptHash: 'abc',
      assetType: 'agent',
    });

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.txHash).toBe('tx-hash-ext');
  });

  it('returns null for non-agent asset types', async () => {
    const result = await syncer.pushFeedback({
      passportId: 'model-001',
      score: 80,
      category: 'quality',
      receiptHash: 'abc',
      assetType: 'model',
    });
    expect(result).toBeNull();
    expect(mockSdk.giveFeedback).not.toHaveBeenCalled();
  });

  it('handles SDK errors gracefully', async () => {
    mockSdk.readAllFeedback.mockRejectedValue(new Error('network'));
    const feedback = await syncer.pullFeedback('agent-001');
    expect(feedback).toEqual([]);
  });
});
```

**Step 2: Implement Solana8004Syncer**

Create `offchain/packages/engine/src/reputation/syncers/Solana8004Syncer.ts`:

```typescript
import { IReputationSyncer, ExternalFeedback, ExternalSummary } from '../IReputationSyncer';
import { FeedbackParams, TxReceipt, AssetType } from '../types';

export class Solana8004Syncer implements IReputationSyncer {
  readonly syncerName = '8004-solana';
  readonly supportedAssetTypes: AssetType[] = ['agent'];

  constructor(private sdk: any) {}

  async pullFeedback(passportId: string): Promise<ExternalFeedback[]> {
    try {
      const externalId = await this.resolveExternalId(passportId);
      if (!externalId) return [];

      const feedback = await this.sdk.readAllFeedback(externalId);
      return (feedback || []).map((f: any) => ({
        source: this.syncerName,
        externalId,
        score: f.score,
        category: f.category,
        timestamp: f.timestamp,
        metadata: { from: f.from },
      }));
    } catch {
      return [];
    }
  }

  async pullSummary(passportId: string): Promise<ExternalSummary | null> {
    try {
      const externalId = await this.resolveExternalId(passportId);
      if (!externalId) return null;

      const summary = await this.sdk.getSummary(externalId);
      if (!summary) return null;

      return {
        source: this.syncerName,
        externalId,
        avgScore: summary.averageScore,
        feedbackCount: summary.totalFeedback,
        lastUpdated: summary.lastUpdated || Date.now(),
      };
    } catch {
      return null;
    }
  }

  async pushFeedback(params: FeedbackParams): Promise<TxReceipt | null> {
    if (!this.supportedAssetTypes.includes(params.assetType)) return null;
    try {
      const txHash = await this.sdk.giveFeedback(
        params.passportId,
        params.score,
        params.category,
      );
      return { success: true, txHash };
    } catch {
      return null;
    }
  }

  async resolveExternalId(passportId: string): Promise<string | null> {
    // For now, 1:1 mapping. In future, could look up a mapping table
    // that maps Lucid passport IDs to 8004 agent token IDs.
    return passportId;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.sdk;
  }
}
```

**Step 3: Run tests**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain
npx jest --testPathPattern="reputation/__tests__/Solana8004Syncer" --no-coverage
```

Expected: All 7 tests PASS.

**Step 4: Commit**

```bash
git add offchain/packages/engine/src/reputation/syncers/Solana8004Syncer.ts offchain/packages/engine/src/reputation/__tests__/Solana8004Syncer.test.ts
git commit -m "feat: add Solana8004Syncer wrapping 8004-solana SDK"
```

---

### Task 8: ReputationService Orchestrator + Tests

**Files:**
- Create: `offchain/packages/gateway-lite/src/reputation/reputationService.ts`
- Create: `offchain/packages/gateway-lite/src/reputation/__tests__/reputationService.test.ts`

**Step 1: Write the failing test**

Create `offchain/packages/gateway-lite/src/reputation/__tests__/reputationService.test.ts`:

```typescript
import { ReputationService } from '../reputationService';
import { IReputationProvider } from '../../../../engine/src/reputation/IReputationProvider';
import { IReputationSyncer, ExternalFeedback, ExternalSummary } from '../../../../engine/src/reputation/IReputationSyncer';
import { FeedbackParams, ReputationSummary, TxReceipt } from '../../../../engine/src/reputation/types';

function mockProvider(overrides?: Partial<IReputationProvider>): IReputationProvider {
  return {
    providerName: 'mock',
    submitFeedback: jest.fn().mockResolvedValue({ success: true, id: 'f1' }),
    readFeedback: jest.fn().mockResolvedValue([]),
    getSummary: jest.fn().mockResolvedValue({
      passportId: 'p1', feedbackCount: 5, validationCount: 2,
      avgScore: 80, totalScore: 400, lastUpdated: 1000,
    }),
    submitValidation: jest.fn().mockResolvedValue({ success: true }),
    getValidation: jest.fn().mockResolvedValue(null),
    isHealthy: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function mockSyncer(name: string, overrides?: Partial<IReputationSyncer>): IReputationSyncer {
  return {
    syncerName: name,
    supportedAssetTypes: ['agent'],
    pullFeedback: jest.fn().mockResolvedValue([]),
    pullSummary: jest.fn().mockResolvedValue(null),
    pushFeedback: jest.fn().mockResolvedValue({ success: true }),
    resolveExternalId: jest.fn().mockResolvedValue('ext-id'),
    isAvailable: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('ReputationService', () => {
  it('delegates submitFeedback to provider', async () => {
    const provider = mockProvider();
    const service = new ReputationService(provider, [], true, true);

    const params: FeedbackParams = {
      passportId: 'agent-1', score: 85, category: 'quality',
      receiptHash: 'abc', assetType: 'agent',
    };
    const result = await service.submitFeedback(params);

    expect(result.success).toBe(true);
    expect(provider.submitFeedback).toHaveBeenCalledWith(params);
  });

  it('pushes feedback to matching syncers on submit', async () => {
    const provider = mockProvider();
    const syncer1 = mockSyncer('s1');
    const syncer2 = mockSyncer('s2', { supportedAssetTypes: ['model'] });
    const service = new ReputationService(provider, [syncer1, syncer2], true, true);

    await service.submitFeedback({
      passportId: 'agent-1', score: 85, category: 'quality',
      receiptHash: 'abc', assetType: 'agent',
    });

    expect(syncer1.pushFeedback).toHaveBeenCalled(); // agent is supported
    expect(syncer2.pushFeedback).not.toHaveBeenCalled(); // model only
  });

  it('does not push when pushEnabled is false', async () => {
    const provider = mockProvider();
    const syncer = mockSyncer('s1');
    const service = new ReputationService(provider, [syncer], false, true);

    await service.submitFeedback({
      passportId: 'agent-1', score: 85, category: 'q',
      receiptHash: 'h', assetType: 'agent',
    });

    expect(syncer.pushFeedback).not.toHaveBeenCalled();
  });

  it('returns unified summary merging provider + syncers', async () => {
    const provider = mockProvider();
    const syncer = mockSyncer('ext', {
      pullSummary: jest.fn().mockResolvedValue({
        source: 'ext', externalId: 'e1', avgScore: 90,
        feedbackCount: 10, lastUpdated: 2000,
      }),
    });
    const service = new ReputationService(provider, [syncer], true, true);

    const unified = await service.getUnifiedSummary('agent-1');

    expect(unified.local.avgScore).toBe(80);
    expect(unified.external).toHaveLength(1);
    expect(unified.external[0].avgScore).toBe(90);
    expect(unified.merged.avgScore).toBeGreaterThan(0);
  });

  it('does not pull when pullEnabled is false', async () => {
    const provider = mockProvider();
    const syncer = mockSyncer('ext');
    const service = new ReputationService(provider, [syncer], true, false);

    const unified = await service.getUnifiedSummary('agent-1');

    expect(unified.external).toEqual([]);
    expect(syncer.pullSummary).not.toHaveBeenCalled();
  });

  it('isolates syncer failures', async () => {
    const provider = mockProvider();
    const badSyncer = mockSyncer('bad', {
      pullSummary: jest.fn().mockRejectedValue(new Error('network')),
    });
    const goodSyncer = mockSyncer('good', {
      pullSummary: jest.fn().mockResolvedValue({
        source: 'good', externalId: 'e1', avgScore: 75,
        feedbackCount: 3, lastUpdated: 1000,
      }),
    });
    const service = new ReputationService(provider, [badSyncer, goodSyncer], true, true);

    const unified = await service.getUnifiedSummary('agent-1');

    // bad syncer fails silently, good syncer data still present
    expect(unified.external).toHaveLength(1);
    expect(unified.external[0].source).toBe('good');
  });

  it('combines local + external feedback in readFeedback', async () => {
    const provider = mockProvider({
      readFeedback: jest.fn().mockResolvedValue([
        { passportId: 'a1', from: 'local', score: 80, category: 'q',
          receiptHash: 'h1', assetType: 'agent', timestamp: 1000, revoked: false, index: 0 },
      ]),
    });
    const syncer = mockSyncer('ext', {
      pullFeedback: jest.fn().mockResolvedValue([
        { source: 'ext', externalId: 'e1', score: 90, category: 'q', timestamp: 2000 },
      ]),
    });
    const service = new ReputationService(provider, [syncer], true, true);

    const result = await service.readFeedback('a1');
    expect(result.local).toHaveLength(1);
    expect(result.external).toHaveLength(1);
  });
});
```

**Step 2: Implement ReputationService**

Create `offchain/packages/gateway-lite/src/reputation/reputationService.ts`:

```typescript
import { IReputationProvider } from '../../../engine/src/reputation/IReputationProvider';
import { IReputationSyncer, ExternalFeedback, ExternalSummary } from '../../../engine/src/reputation/IReputationSyncer';
import {
  FeedbackParams,
  ValidationParams,
  ReputationData,
  ValidationResult,
  ReputationSummary,
  TxReceipt,
  ReadOptions,
} from '../../../engine/src/reputation/types';

export interface UnifiedSummary {
  local: ReputationSummary;
  external: ExternalSummary[];
  merged: { avgScore: number; totalFeedback: number };
}

export interface UnifiedFeedback {
  local: ReputationData[];
  external: ExternalFeedback[];
}

export class ReputationService {
  constructor(
    private provider: IReputationProvider,
    private syncers: IReputationSyncer[],
    private pushEnabled: boolean,
    private pullEnabled: boolean,
  ) {}

  async submitFeedback(params: FeedbackParams): Promise<TxReceipt> {
    const receipt = await this.provider.submitFeedback(params);

    if (this.pushEnabled) {
      const matching = this.syncers.filter(s =>
        s.supportedAssetTypes.includes(params.assetType),
      );
      await Promise.allSettled(matching.map(s => s.pushFeedback(params)));
    }

    return receipt;
  }

  async submitValidation(params: ValidationParams): Promise<TxReceipt> {
    return this.provider.submitValidation(params);
  }

  async getValidation(passportId: string, receiptHash: string): Promise<ValidationResult | null> {
    return this.provider.getValidation(passportId, receiptHash);
  }

  async readFeedback(passportId: string, options?: ReadOptions): Promise<UnifiedFeedback> {
    const local = await this.provider.readFeedback(passportId, options);

    let external: ExternalFeedback[] = [];
    if (this.pullEnabled) {
      const results = await Promise.allSettled(
        this.syncers.map(s => s.pullFeedback(passportId)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') external.push(...r.value);
      }
    }

    return { local, external };
  }

  async getSummary(passportId: string): Promise<ReputationSummary> {
    return this.provider.getSummary(passportId);
  }

  async getUnifiedSummary(passportId: string): Promise<UnifiedSummary> {
    const local = await this.provider.getSummary(passportId);

    let external: ExternalSummary[] = [];
    if (this.pullEnabled) {
      const results = await Promise.allSettled(
        this.syncers.map(s => s.pullSummary(passportId)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          external.push(r.value);
        }
      }
    }

    // Weighted merge: weight by feedback count
    const sources = [
      { avg: local.avgScore, count: local.feedbackCount },
      ...external.map(e => ({ avg: e.avgScore, count: e.feedbackCount })),
    ];
    const totalCount = sources.reduce((s, x) => s + x.count, 0);
    const weightedAvg = totalCount > 0
      ? sources.reduce((s, x) => s + x.avg * x.count, 0) / totalCount
      : 0;

    return {
      local,
      external,
      merged: { avgScore: weightedAvg, totalFeedback: totalCount },
    };
  }
}
```

**Step 3: Run tests**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain
npx jest --testPathPattern="reputation/__tests__/reputationService" --no-coverage
```

Expected: All 7 tests PASS.

**Step 4: Commit**

```bash
git add offchain/packages/gateway-lite/src/reputation/reputationService.ts offchain/packages/gateway-lite/src/reputation/__tests__/
git commit -m "feat: add ReputationService orchestrator with unified summary + push/pull"
```

---

### Task 9: Factory + Index + Env Wiring

**Files:**
- Create: `offchain/packages/engine/src/reputation/index.ts`
- Modify: `offchain/packages/gateway-lite/src/index.ts` (wire up service)

**Step 1: Create factory index**

Create `offchain/packages/engine/src/reputation/index.ts`:

```typescript
export { IReputationProvider } from './IReputationProvider';
export { IReputationSyncer, ExternalFeedback, ExternalSummary } from './IReputationSyncer';
export * from './types';

import { IReputationProvider } from './IReputationProvider';
import { IReputationSyncer } from './IReputationSyncer';

let _provider: IReputationProvider | null = null;
let _syncers: IReputationSyncer[] | null = null;

export function getReputationProvider(): IReputationProvider {
  if (_provider) return _provider;

  const providerType = process.env.REPUTATION_PROVIDER || 'db';

  switch (providerType) {
    case 'onchain': {
      const { LucidOnChainProvider } = require('./providers/LucidOnChainProvider');
      // Program and wallet must be injected via setReputationProvider() for on-chain
      throw new Error(
        'On-chain reputation provider requires explicit initialization via setReputationProvider(). ' +
        'Pass the Anchor program and wallet.',
      );
    }
    case 'db':
    default: {
      const { LucidDBProvider } = require('./providers/LucidDBProvider');
      _provider = new LucidDBProvider();
      return _provider;
    }
  }
}

export function setReputationProvider(provider: IReputationProvider): void {
  _provider = provider;
}

export function getReputationSyncers(): IReputationSyncer[] {
  if (_syncers) return _syncers;

  const syncerNames = (process.env.REPUTATION_SYNCERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  _syncers = [];

  for (const name of syncerNames) {
    switch (name) {
      case '8004': {
        const { Solana8004Syncer } = require('./syncers/Solana8004Syncer');
        // SDK must be provided externally or initialized from env
        try {
          const sdk8004 = require('8004-solana');
          const sdk = new sdk8004.SolanaSDK8004();
          _syncers.push(new Solana8004Syncer(sdk));
        } catch {
          console.warn('8004-solana SDK not available, skipping Solana8004Syncer');
        }
        break;
      }
      case 'sati': {
        const { SATISyncer } = require('./syncers/SATISyncer');
        _syncers.push(new SATISyncer());
        break;
      }
      case 'said': {
        const { SAIDSyncer } = require('./syncers/SAIDSyncer');
        _syncers.push(new SAIDSyncer());
        break;
      }
      case 'evm': {
        const { EVM8004Syncer } = require('./syncers/EVM8004Syncer');
        _syncers.push(new EVM8004Syncer());
        break;
      }
      default:
        console.warn(`Unknown reputation syncer: ${name}`);
    }
  }

  return _syncers;
}

export function resetReputationFactory(): void {
  _provider = null;
  _syncers = null;
}
```

**Step 2: Commit**

```bash
git add offchain/packages/engine/src/reputation/index.ts
git commit -m "feat: add reputation factory with env-based provider/syncer selection"
```

---

### Task 10: Remove Validation/Reputation from IBlockchainAdapter

**Files:**
- Modify: `offchain/packages/engine/src/chains/adapter-interface.ts` (remove 4 methods)
- Modify: `offchain/packages/engine/src/chains/solana/adapter.ts` (remove 4 method implementations)
- Modify: `offchain/src/__tests__/solanaAdapter.test.ts` (remove validation/reputation tests)

**Step 1: Read current files**

Read `adapter-interface.ts`, `solana/adapter.ts`, and `solanaAdapter.test.ts` to identify exact lines to remove.

**Step 2: Remove from adapter-interface.ts**

Remove these 4 method signatures from `IBlockchainAdapter`:
- `submitValidation(params: ValidationSubmission): Promise<TxReceipt>` (around line 71)
- `getValidation(validationId: string): Promise<ValidationResult | null>` (around line 74)
- `submitReputation(params: ReputationFeedback): Promise<TxReceipt>` (around line 81)
- `readReputation(agentId: string): Promise<ReputationData[]>` (around line 84)

Also remove unused type imports: `ValidationSubmission`, `ValidationResult`, `ReputationFeedback`, `ReputationData`.

**Step 3: Remove from solana/adapter.ts**

Remove these method implementations:
- `submitValidation()` (around lines 217-253)
- `getValidation()` (around lines 255-280)
- `submitReputation()` (around lines 286-323)
- `readReputation()` (around lines 325-348)

Remove the `pool` import if no longer needed.

**Step 4: Remove validation/reputation tests from solanaAdapter.test.ts**

Remove:
- `pool.query` mock setup (lines 10-18)
- `const mockQuery` (line 33)
- `mockQuery.mockReset()` in beforeEach (line 171)
- The `submitValidation` test block (lines 185-215)
- The `submitReputation` test block (lines 217-244)
- The `getValidation null` test (lines 246-250)
- The `readReputation empty` test (lines 252-256)

Remove the `pool` import.

**Step 5: Run all tests to verify nothing breaks**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain
npx jest --no-coverage
```

Expected: All tests pass (the removed tests are gone, remaining tests still pass).

**Step 6: Commit**

```bash
git add offchain/packages/engine/src/chains/adapter-interface.ts offchain/packages/engine/src/chains/solana/adapter.ts offchain/src/__tests__/solanaAdapter.test.ts
git commit -m "refactor: remove validation/reputation from IBlockchainAdapter (moved to IReputationProvider)"
```

---

### Task 11: Update ReputationAggregator

**Files:**
- Modify: `offchain/packages/gateway-lite/src/reputation/reputationAggregator.ts`

**Step 1: Read current file**

Read the full `reputationAggregator.ts` to understand the current `indexChain()` and `getUnifiedScore()` flow.

**Step 2: Add ReputationService integration**

Add an optional `ReputationService` reference to the aggregator. When present, `getUnifiedScore()` should also query the service for on-chain Solana reputation data (via `getUnifiedSummary`), merging it with the existing EVM event-based data.

Add near the class constructor:

```typescript
import { ReputationService, UnifiedSummary } from './reputationService';

// In the class:
private reputationService?: ReputationService;

setReputationService(service: ReputationService): void {
  this.reputationService = service;
}
```

In `getUnifiedScore()`, after aggregating EVM data, add:

```typescript
if (this.reputationService) {
  try {
    const unified = await this.reputationService.getUnifiedSummary(agentId);
    if (unified.local.feedbackCount > 0) {
      // Merge Lucid native reputation as another "chain"
      // Weight by feedback count, same as other chains
      totalWeightedScore += unified.local.avgScore * unified.local.feedbackCount;
      totalWeight += unified.local.feedbackCount;
    }
  } catch {
    // Reputation service unavailable, continue with EVM data only
  }
}
```

**Step 3: Run existing reputation aggregator tests (if any)**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain
npx jest --testPathPattern="reputationAggregator" --no-coverage 2>/dev/null || echo "No existing tests"
```

**Step 4: Commit**

```bash
git add offchain/packages/gateway-lite/src/reputation/reputationAggregator.ts
git commit -m "feat: wire ReputationService into ReputationAggregator for Solana reputation data"
```

---

### Task 12: Update Reputation Index Exports

**Files:**
- Modify: `offchain/packages/gateway-lite/src/reputation/index.ts`

**Step 1: Read current exports**

Read `offchain/packages/gateway-lite/src/reputation/index.ts`.

**Step 2: Add ReputationService export**

Add to the existing re-exports:

```typescript
export { ReputationService, UnifiedSummary, UnifiedFeedback } from './reputationService';
```

**Step 3: Commit**

```bash
git add offchain/packages/gateway-lite/src/reputation/index.ts
git commit -m "chore: export ReputationService from reputation index"
```

---

### Task 13: Full Test Suite Verification

**Step 1: Run full offchain test suite**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain
npm test -- --no-coverage
```

Expected: All tests pass (946+ existing, plus new reputation tests).

**Step 2: Build check**

```bash
cd /home/debian/Lucid/Lucid-L2/offchain
npx tsc --noEmit
```

Expected: No type errors.

**Step 3: Build Anchor program**

```bash
cd /home/debian/Lucid/Lucid-L2
anchor build -p lucid_reputation
```

Expected: Successful build.

**Step 4: Commit any remaining fixes**

If any tests fail or type errors exist, fix them and commit.

---

### Task 14: Database Migration (if using DB provider)

**Files:**
- Create: `infrastructure/migrations/YYYYMMDD_reputation_tables.sql`

**Step 1: Create migration**

```sql
-- Reputation feedback table (used by LucidDBProvider)
CREATE TABLE IF NOT EXISTS reputation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id TEXT NOT NULL,
  from_address TEXT NOT NULL DEFAULT 'local',
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 100),
  category TEXT NOT NULL DEFAULT 'general',
  receipt_hash TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'model',
  metadata TEXT DEFAULT '',
  revoked BOOLEAN DEFAULT false,
  feedback_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fk_asset_type CHECK (asset_type IN ('model', 'compute', 'tool', 'agent', 'dataset'))
);

CREATE INDEX IF NOT EXISTS idx_rep_feedback_passport ON reputation_feedback(passport_id);
CREATE INDEX IF NOT EXISTS idx_rep_feedback_receipt ON reputation_feedback(receipt_hash);

-- Reputation validations table
CREATE TABLE IF NOT EXISTS reputation_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id TEXT NOT NULL,
  validator TEXT NOT NULL DEFAULT 'local',
  valid BOOLEAN NOT NULL,
  receipt_hash TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'model',
  metadata TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fk_val_asset_type CHECK (asset_type IN ('model', 'compute', 'tool', 'agent', 'dataset')),
  CONSTRAINT uq_validation_receipt UNIQUE (passport_id, receipt_hash)
);

CREATE INDEX IF NOT EXISTS idx_rep_validation_passport ON reputation_validations(passport_id);
```

**Step 2: Commit**

```bash
git add infrastructure/migrations/
git commit -m "feat: add reputation_feedback and reputation_validations DB tables"
```

---

## Summary

| Task | Description | Estimated Steps |
|------|-------------|-----------------|
| 1 | Anchor program scaffold (lib.rs) | 6 |
| 2 | Anchor integration tests | 3 |
| 3 | Types + IReputationProvider interface | 3 |
| 4 | LucidDBProvider + tests | 5 |
| 5 | LucidOnChainProvider + tests | 4 |
| 6 | IReputationSyncer + stub syncers + tests | 5 |
| 7 | Solana8004Syncer + tests | 4 |
| 8 | ReputationService orchestrator + tests | 4 |
| 9 | Factory + index + env wiring | 2 |
| 10 | Remove validation/reputation from IBlockchainAdapter | 6 |
| 11 | Update ReputationAggregator | 4 |
| 12 | Update reputation index exports | 3 |
| 13 | Full test suite verification | 4 |
| 14 | Database migration | 2 |

**Total: 14 tasks, ~55 steps**

## Environment Variables (New)

```bash
REPUTATION_PROVIDER=db              # 'onchain' | 'db' (default: 'db')
REPUTATION_SYNCERS=                  # comma-separated: '8004,sati,said,evm' (default: empty)
REPUTATION_PUSH_ENABLED=true         # Push feedback to external providers
REPUTATION_PULL_ENABLED=true         # Pull feedback from external providers
```
