use anchor_lang::prelude::*;

declare_id!("4FWEH1XQb7p1pU9r8Ap8xomDYVxdSdwk6fFT8XD63G3A");

// PDA seeds
const STATS_SEED: &[u8] = b"stats";
const FEEDBACK_SEED: &[u8] = b"feedback";
const VALIDATION_SEED: &[u8] = b"validation";

// Limits
const MAX_PASSPORT_ID_LEN: usize = 64;
const MAX_CATEGORY_LEN: usize = 32;
const MAX_METADATA_LEN: usize = 256;

#[program]
pub mod lucid_reputation {
    use super::*;

    /// Initialize a PassportStats PDA with zeroed counters for a given passport_id.
    pub fn init_stats(ctx: Context<InitStats>, passport_id: String) -> Result<()> {
        require!(
            passport_id.len() <= MAX_PASSPORT_ID_LEN,
            ErrorCode::PassportIdTooLong
        );

        let stats = &mut ctx.accounts.stats;
        stats.passport_id = passport_id.clone();
        stats.feedback_count = 0;
        stats.validation_count = 0;
        stats.total_score = 0;
        stats.avg_score = 0;
        stats.last_updated = Clock::get()?.unix_timestamp;
        stats.bump = ctx.bumps.stats;

        Ok(())
    }

    /// Submit feedback for a passport. Creates a FeedbackEntry PDA and atomically
    /// updates the PassportStats counters (feedback_count, total_score, avg_score).
    pub fn submit_feedback(
        ctx: Context<SubmitFeedback>,
        passport_id: String,
        score: u8,
        category: String,
        receipt_hash: [u8; 32],
        asset_type: u8,
        metadata: String,
    ) -> Result<()> {
        require!(
            passport_id.len() <= MAX_PASSPORT_ID_LEN,
            ErrorCode::PassportIdTooLong
        );
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

        let now = Clock::get()?.unix_timestamp;
        let stats = &mut ctx.accounts.stats;
        let index = stats.feedback_count;

        // Create feedback entry
        let entry = &mut ctx.accounts.feedback;
        entry.passport_id = passport_id.clone();
        entry.from = ctx.accounts.submitter.key();
        entry.score = score;
        entry.category = category;
        entry.receipt_hash = receipt_hash;
        entry.asset_type = asset_type;
        entry.metadata = metadata;
        entry.timestamp = now;
        entry.revoked = false;
        entry.index = index;
        entry.bump = ctx.bumps.feedback;

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
        stats.avg_score = ((stats.total_score as u128)
            .checked_mul(100)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(stats.feedback_count as u128)
            .ok_or(ErrorCode::Overflow)?) as u16;
        stats.last_updated = now;

        emit!(FeedbackSubmitted {
            passport_id,
            from: entry.from,
            score,
            index,
            receipt_hash,
            timestamp: now,
        });

        Ok(())
    }

    /// Submit a validation entry for a passport. Creates a ValidationEntry PDA
    /// and increments the validation_count in PassportStats.
    pub fn submit_validation(
        ctx: Context<SubmitValidation>,
        passport_id: String,
        receipt_hash: [u8; 32],
        valid: bool,
        asset_type: u8,
        metadata: String,
    ) -> Result<()> {
        require!(
            passport_id.len() <= MAX_PASSPORT_ID_LEN,
            ErrorCode::PassportIdTooLong
        );
        require!(asset_type <= 4, ErrorCode::InvalidAssetType);
        require!(
            metadata.len() <= MAX_METADATA_LEN,
            ErrorCode::MetadataTooLong
        );

        let now = Clock::get()?.unix_timestamp;

        // Create validation entry
        let entry = &mut ctx.accounts.validation;
        entry.passport_id = passport_id.clone();
        entry.validator = ctx.accounts.validator.key();
        entry.valid = valid;
        entry.receipt_hash = receipt_hash;
        entry.asset_type = asset_type;
        entry.metadata = metadata;
        entry.timestamp = now;
        entry.bump = ctx.bumps.validation;

        // Update stats
        let stats = &mut ctx.accounts.stats;
        stats.validation_count = stats
            .validation_count
            .checked_add(1)
            .ok_or(ErrorCode::Overflow)?;
        stats.last_updated = now;

        emit!(ValidationSubmitted {
            passport_id,
            validator: entry.validator,
            valid,
            receipt_hash,
            timestamp: now,
        });

        Ok(())
    }

