# Lucid Passport + 8004-solana Integration Plan

> **Strategic roadmap for integrating 8004-solana's best features into Lucid Passport**

[![Status](https://img.shields.io/badge/Status-Planning-blue)]()
[![Priority](https://img.shields.io/badge/Priority-High-red)]()
[![Estimated Duration](https://img.shields.io/badge/Duration-8--12%20weeks-orange)]()

---

## 📋 Executive Summary

This document outlines a comprehensive plan to enhance Lucid Passport by integrating key features from the 8004-solana project. The integration will add:

1. **ATOM-style Reputation Engine** - Trust scoring with sybil resistance
2. **SEAL-style Hash-Chain Integrity** - Cryptographic event auditability
3. **Third-Party Validation Workflow** - Multi-validator verification
4. **Optional NFT-based Ownership** - Asset transferability via Metaplex

These additions will position Lucid Passport as the most comprehensive AI asset registry on Solana.

---

## 🎯 Integration Priorities

| Priority | Feature | Complexity | Value | Timeline |
|----------|---------|------------|-------|----------|
| **P0** | Hash-Chain Integrity (SEAL) | Medium | High | Week 1-2 |
| **P1** | Reputation Engine (ATOM) | High | Very High | Week 3-6 |
| **P2** | Validation Workflow | Medium | High | Week 7-8 |
| **P3** | NFT-based Ownership | Low | Medium | Week 9-10 |

---

## 🔗 Phase 1: Hash-Chain Integrity (SEAL-style)

### Overview

Implement a Solana Event Authenticity Layer for Lucid Passport to provide:
- Trustless on-chain hash computation
- Rolling digests for all attestation events
- Verifiable hash-chain for audit trails

### Technical Design

#### 1.1 New On-Chain Structures

```rust
// programs/lucid-passports/src/lib.rs

/// Domain separators for SEAL
pub const DOMAIN_SEAL_V1: &[u8; 16] = b"LUCID_SEAL_V1___";
pub const DOMAIN_ATTEST_V1: &[u8; 16] = b"LUCID_ATST_V1___";
pub const DOMAIN_UPDATE_V1: &[u8; 16] = b"LUCID_UPDT_V1___";

/// Hash-chain state for a passport
#[account]
#[derive(InitSpace)]
pub struct PassportHashChain {
    pub passport: Pubkey,                   // 32 - Associated passport
    pub attestation_digest: [u8; 32],       // 32 - Rolling attestation hash
    pub update_digest: [u8; 32],            // 32 - Rolling update hash  
    pub attestation_count: u64,             // 8 - Total attestations
    pub update_count: u64,                  // 8 - Total updates
    pub last_slot: u64,                     // 8 - Last activity slot
    pub bump: u8,                           // 1
}

/// Seal record for individual events
#[account]
#[derive(InitSpace)]
pub struct SealRecord {
    pub passport: Pubkey,                   // 32
    pub event_type: SealEventType,          // 1
    pub seal_hash: [u8; 32],                // 32 - Computed on-chain
    pub prev_digest: [u8; 32],              // 32 - Previous chain state
    pub slot: u64,                          // 8
    pub bump: u8,                           // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum SealEventType {
    Attestation,
    Update,
    StatusChange,
    VersionLink,
}
```

#### 1.2 Seal Hash Computation

```rust
/// Compute seal hash on-chain (cannot be faked by clients)
pub fn compute_seal_hash(
    event_type: SealEventType,
    passport: &Pubkey,
    content_hash: &[u8; 32],
    attester: &Pubkey,
    slot: u64,
) -> [u8; 32] {
    let mut data = Vec::with_capacity(121);
    
    // Domain separator (16 bytes)
    data.extend_from_slice(DOMAIN_SEAL_V1);
    
    // Event type (1 byte)
    data.push(event_type as u8);
    
    // Passport pubkey (32 bytes)
    data.extend_from_slice(passport.as_ref());
    
    // Content hash (32 bytes)
    data.extend_from_slice(content_hash);
    
    // Attester (32 bytes)
    data.extend_from_slice(attester.as_ref());
    
    // Slot (8 bytes LE)
    data.extend_from_slice(&slot.to_le_bytes());
    
    // Compute keccak256
    solana_program::keccak::hash(&data).0
}

/// Update rolling digest
pub fn update_digest(
    prev_digest: &[u8; 32],
    domain: &[u8; 16],
    seal_hash: &[u8; 32],
) -> [u8; 32] {
    let mut data = Vec::with_capacity(80);
    data.extend_from_slice(prev_digest);
    data.extend_from_slice(domain);
    data.extend_from_slice(seal_hash);
    solana_program::keccak::hash(&data).0
}
```

#### 1.3 New Instructions

```rust
/// Initialize hash-chain for a passport
pub fn initialize_hash_chain(ctx: Context<InitHashChain>) -> Result<()> {
    let chain = &mut ctx.accounts.hash_chain;
    chain.passport = ctx.accounts.passport.key();
    chain.attestation_digest = [0u8; 32]; // Genesis
    chain.update_digest = [0u8; 32];
    chain.attestation_count = 0;
    chain.update_count = 0;
    chain.last_slot = Clock::get()?.slot;
    chain.bump = ctx.bumps.hash_chain;
    Ok(())
}

/// Modified add_attestation with SEAL
pub fn add_attestation_sealed(
    ctx: Context<AddAttestationSealed>,
    attestation_type: AttestationType,
    attestation_id: [u8; 8],
    content_cid: String,
    description: String,
    content_hash: [u8; 32], // Hash of actual content
) -> Result<()> {
    let clock = Clock::get()?;
    let slot = clock.slot;
    
    // Compute seal on-chain
    let seal_hash = compute_seal_hash(
        SealEventType::Attestation,
        &ctx.accounts.passport.key(),
        &content_hash,
        &ctx.accounts.attester.key(),
        slot,
    );
    
    // Update hash-chain
    let chain = &mut ctx.accounts.hash_chain;
    let new_digest = update_digest(
        &chain.attestation_digest,
        DOMAIN_ATTEST_V1,
        &seal_hash,
    );
    chain.attestation_digest = new_digest;
    chain.attestation_count += 1;
    chain.last_slot = slot;
    
    // Store attestation with seal
    let attestation = &mut ctx.accounts.attestation;
    attestation.passport = ctx.accounts.passport.key();
    attestation.attestation_type = attestation_type;
    attestation.content_cid = content_cid;
    attestation.description = description;
    attestation.attester = ctx.accounts.attester.key();
    attestation.created_at = clock.unix_timestamp;
    attestation.seal_hash = seal_hash; // NEW FIELD
    attestation.bump = ctx.bumps.attestation;
    
    emit!(AttestationSealed {
        passport: attestation.passport,
        attestation_type,
        attester: attestation.attester,
        seal_hash,
        digest: new_digest,
    });
    
    Ok(())
}
```

### Deliverables

- [ ] `PassportHashChain` account structure
- [ ] `SealRecord` account structure
- [ ] `compute_seal_hash()` function
- [ ] `update_digest()` function
- [ ] `initialize_hash_chain` instruction
- [ ] `add_attestation_sealed` instruction
- [ ] `update_passport_sealed` instruction
- [ ] TypeScript SDK integration
- [ ] Off-chain verification utilities
- [ ] Unit tests

### Migration Path

1. New passports automatically get hash-chain initialized
2. Existing passports can opt-in via `initialize_hash_chain`
3. Old `add_attestation` remains for backward compatibility
4. New `add_attestation_sealed` recommended for new attestations

---

## ⭐ Phase 2: Reputation Engine (ATOM-style)

### Overview

Implement a trust scoring system for Lucid Passport assets:
- Quality scores from users (0-100)
- Sybil-resistant unique rater counting (HyperLogLog)
- Trust tiers with vesting requirements
- Risk signal detection (burst, manipulation)

### Technical Design

#### 2.1 New On-Chain Structures

```rust
// programs/lucid-passports/src/lib.rs (or new program)

/// Configuration for reputation system
#[account]
#[derive(InitSpace)]
pub struct ReputationConfig {
    pub authority: Pubkey,                  // 32
    pub ema_alpha_fast: u16,                // 2 - Default 3000 (0.30 * 10000)
    pub ema_alpha_slow: u16,                // 2 - Default 500 (0.05 * 10000)
    pub min_ratings_for_tier1: u16,         // 2 - e.g., 5
    pub min_ratings_for_tier2: u16,         // 2 - e.g., 20
    pub min_ratings_for_tier3: u16,         // 2 - e.g., 50
    pub min_ratings_for_tier4: u16,         // 2 - e.g., 100
    pub tier_vesting_epochs: u8,            // 1 - e.g., 8 epochs
    pub bump: u8,                           // 1
}

/// Reputation stats for a passport
#[account]
#[derive(InitSpace)]
pub struct PassportReputation {
    pub passport: Pubkey,                   // 32 - Associated passport
    
    // Core metrics
    pub rating_count: u64,                  // 8 - Total ratings received
    pub first_rating_slot: u64,             // 8
    pub last_rating_slot: u64,              // 8
    
    // Dual-EMA scoring (scale 0-10000 = 0.00-100.00)
    pub ema_score_fast: u16,                // 2 - α=0.30
    pub ema_score_slow: u16,                // 2 - α=0.05
    pub ema_volatility: u16,                // 2 - |fast - slow|
    pub peak_ema: u16,                      // 2 - Historical peak
    pub max_drawdown: u16,                  // 2 - Peak - current
    
    // Score bounds
    pub min_score: u8,                      // 1
    pub max_score: u8,                      // 1
    pub first_score: u8,                    // 1
    pub last_score: u8,                     // 1
    
    // HyperLogLog for unique raters (128 bytes = 256 registers × 4 bits)
    #[max_len(128)]
    pub hll_packed: Vec<u8>,                // 4 + 128 - ~6.5% error
    pub hll_salt: u64,                      // 8 - Per-passport grinding resistance
    
    // Ring buffer for burst detection (24 recent raters)
    pub recent_raters: [[u8; 8]; 24],       // 192 - 56-bit fingerprint + 7-bit score + flags
    pub burst_pressure: u8,                 // 1 - EMA of repeat raters
    pub eviction_cursor: u8,                // 1 - Round robin pointer
    
    // Computed metrics
    pub estimated_unique_raters: u32,       // 4 - From HLL
    pub quality_score: u16,                 // 2 - Weighted: quality + diversity
    pub risk_score: u16,                    // 2 - Sybil + burst + stagnation
    pub trust_tier: u8,                     // 1 - 0=Unrated, 1=Bronze, 2=Silver, 3=Gold, 4=Platinum
    pub tier_vesting_epoch: u16,            // 2 - Epoch when tier was achieved
    
    pub bump: u8,                           // 1
}

/// Individual rating record (event-based, minimal storage)
#[event]
pub struct RatingGiven {
    pub passport: Pubkey,
    pub rater: Pubkey,
    pub score: u8,                          // 0-100
    pub seal_hash: [u8; 32],
    pub rating_index: u64,
    pub slot: u64,
}
```

#### 2.2 HyperLogLog Implementation

```rust
/// HyperLogLog constants
const HLL_REGISTERS: usize = 256;
const HLL_BITS_PER_REGISTER: usize = 4;
const HLL_ALPHA: f64 = 0.7213 / (1.0 + 1.079 / HLL_REGISTERS as f64);

/// Add a rater to HLL (on-chain)
pub fn hll_add(
    hll_packed: &mut [u8; 128],
    salt: u64,
    rater: &Pubkey,
) -> bool {
    // Hash rater with salt to get fingerprint
    let mut data = Vec::with_capacity(40);
    data.extend_from_slice(&salt.to_le_bytes());
    data.extend_from_slice(rater.as_ref());
    let hash = solana_program::keccak::hash(&data).0;
    
    // Use first 8 bits for register index
    let register_idx = hash[0] as usize;
    
    // Count leading zeros in remaining bits for register value
    let remaining = u64::from_le_bytes(hash[1..9].try_into().unwrap());
    let leading_zeros = remaining.leading_zeros() as u8;
    let register_value = (leading_zeros + 1).min(15); // Max 4 bits
    
    // Get current value
    let byte_idx = register_idx / 2;
    let is_high_nibble = register_idx % 2 == 1;
    let current = if is_high_nibble {
        (hll_packed[byte_idx] >> 4) & 0x0F
    } else {
        hll_packed[byte_idx] & 0x0F
    };
    
    // Update if new value is higher
    if register_value > current {
        if is_high_nibble {
            hll_packed[byte_idx] = (hll_packed[byte_idx] & 0x0F) | (register_value << 4);
        } else {
            hll_packed[byte_idx] = (hll_packed[byte_idx] & 0xF0) | register_value;
        }
        return true; // HLL changed
    }
    
    false // No change
}

/// Estimate cardinality from HLL
pub fn hll_count(hll_packed: &[u8; 128]) -> u32 {
    let mut sum: f64 = 0.0;
    let mut zeros = 0u32;
    
    for i in 0..HLL_REGISTERS {
        let byte_idx = i / 2;
        let is_high_nibble = i % 2 == 1;
        let register_value = if is_high_nibble {
            (hll_packed[byte_idx] >> 4) & 0x0F
        } else {
            hll_packed[byte_idx] & 0x0F
        };
        
        sum += 1.0 / (1u64 << register_value) as f64;
        if register_value == 0 {
            zeros += 1;
        }
    }
    
    let raw_estimate = HLL_ALPHA * (HLL_REGISTERS as f64).powi(2) / sum;
    
    // Small range correction
    if raw_estimate <= 2.5 * HLL_REGISTERS as f64 && zeros > 0 {
        let linear_count = HLL_REGISTERS as f64 * (HLL_REGISTERS as f64 / zeros as f64).ln();
        return linear_count as u32;
    }
    
    raw_estimate as u32
}
```

#### 2.3 EMA and Risk Computation

```rust
/// Update EMA scores (on-chain)
/// Alpha is in basis points (3000 = 0.30)
pub fn update_ema(current: u16, new_score: u8, alpha_bp: u16) -> u16 {
    let score_scaled = (new_score as u32) * 100; // 0-10000
    let alpha = alpha_bp as u32;
    let one_minus_alpha = 10000 - alpha;
    
    let new_ema = (alpha * score_scaled + one_minus_alpha * current as u32) / 10000;
    new_ema as u16
}

/// Compute risk score from multiple signals
pub fn compute_risk_score(rep: &PassportReputation) -> u16 {
    let mut risk: u32 = 0;
    
    // Sybil risk: low unique raters relative to total ratings
    if rep.rating_count > 10 {
        let unique = rep.estimated_unique_raters as u64;
        let total = rep.rating_count;
        let sybil_ratio = (unique * 100) / total;
        if sybil_ratio < 50 {
            risk += (50 - sybil_ratio) as u32 * 20; // 0-1000 range
        }
    }
    
    // Burst risk: high burst pressure
    risk += (rep.burst_pressure as u32) * 4; // 0-1000 range
    
    // Volatility risk: high EMA divergence
    risk += (rep.ema_volatility as u32) / 10; // 0-1000 range
    
    // Drawdown risk: significant drop from peak
    risk += (rep.max_drawdown as u32) / 5; // 0-2000 range
    
    risk.min(10000) as u16
}

/// Compute trust tier based on metrics
pub fn compute_trust_tier(
    rep: &PassportReputation,
    config: &ReputationConfig,
    current_epoch: u16,
) -> u8 {
    let quality = rep.ema_score_slow;
    let unique = rep.estimated_unique_raters;
    let risk = compute_risk_score(rep);
    
    // Disqualify if risk too high
    if risk > 5000 {
        return 0;
    }
    
    // Check tier requirements (must meet all criteria)
    let tier = if unique >= config.min_ratings_for_tier4 as u32 && quality >= 8000 {
        4 // Platinum
    } else if unique >= config.min_ratings_for_tier3 as u32 && quality >= 7000 {
        3 // Gold
    } else if unique >= config.min_ratings_for_tier2 as u32 && quality >= 6000 {
        2 // Silver
    } else if unique >= config.min_ratings_for_tier1 as u32 && quality >= 5000 {
        1 // Bronze
    } else {
        0 // Unrated
    };
    
    // Tier vesting: must hold tier for N epochs
    if tier > rep.trust_tier {
        // Upgrading - check vesting
        let epochs_at_current = current_epoch.saturating_sub(rep.tier_vesting_epoch);
        if epochs_at_current >= config.tier_vesting_epochs as u16 {
            return tier;
        }
        return rep.trust_tier; // Not vested yet
    }
    
    tier
}
```

#### 2.4 Rating Instruction

```rust
/// Give a rating to a passport
pub fn give_rating(
    ctx: Context<GiveRating>,
    score: u8,
) -> Result<()> {
    require!(score <= 100, ErrorCode::ScoreOutOfRange);
    
    let rep = &mut ctx.accounts.passport_reputation;
    let config = &ctx.accounts.reputation_config;
    let clock = Clock::get()?;
    let slot = clock.slot;
    
    // Compute seal hash
    let seal_hash = compute_seal_hash(
        SealEventType::Rating,
        &rep.passport,
        &[score; 32], // Simple hash input
        &ctx.accounts.rater.key(),
        slot,
    );
    
    // Update HLL (check if new unique rater)
    let hll_changed = hll_add(
        &mut rep.hll_packed.try_into().unwrap(),
        rep.hll_salt,
        &ctx.accounts.rater.key(),
    );
    
    // Update ring buffer for burst detection
    let rater_fp = fingerprint(&ctx.accounts.rater.key(), rep.hll_salt);
    let is_repeat = check_and_update_ring_buffer(
        &mut rep.recent_raters,
        &mut rep.eviction_cursor,
        rater_fp,
        score,
    );
    
    // Update burst pressure (EMA of repeat raters)
    let repeat_signal = if is_repeat { 255 } else { 0 };
    rep.burst_pressure = ((rep.burst_pressure as u16 * 7 + repeat_signal as u16) / 8) as u8;
    
    // Update EMAs
    rep.ema_score_fast = update_ema(rep.ema_score_fast, score, config.ema_alpha_fast);
    rep.ema_score_slow = update_ema(rep.ema_score_slow, score, config.ema_alpha_slow);
    rep.ema_volatility = rep.ema_score_fast.abs_diff(rep.ema_score_slow);
    
    // Update peak and drawdown
    if rep.ema_score_slow > rep.peak_ema {
        rep.peak_ema = rep.ema_score_slow;
    }
    rep.max_drawdown = rep.peak_ema.saturating_sub(rep.ema_score_slow);
    
    // Update bounds
    if rep.rating_count == 0 {
        rep.first_score = score;
        rep.first_rating_slot = slot;
        rep.min_score = score;
        rep.max_score = score;
    } else {
        rep.min_score = rep.min_score.min(score);
        rep.max_score = rep.max_score.max(score);
    }
    rep.last_score = score;
    rep.last_rating_slot = slot;
    
    // Update unique estimate
    if hll_changed {
        rep.estimated_unique_raters = hll_count(&rep.hll_packed.try_into().unwrap());
    }
    
    // Update derived metrics
    rep.quality_score = compute_quality_score(rep);
    rep.risk_score = compute_risk_score(rep);
    
    // Update tier (with vesting check)
    let current_epoch = (slot / 432000) as u16; // ~2 days per epoch
    let new_tier = compute_trust_tier(rep, config, current_epoch);
    if new_tier != rep.trust_tier {
        rep.tier_vesting_epoch = current_epoch;
    }
    rep.trust_tier = new_tier;
    
    rep.rating_count += 1;
    
    emit!(RatingGiven {
        passport: rep.passport,
        rater: ctx.accounts.rater.key(),
        score,
        seal_hash,
        rating_index: rep.rating_count,
        slot,
    });
    
    Ok(())
}
```

### Deliverables

- [ ] `ReputationConfig` account
- [ ] `PassportReputation` account
- [ ] HyperLogLog implementation (128 bytes packed)
- [ ] Dual-EMA scoring system
- [ ] Ring buffer for burst detection
- [ ] Risk score computation
- [ ] Trust tier logic with vesting
- [ ] `initialize_reputation_config` instruction
- [ ] `initialize_passport_reputation` instruction
- [ ] `give_rating` instruction
- [ ] `revoke_rating` instruction (optional)
- [ ] CPI interface for other programs
- [ ] TypeScript SDK integration
- [ ] Indexer integration
- [ ] Unit tests

### Storage Costs

| Account | Size | Rent |
|---------|------|------|
| ReputationConfig | ~50 bytes | ~0.0005 SOL |
| PassportReputation | ~500 bytes | ~0.005 SOL |

---

## ✅ Phase 3: Third-Party Validation Workflow

### Overview

Enable third-party validators to verify Lucid Passport assets:
- Validators can request validation of any passport
- Asset owners can approve/reject validation requests
- Validators provide verification reports
- Self-validation is blocked

### Technical Design

#### 3.1 Account Structures

```rust
/// Global validation configuration
#[account]
#[derive(InitSpace)]
pub struct ValidationConfig {
    pub authority: Pubkey,                  // 32
    pub total_requests: u64,                // 8
    pub total_completions: u64,             // 8
    pub min_validator_stake: u64,           // 8 - Optional stake requirement
    pub bump: u8,                           // 1
}

/// Individual validation request
#[account]
#[derive(InitSpace)]
pub struct ValidationRequest {
    pub passport: Pubkey,                   // 32 - Target passport
    pub validator: Pubkey,                  // 32 - Requesting validator
    pub nonce: u64,                         // 8 - Unique per passport+validator
    pub request_hash: [u8; 32],             // 32 - Hash of request params
    pub status: ValidationStatus,           // 1
    pub response_score: Option<u8>,         // 2 (1 discriminator + 1 value)
    #[max_len(64)]
    pub response_cid: String,               // 4 + 64 - IPFS CID of report
    pub requested_at: i64,                  // 8
    pub responded_at: Option<i64>,          // 9
    pub bump: u8,                           // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ValidationStatus {
    Pending,
    Approved,
    Rejected,
    Completed,
    Expired,
}
```

#### 3.2 Instructions

```rust
/// Request validation of a passport
pub fn request_validation(
    ctx: Context<RequestValidation>,
    nonce: u64,
    request_details_hash: [u8; 32],
) -> Result<()> {
    // Self-validation blocked
    require!(
        ctx.accounts.validator.key() != ctx.accounts.passport.owner,
        ErrorCode::SelfValidationBlocked
    );
    
    let request = &mut ctx.accounts.validation_request;
    let clock = Clock::get()?;
    
    request.passport = ctx.accounts.passport.key();
    request.validator = ctx.accounts.validator.key();
    request.nonce = nonce;
    request.request_hash = request_details_hash;
    request.status = ValidationStatus::Pending;
    request.response_score = None;
    request.response_cid = String::new();
    request.requested_at = clock.unix_timestamp;
    request.responded_at = None;
    request.bump = ctx.bumps.validation_request;
    
    let config = &mut ctx.accounts.validation_config;
    config.total_requests += 1;
    
    emit!(ValidationRequested {
        passport: request.passport,
        validator: request.validator,
        nonce,
        request_hash: request_details_hash,
    });
    
    Ok(())
}

/// Owner approves validation request
pub fn approve_validation(ctx: Context<ApproveValidation>) -> Result<()> {
    let request = &mut ctx.accounts.validation_request;
    require!(request.status == ValidationStatus::Pending, ErrorCode::InvalidStatus);
    
    request.status = ValidationStatus::Approved;
    
    emit!(ValidationApproved {
        passport: request.passport,
        validator: request.validator,
    });
    
    Ok(())
}

/// Validator submits response
pub fn submit_validation_response(
    ctx: Context<SubmitValidationResponse>,
    score: u8,
    report_cid: String,
) -> Result<()> {
    require!(score <= 100, ErrorCode::ScoreOutOfRange);
    require!(report_cid.len() <= 64, ErrorCode::CidTooLong);
    
    let request = &mut ctx.accounts.validation_request;
    require!(request.status == ValidationStatus::Approved, ErrorCode::InvalidStatus);
    
    let clock = Clock::get()?;
    
    request.status = ValidationStatus::Completed;
    request.response_score = Some(score);
    request.response_cid = report_cid;
    request.responded_at = Some(clock.unix_timestamp);
    
    let config = &mut ctx.accounts.validation_config;
    config.total_completions += 1;
    
    // Update passport reputation if integrated
    // (CPI to reputation system)
    
    emit!(ValidationCompleted {
        passport: request.passport,
        validator: request.validator,
        score,
    });
    
    Ok(())
}
```

### Deliverables

- [ ] `ValidationConfig` account
- [ ] `ValidationRequest` account
- [ ] `initialize_validation_config` instruction
- [ ] `request_validation` instruction
- [ ] `approve_validation` instruction
- [ ] `reject_validation` instruction
- [ ] `submit_validation_response` instruction
- [ ] Self-validation blocking
- [ ] Integration with reputation system (optional CPI)
- [ ] TypeScript SDK integration
- [ ] Unit tests

---

## 🎨 Phase 4: NFT-based Ownership (Optional)

### Overview

Enable passports to be represented as transferable NFTs via Metaplex Core:
- Passport ownership can be transferred
- Marketplace compatibility
- Collection-based organization

### Technical Design

#### 4.1 Integration Approach

```rust
/// Passport with optional NFT binding
#[account]
#[derive(InitSpace)]
pub struct Passport {
    // ... existing fields ...
    
    // NEW: Optional NFT binding
    pub nft_asset: Option<Pubkey>,          // 33 (1 + 32) - Metaplex Core asset
    pub is_nft_locked: bool,                // 1 - Ownership follows NFT
}

/// Bind passport to NFT (one-time operation)
pub fn bind_to_nft(
    ctx: Context<BindToNft>,
) -> Result<()> {
    let passport = &mut ctx.accounts.passport;
    require!(passport.nft_asset.is_none(), ErrorCode::AlreadyBound);
    
    // Verify NFT ownership
    require!(
        ctx.accounts.nft_asset.owner == ctx.accounts.owner.key(),
        ErrorCode::NotNftOwner
    );
    
    passport.nft_asset = Some(ctx.accounts.nft_asset.key());
    passport.is_nft_locked = true;
    
    emit!(PassportBoundToNft {
        passport: passport.key(),
        nft_asset: ctx.accounts.nft_asset.key(),
    });
    
    Ok(())
}

/// Transfer passport ownership via NFT transfer
pub fn sync_nft_ownership(ctx: Context<SyncNftOwnership>) -> Result<()> {
    let passport = &mut ctx.accounts.passport;
    require!(passport.is_nft_locked, ErrorCode::NotNftLocked);
    
    // Get current NFT owner
    let nft_owner = ctx.accounts.nft_asset.owner;
    
    // Update passport owner
    passport.owner = nft_owner;
    
    emit!(PassportOwnershipSynced {
        passport: passport.key(),
        new_owner: nft_owner,
    });
    
    Ok(())
}
```

### Deliverables

- [ ] NFT binding field in Passport
- [ ] `bind_to_nft` instruction
- [ ] `sync_nft_ownership` instruction
- [ ] Metaplex Core CPI integration
- [ ] Collection management
- [ ] TypeScript SDK integration
- [ ] Unit tests

---

## 📅 Implementation Timeline

```
Week 1-2:   Phase 1 - SEAL Hash-Chain
            ├── Account structures
            ├── Hash computation
            └── Basic tests

Week 3-4:   Phase 2a - Reputation Core
            ├── HLL implementation
            ├── EMA system
            └── Basic rating instruction

Week 5-6:   Phase 2b - Reputation Advanced
            ├── Trust tiers
            ├── Risk scoring
            ├── Ring buffer
            └── Integration tests

Week 7-8:   Phase 3 - Validation
            ├── Request flow
            ├── Response flow
            └── Reputation integration

Week 9-10:  Phase 4 - NFT Binding (Optional)
            ├── Metaplex integration
            ├── Ownership sync
            └── Collection setup

Week 11-12: Integration & Polish
            ├── SDK updates
            ├── Indexer updates
            ├── Documentation
            └── Security audit prep
```

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
// tests/seal.test.ts
describe('SEAL Hash-Chain', () => {
  it('computes deterministic seal hash', async () => {});
  it('updates digest correctly', async () => {});
  it('maintains chain integrity', async () => {});
});

// tests/reputation.test.ts
describe('Reputation Engine', () => {
  it('initializes HLL correctly', async () => {});
  it('estimates unique raters accurately', async () => {});
  it('updates EMA on rating', async () => {});
  it('detects burst attacks', async () => {});
  it('computes trust tier with vesting', async () => {});
});

// tests/validation.test.ts
describe('Validation Workflow', () => {
  it('blocks self-validation', async () => {});
  it('requires approval before response', async () => {});
  it('completes validation flow', async () => {});
});
```

### Integration Tests

- End-to-end rating flow
- Multi-validator scenarios
- Hash-chain verification
- NFT transfer scenarios

### Security Tests

- Sybil attack simulation
- Burst attack detection
- Hash collision resistance
- Replay attack prevention

---

## 💰 Cost Analysis

| Operation | Rent (SOL) | Notes |
|-----------|------------|-------|
| Initialize Hash-Chain | ~0.002 | One-time per passport |
| Add Sealed Attestation | ~0.003 | Per attestation |
| Initialize Reputation | ~0.005 | One-time per passport |
| Give Rating | ~0.000005 | Event only |
| Request Validation | ~0.003 | Per request |
| Submit Response | ~0.000005 | Update only |
| Bind to NFT | ~0.001 | One-time |

**Total per passport (full features):** ~0.013 SOL

---

## 🔐 Security Considerations

1. **Hash-Chain Integrity**
   - Domain separators prevent cross-type collisions
   - On-chain computation prevents client manipulation
   - Slot binding prevents replay attacks

2. **Sybil Resistance**
   - Per-passport HLL salt prevents grinding
   - Ring buffer detects burst patterns
   - Tier vesting prevents quick manipulation

3. **Validation Security**
   - Self-validation blocked
   - Nonce prevents duplicate requests
   - Response requires prior approval

4. **NFT Ownership**
   - One-way binding (cannot unbind)
   - Ownership sync requires valid NFT

---

## 📚 References

- [8004-solana GitHub](https://github.com/QuantuLabs/8004-solana)
- [ERC-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004)
- [HyperLogLog Paper](https://algo.inria.fr/flajolet/Publications/FlFuGaMe07.pdf)
- [Metaplex Core Documentation](https://developers.metaplex.com/core)
- [Solana Anchor Book](https://www.anchor-lang.com/)

---

## ✅ Acceptance Criteria

### Phase 1: SEAL
- [ ] All attestations produce verifiable seal_hash
- [ ] Hash-chain can be verified off-chain
- [ ] Backward compatible with existing attestations

### Phase 2: Reputation
- [ ] HLL estimates within 10% of actual unique raters
- [ ] EMA converges correctly on stable input
- [ ] Burst attacks detected within 3 consecutive ratings
- [ ] Trust tiers upgrade only after vesting period

### Phase 3: Validation
- [ ] Self-validation rejected with clear error
- [ ] Full flow: request → approve → respond
- [ ] Validation scores affect reputation (if enabled)

### Phase 4: NFT (Optional)
- [ ] Passport ownership follows NFT ownership
- [ ] Compatible with Metaplex marketplaces

---

**Document Version:** 1.0  
**Created:** 2026-02-05  
**Author:** Lucid AI Team  
**Status:** Draft - Pending Review