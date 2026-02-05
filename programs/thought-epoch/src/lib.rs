use anchor_lang::prelude::*;

// ← replace this with the ID printed by `anchor deploy`
declare_id!("8QXiFjguJT4PLVzH6BYNMHXZ3eLRaoF8cwx23EBc44Q6");

const MAX_BATCH: usize = 16; // adjust as you like

#[program]
pub mod thought_epoch {
    use super::*;

    /// Commit a 32-byte Merkle root to chain.
    pub fn commit_epoch(ctx: Context<CommitEpoch>, root: [u8; 32]) -> Result<()> {
        let rec = &mut ctx.accounts.epoch_record;
        rec.merkle_root = root;
        rec.authority   = *ctx.accounts.authority.key;
        Ok(())
    }

    /// Commit up to MAX_BATCH roots in one Tx.
    pub fn commit_epochs(ctx: Context<CommitEpochs>, roots: Vec<[u8; 32]>) -> Result<()> {
        require!(roots.len() <= MAX_BATCH, ErrorCode::BatchTooLarge);
        let batch = &mut ctx.accounts.epoch_record_batch;
        batch.roots = roots;
        batch.authority = *ctx.accounts.authority.key;
        Ok(())
    }

    /// Commit a Merkle root with v0+ metadata for Fluid Compute.
    ///
    /// This is the v2 record format used for verifiable anchoring:
    /// - epoch_id: monotonically increasing epoch identifier
    /// - leaf_count: total leaves in the MMR at commit time
    /// - timestamp: unix timestamp (seconds)
    /// - mmr_size: total MMR size
    pub fn commit_epoch_v2(
        ctx: Context<CommitEpochV2>,
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
}

#[derive(Accounts)]
pub struct CommitEpoch<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// PDA seeds = ["epoch", authority], bump
    #[account(
       init_if_needed,
       payer    = authority,
       space    = 8 + 32 + 32,
       seeds    = [b"epoch", authority.key().as_ref()],
       bump
    )]
    pub epoch_record: Account<'info, EpochRecord>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct EpochRecord {
    pub merkle_root: [u8; 32],
    pub authority:   Pubkey,
}

#[derive(Accounts)]
pub struct CommitEpochs<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
       init_if_needed,
       payer    = authority,
       space    = 8 + (4 + MAX_BATCH * 32) + 32,
       seeds    = [b"epochs", authority.key().as_ref()],
       bump
    )]
    pub epoch_record_batch: Account<'info, EpochRecordBatch>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitEpochV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// PDA seeds = ["epoch_v2", authority], bump
    #[account(
       init_if_needed,
       payer    = authority,
       space    = 8 + 32 + 32 + 8 + 8 + 8 + 8,
       seeds    = [b"epoch_v2", authority.key().as_ref()],
       bump
    )]
    pub epoch_record_v2: Account<'info, EpochRecordV2>,

    pub system_program: Program<'info, System>,
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
