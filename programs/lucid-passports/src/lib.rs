use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::solana_program::hash::hash as sha256;

// Program ID - deployed to devnet
declare_id!("FhoemNdqwPMt8nmX4HT3WpSqUuqeAUXRb7WchAehmSaL");

/// Hash a slug to a fixed 32-byte seed (prevents PDA seed overflow for slugs > 32 bytes).
fn slug_seed(slug: &str) -> [u8; 32] {
    sha256(slug.as_bytes()).to_bytes()
}

/// Maximum length for asset slugs (e.g., "mistral-7b-instruct-v0.2")
const MAX_SLUG_LEN: usize = 64;

/// Maximum length for IPFS CIDs (base58 encoded, typically 46-59 chars)
const MAX_CID_LEN: usize = 64;

/// Maximum length for license identifiers (SPDX codes like "Apache-2.0")
const MAX_LICENSE_LEN: usize = 32;

#[program]
pub mod lucid_passports {
    use super::*;

    /// Register a new passport for an AI asset (model, dataset, etc.)
    pub fn register_passport(
        ctx: Context<RegisterPassport>,
        asset_type: AssetType,
        slug: String,
        version: Version,
        content_cid: String,
        content_hash: [u8; 32],
        metadata_cid: String,
        license_code: String,
        policy_flags: u16,
    ) -> Result<()> {
        require!(slug.len() <= MAX_SLUG_LEN, ErrorCode::SlugTooLong);
        require!(content_cid.len() <= MAX_CID_LEN, ErrorCode::CidTooLong);
        require!(metadata_cid.len() <= MAX_CID_LEN, ErrorCode::CidTooLong);
        require!(license_code.len() <= MAX_LICENSE_LEN, ErrorCode::LicenseTooLong);

        let passport = &mut ctx.accounts.passport;
        let clock = Clock::get()?;

        passport.owner = ctx.accounts.owner.key();
        passport.asset_type = asset_type;
        passport.slug = slug;
        passport.version = version;
        passport.content_cid = content_cid;
        passport.content_hash = content_hash;
        passport.metadata_cid = metadata_cid;
        passport.license_code = license_code;
        passport.policy_flags = policy_flags;
        passport.status = PassportStatus::Active;
        passport.created_at = clock.unix_timestamp;
        passport.updated_at = clock.unix_timestamp;
        passport.bump = ctx.bumps.passport;

        emit!(PassportRegistered {
            passport: passport.key(),
            owner: passport.owner,
            asset_type: passport.asset_type,
            slug: passport.slug.clone(),
            version: passport.version,
            content_hash: passport.content_hash,
        });

        Ok(())
    }

    /// Update passport metadata or status
    pub fn update_passport(
        ctx: Context<UpdatePassport>,
        metadata_cid: Option<String>,
        status: Option<PassportStatus>,
    ) -> Result<()> {
        let passport = &mut ctx.accounts.passport;
        let clock = Clock::get()?;

        if let Some(cid) = metadata_cid {
            require!(cid.len() <= MAX_CID_LEN, ErrorCode::CidTooLong);
            passport.metadata_cid = cid;
        }

        if let Some(new_status) = status {
            passport.status = new_status;
        }

        passport.updated_at = clock.unix_timestamp;

        emit!(PassportUpdated {
            passport: passport.key(),
            updated_at: passport.updated_at,
        });

        Ok(())
    }

    /// Create a version link to track version history
    pub fn link_version(
        ctx: Context<LinkVersion>,
        previous_version: Version,
    ) -> Result<()> {
        let link = &mut ctx.accounts.version_link;
        let clock = Clock::get()?;

        link.current_passport = ctx.accounts.current_passport.key();
        link.previous_passport = ctx.accounts.previous_passport.key();
        link.previous_version = previous_version;
        link.created_at = clock.unix_timestamp;
        link.bump = ctx.bumps.version_link;

        emit!(VersionLinked {
            current: link.current_passport,
            previous: link.previous_passport,
            previous_version,
        });

        Ok(())
    }

