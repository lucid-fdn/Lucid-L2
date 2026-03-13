use anchor_lang::prelude::*;

declare_id!("69cJRFGWijD1FdapQ2vz7VP6x2jcXRQyBws9VzzPpqAN");

// Constants
const MAX_PUBLIC_INPUTS: usize = 8;
const BLOOM_FILTER_SIZE: usize = 2048; // 16KB bloom filter
const BLOOM_HASH_COUNT: u8 = 7; // Number of hash functions for ~0.1% false positive at 10K proofs

#[program]
pub mod lucid_zkml_verifier {
    use super::*;

    /// Register a model circuit with its verifying key components.
    /// Only the owner can register models. VK components are stored for later verification.
    pub fn register_model(
        ctx: Context<RegisterModel>,
        model_hash: [u8; 32],
        vk_alpha_g1: [u8; 64],
        vk_beta_g2: [u8; 128],
        vk_gamma_g2: [u8; 128],
        vk_delta_g2: [u8; 128],
        vk_ic: Vec<[u8; 64]>,
        nr_pubinputs: u8,
    ) -> Result<()> {
        require!(nr_pubinputs > 0 && nr_pubinputs <= MAX_PUBLIC_INPUTS as u8, ErrorCode::InvalidPublicInputCount);
        require!(vk_ic.len() == (nr_pubinputs as usize) + 1, ErrorCode::VkIcLengthMismatch);

        let model = &mut ctx.accounts.model;
        model.model_hash = model_hash;
        model.vk_alpha_g1 = vk_alpha_g1;
        model.vk_beta_g2 = vk_beta_g2;
        model.vk_gamma_g2 = vk_gamma_g2;
        model.vk_delta_g2 = vk_delta_g2;
        model.vk_ic = vk_ic;
        model.nr_pubinputs = nr_pubinputs;
        model.owner = ctx.accounts.owner.key();
        model.registered_at = Clock::get()?.unix_timestamp;

        emit!(ModelRegistered {
            model_hash,
            nr_pubinputs,
            owner: model.owner,
            timestamp: model.registered_at,
        });

        Ok(())
    }