    /// Revoke a previously submitted feedback entry. Only the original submitter
    /// can revoke. Sets revoked=true and adjusts PassportStats (total_score, avg_score).
    pub fn revoke_feedback(
        ctx: Context<RevokeFeedback>,
        _passport_id: String,
        _index: u32,
    ) -> Result<()> {
        let feedback = &mut ctx.accounts.feedback;

        // Only the original submitter can revoke
        require!(
            feedback.from == ctx.accounts.submitter.key(),
            ErrorCode::UnauthorizedRevoke
        );
        require!(!feedback.revoked, ErrorCode::AlreadyRevoked);

        feedback.revoked = true;

        // Adjust stats
        let stats = &mut ctx.accounts.stats;
        stats.total_score = stats
            .total_score
            .checked_sub(feedback.score as u64)
            .ok_or(ErrorCode::Overflow)?;

        // Compute count of non-revoked feedback (feedback_count tracks total created,
        // so active = feedback_count - 1 revoked entry; we decrement for avg calculation)
        let active_count = stats
            .feedback_count
            .checked_sub(1)
            .ok_or(ErrorCode::Overflow)?;

        if active_count == 0 {
            stats.avg_score = 0;
        } else {
            stats.avg_score = ((stats.total_score as u128)
                .checked_mul(100)
                .ok_or(ErrorCode::Overflow)?
                .checked_div(active_count as u128)
                .ok_or(ErrorCode::Overflow)?) as u16;
        }

        // Note: feedback_count is NOT decremented -- it tracks total ever created
        // (used as index seed for new entries). total_score and avg_score reflect
        // only non-revoked entries.
        stats.last_updated = Clock::get()?.unix_timestamp;

        emit!(FeedbackRevoked {
            passport_id: feedback.passport_id.clone(),
            from: feedback.from,
            index: feedback.index,
            score: feedback.score,
            timestamp: stats.last_updated,
        });

        Ok(())
    }
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

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

// ============================================================================
// INSTRUCTION CONTEXTS
// ============================================================================

#[derive(Accounts)]
#[instruction(passport_id: String)]
pub struct InitStats<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + PassportStats::INIT_SPACE,
        seeds = [STATS_SEED, passport_id.as_bytes()],
        bump,
    )]
    pub stats: Account<'info, PassportStats>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(passport_id: String)]
pub struct SubmitFeedback<'info> {
    #[account(
        init,
        payer = submitter,
        space = 8 + FeedbackEntry::INIT_SPACE,
        seeds = [FEEDBACK_SEED, passport_id.as_bytes(), &stats.feedback_count.to_le_bytes()],
        bump,
    )]
    pub feedback: Account<'info, FeedbackEntry>,
    #[account(
        mut,
        seeds = [STATS_SEED, passport_id.as_bytes()],
        bump = stats.bump,
    )]
    pub stats: Account<'info, PassportStats>,
    #[account(mut)]
    pub submitter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(passport_id: String, receipt_hash: [u8; 32])]
pub struct SubmitValidation<'info> {
    #[account(
        init,
        payer = validator,
        space = 8 + ValidationEntry::INIT_SPACE,
        seeds = [VALIDATION_SEED, passport_id.as_bytes(), &receipt_hash],
        bump,
    )]
    pub validation: Account<'info, ValidationEntry>,
    #[account(
        mut,
        seeds = [STATS_SEED, passport_id.as_bytes()],
        bump = stats.bump,
    )]
    pub stats: Account<'info, PassportStats>,
    #[account(mut)]
    pub validator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(passport_id: String, index: u32)]
pub struct RevokeFeedback<'info> {
    #[account(
        mut,
        seeds = [FEEDBACK_SEED, passport_id.as_bytes(), &index.to_le_bytes()],
        bump = feedback.bump,
    )]
    pub feedback: Account<'info, FeedbackEntry>,
    #[account(
        mut,
        seeds = [STATS_SEED, passport_id.as_bytes()],
        bump = stats.bump,
    )]
    pub stats: Account<'info, PassportStats>,
    pub submitter: Signer<'info>,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct FeedbackSubmitted {
    pub passport_id: String,
    pub from: Pubkey,
    pub score: u8,
    pub index: u32,
    pub receipt_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct ValidationSubmitted {
    pub passport_id: String,
    pub validator: Pubkey,
    pub valid: bool,
    pub receipt_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct FeedbackRevoked {
    pub passport_id: String,
    pub from: Pubkey,
    pub index: u32,
    pub score: u8,
    pub timestamp: i64,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Score must be between 1 and 100")]
    InvalidScore,
    #[msg("Asset type must be 0-4 (model, compute, tool, agent, dataset)")]
    InvalidAssetType,
    #[msg("Passport ID exceeds maximum length of 64 characters")]
    PassportIdTooLong,
    #[msg("Category exceeds maximum length of 32 characters")]
    CategoryTooLong,
    #[msg("Metadata exceeds maximum length of 256 characters")]
    MetadataTooLong,
    #[msg("Feedback has already been revoked")]
    AlreadyRevoked,
    #[msg("Only the original submitter can revoke feedback")]
    UnauthorizedRevoke,
    #[msg("Arithmetic overflow")]
    Overflow,
}