    /// Add an attestation (training log, eval report, etc.)
    pub fn add_attestation(
        ctx: Context<AddAttestation>,
        attestation_type: AttestationType,
        _attestation_id: [u8; 8], // Used in PDA derivation, passed here for validation
        content_cid: String,
        description: String,
    ) -> Result<()> {
        require!(content_cid.len() <= MAX_CID_LEN, ErrorCode::CidTooLong);
        require!(description.len() <= 200, ErrorCode::DescriptionTooLong);

        let attestation = &mut ctx.accounts.attestation;
        let clock = Clock::get()?;

        attestation.passport = ctx.accounts.passport.key();
        attestation.attestation_type = attestation_type;
        attestation.content_cid = content_cid;
        attestation.description = description;
        attestation.attester = ctx.accounts.attester.key();
        attestation.created_at = clock.unix_timestamp;
        attestation.bump = ctx.bumps.attestation;

        emit!(AttestationAdded {
            passport: attestation.passport,
            attestation_type: attestation.attestation_type,
            attester: attestation.attester,
        });

        Ok(())
    }

    // ========================================================================
    // Payment Gating (x402) Instructions
    // ========================================================================

    /// Set a payment gate on a passport — owner defines SOL/LUCID price for access
    pub fn set_payment_gate(
        ctx: Context<SetPaymentGate>,
        price_lamports: u64,
        price_lucid: u64,
        payment_token_mint: Pubkey,
    ) -> Result<()> {
        let gate = &mut ctx.accounts.payment_gate;
        let clock = Clock::get()?;

        gate.passport = ctx.accounts.passport.key();
        gate.owner = ctx.accounts.owner.key();
        gate.price_lamports = price_lamports;
        gate.price_lucid = price_lucid;
        gate.payment_token_mint = payment_token_mint;
        gate.vault = ctx.accounts.vault.key();
        gate.total_revenue = 0;
        gate.total_accesses = 0;
        gate.enabled = true;
        gate.created_at = clock.unix_timestamp;
        gate.bump = ctx.bumps.payment_gate;

        emit!(PaymentGateSet {
            passport: gate.passport,
            owner: gate.owner,
            price_lamports,
            price_lucid,
        });

        Ok(())
    }

    /// Pay for access to a gated passport (SOL payment)
    pub fn pay_for_access(
        ctx: Context<PayForAccess>,
        expires_at: i64,
    ) -> Result<()> {
        let gate = &mut ctx.accounts.payment_gate;
        require!(gate.enabled, ErrorCode::PaymentGateNotEnabled);

        let price = gate.price_lamports;
        require!(price > 0, ErrorCode::InsufficientPayment);

        // Transfer SOL from payer to vault
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        );
        system_program::transfer(cpi_context, price)?;

        // Update gate stats
        gate.total_revenue = gate.total_revenue.checked_add(price).unwrap();
        gate.total_accesses = gate.total_accesses.checked_add(1).unwrap();

        // Create access receipt
        let receipt = &mut ctx.accounts.access_receipt;
        let clock = Clock::get()?;

        receipt.payer = ctx.accounts.payer.key();
        receipt.passport = ctx.accounts.passport.key();
        receipt.amount_paid = price;
        receipt.expires_at = expires_at; // 0 = permanent
        receipt.created_at = clock.unix_timestamp;
        receipt.bump = ctx.bumps.access_receipt;

        emit!(AccessPurchased {
            passport: receipt.passport,
            payer: receipt.payer,
            amount: price,
        });

