use anchor_lang::prelude::*;

// ← replace this with the ID printed by `anchor deploy`
declare_id!("9YhfaLoUZYLzu3xRQevRom4qj8oTf5TGpuoWptvStKDu");

const MAX_BATCH: usize = 16; // adjust as you like

#[program]
pub mod thought_epoch {
    use super::*;

    /// Initialize a new epoch record (first time only).
    pub fn init_epoch(ctx: Context<InitEpoch>, root: [u8; 32]) -> Result<()> {
        let rec = &mut ctx.accounts.epoch_record;
        rec.merkle_root = root;
        rec.authority   = *ctx.accounts.authority.key;
        Ok(())
    }

    /// Update an existing epoch record (authority must match).
    pub fn commit_epoch(ctx: Context<UpdateEpoch>, root: [u8; 32]) -> Result<()> {
        let rec = &mut ctx.accounts.epoch_record;
        rec.merkle_root = root;
        // authority already validated by has_one constraint
        Ok(())
    }

    /// Initialize a new batch record (first time only).
    pub fn init_epochs(ctx: Context<InitEpochs>, roots: Vec<[u8; 32]>) -> Result<()> {
        require!(roots.len() <= MAX_BATCH, ErrorCode::BatchTooLarge);
        let batch = &mut ctx.accounts.epoch_record_batch;
        batch.roots = roots;
        batch.authority = *ctx.accounts.authority.key;
        Ok(())
    }

    /// Update an existing batch record (authority must match).
    pub fn commit_epochs(ctx: Context<UpdateEpochs>, roots: Vec<[u8; 32]>) -> Result<()> {
        require!(roots.len() <= MAX_BATCH, ErrorCode::BatchTooLarge);
        let batch = &mut ctx.accounts.epoch_record_batch;
        batch.roots = roots;
        // authority already validated by has_one constraint
        Ok(())
    }

    /// Initialize a new v2 epoch record (first time only).
    pub fn init_epoch_v2(
        ctx: Context<InitEpochV2>,
        root: [u8; 32],
        epoch_id: u64,
        leaf_count: u64,
        timestamp: i64,
        mmr_size: u64,
    ) -> Result<()> {
        let rec = &mut ctx.accounts.epoch_record_v2;
        rec.merkle_root = root;
        rec.authority = *ctx.accounts.authority.key;
        rec.epoch_id = epoch_id;
        rec.leaf_count = leaf_count;
        rec.timestamp = timestamp;
        rec.mmr_size = mmr_size;
        Ok(())
    }

    /// Update an existing v2 epoch record (authority must match).
    pub fn commit_epoch_v2(
        ctx: Context<UpdateEpochV2>,
        root: [u8; 32],
        epoch_id: u64,
        leaf_count: u64,
        timestamp: i64,
        mmr_size: u64,
    ) -> Result<()> {
        let rec = &mut ctx.accounts.epoch_record_v2;
        rec.merkle_root = root;
        // authority already validated by has_one constraint
        rec.epoch_id = epoch_id;
        rec.leaf_count = leaf_count;
        rec.timestamp = timestamp;
        rec.mmr_size = mmr_size;
        Ok(())
    }
}

// --- Init accounts (create only, never overwrite) ---

#[derive(Accounts)]
pub struct InitEpoch<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// PDA seeds = ["epoch", authority], bump — created once
    #[account(
       init,
       payer    = authority,
       space    = 8 + 32 + 32,
       seeds    = [b"epoch", authority.key().as_ref()],
       bump
    )]
    pub epoch_record: Account<'info, EpochRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitEpochs<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
       init,
       payer    = authority,
       space    = 8 + (4 + MAX_BATCH * 32) + 32,
       seeds    = [b"epochs", authority.key().as_ref()],
       bump
    )]
    pub epoch_record_batch: Account<'info, EpochRecordBatch>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitEpochV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// PDA seeds = ["epoch_v2", authority], bump — created once
    #[account(
       init,
       payer    = authority,
       space    = 8 + 32 + 32 + 8 + 8 + 8 + 8,
       seeds    = [b"epoch_v2", authority.key().as_ref()],
       bump
    )]
    pub epoch_record_v2: Account<'info, EpochRecordV2>,

    pub system_program: Program<'info, System>,
}

// --- Update accounts (existing records, authority enforced via has_one) ---

#[derive(Accounts)]
pub struct UpdateEpoch<'info> {
    pub authority: Signer<'info>,

    #[account(
       mut,
       has_one  = authority,
       seeds    = [b"epoch", authority.key().as_ref()],
       bump
    )]
    pub epoch_record: Account<'info, EpochRecord>,
}

#[derive(Accounts)]
pub struct UpdateEpochs<'info> {
    pub authority: Signer<'info>,

    #[account(
       mut,
       has_one  = authority,
       seeds    = [b"epochs", authority.key().as_ref()],
       bump
    )]
    pub epoch_record_batch: Account<'info, EpochRecordBatch>,
}

#[derive(Accounts)]
pub struct UpdateEpochV2<'info> {
    pub authority: Signer<'info>,

    #[account(
       mut,
       has_one  = authority,
       seeds    = [b"epoch_v2", authority.key().as_ref()],
       bump
    )]
    pub epoch_record_v2: Account<'info, EpochRecordV2>,
}

#[account]
pub struct EpochRecord {
    pub merkle_root: [u8; 32],
    pub authority:   Pubkey,
}

#[account]
pub struct EpochRecordBatch {
    pub roots:     Vec<[u8; 32]>,
    pub authority: Pubkey,
}

#[account]
pub struct EpochRecordV2 {
    pub merkle_root: [u8; 32],
    pub authority: Pubkey,
    pub epoch_id: u64,
    pub leaf_count: u64,
    pub timestamp: i64,
    pub mmr_size: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Batch size exceeds MAX_BATCH")]
    BatchTooLarge,
}
