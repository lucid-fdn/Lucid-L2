<!-- generated: commit aa1296b, 2026-03-18T20:27:23.164Z -->
# LucidSessionManager — EVM Contract

> **Source:** `C:\Lucid-L2\contracts\src\LucidSessionManager.sol`

## Purpose

> AI enrichment pending — run the pipeline with `DOCS_MODEL` set to populate this section.

## Architecture

> AI enrichment pending.

## Patterns & Gotchas

> AI enrichment pending.

## Functions

| Function | Visibility | Parameters |
|----------|------------|------------|
| `createSession` | external | address delegate, uint256 permissions, uint256 expiresAt, uint256 maxAmount |
| `revokeSession` | external | address delegate |
| `useSession` | external | address wallet, uint256 amount |
| `isSessionValid` | external | address wallet, address delegate |
| `getSession` | external | address wallet, address delegate |

## Events

| Event | Parameters |
|-------|------------|
| `SessionCreated` | address indexed wallet, address indexed delegate, uint256 permissions, uint256 expiresAt, uint256 maxAmount |
| `SessionRevoked` | address indexed wallet, address indexed delegate |
| `SessionUsed` | address indexed wallet, address indexed delegate, uint256 amount, uint256 totalUsed |
