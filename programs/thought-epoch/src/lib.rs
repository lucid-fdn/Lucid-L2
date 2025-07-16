use anchor_lang::prelude::*;

// ← replace this with the ID printed by `anchor deploy`
declare_id!("J1JNYJB41UeyyR3qYFjwxZ2RsD71JRm3ULYZG6bLhm3c");

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
}

#[derive(Accounts)]
#[instruction(root: [u8; 32])]
pub struct CommitEpoch<'info> {
    /// PDA seeds = ["epoch", authority], bump
    #[account(
       init_if_needed,
       payer    = authority,
       space    = 8 + 32 + 32,
       seeds    = [b"epoch", authority.key().as_ref()],
       bump
    )]
    pub epoch_record: Account<'info, EpochRecord>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct EpochRecord {
    pub merkle_root: [u8; 32],
    pub authority:   Pubkey,
}

#[derive(Accounts)]
pub struct CommitEpochs<'info> {
    #[account(
       init_if_needed,
       payer    = authority,
       space    = 8 + (4 + MAX_BATCH * 32) + 32,
       seeds    = [b"epochs", authority.key().as_ref()],
       bump
    )]
    pub epoch_record_batch: Account<'info, EpochRecordBatch>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct EpochRecordBatch {
    pub roots:     Vec<[u8; 32]>,
    pub authority: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Batch size exceeds MAX_BATCH")]
    BatchTooLarge,
}
