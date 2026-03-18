<!-- generated: commit aa1296b, 2026-03-18T20:26:15.610Z -->
# lucid_agent_wallet — Solana Program

> **Source:** `C:\Lucid-L2\programs\lucid-agent-wallet\src\lib.rs`

## Purpose

> AI enrichment pending — run the pipeline with `DOCS_MODEL` set to populate this section.

## Architecture

> AI enrichment pending.

## Patterns & Gotchas

> AI enrichment pending.

## Instructions

| Instruction | Parameters |
|-------------|------------|
| `create_wallet` | `bump` |
| `execute` | `ix_data`, `program_id`, `amount` |
| `set_policy` | `max_per_tx`, `daily_limit`, `allowed_programs`, `time_window_start`, `time_window_end`, `) -> Result<(` |
| `configure_split` | `recipients`, `basis_points`, `) -> Result<(` |
| `distribute` | `amount`, `) -> Result<(` |
| `create_session` | `permissions`, `expires_at`, `max_amount`, `) -> Result<(` |
| `revoke_session` | — |
| `create_escrow` | `amount`, `duration_seconds`, `expected_receipt_hash`, `) -> Result<(` |
| `release_escrow` | `receipt_hash`, `_receipt_signature`, `) -> Result<(` |
| `claim_timeout` | — |
| `dispute_escrow` | `reason` |

## Account Structs

| Struct | Fields |
|--------|--------|
| `CreateWallet` | `wallet`, `passport_mint`, `owner`, `system_program` |
| `Execute` | `wallet`, `owner`, `policy` |
| `SetPolicy` | `policy`, `wallet`, `owner`, `system_program` |
| `ConfigureSplit` | `split`, `wallet`, `owner`, `system_program` |
| `Distribute` | `wallet`, `owner`, `split`, `wallet_ata`, `token_program` |
| `CreateSession` | `session`, `wallet`, `owner`, `delegate`, `system_program` |
| `RevokeSession` | `session`, `wallet`, `owner` |
| `CreateEscrow` | `escrow`, `wallet`, `owner`, `beneficiary`, `token_mint`, `depositor_ata`, `escrow_ata`, `token_program`, `system_program` |
| `ReleaseEscrow` | `escrow`, `wallet`, `releaser`, `escrow_ata`, `beneficiary_ata`, `token_program` |
| `ClaimTimeout` | `escrow`, `wallet`, `claimer`, `escrow_ata`, `depositor_ata`, `token_program` |
| `DisputeEscrow` | `escrow`, `wallet`, `disputer` |
