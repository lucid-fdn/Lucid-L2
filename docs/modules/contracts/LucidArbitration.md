<!-- generated: commit aa1296b, 2026-03-18T20:27:23.157Z -->
# LucidArbitration — EVM Contract

> **Source:** `C:\Lucid-L2\contracts\src\LucidArbitration.sol`

## Purpose

> AI enrichment pending — run the pipeline with `DOCS_MODEL` set to populate this section.

## Architecture

> AI enrichment pending.

## Patterns & Gotchas

> AI enrichment pending.

## Functions

| Function | Visibility | Parameters |
|----------|------------|------------|
| `openDispute` | external | bytes32 escrowId, string calldata reason |
| `submitEvidence` | external | bytes32 disputeId, bytes32 receiptHash, bytes32 mmrRoot, bytes calldata mmrProof, string calldata description |
| `resolveDispute` | external | bytes32 disputeId |
| `appealDecision` | external | bytes32 disputeId |
| `getDispute` | external | bytes32 disputeId |
| `getEvidenceCount` | external | bytes32 disputeId |
| `getEvidence` | external | bytes32 disputeId, uint256 index |

## Events

| Event | Parameters |
|-------|------------|
| `DisputeOpened` | bytes32 indexed disputeId, bytes32 indexed escrowId, address indexed initiator, string reason, uint256 evidenceDeadline |
| `EvidenceSubmitted` | bytes32 indexed disputeId, address indexed submitter, bytes32 receiptHash, bytes32 mmrRoot |
| `DisputeResolved` | bytes32 indexed disputeId, address indexed resolvedInFavorOf, bool hasValidReceipt |
| `DisputeAppealed` | bytes32 indexed disputeId, address indexed appealedBy, uint256 newDeadline |
