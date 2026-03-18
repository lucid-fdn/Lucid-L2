<!-- generated: commit aa1296b, 2026-03-18T20:27:23.166Z -->
# LucidValidator — EVM Contract

> **Source:** `C:\Lucid-L2\contracts\src\LucidValidator.sol`

## Purpose

> AI enrichment pending — run the pipeline with `DOCS_MODEL` set to populate this section.

## Architecture

> AI enrichment pending.

## Patterns & Gotchas

> AI enrichment pending.

## Functions

| Function | Visibility | Parameters |
|----------|------------|------------|
| `verifyReceiptHash` | external | bytes32 receiptHash, bytes calldata preimage |
| `validateReceipt` | external | bytes32 receiptHash, bytes calldata signature, bytes32 signerPubkey |
| `verifyMMRProof` | external | bytes32 leafHash, bytes32[] calldata siblings, bytes32[] calldata peaks, uint64 leafIndex, bytes32 expectedRoot |
| `submitValidation` | external | address validationRegistry, uint256 agentTokenId, bytes32 receiptHash, bool valid |
| `verifyZkMLProof` | external | address zkmlVerifier, bytes32 modelHash, uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[] calldata publicInputs |
| `_bagPeaks` | internal | bytes32[] calldata peaks |

## Events

| Event | Parameters |
|-------|------------|
| `ValidationSubmitted` | address indexed validationRegistry, uint256 indexed agentTokenId, bytes32 receiptHash, bool valid |