        Ok(())
    }

    /// Withdraw collected revenue from vault (owner only)
    pub fn withdraw_revenue(
        ctx: Context<WithdrawRevenue>,
        amount: u64,
    ) -> Result<()> {
        require!(
            ctx.accounts.payment_gate.owner == ctx.accounts.owner.key(),
            ErrorCode::UnauthorizedWithdrawal
        );

        let vault_balance = ctx.accounts.vault.lamports();
        require!(vault_balance >= amount, ErrorCode::InsufficientPayment);

        // Transfer SOL from vault PDA to owner via system_program CPI with PDA signer seeds
        let passport_key = ctx.accounts.passport.key();
        let bump = ctx.bumps.vault;
        let seeds: &[&[u8]] = &[
            b"vault",
            passport_key.as_ref(),
            &[bump],
        ];
        let signer_seeds = &[seeds];

        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.owner.to_account_info(),
            },
            signer_seeds,
        );
        system_program::transfer(cpi_context, amount)?;

        emit!(RevenueWithdrawn {
            passport: ctx.accounts.passport.key(),
            owner: ctx.accounts.owner.key(),
            amount,
        });

        Ok(())
    }

    /// Revoke a user's access receipt (owner only)
    pub fn revoke_access(
        ctx: Context<RevokeAccess>,
    ) -> Result<()> {
        require!(
            ctx.accounts.payment_gate.owner == ctx.accounts.owner.key(),
            ErrorCode::UnauthorizedWithdrawal
        );

        // Close the access receipt account, return rent to owner
        // The account close is handled by Anchor's `close` constraint

        emit!(AccessRevoked {
            passport: ctx.accounts.passport.key(),
            payer: ctx.accounts.access_receipt.payer,
        });

        Ok(())
    }
}

// ============================================================================
// Account Structures
// ============================================================================

#[derive(Accounts)]
#[instruction(
    asset_type: AssetType,
    slug: String,
    version: Version,
)]
pub struct RegisterPassport<'info> {
    /// PDA: ["passport", owner, asset_type_byte, sha256(slug), version_bytes]
    /// Slug is hashed to prevent PDA seed overflow (slugs can be up to 64 bytes,
    /// but each PDA seed is limited to 32 bytes).
    #[account(
        init,
        payer = owner,
        space = 8 + Passport::INIT_SPACE,
        seeds = [
            b"passport",
            owner.key().as_ref(),
            &[asset_type as u8],
            &slug_seed(&slug),
            &version.to_bytes(),
        ],
        bump
    )]
    pub passport: Account<'info, Passport>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePassport<'info> {
    #[account(
        mut,
        has_one = owner,
        seeds = [
            b"passport",
            owner.key().as_ref(),
            &[passport.asset_type as u8],
            &slug_seed(&passport.slug),
            &passport.version.to_bytes(),
        ],
        bump = passport.bump
    )]
    pub passport: Account<'info, Passport>,

    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct LinkVersion<'info> {
    /// PDA: ["version_link", current_passport]
    #[account(
        init,
        payer = owner,
        space = 8 + VersionLink::INIT_SPACE,
        seeds = [
            b"version_link",
            current_passport.key().as_ref(),
        ],
        bump
    )]
    pub version_link: Account<'info, VersionLink>,

    #[account(has_one = owner)]
    pub current_passport: Account<'info, Passport>,

    /// Previous passport — deserialized and validated by Anchor (no unchecked account)
    pub previous_passport: Account<'info, Passport>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(attestation_type: AttestationType, attestation_id: [u8; 8])]
pub struct AddAttestation<'info> {
    /// PDA: ["attestation", passport, attester, attestation_id]
    #[account(
        init,
        payer = attester,
        space = 8 + Attestation::INIT_SPACE,
        seeds = [
            b"attestation",
            passport.key().as_ref(),
            attester.key().as_ref(),
            &attestation_id,
        ],
        bump
    )]
    pub attestation: Account<'info, Attestation>,

    pub passport: Account<'info, Passport>,

    #[account(mut)]
    pub attester: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ============================================================================
// Payment Gating Account Structures
// ============================================================================

