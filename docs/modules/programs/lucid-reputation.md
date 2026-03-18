<!-- generated: commit aa1296b, 2026-03-18T20:26:15.613Z -->
# lucid_reputation — Solana Program

> **Source:** `C:\Lucid-L2\programs\lucid-reputation\src\lib.rs`

## Purpose

> AI enrichment pending — run the pipeline with `DOCS_MODEL` set to populate this section.

## Architecture

> AI enrichment pending.

## Patterns & Gotchas

> AI enrichment pending.

## Instructions

| Instruction | Parameters |
|-------------|------------|
| `init_stats` | `passport_id` |
| `submit_feedback` | `passport_id`, `score`, `category`, `receipt_hash`, `asset_type`, `metadata`, `) -> Result<(` |
| `submit_validation` | `passport_id`, `receipt_hash`, `valid`, `asset_type`, `metadata`, `) -> Result<(` |
| `revoke_feedback` | `_passport_id`, `_index`, `) -> Result<(` |

## Account Structs

| Struct | Fields |
|--------|--------|
| `InitStats` | `stats`, `payer`, `system_program` |
| `SubmitFeedback` | `feedback`, `stats`, `submitter`, `system_program` |
| `SubmitValidation` | `validation`, `stats`, `validator`, `system_program` |
| `RevokeFeedback` | `feedback`, `stats`, `submitter` |
