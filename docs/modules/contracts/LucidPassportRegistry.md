<!-- generated: commit aa1296b, 2026-03-18T20:27:23.161Z -->
# LucidPassportRegistry — EVM Contract

> **Source:** `C:\Lucid-L2\contracts\src\LucidPassportRegistry.sol`

## Purpose

> AI enrichment pending — run the pipeline with `DOCS_MODEL` set to populate this section.

## Architecture

> AI enrichment pending.

## Patterns & Gotchas

> AI enrichment pending.

## Functions

| Function | Visibility | Parameters |
|----------|------------|------------|
| `setSyncer` | external | address syncer, bool authorized |
| `anchorPassport` | external | bytes32 passportId, bytes32 contentHash, address passportOwner |
| `updateStatus` | external | bytes32 passportId, uint8 newStatus |
| `verifyAnchor` | external | bytes32 passportId, bytes32 contentHash |
| `setGate` | external | bytes32 passportId, uint256 priceNative, uint256 priceLucid |
| `payForAccess` | external | bytes32 passportId, uint64 duration |
| `payForAccessLucid` | external | bytes32 passportId, uint64 duration |
| `checkAccess` | external | bytes32 passportId, address user |
| `withdrawRevenue` | external | bytes32 passportId |
| `revokeAccess` | external | bytes32 passportId, address user |

## Events

| Event | Parameters |
|-------|------------|
| `PassportAnchored` | bytes32 indexed passportId, bytes32 contentHash, address indexed owner |
| `PassportStatusUpdated` | bytes32 indexed passportId, uint8 oldStatus, uint8 newStatus |
| `SyncerUpdated` | address indexed syncer, bool authorized |
| `GateSet` | bytes32 indexed passportId, uint256 priceNative, uint256 priceLucid |
| `AccessPurchased` | bytes32 indexed passportId, address indexed payer, uint64 expiresAt, uint256 paid |
| `RevenueWithdrawn` | bytes32 indexed passportId, address indexed to, uint256 amountNative, uint256 amountLucid |
| `AccessRevoked` | bytes32 indexed passportId, address indexed user |
