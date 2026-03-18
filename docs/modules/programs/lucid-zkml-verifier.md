<!-- generated: commit aa1296b, 2026-03-18T20:26:15.615Z -->
# lucid_zkml_verifier — Solana Program

> **Source:** `C:\Lucid-L2\programs\lucid-zkml-verifier\src\lib.rs`

## Purpose

> AI enrichment pending — run the pipeline with `DOCS_MODEL` set to populate this section.

## Architecture

> AI enrichment pending.

## Patterns & Gotchas

> AI enrichment pending.

## Instructions

| Instruction | Parameters |
|-------------|------------|
| `register_model` | `model_hash`, `vk_alpha_g1`, `vk_beta_g2`, `vk_gamma_g2`, `vk_delta_g2`, `vk_ic`, `nr_pubinputs`, `) -> Result<(` |
| `verify_proof` | `proof_a`, `proof_b`, `proof_c`, `public_inputs`, `receipt_hash`, `) -> Result<(` |
| `verify_batch` | `proofs`, `) -> Result<(` |
| `check_proof` | `proof_hash`, `) -> Result<(` |
| `init_bloom` | — |

## Account Structs

| Struct | Fields |
|--------|--------|
| `RegisterModel` | `model`, `owner`, `system_program` |
| `VerifyProof` | `model`, `bloom`, `verifier`, `proof_record` |
| `VerifyBatch` | `bloom`, `verifier` |
| `CheckProof` | `bloom` |
| `InitBloom` | `bloom`, `authority`, `system_program` |
