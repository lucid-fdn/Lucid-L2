<!-- generated: commit aa1296b, 2026-03-18T20:27:23.159Z -->
# LucidEscrow — EVM Contract

> **Source:** `C:\Lucid-L2\contracts\src\LucidEscrow.sol`

## Purpose

> AI enrichment pending — run the pipeline with `DOCS_MODEL` set to populate this section.

## Architecture

> AI enrichment pending.

## Patterns & Gotchas

> AI enrichment pending.

## Functions

| Function | Visibility | Parameters |
|----------|------------|------------|
| `createEscrow` | external | address beneficiary, address token, uint256 amount, uint256 duration, bytes32 expectedReceiptHash |
| `releaseEscrow` | external | bytes32 escrowId, bytes32 receiptHash, bytes calldata receiptSignature, bytes32 signerPubkey |
| `claimTimeout` | external | bytes32 escrowId |
| `disputeEscrow` | external | bytes32 escrowId, string calldata reason |
| `resolveDispute` | external | bytes32 escrowId, address winner |
| `setArbitrationContract` | external | address _arbitrationContract |
| `getEscrow` | external | bytes32 escrowId |

## Events

| Event | Parameters |
|-------|------------|
| `EscrowCreated` | bytes32 indexed escrowId, address indexed depositor, address indexed beneficiary, address token, uint256 amount, uint256 expiresAt, bytes32 expectedReceiptHash |
| `EscrowReleased` | bytes32 indexed escrowId, address indexed beneficiary, uint256 amount, bytes32 receiptHash |
| `EscrowRefunded` | bytes32 indexed escrowId, address indexed depositor, uint256 amount |
| `EscrowDisputed` | bytes32 indexed escrowId, address indexed disputedBy, string reason |
