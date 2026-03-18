<!-- generated: commit aa1296b, 2026-03-18T20:27:23.162Z -->
# LucidPaymaster — EVM Contract

> **Source:** `C:\Lucid-L2\contracts\src\LucidPaymaster.sol`

## Purpose

> AI enrichment pending — run the pipeline with `DOCS_MODEL` set to populate this section.

## Architecture

> AI enrichment pending.

## Patterns & Gotchas

> AI enrichment pending.

## Functions

| Function | Visibility | Parameters |
|----------|------------|------------|
| `depositTo` | external | address account |
| `withdrawTo` | external | address payable withdrawAddress, uint256 withdrawAmount |
| `balanceOf` | external | address account |
| `validatePaymasterUserOp` | external | PackedUserOperation calldata userOp, bytes32 , uint256 maxCost |
| `postOp` | external | uint8 mode, bytes calldata context, uint256 actualGasCost, uint256 |
| `setExchangeRate` | external | uint256 newRate |
| `setMaxCost` | external | uint256 newMax |
| `deposit` | external | — |
| `withdrawLucid` | external | uint256 amount |
| `withdrawEth` | external | uint256 amount |
| `getDeposit` | external | — |
| `estimateLucidCost` | external | uint256 ethCost |

## Events

| Event | Parameters |
|-------|------------|
| `ExchangeRateUpdated` | uint256 oldRate, uint256 newRate |
| `MaxCostUpdated` | uint256 oldMax, uint256 newMax |
| `GasSponsored` | address indexed sender, uint256 lucidCharged, uint256 ethCost |
| `Deposited` | address indexed from, uint256 amount |
| `LucidWithdrawn` | address indexed to, uint256 amount |
| `EthWithdrawn` | address indexed to, uint256 amount |