#[derive(Accounts)]
pub struct SetPaymentGate<'info> {
    /// PDA: ["payment_gate", passport]
    #[account(
        init,
        payer = owner,
        space = 8 + PaymentGate::INIT_SPACE,
        seeds = [
            b"payment_gate",
            passport.key().as_ref(),
        ],
        bump
    )]
    pub payment_gate: Account<'info, PaymentGate>,

    #[account(has_one = owner)]
    pub passport: Account<'info, Passport>,

    /// CHECK: Vault PDA to hold collected payments
    #[account(
        seeds = [
            b"vault",
            passport.key().as_ref(),
        ],
        bump
    )]
    pub vault: AccountInfo<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PayForAccess<'info> {
    /// PDA: ["access_receipt", passport, payer]
    #[account(
        init,
        payer = payer,
        space = 8 + AccessReceipt::INIT_SPACE,
        seeds = [
            b"access_receipt",
            passport.key().as_ref(),
            payer.key().as_ref(),
        ],
        bump
    )]
    pub access_receipt: Account<'info, AccessReceipt>,

    #[account(
        mut,
        seeds = [
            b"payment_gate",
            passport.key().as_ref(),
        ],
        bump = payment_gate.bump
    )]
    pub payment_gate: Account<'info, PaymentGate>,

    pub passport: Account<'info, Passport>,

    /// CHECK: Vault PDA to receive payments
    #[account(
        mut,
        seeds = [
            b"vault",
            passport.key().as_ref(),
        ],
        bump
    )]
    pub vault: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawRevenue<'info> {
    #[account(
        seeds = [
            b"payment_gate",
            passport.key().as_ref(),
        ],
        bump = payment_gate.bump
    )]
    pub payment_gate: Account<'info, PaymentGate>,

    pub passport: Account<'info, Passport>,

    /// CHECK: Vault PDA holding funds
    #[account(
        mut,
        seeds = [
            b"vault",
            passport.key().as_ref(),
        ],
        bump
    )]
    pub vault: AccountInfo<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeAccess<'info> {
    #[account(
        seeds = [
            b"payment_gate",
            passport.key().as_ref(),
        ],
        bump = payment_gate.bump
    )]
    pub payment_gate: Account<'info, PaymentGate>,

    pub passport: Account<'info, Passport>,

    #[account(
        mut,
        close = owner,
        seeds = [
            b"access_receipt",
            passport.key().as_ref(),
            access_receipt.payer.as_ref(),
        ],
        bump = access_receipt.bump
    )]
    pub access_receipt: Account<'info, AccessReceipt>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

// ============================================================================
// Account Data Structures
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct Passport {
    pub owner: Pubkey,                      // 32
    pub asset_type: AssetType,              // 1
    #[max_len(64)]
    pub slug: String,                       // 4 + 64
    pub version: Version,                   // 12
    #[max_len(64)]
    pub content_cid: String,                // 4 + 64 (IPFS CID)
    pub content_hash: [u8; 32],             // 32 (SHA256)
    #[max_len(64)]
    pub metadata_cid: String,               // 4 + 64 (IPFS CID)
    #[max_len(32)]
    pub license_code: String,               // 4 + 32 (SPDX)
    pub policy_flags: u16,                  // 2
    pub status: PassportStatus,             // 1
    pub created_at: i64,                    // 8
    pub updated_at: i64,                    // 8
    pub bump: u8,                           // 1
}

#[account]
#[derive(InitSpace)]
pub struct VersionLink {
    pub current_passport: Pubkey,           // 32
    pub previous_passport: Pubkey,          // 32
    pub previous_version: Version,          // 12
    pub created_at: i64,                    // 8
    pub bump: u8,                           // 1
}

#[account]
#[derive(InitSpace)]
pub struct Attestation {
    pub passport: Pubkey,                   // 32
    pub attestation_type: AttestationType,  // 1
    #[max_len(64)]
    pub content_cid: String,                // 4 + 64
    #[max_len(200)]
    pub description: String,                // 4 + 200
    pub attester: Pubkey,                   // 32
    pub created_at: i64,                    // 8
    pub bump: u8,                           // 1
}

#[account]
#[derive(InitSpace)]
pub struct PaymentGate {
    pub passport: Pubkey,                   // 32
    pub owner: Pubkey,                      // 32 — receives payments
    pub price_lamports: u64,                // 8  — SOL price (0 = free)
    pub price_lucid: u64,                   // 8  — LUCID token price (0 = free)
    pub payment_token_mint: Pubkey,         // 32 — SPL mint (SystemProgram if SOL-only)
    pub vault: Pubkey,                      // 32 — vault PDA holding funds
    pub total_revenue: u64,                 // 8
    pub total_accesses: u64,                // 8
    pub enabled: bool,                      // 1
    pub created_at: i64,                    // 8
    pub bump: u8,                           // 1
}

