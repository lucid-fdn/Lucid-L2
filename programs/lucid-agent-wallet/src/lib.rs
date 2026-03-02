use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("FWyyVHyohvkdHsuKnPwC7bKNCu4VYPgW9yhFgNLEpTZK");

// PDA seeds
const AGENT_WALLET_SEED: &[u8] = b"agent_wallet";
const POLICY_SEED: &[u8] = b"policy";
const SPLIT_SEED: &[u8] = b"split";
const SESSION_SEED: &[u8] = b"session";
const ESCROW_SEED: &[u8] = b"escrow";

const MAX_ALLOWED_PROGRAMS: usize = 10;
const MAX_RECIPIENTS: usize = 10;

#[program]
pub mod lucid_agent_wallet {
    use super::*;

    /// Create a new agent wallet PDA bound to a passport NFT mint.
    pub fn create_wallet(ctx: Context<CreateWallet>, bump: u8) -> Result<()> {
        let wallet = &mut ctx.accounts.wallet;
        wallet.owner = ctx.accounts.owner.key();
        wallet.passport_mint = ctx.accounts.passport_mint.key();
        wallet.nonce = 0;
        wallet.bump = bump;
        wallet.created_at = Clock::get()?.unix_timestamp;
        emit!(WalletCreated {
            wallet: wallet.key(),
            owner: wallet.owner,
            passport_mint: wallet.passport_mint,
            timestamp: wallet.created_at,
        });
        Ok(())
    }

