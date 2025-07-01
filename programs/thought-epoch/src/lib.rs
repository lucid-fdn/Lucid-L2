use anchor_lang::prelude::*;

// ← replace this with the ID printed by `anchor deploy`
declare_id!("REPLACE_WITH_YOUR_PROGRAM_ID");

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
