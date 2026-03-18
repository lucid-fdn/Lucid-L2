<!-- generated: commit aa1296b, 2026-03-18T20:26:15.612Z -->
# lucid_passports — Solana Program

> **Source:** `C:\Lucid-L2\programs\lucid-passports\src\lib.rs`

## Purpose

> AI enrichment pending — run the pipeline with `DOCS_MODEL` set to populate this section.

## Architecture

> AI enrichment pending.

## Patterns & Gotchas

> AI enrichment pending.

## Instructions

| Instruction | Parameters |
|-------------|------------|
| `register_passport` | `asset_type`, `slug`, `version`, `content_cid`, `content_hash`, `metadata_cid`, `license_code`, `policy_flags`, `) -> Result<(` |
| `update_passport` | `metadata_cid`, `status`, `) -> Result<(` |
| `link_version` | `previous_version`, `) -> Result<(` |
| `add_attestation` | `attestation_type`, `_attestation_id`, `content_cid`, `description`, `) -> Result<(` |
| `set_payment_gate` | `price_lamports`, `price_lucid`, `payment_token_mint`, `) -> Result<(` |
| `pay_for_access` | `expires_at`, `) -> Result<(` |
| `withdraw_revenue` | `amount`, `) -> Result<(` |
| `revoke_access` | `) -> Result<(` |

## Account Structs

| Struct | Fields |
|--------|--------|
| `RegisterPassport` | `passport`, `owner`, `system_program` |
| `UpdatePassport` | `passport`, `owner` |
| `LinkVersion` | `version_link`, `current_passport`, `previous_passport`, `owner`, `system_program` |
| `AddAttestation` | `attestation`, `passport`, `attester`, `system_program` |
| `SetPaymentGate` | `payment_gate`, `passport`, `vault`, `owner`, `system_program` |
| `PayForAccess` | `access_receipt`, `payment_gate`, `passport`, `vault`, `payer`, `system_program` |
| `WithdrawRevenue` | `payment_gate`, `passport`, `vault`, `owner`, `system_program` |
| `RevokeAccess` | `payment_gate`, `passport`, `access_receipt`, `owner` |
