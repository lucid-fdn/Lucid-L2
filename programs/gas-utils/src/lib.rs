use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

// This will be updated after deployment
declare_id!("FsQ828An5fAebEVFxGcmKwuqa143hd56pwyjKtBTEtA4");

const MAX_RECIPIENTS: usize = 10;

#[program]
pub mod gas_utils {
    use super::*;

    /// Collect gas tokens from user — burn portion + distribute remainder on-chain.
    ///
    /// `remaining_accounts` must contain one TokenAccount per recipient (same order as `recipients`).
    /// Each account is validated against the declared recipient pubkey and LUCID mint.
    /// `burn_bps` controls what percentage is burned (basis points, 0-10000). 10000 = burn all.
    pub fn collect_and_split<'info>(
        ctx: Context<'_, '_, 'info, 'info, CollectAndSplit<'info>>,
        m_gas_amount: u64,
        i_gas_amount: u64,
        recipients: Vec<RecipientShare>,
        burn_bps: u16,
    ) -> Result<()> {
        require!(recipients.len() <= MAX_RECIPIENTS, ErrorCode::TooManyRecipients);
        require!(!recipients.is_empty(), ErrorCode::NoRecipients);
        require!(burn_bps <= 10000, ErrorCode::InvalidBurnBps);

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

        // Calculate burn and distribution amounts
        let burn_amount = (total_gas as u128)
            .checked_mul(burn_bps as u128)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::ArithmeticOverflow)? as u64;
        let distribute_amount = total_gas.checked_sub(burn_amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        // Burn portion
        if burn_amount > 0 {
            let burn_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.lucid_mint.to_account_info(),
                    from: ctx.accounts.user_ata.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            );
            token::burn(burn_ctx, burn_amount)?;
        }

        // Distribute remainder to recipients via remaining_accounts
        if distribute_amount > 0 {
            let remaining = ctx.remaining_accounts;
            require!(
                remaining.len() == recipients.len(),
                ErrorCode::RecipientAccountMismatch
            );

            for (i, recipient) in recipients.iter().enumerate() {
                let recipient_ata_info = &remaining[i];

                // Deserialize and validate the recipient ATA
                let recipient_ata = Account::<TokenAccount>::try_from(recipient_ata_info)
                    .map_err(|_| ErrorCode::InvalidRecipientAccount)?;
                require!(
                    recipient_ata.owner == recipient.recipient,
                    ErrorCode::RecipientOwnerMismatch
                );
                require!(
                    recipient_ata.mint == ctx.accounts.lucid_mint.key(),
                    ErrorCode::RecipientMintMismatch
                );

                // Calculate proportional amount
                let share_amount = (distribute_amount as u128)
                    .checked_mul(recipient.percentage as u128)
                    .ok_or(ErrorCode::ArithmeticOverflow)?
                    .checked_div(100)
                    .ok_or(ErrorCode::ArithmeticOverflow)? as u64;

                if share_amount > 0 {
                    let transfer_ctx = CpiContext::new(
                        ctx.accounts.token_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.user_ata.to_account_info(),
                            to: recipient_ata_info.clone(),
                            authority: ctx.accounts.user.to_account_info(),
                        },
                    );
                    token::transfer(transfer_ctx, share_amount)?;
                }
            }
        }

        msg!("GAS: burned {} + distributed {} tokens", burn_amount, distribute_amount);

        // Emit gas collection event for indexing
        emit!(GasCollected {
            user: ctx.accounts.user.key(),
            m_gas_amount,
            i_gas_amount,
            total_amount: total_gas,
            burn_amount,
            distribute_amount,
            burn_bps,
            recipients: recipients.clone(),
        });

        Ok(())
    }

    /// Mint and distribute tokens to recipients.
    /// Requires mint authority.
    pub fn mint_and_distribute(
        _ctx: Context<MintAndDistribute>,
        total_amount: u64,
        recipients: Vec<RecipientShare>,
    ) -> Result<()> {
        require!(recipients.len() <= MAX_RECIPIENTS, ErrorCode::TooManyRecipients);
        require!(!recipients.is_empty(), ErrorCode::NoRecipients);

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
    #[account(mut)]
    pub lucid_mint: Account<'info, Mint>,

    /// User who is paying the gas
    #[account(mut)]
    pub user: Signer<'info>,

    /// Token program
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MintAndDistribute<'info> {
    /// LUCID token mint
    pub lucid_mint: Account<'info, Mint>,

    /// Authority that can mint tokens
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
    pub user: Pubkey,
    pub m_gas_amount: u64,
    pub i_gas_amount: u64,
    pub total_amount: u64,
    pub burn_amount: u64,
    pub distribute_amount: u64,
    pub burn_bps: u16,
    pub recipients: Vec<RecipientShare>,
}

#[event]
pub struct GasDistributed {
    pub total_amount: u64,
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
    #[msg("Burn basis points must be 0-10000")]
    InvalidBurnBps,
    #[msg("Number of remaining_accounts must match recipients")]
    RecipientAccountMismatch,
    #[msg("Invalid recipient token account")]
    InvalidRecipientAccount,
    #[msg("Recipient ATA owner mismatch")]
    RecipientOwnerMismatch,
    #[msg("Recipient ATA mint mismatch")]
    RecipientMintMismatch,
}
