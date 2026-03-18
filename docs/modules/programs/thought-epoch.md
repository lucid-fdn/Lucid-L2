<!-- generated: commit aa1296b, 2026-03-18T20:26:15.615Z -->
# thought_epoch — Solana Program

> **Source:** `C:\Lucid-L2\programs\thought-epoch\src\lib.rs`

## Purpose

> AI enrichment pending — run the pipeline with `DOCS_MODEL` set to populate this section.

## Architecture

> AI enrichment pending.

## Patterns & Gotchas

> AI enrichment pending.

## Instructions

| Instruction | Parameters |
|-------------|------------|
| `init_epoch` | `root` |
| `commit_epoch` | `root` |
| `init_epochs` | `roots` |
| `commit_epochs` | `roots` |
| `init_epoch_v2` | `root`, `epoch_id`, `leaf_count`, `timestamp`, `mmr_size`, `) -> Result<(` |
| `commit_epoch_v2` | `root`, `epoch_id`, `leaf_count`, `timestamp`, `mmr_size`, `) -> Result<(` |

## Account Structs

| Struct | Fields |
|--------|--------|
| `InitEpoch` | `authority`, `epoch_record`, `system_program` |
| `InitEpochs` | `authority`, `epoch_record_batch`, `system_program` |
| `InitEpochV2` | `authority`, `epoch_record_v2`, `system_program` |
| `UpdateEpoch` | `authority`, `epoch_record` |
| `UpdateEpochs` | `authority`, `epoch_record_batch` |
| `UpdateEpochV2` | `authority`, `epoch_record_v2` |