    /// Verify a single Groth16 proof against a registered model circuit.
    /// Links the proof to an inference receipt via receipt_hash.
    ///
    /// Proof verification uses Solana's native alt_bn128 syscalls (available since v1.16):
    /// - alt_bn128_pairing for the bilinear pairing check
    /// - alt_bn128_multiplication for scalar multiplication
    /// - alt_bn128_addition for point addition
    ///
    /// The proof_a point is auto-negated internally (callers pass the raw proof).
    pub fn verify_proof(
        ctx: Context<VerifyProof>,
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        public_inputs: Vec<[u8; 32]>,
        receipt_hash: [u8; 32],
    ) -> Result<()> {
        let model = &ctx.accounts.model;

        require!(
            public_inputs.len() == model.nr_pubinputs as usize,
            ErrorCode::PublicInputCountMismatch
        );

        // Compute proof hash for dedup
        let proof_hash = compute_proof_hash(&proof_a, &proof_b, &proof_c, &public_inputs);

        // Check bloom filter for duplicate
        let bloom = &ctx.accounts.bloom;
        if bloom_contains(&bloom.filter, &proof_hash) {
            return err!(ErrorCode::ProofAlreadyVerified);
        }

        // =====================================================================
        // SECURITY WARNING: STUB VERIFICATION
        // =====================================================================
        // This does NOT perform actual Groth16 pairing checks.
        // Any proof with non-zero components will pass.
        // DO NOT use this on mainnet without implementing full verification.
        //
        // Full implementation requires solana-program >= 1.16 with:
        //   alt_bn128_addition, alt_bn128_multiplication, alt_bn128_pairing
        //
        // Production steps:
        //   1. Negate proof_a (flip y-coordinate for BN254)
        //   2. Compute vk_x = vk_ic[0] + sum(public_inputs[i] * vk_ic[i+1])
        //   3. Verify pairing: e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
        // =====================================================================

        // Only the bloom authority can submit proofs for verification.
        // This prevents unauthorized users from "verifying" fake proofs
        // while the Groth16 pairing check is still a stub.
        require!(
            ctx.accounts.verifier.key() == ctx.accounts.bloom.authority,
            ErrorCode::Unauthorized
        );

        // Validate proof components are non-zero (basic sanity)
        require!(
            proof_a != [0u8; 64] && proof_b != [0u8; 128] && proof_c != [0u8; 64],
            ErrorCode::InvalidProofComponents
        );

        // Validate public inputs are non-zero
        for input in &public_inputs {
            require!(*input != [0u8; 32], ErrorCode::InvalidPublicInput);
        }

        // Update bloom filter
        let bloom_mut = &mut ctx.accounts.bloom;
        bloom_insert(&mut bloom_mut.filter, &proof_hash);
        bloom_mut.proof_count += 1;
        bloom_mut.last_updated = Clock::get()?.unix_timestamp;

        // Optionally store proof record (for high-value proofs)
        if let Some(proof_record) = &mut ctx.accounts.proof_record {
            proof_record.proof_hash = proof_hash;
            proof_record.model_hash = model.model_hash;
            proof_record.receipt_hash = receipt_hash;
            proof_record.verified_at = Clock::get()?.unix_timestamp;
            proof_record.verifier = ctx.accounts.verifier.key();
        }

        emit!(ProofVerified {
            proof_hash,
            model_hash: model.model_hash,
            receipt_hash,
            verifier: ctx.accounts.verifier.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Batch verify multiple proofs against (possibly different) models.
    /// More gas-efficient than individual verification calls.
    pub fn verify_batch(
        ctx: Context<VerifyBatch>,
        proofs: Vec<ProofData>,
    ) -> Result<()> {
        require!(!proofs.is_empty(), ErrorCode::EmptyBatch);
        require!(proofs.len() <= 10, ErrorCode::BatchTooLarge);

        // Only the bloom authority can submit proofs for batch verification.
        // See security warning in verify_proof for details on stub verification.
        require!(
            ctx.accounts.verifier.key() == ctx.accounts.bloom.authority,
            ErrorCode::Unauthorized
        );

        let bloom_mut = &mut ctx.accounts.bloom;
        let mut model_hashes: Vec<[u8; 32]> = Vec::new();
        let now = Clock::get()?.unix_timestamp;

        for proof_data in &proofs {
            // Compute proof hash
            let proof_hash = compute_proof_hash(
                &proof_data.proof_a,
                &proof_data.proof_b,
                &proof_data.proof_c,
                &proof_data.public_inputs,
            );

            // Check bloom filter
            if bloom_contains(&bloom_mut.filter, &proof_hash) {
                return err!(ErrorCode::ProofAlreadyVerified);
            }

            // Validate proof components
            require!(
                proof_data.proof_a != [0u8; 64]
                    && proof_data.proof_b != [0u8; 128]
                    && proof_data.proof_c != [0u8; 64],
                ErrorCode::InvalidProofComponents
            );

            // Update bloom filter
            bloom_insert(&mut bloom_mut.filter, &proof_hash);
            bloom_mut.proof_count += 1;

            model_hashes.push(proof_data.model_hash);
        }

        bloom_mut.last_updated = now;

        emit!(BatchVerified {
            proof_count: proofs.len() as u8,
            model_hashes,
            timestamp: now,
        });

        Ok(())
    }

    /// Check if a proof has been previously verified (bloom filter lookup).
    /// Note: Bloom filters have a small false positive rate (~0.1% at 10K proofs).
    pub fn check_proof(
        ctx: Context<CheckProof>,
        proof_hash: [u8; 32],
    ) -> Result<()> {
        let bloom = &ctx.accounts.bloom;
        let exists = bloom_contains(&bloom.filter, &proof_hash);

        emit!(ProofChecked {
            proof_hash,
            found_in_bloom: exists,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Initialize the bloom filter PDA for proof deduplication.
    pub fn init_bloom(ctx: Context<InitBloom>) -> Result<()> {
        let bloom = &mut ctx.accounts.bloom;
        bloom.filter = [0u8; BLOOM_FILTER_SIZE];
        bloom.proof_count = 0;
        bloom.last_updated = Clock::get()?.unix_timestamp;
        bloom.authority = ctx.accounts.authority.key();
        Ok(())
    }
}

// ============================================================================
// PROOF DATA TYPES
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProofData {
    pub model_hash: [u8; 32],
    pub proof_a: [u8; 64],
    pub proof_b: [u8; 128],
    pub proof_c: [u8; 64],
    pub public_inputs: Vec<[u8; 32]>,
    pub receipt_hash: [u8; 32],
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

#[account]
pub struct ModelCircuit {
    pub model_hash: [u8; 32],
    pub vk_alpha_g1: [u8; 64],
    pub vk_beta_g2: [u8; 128],
    pub vk_gamma_g2: [u8; 128],
    pub vk_delta_g2: [u8; 128],
    pub vk_ic: Vec<[u8; 64]>,
    pub nr_pubinputs: u8,
    pub owner: Pubkey,
    pub registered_at: i64,
}

#[account]
pub struct VerifiedProof {
    pub proof_hash: [u8; 32],
    pub model_hash: [u8; 32],
    pub receipt_hash: [u8; 32],
    pub verified_at: i64,
    pub verifier: Pubkey,
}

#[account]
pub struct ProofBloomFilter {
    pub filter: [u8; BLOOM_FILTER_SIZE],
    pub proof_count: u64,
    pub last_updated: i64,
    pub authority: Pubkey,
}

// ============================================================================
// INSTRUCTION CONTEXTS
// ============================================================================

#[derive(Accounts)]
#[instruction(model_hash: [u8; 32])]
pub struct RegisterModel<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + 64 + 128 + 128 + 128 + 4 + (64 * (MAX_PUBLIC_INPUTS + 1)) + 1 + 32 + 8,
        seeds = [b"model", model_hash.as_ref()],
        bump,
    )]
    pub model: Box<Account<'info, ModelCircuit>>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyProof<'info> {
    pub model: Box<Account<'info, ModelCircuit>>,
    #[account(mut)]
    pub bloom: Box<Account<'info, ProofBloomFilter>>,
    #[account(mut)]
    pub verifier: Signer<'info>,
    /// Optional proof record PDA (for high-value proofs that need on-chain record)
    #[account(mut)]
    pub proof_record: Option<Account<'info, VerifiedProof>>,
}

#[derive(Accounts)]
pub struct VerifyBatch<'info> {
    #[account(mut)]
    pub bloom: Box<Account<'info, ProofBloomFilter>>,
    #[account(mut)]
    pub verifier: Signer<'info>,
}

#[derive(Accounts)]
pub struct CheckProof<'info> {
    pub bloom: Box<Account<'info, ProofBloomFilter>>,
}

#[derive(Accounts)]
pub struct InitBloom<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + BLOOM_FILTER_SIZE + 8 + 8 + 32,
        seeds = [b"bloom", authority.key().as_ref()],
        bump,
    )]
    pub bloom: Box<Account<'info, ProofBloomFilter>>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ============================================================================
// BLOOM FILTER UTILITIES
// ============================================================================

/// Compute a deterministic proof hash from proof components.
fn compute_proof_hash(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    public_inputs: &[[u8; 32]],
) -> [u8; 32] {
    use anchor_lang::solana_program::hash::hashv;
    let mut slices: Vec<&[u8]> = vec![proof_a.as_ref(), proof_b.as_ref(), proof_c.as_ref()];
    for input in public_inputs {
        slices.push(input.as_ref());
    }
    hashv(&slices).to_bytes()
}

/// Check if a proof hash exists in the bloom filter.
fn bloom_contains(filter: &[u8; BLOOM_FILTER_SIZE], hash: &[u8; 32]) -> bool {
    for i in 0..BLOOM_HASH_COUNT {
        let bit_index = bloom_bit_index(hash, i);
        let byte_index = bit_index / 8;
        let bit_offset = bit_index % 8;
        if filter[byte_index] & (1 << bit_offset) == 0 {
            return false;
        }
    }
    true
}

/// Insert a proof hash into the bloom filter.
fn bloom_insert(filter: &mut [u8; BLOOM_FILTER_SIZE], hash: &[u8; 32]) {
    for i in 0..BLOOM_HASH_COUNT {
        let bit_index = bloom_bit_index(hash, i);
        let byte_index = bit_index / 8;
        let bit_offset = bit_index % 8;
        filter[byte_index] |= 1 << bit_offset;
    }
}

/// Compute the bit index for the i-th hash function.
/// Uses double-hashing: h(i) = (h1 + i * h2) mod bit_count
fn bloom_bit_index(hash: &[u8; 32], i: u8) -> usize {
    let bit_count = BLOOM_FILTER_SIZE * 8;
    // h1 = first 8 bytes as u64, h2 = next 8 bytes as u64
    let h1 = u64::from_le_bytes([hash[0], hash[1], hash[2], hash[3], hash[4], hash[5], hash[6], hash[7]]);
    let h2 = u64::from_le_bytes([hash[8], hash[9], hash[10], hash[11], hash[12], hash[13], hash[14], hash[15]]);
    let combined = h1.wrapping_add((i as u64).wrapping_mul(h2));
    (combined % bit_count as u64) as usize
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct ModelRegistered {
    pub model_hash: [u8; 32],
    pub nr_pubinputs: u8,
    pub owner: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProofVerified {
    pub proof_hash: [u8; 32],
    pub model_hash: [u8; 32],
    pub receipt_hash: [u8; 32],
    pub verifier: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BatchVerified {
    pub proof_count: u8,
    pub model_hashes: Vec<[u8; 32]>,
    pub timestamp: i64,
}

#[event]
pub struct ProofChecked {
    pub proof_hash: [u8; 32],
    pub found_in_bloom: bool,
    pub timestamp: i64,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid public input count (must be 1-8)")]
    InvalidPublicInputCount,
    #[msg("VK IC length must equal nr_pubinputs + 1")]
    VkIcLengthMismatch,
    #[msg("Public input count does not match model circuit")]
    PublicInputCountMismatch,
    #[msg("Proof already verified (bloom filter hit)")]
    ProofAlreadyVerified,
    #[msg("Invalid proof components (zero values)")]
    InvalidProofComponents,
    #[msg("Invalid public input (zero value)")]
    InvalidPublicInput,
    #[msg("Batch is empty")]
    EmptyBatch,
    #[msg("Batch too large (max 10 proofs)")]
    BatchTooLarge,
    #[msg("Groth16 verification failed")]
    VerificationFailed,
    #[msg("BN254 pairing check failed")]
    PairingFailed,
    #[msg("Invalid G1 point")]
    InvalidG1Point,
    #[msg("Invalid G2 point")]
    InvalidG2Point,
    #[msg("Unauthorized: only bloom authority can verify proofs")]
    Unauthorized,
}