    /// Execute an arbitrary instruction from the wallet (owner-only).
    pub fn execute(ctx: Context<Execute>, ix_data: Vec<u8>, program_id: Pubkey) -> Result<()> {
        let wallet = &mut ctx.accounts.wallet;

        // Check policy if it exists
        if let Some(policy_account) = &ctx.accounts.policy {
            let policy = policy_account;
            // Check allowed programs
            if !policy.allowed_programs.is_empty() {
                require!(
                    policy.allowed_programs.contains(&program_id),
                    ErrorCode::ProgramNotAllowed
                );
            }
            // Check time window
            let now = Clock::get()?.unix_timestamp;
            if policy.time_window_start > 0 || policy.time_window_end > 0 {
                require!(
                    now >= policy.time_window_start
                        && (policy.time_window_end == 0 || now <= policy.time_window_end),
                    ErrorCode::OutsideTimeWindow
                );
            }
        }

        wallet.nonce += 1;
        emit!(Executed {
            wallet: wallet.key(),
            program_id,
            nonce: wallet.nonce,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Configure spending and program policies for the wallet.
    pub fn set_policy(
        ctx: Context<SetPolicy>,
        max_per_tx: u64,
        daily_limit: u64,
        allowed_programs: Vec<Pubkey>,
        time_window_start: i64,
        time_window_end: i64,
    ) -> Result<()> {
        require!(
            allowed_programs.len() <= MAX_ALLOWED_PROGRAMS,
            ErrorCode::TooManyAllowedPrograms
        );
        let policy = &mut ctx.accounts.policy;
        policy.wallet = ctx.accounts.wallet.key();
        policy.max_per_tx = max_per_tx;
        policy.daily_limit = daily_limit;
        policy.daily_spent = 0;
        policy.last_reset_day = Clock::get()?.unix_timestamp / 86400;
        policy.allowed_programs = allowed_programs;
        policy.time_window_start = time_window_start;
        policy.time_window_end = time_window_end;
        emit!(PolicySet {
            wallet: policy.wallet,
            max_per_tx,
            daily_limit,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Configure revenue distribution split for the wallet.
    pub fn configure_split(
        ctx: Context<ConfigureSplit>,
        recipients: Vec<Pubkey>,
        basis_points: Vec<u16>,
    ) -> Result<()> {
        require!(
            recipients.len() == basis_points.len(),
            ErrorCode::RecipientBpsMismatch
        );
        require!(
            recipients.len() <= MAX_RECIPIENTS,
            ErrorCode::TooManyRecipients
        );
        require!(!recipients.is_empty(), ErrorCode::NoRecipients);
        let total_bps: u32 = basis_points.iter().map(|&b| b as u32).sum();
        require!(total_bps == 10000, ErrorCode::InvalidBpsSum);

        let split = &mut ctx.accounts.split;
        split.wallet = ctx.accounts.wallet.key();
        split.recipients = recipients;
        split.basis_points = basis_points;
        split.updated_at = Clock::get()?.unix_timestamp;
        emit!(SplitConfigured {
            wallet: split.wallet,
            recipient_count: split.recipients.len() as u8,
            timestamp: split.updated_at,
        });
        Ok(())
    }

    /// Execute a payout split -- distribute tokens to all recipients according to configured BPS.
    /// remaining_accounts must contain one TokenAccount per recipient (same order).
    pub fn distribute<'info>(
        ctx: Context<'_, '_, 'info, 'info, Distribute<'info>>,
        amount: u64,
    ) -> Result<()> {
        let split = &ctx.accounts.split;
        let remaining = ctx.remaining_accounts;
        require!(
            remaining.len() == split.recipients.len(),
            ErrorCode::RecipientAccountMismatch
        );

        let wallet = &ctx.accounts.wallet;
        let wallet_key = wallet.key();
        let seeds = &[
            AGENT_WALLET_SEED,
            wallet.passport_mint.as_ref(),
            &[wallet.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        for (i, _recipient) in split.recipients.iter().enumerate() {
            let share = (amount as u128)
                .checked_mul(split.basis_points[i] as u128)
                .ok_or(ErrorCode::ArithmeticOverflow)?
                .checked_div(10000)
                .ok_or(ErrorCode::ArithmeticOverflow)? as u64;

            if share > 0 {
                let recipient_ata = &remaining[i];
                let transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.wallet_ata.to_account_info(),
                        to: recipient_ata.clone(),
                        authority: ctx.accounts.wallet.to_account_info(),
                    },
                    signer_seeds,
                );
                token::transfer(transfer_ctx, share)?;
            }
        }

        emit!(Distributed {
            wallet: wallet_key,
            amount,
            recipient_count: split.recipients.len() as u8,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Create a session key -- delegate signing authority with permissions and expiry.
    pub fn create_session(
        ctx: Context<CreateSession>,
        permissions: u16,
        expires_at: i64,
        max_amount: u64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(expires_at > now, ErrorCode::SessionAlreadyExpired);

        let session = &mut ctx.accounts.session;
        session.wallet = ctx.accounts.wallet.key();
        session.delegate = ctx.accounts.delegate.key();
        session.permissions = permissions;
        session.expires_at = expires_at;
        session.max_amount = max_amount;
        session.amount_used = 0;
        session.active = true;
        session.created_at = now;
        emit!(SessionCreated {
            wallet: session.wallet,
            delegate: session.delegate,
            permissions,
            expires_at,
            timestamp: now,
        });
        Ok(())
    }

    /// Revoke a session key.
    pub fn revoke_session(ctx: Context<RevokeSession>) -> Result<()> {
        let session = &mut ctx.accounts.session;
        session.active = false;
        emit!(SessionRevoked {
            wallet: session.wallet,
            delegate: session.delegate,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Create a time-locked escrow from the agent wallet.
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        amount: u64,
        duration_seconds: i64,
        expected_receipt_hash: [u8; 32],
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::ZeroEscrowAmount);
        require!(duration_seconds > 0, ErrorCode::InvalidDuration);

        let now = Clock::get()?.unix_timestamp;
        let wallet = &mut ctx.accounts.wallet;
        let nonce = wallet.nonce;
        wallet.nonce += 1;

        let escrow = &mut ctx.accounts.escrow;
        escrow.wallet = wallet.key();
        escrow.depositor = ctx.accounts.owner.key();
        escrow.beneficiary = ctx.accounts.beneficiary.key();
        escrow.token_mint = ctx.accounts.token_mint.key();
        escrow.amount = amount;
        escrow.created_at = now;
        escrow.expires_at = now + duration_seconds;
        escrow.expected_receipt_hash = expected_receipt_hash;
        escrow.status = EscrowStatus::Created;
        escrow.nonce = nonce;

        // Transfer tokens to escrow PDA (held by wallet PDA)
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor_ata.to_account_info(),
                to: ctx.accounts.escrow_ata.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, amount)?;

        emit!(EscrowCreated {
            escrow: escrow.key(),
            wallet: wallet.key(),
            beneficiary: escrow.beneficiary,
            amount,
            expires_at: escrow.expires_at,
            timestamp: now,
        });
        Ok(())
    }

    /// Release escrow to beneficiary upon verified receipt.
    pub fn release_escrow(
        ctx: Context<ReleaseEscrow>,
        receipt_hash: [u8; 32],
        _receipt_signature: [u8; 64],
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Created,
            ErrorCode::EscrowNotActive
        );
        require!(
            receipt_hash == escrow.expected_receipt_hash,
            ErrorCode::ReceiptHashMismatch
        );

        let wallet = &ctx.accounts.wallet;
        let seeds = &[
            AGENT_WALLET_SEED,
            wallet.passport_mint.as_ref(),
            &[wallet.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        // Transfer from escrow ATA to beneficiary ATA
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_ata.to_account_info(),
                to: ctx.accounts.beneficiary_ata.to_account_info(),
                authority: ctx.accounts.wallet.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, escrow.amount)?;

        escrow.status = EscrowStatus::Released;

        emit!(EscrowReleased {
            escrow: escrow.key(),
            beneficiary: escrow.beneficiary,
            amount: escrow.amount,
            receipt_hash,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Claim timeout -- refund depositor after escrow expiry.
    pub fn claim_timeout(ctx: Context<ClaimTimeout>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let now = Clock::get()?.unix_timestamp;
        require!(
            escrow.status == EscrowStatus::Created,
            ErrorCode::EscrowNotActive
        );
        require!(now >= escrow.expires_at, ErrorCode::EscrowNotExpired);

        let wallet = &ctx.accounts.wallet;
        let seeds = &[
            AGENT_WALLET_SEED,
            wallet.passport_mint.as_ref(),
            &[wallet.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        // Transfer from escrow ATA back to depositor ATA
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_ata.to_account_info(),
                to: ctx.accounts.depositor_ata.to_account_info(),
                authority: ctx.accounts.wallet.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, escrow.amount)?;

        escrow.status = EscrowStatus::Refunded;

        emit!(EscrowRefunded {
            escrow: escrow.key(),
            depositor: escrow.depositor,
            amount: escrow.amount,
            timestamp: now,
        });
        Ok(())
    }

    /// Dispute an escrow -- freeze for arbitration.
    pub fn dispute_escrow(ctx: Context<DisputeEscrow>, reason: String) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Created,
            ErrorCode::EscrowNotActive
        );
        require!(reason.len() <= 256, ErrorCode::ReasonTooLong);

        escrow.status = EscrowStatus::Disputed;

        emit!(EscrowDisputed {
            escrow: escrow.key(),
            disputer: ctx.accounts.disputer.key(),
            reason,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

#[account]
pub struct AgentWallet {
    pub owner: Pubkey,
    pub passport_mint: Pubkey,
    pub nonce: u64,
    pub bump: u8,
    pub created_at: i64,
}

#[account]
pub struct PolicyConfig {
    pub wallet: Pubkey,
    pub max_per_tx: u64,
    pub daily_limit: u64,
    pub daily_spent: u64,
    pub last_reset_day: i64,
    pub allowed_programs: Vec<Pubkey>,
    pub time_window_start: i64,
    pub time_window_end: i64,
}

#[account]
pub struct SplitConfig {
    pub wallet: Pubkey,
    pub recipients: Vec<Pubkey>,
    pub basis_points: Vec<u16>,
    pub updated_at: i64,
}

#[account]
pub struct SessionKey {
    pub wallet: Pubkey,
    pub delegate: Pubkey,
    pub permissions: u16,
    pub expires_at: i64,
    pub max_amount: u64,
    pub amount_used: u64,
    pub active: bool,
    pub created_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum EscrowStatus {
    Created,
    Released,
    Refunded,
    Disputed,
}

#[account]
pub struct EscrowRecord {
    pub wallet: Pubkey,
    pub depositor: Pubkey,
    pub beneficiary: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub created_at: i64,
    pub expires_at: i64,
    pub expected_receipt_hash: [u8; 32],
    pub status: EscrowStatus,
    pub nonce: u64,
}

// ============================================================================
// INSTRUCTION CONTEXTS
// ============================================================================

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct CreateWallet<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + 32 + 8 + 1 + 8,
        seeds = [AGENT_WALLET_SEED, passport_mint.key().as_ref()],
        bump,
    )]
    pub wallet: Account<'info, AgentWallet>,
    /// CHECK: The passport NFT mint -- validates wallet is bound to a specific passport
    pub passport_mint: AccountInfo<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Execute<'info> {
    #[account(mut, has_one = owner)]
    pub wallet: Account<'info, AgentWallet>,
    pub owner: Signer<'info>,
    /// Optional policy account
    pub policy: Option<Account<'info, PolicyConfig>>,
}

#[derive(Accounts)]
pub struct SetPolicy<'info> {
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + 32 + 8 + 8 + 8 + 8 + 4 + (32 * MAX_ALLOWED_PROGRAMS) + 8 + 8,
        seeds = [POLICY_SEED, wallet.key().as_ref()],
        bump,
    )]
    pub policy: Account<'info, PolicyConfig>,
    #[account(has_one = owner)]
    pub wallet: Account<'info, AgentWallet>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ConfigureSplit<'info> {
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + 32 + 4 + (32 * MAX_RECIPIENTS) + 4 + (2 * MAX_RECIPIENTS) + 8,
        seeds = [SPLIT_SEED, wallet.key().as_ref()],
        bump,
    )]
    pub split: Account<'info, SplitConfig>,
    #[account(has_one = owner)]
    pub wallet: Account<'info, AgentWallet>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Distribute<'info> {
    #[account(has_one = owner)]
    pub wallet: Account<'info, AgentWallet>,
    pub owner: Signer<'info>,
    #[account(seeds = [SPLIT_SEED, wallet.key().as_ref()], bump)]
    pub split: Account<'info, SplitConfig>,
    /// Wallet's token account to distribute from
    #[account(mut)]
    pub wallet_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CreateSession<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + 32 + 2 + 8 + 8 + 8 + 1 + 8,
        seeds = [SESSION_SEED, wallet.key().as_ref(), delegate.key().as_ref()],
        bump,
    )]
    pub session: Account<'info, SessionKey>,
    #[account(has_one = owner)]
    pub wallet: Account<'info, AgentWallet>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: The delegate receiving the session key
    pub delegate: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeSession<'info> {
    #[account(mut, has_one = wallet)]
    pub session: Account<'info, SessionKey>,
    #[account(has_one = owner)]
    pub wallet: Account<'info, AgentWallet>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreateEscrow<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 32 + 1 + 8,
        seeds = [ESCROW_SEED, wallet.key().as_ref(), &wallet.nonce.to_le_bytes()],
        bump,
    )]
    pub escrow: Account<'info, EscrowRecord>,
    #[account(mut, has_one = owner)]
    pub wallet: Account<'info, AgentWallet>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: Beneficiary pubkey
    pub beneficiary: AccountInfo<'info>,
    /// CHECK: Token mint for escrow
    pub token_mint: AccountInfo<'info>,
    /// Depositor's token account
    #[account(mut)]
    pub depositor_ata: Account<'info, TokenAccount>,
    /// Escrow token account (wallet-owned ATA)
    #[account(mut)]
    pub escrow_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseEscrow<'info> {
    #[account(mut, has_one = wallet)]
    pub escrow: Account<'info, EscrowRecord>,
    pub wallet: Account<'info, AgentWallet>,
    /// Either the depositor or the wallet owner can release
    pub releaser: Signer<'info>,
    /// Escrow token account
    #[account(mut)]
    pub escrow_ata: Account<'info, TokenAccount>,
    /// Beneficiary token account
    #[account(mut)]
    pub beneficiary_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimTimeout<'info> {
    #[account(mut, has_one = wallet)]
    pub escrow: Account<'info, EscrowRecord>,
    pub wallet: Account<'info, AgentWallet>,
    pub claimer: Signer<'info>,
    /// Escrow token account
    #[account(mut)]
    pub escrow_ata: Account<'info, TokenAccount>,
    /// Depositor token account (refund target)
    #[account(mut)]
    pub depositor_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DisputeEscrow<'info> {
    #[account(mut, has_one = wallet)]
    pub escrow: Account<'info, EscrowRecord>,
    #[account(has_one = owner)]
    pub wallet: Account<'info, AgentWallet>,
    /// Either depositor or beneficiary can dispute
    pub disputer: Signer<'info>,
    pub owner: Signer<'info>,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct WalletCreated {
    pub wallet: Pubkey,
    pub owner: Pubkey,
    pub passport_mint: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct Executed {
    pub wallet: Pubkey,
    pub program_id: Pubkey,
    pub nonce: u64,
    pub timestamp: i64,
}

#[event]
pub struct PolicySet {
    pub wallet: Pubkey,
    pub max_per_tx: u64,
    pub daily_limit: u64,
    pub timestamp: i64,
}

#[event]
pub struct SplitConfigured {
    pub wallet: Pubkey,
    pub recipient_count: u8,
    pub timestamp: i64,
}

#[event]
pub struct Distributed {
    pub wallet: Pubkey,
    pub amount: u64,
    pub recipient_count: u8,
    pub timestamp: i64,
}

#[event]
pub struct SessionCreated {
    pub wallet: Pubkey,
    pub delegate: Pubkey,
    pub permissions: u16,
    pub expires_at: i64,
    pub timestamp: i64,
}

#[event]
pub struct SessionRevoked {
    pub wallet: Pubkey,
    pub delegate: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct EscrowCreated {
    pub escrow: Pubkey,
    pub wallet: Pubkey,
    pub beneficiary: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
    pub timestamp: i64,
}

#[event]
pub struct EscrowReleased {
    pub escrow: Pubkey,
    pub beneficiary: Pubkey,
    pub amount: u64,
    pub receipt_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct EscrowRefunded {
    pub escrow: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct EscrowDisputed {
    pub escrow: Pubkey,
    pub disputer: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Program not in allowed list")]
    ProgramNotAllowed,
    #[msg("Outside allowed time window")]
    OutsideTimeWindow,
    #[msg("Transaction exceeds per-tx limit")]
    ExceedsPerTxLimit,
    #[msg("Transaction would exceed daily limit")]
    ExceedsDailyLimit,
    #[msg("Too many allowed programs")]
    TooManyAllowedPrograms,
    #[msg("Recipients and basis_points length mismatch")]
    RecipientBpsMismatch,
    #[msg("Too many recipients")]
    TooManyRecipients,
    #[msg("No recipients specified")]
    NoRecipients,
    #[msg("Basis points must sum to 10000")]
    InvalidBpsSum,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Number of remaining_accounts must match recipients")]
    RecipientAccountMismatch,
    #[msg("Session already expired")]
    SessionAlreadyExpired,
    #[msg("Session not active")]
    SessionNotActive,
    #[msg("Session expired")]
    SessionExpired,
    #[msg("Insufficient session permissions")]
    InsufficientPermissions,
    #[msg("Session amount limit exceeded")]
    SessionAmountExceeded,
    #[msg("Escrow amount must be greater than zero")]
    ZeroEscrowAmount,
    #[msg("Invalid duration")]
    InvalidDuration,
    #[msg("Escrow not in active state")]
    EscrowNotActive,
    #[msg("Receipt hash does not match expected")]
    ReceiptHashMismatch,
    #[msg("Escrow has not expired yet")]
    EscrowNotExpired,
    #[msg("Dispute reason too long (max 256 chars)")]
    ReasonTooLong,
}
