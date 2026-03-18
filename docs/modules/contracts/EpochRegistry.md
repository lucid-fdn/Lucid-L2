<!-- generated: commit aa1296b, 2026-03-18T20:27:23.153Z -->
# EpochRegistry — EVM Contract

> **Source:** `C:\Lucid-L2\contracts\src\EpochRegistry.sol`

## Purpose

> AI enrichment pending — run the pipeline with `DOCS_MODEL` set to populate this section.

## Architecture

> AI enrichment pending.

## Patterns & Gotchas

> AI enrichment pending.

## Functions

| Function | Visibility | Parameters |
|----------|------------|------------|
| `setSubmitter` | external | address submitter, bool authorized |
| `commitEpoch` | external | bytes32 agentId, bytes32 mmrRoot, uint64 epochId, uint64 leafCount, uint64 mmrSize |
| `commitEpochBatch` | external | bytes32[] calldata agentIds, bytes32[] calldata mmrRoots, uint64[] calldata epochIds, uint64[] calldata leafCounts, uint64[] calldata mmrSizes |
| `_commitEpoch` | internal | bytes32 agentId, bytes32 mmrRoot, uint64 epochId, uint64 leafCount, uint64 mmrSize |
| `getEpoch` | external | bytes32 agentId, uint64 epochId |
| `getLatestEpoch` | external | bytes32 agentId |
| `getEpochCount` | external | bytes32 agentId |
| `verifyEpochInclusion` | external | bytes32 agentId, uint64 epochId, bytes32 mmrRoot |
| `getEpochRange` | external | bytes32 agentId, uint256 offset, uint256 limit |

## Events

| Event | Parameters |
|-------|------------|
| `EpochCommitted` | bytes32 indexed agentId, uint64 indexed epochId, bytes32 mmrRoot, uint64 leafCount, uint64 mmrSize, uint256 timestamp |
| `SubmitterAuthorized` | address indexed submitter, bool authorized |