#[account]
#[derive(InitSpace)]
pub struct AccessReceipt {
    pub payer: Pubkey,                      // 32
    pub passport: Pubkey,                   // 32
    pub amount_paid: u64,                   // 8
    pub expires_at: i64,                    // 8  — 0 = permanent
    pub created_at: i64,                    // 8
    pub bump: u8,                           // 1
}

// ============================================================================
// Enums and Types
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AssetType {
    Model,
    Dataset,
    Tool,
    Agent,
    Voice,
    Other,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PassportStatus {
    Active,
    Deprecated,
    Superseded,
    Revoked,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AttestationType {
    TrainingLog,
    EvalReport,
    SafetyAudit,
    LicenseVerification,
    TEEQuote,
    VendorAttestation,
    Other,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub struct Version {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

impl Version {
    pub fn to_bytes(&self) -> [u8; 12] {
        let mut bytes = [0u8; 12];
        bytes[0..4].copy_from_slice(&self.major.to_le_bytes());
        bytes[4..8].copy_from_slice(&self.minor.to_le_bytes());
        bytes[8..12].copy_from_slice(&self.patch.to_le_bytes());
        bytes
    }

    pub fn from_bytes(bytes: &[u8; 12]) -> Self {
        let major = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        let minor = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
        let patch = u32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]);
        Self { major, minor, patch }
    }
}

// Policy flags (bitfield)
pub const POLICY_ALLOW_COMMERCIAL: u16 = 1 << 0;
pub const POLICY_ALLOW_DERIVATIVES: u16 = 1 << 1;
pub const POLICY_ALLOW_FINETUNE: u16 = 1 << 2;
pub const POLICY_REQUIRE_ATTRIBUTION: u16 = 1 << 3;
pub const POLICY_SHARE_ALIKE: u16 = 1 << 4;

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct PassportRegistered {
    pub passport: Pubkey,
    pub owner: Pubkey,
    pub asset_type: AssetType,
    pub slug: String,
    pub version: Version,
    pub content_hash: [u8; 32],
}

#[event]
pub struct PassportUpdated {
    pub passport: Pubkey,
    pub updated_at: i64,
}

#[event]
pub struct VersionLinked {
    pub current: Pubkey,
    pub previous: Pubkey,
    pub previous_version: Version,
}

#[event]
pub struct AttestationAdded {
    pub passport: Pubkey,
    pub attestation_type: AttestationType,
    pub attester: Pubkey,
}

#[event]
pub struct PaymentGateSet {
    pub passport: Pubkey,
    pub owner: Pubkey,
    pub price_lamports: u64,
    pub price_lucid: u64,
}

#[event]
pub struct AccessPurchased {
    pub passport: Pubkey,
    pub payer: Pubkey,
    pub amount: u64,
}

#[event]
pub struct RevenueWithdrawn {
    pub passport: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AccessRevoked {
    pub passport: Pubkey,
    pub payer: Pubkey,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Slug exceeds maximum length")]
    SlugTooLong,
    #[msg("CID exceeds maximum length")]
    CidTooLong,
    #[msg("License code exceeds maximum length")]
    LicenseTooLong,
    #[msg("Description exceeds maximum length")]
    DescriptionTooLong,
    #[msg("Unauthorized: only owner can perform this action")]
    Unauthorized,
    #[msg("Invalid passport status")]
    InvalidStatus,
    #[msg("Version mismatch")]
    VersionMismatch,
    #[msg("Payment gate is not enabled")]
    PaymentGateNotEnabled,
    #[msg("Insufficient payment amount")]
    InsufficientPayment,
    #[msg("Access already granted to this payer")]
    AccessAlreadyGranted,
    #[msg("Unauthorized withdrawal attempt")]
    UnauthorizedWithdrawal,
}
