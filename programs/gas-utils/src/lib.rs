use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

// This will be updated after deployment
declare_id!("11111111111111111111111111111111");

const MAX_RECIPIENTS: usize = 10; // Maximum number of recipients per transaction

#[program]
pub mod gas_utils {
    use super::*;

    /// Collect gas tokens from user — burn only.
    ///
    /// **WARNING**: This instruction burns tokens but does NOT distribute to recipients.
    /// The `recipients` field is recorded in the emitted event for off-chain settlement.
    /// On-chain distribution requires passing recipient token accounts as remaining_accounts
    /// and is not yet implemented. Do NOT call this expecting on-chain payouts.
    pub fn collect_and_split(
        ctx: Context<CollectAndSplit>,
        m_gas_amount: u64,
        i_gas_amount: u64,
        recipients: Vec<RecipientShare>,
    ) -> Result<()> {
        require!(recipients.len() <= MAX_RECIPIENTS, ErrorCode::TooManyRecipients);
        require!(!recipients.is_empty(), ErrorCode::NoRecipients);

        // Validate percentages sum to 100
        let total_percentage: u16 = recipients.iter().map(|r| r.percentage as u16).sum();
        require!(total_percentage == 100, ErrorCode::InvalidPercentageSum);

        // Calculate total gas amount
        let total_gas = m_gas_amount
            .checked_add(i_gas_amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        require!(total_gas > 0, ErrorCode::ZeroGasAmount);

        // Validate that the user ATA belongs to the expected LUCID mint
        require!(
            ctx.accounts.user_ata.mint == ctx.accounts.lucid_mint.key(),
            ErrorCode::MintMismatch
        );

        // Burn total gas from user's account
        let burn_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.lucid_mint.to_account_info(),
                from: ctx.accounts.user_ata.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );

        token::burn(burn_ctx, total_gas)?;

        msg!("GAS: burned {} tokens (distribution is off-chain only)", total_gas);

        // Emit gas collection event (off-chain indexer handles distribution)
        emit!(GasCollected {
            user: ctx.accounts.user.key(),
            m_gas_amount,
            i_gas_amount,
            total_amount: total_gas,
            recipients: recipients.clone(),
        });

        Ok(())
    }

    /// Placeholder for future on-chain minting + distribution.
    /// Currently emits an event only — no tokens are minted or transferred.
    pub fn mint_and_distribute(
        _ctx: Context<MintAndDistribute>,
        total_amount: u64,
        recipients: Vec<RecipientShare>,
    ) -> Result<()> {
        require!(recipients.len() <= MAX_RECIPIENTS, ErrorCode::TooManyRecipients);
        require!(!recipients.is_empty(), ErrorCode::NoRecipients);

        // Validate percentages sum to 100
        let total_percentage: u16 = recipients.iter().map(|r| r.percentage as u16).sum();
        require!(total_percentage == 100, ErrorCode::InvalidPercentageSum);

        require!(total_amount > 0, ErrorCode::ZeroGasAmount);

        msg!("GAS: mint_and_distribute is a placeholder — no tokens minted");

        emit!(GasDistributed {
            total_amount,
            recipients: recipients.clone(),
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CollectAndSplit<'info> {
    /// User's associated token account for LUCID tokens
    #[account(mut)]
    pub user_ata: Account<'info, TokenAccount>,

    /// LUCID token mint
    pub lucid_mint: Account<'info, Mint>,

    /// User who is paying the gas
    #[account(mut)]
    pub user: Signer<'info>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MintAndDistribute<'info> {
    /// LUCID token mint (would need mint authority for actual minting)
    pub lucid_mint: Account<'info, Mint>,

    /// Authority that can mint tokens (future enhancement)
    pub mint_authority: Signer<'info>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RecipientShare {
    /// Recipient's public key
    pub recipient: Pubkey,
    /// Percentage of total gas (0-100)
    pub percentage: u8,
}

#[event]
pub struct GasCollected {
    /// User who paid the gas
    pub user: Pubkey,
    /// Memory gas amount
    pub m_gas_amount: u64,
    /// Inference gas amount
    pub i_gas_amount: u64,
    /// Total gas amount burned
    pub total_amount: u64,
    /// Recipients and their shares
    pub recipients: Vec<RecipientShare>,
}

#[event]
pub struct GasDistributed {
    /// Total amount distributed
    pub total_amount: u64,
    /// Recipients and their shares
    pub recipients: Vec<RecipientShare>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Too many recipients specified")]
    TooManyRecipients,
    
    #[msg("No recipients specified")]
    NoRecipients,
    
    #[msg("Recipient percentages must sum to 100")]
    InvalidPercentageSum,
    
    #[msg("Gas amount cannot be zero")]
    ZeroGasAmount,
    
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("User ATA mint does not match the provided LUCID mint")]
    MintMismatch,
}
