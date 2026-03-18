<!-- generated: commit aa1296b, 2026-03-18T20:27:23.167Z -->
# ZkMLVerifier — EVM Contract

> **Source:** `C:\Lucid-L2\contracts\src\ZkMLVerifier.sol`

## Purpose

> AI enrichment pending — run the pipeline with `DOCS_MODEL` set to populate this section.

## Architecture

> AI enrichment pending.

## Patterns & Gotchas

> AI enrichment pending.

## Functions

| Function | Visibility | Parameters |
|----------|------------|------------|
| `registerModel` | external | bytes32 modelHash, G1Point calldata alpha, G2Point calldata beta, G2Point calldata gamma, G2Point calldata delta, G1Point[] calldata ic |
| `verifyProof` | external | bytes32 modelHash, G1Point calldata a, G2Point calldata b, G1Point calldata c, uint256[] calldata publicInputs |
| `verifyBatch` | external | bytes32[] calldata modelHashes, Proof[] calldata proofs, uint256[][] calldata inputs |
| `isModelRegistered` | external | bytes32 modelHash |
| `getModelCount` | external | — |
| `getRegisteredModel` | external | uint256 index |
| `_negate` | internal | G1Point memory p |
| `_add` | internal | G1Point memory p1, G1Point memory p2 |
| `_scalarMul` | internal | G1Point memory p, uint256 s |
| `_pairing` | internal | G1Point memory a1, G2Point memory a2, G1Point memory b1, G2Point memory b2, G1Point memory c1, G2Point memory c2, G1Point memory d1, G2Point memory d2 |
| `_isModelInList` | internal | bytes32 modelHash |

## Events

| Event | Parameters |
|-------|------------|
| `ModelRegistered` | bytes32 indexed modelHash |
| `ProofVerified` | bytes32 indexed modelHash, bytes32 indexed receiptHash, bool valid |
