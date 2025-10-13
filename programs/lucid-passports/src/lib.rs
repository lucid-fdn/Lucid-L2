use anchor_lang::prelude::*;

// Program ID - will be updated after deployment
declare_id!("11111111111111111111111111111111");

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
    /// PDA: ["passport", owner, asset_type_byte, slug_bytes, version_bytes]
    #[account(
        init,
        payer = owner,
        space = 8 + Passport::INIT_SPACE,
        seeds = [
            b"passport",
            owner.key().as_ref(),
            &[asset_type as u8],
            slug.as_bytes(),
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
            passport.slug.as_bytes(),
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

    /// CHECK: Previous passport, validated by owner
    pub previous_passport: AccountInfo<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(attestation_type: AttestationType)]
pub struct AddAttestation<'info> {
    /// PDA: ["attestation", passport, attester, timestamp_as_bytes]
    #[account(
        init,
        payer = attester,
        space = 8 + Attestation::INIT_SPACE,
        seeds = [
            b"attestation",
            passport.key().as_ref(),
            attester.key().as_ref(),
            &Clock::get()?.unix_timestamp.to_le_bytes(),
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
}
