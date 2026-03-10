# Chain Parity MVP Spec

**Date:** 2026-03-06
**Principle:** DB-canonical, chain-anchored. Same SDK call → same user outcome → chain-specific implementation hidden.
**Scope:** Functional parity (outcome-identical), not feature parity (instruction-identical).

---

## Design Rules

1. **No mocks, no stubs.** Every adapter method either executes a real transaction or throws a typed error. No `mock_${Date.now()}`, no `0x${funcName}_stub`.
2. **Capabilities derive from config.** If `ChainConfig.escrowContract` is set, escrow works. If not, it throws. No separate capability flags — the config IS the declaration.
3. **Domain sub-interfaces for type safety.** `IEpochAdapter`, `IEscrowAdapter`, `IPassportAdapter` enforce what each adapter must implement. Runtime dispatch is just config presence checks.
4. **Don't deploy useless contracts.** A passport anchor without enforcement (payment gating) adds nothing over epoch-based MMR inclusion proofs. If you deploy a contract, it must do something the offchain layer can't.
5. **Chain-specific is fine when the outcome is the same.** Solana uses PDA wallets + Anchor instructions. EVM uses TBA + contract calls. Different mechanism, same SDK surface.

---

## 1. Current State of Lies

### Solana Adapter — 5 mocks returning fake data

| Method | Today | Fix |
|--------|-------|-----|
| `createAgentWallet()` | `mock_${Date.now()}` | Anchor tx → `lucid-agent-wallet.create_wallet` |
| `setPolicy()` | Logs, returns mock | Anchor tx → `lucid-agent-wallet.set_policy` |
| `createEscrow()` | Mock PDA string | Anchor tx → `lucid-agent-wallet.create_escrow` |
| `releaseEscrow()` | Mock string | Anchor tx → `lucid-agent-wallet.release_escrow` |
| `submitValidation/Reputation()` | Ephemeral `Map<>` (lost on restart) | Persist to Supabase (tech debt: EVM has on-chain registries, Solana doesn't) |

### EVM Adapter — stub calldata that never executes

| Method | Today | Fix |
|--------|-------|-----|
| `escrowService.encodeFunctionCall()` | Returns `0x${funcName}_stub` | `viem.encodeFunctionData()` — ABI already exists at `escrowService.ts:11-90` |
| `disputeService.*` | All stub calldata | `viem.encodeFunctionData()` with `LucidArbitration` ABI |
| `payoutService.executePayoutSplit()` | Missing error handling | Gas estimation + retry + receipt parsing |
| `anchoringService` | Solana-only | Add EVM path → `EpochRegistry.commitEpoch()` |

### Missing EVM Contracts

| Gap | Why it matters |
|-----|---------------|
| No passport contract on EVM | Can't verify OR gate AI assets on EVM chains |
| `EpochRegistry` never called by backend | Deployed but dead — epochs only anchor to Solana |
| No `commitEpochBatch()` on EVM | Multi-chain anchoring will cost 16x more gas than necessary |

---

## 2. Contracts to Write

### 2a. LucidPassportRegistry.sol — Anchor + Payment Gate (one contract)

A passport anchor without enforcement adds nothing over what epoch roots already provide.
Payment gating IS the reason to put passports on-chain. Ship them together or don't ship.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract LucidPassportRegistry is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Passport Anchor ---

    struct Anchor {
        bytes32 contentHash;     // sha256(canonical passport metadata)
        address owner;
        uint8   status;          // 0=Active 1=Deprecated 2=Superseded 3=Revoked
        uint64  createdAt;
        uint64  updatedAt;
    }

    mapping(bytes32 => Anchor) public anchors;            // passportId => Anchor
    mapping(address => bool)   public authorizedSyncers;  // backend service keys

    event PassportAnchored(bytes32 indexed passportId, bytes32 contentHash, address indexed owner);
    event PassportStatusUpdated(bytes32 indexed passportId, uint8 oldStatus, uint8 newStatus);

    modifier onlySyncer() {
        require(authorizedSyncers[msg.sender] || msg.sender == owner(), "not authorized");
        _;
    }

    function setSyncer(address syncer, bool authorized) external onlyOwner;
    function anchorPassport(bytes32 passportId, bytes32 contentHash, address passportOwner) external onlySyncer;
    function updateStatus(bytes32 passportId, uint8 newStatus) external onlySyncer;
    function verifyAnchor(bytes32 passportId, bytes32 contentHash) external view returns (bool);

    // --- Payment Gate ---

    struct Gate {
        address gateOwner;
        uint256 priceNative;       // wei
        uint256 priceLucid;        // 9 decimals
        uint256 totalRevenue;
        uint64  totalAccesses;
        bool    enabled;
    }

    IERC20  public immutable lucidToken;
    mapping(bytes32 => Gate) public gates;
    mapping(bytes32 => mapping(address => uint64)) public accessExpiry;   // passportId => payer => expiresAt

    event GateSet(bytes32 indexed passportId, uint256 priceNative, uint256 priceLucid);
    event AccessPurchased(bytes32 indexed passportId, address indexed payer, uint64 expiresAt, uint256 paid);
    event RevenueWithdrawn(bytes32 indexed passportId, address indexed to, uint256 amount);
    event AccessRevoked(bytes32 indexed passportId, address indexed user);

    function setGate(bytes32 passportId, uint256 priceNative, uint256 priceLucid) external;
    function payForAccess(bytes32 passportId, uint64 duration) external payable nonReentrant;
    function payForAccessLucid(bytes32 passportId, uint64 duration) external nonReentrant;
    function checkAccess(bytes32 passportId, address user) external view returns (bool);
    function withdrawRevenue(bytes32 passportId) external nonReentrant;
    function revokeAccess(bytes32 passportId, address user) external;
}
```

**10 external functions.** One contract. Anchor + enforcement together.
Skip attestations and version linking until a partner asks.

### 2b. EpochRegistry.sol — Add batch commit

One function added to the existing deployed contract:

```solidity
function commitEpochBatch(
    bytes32[] calldata agentIds,
    bytes32[] calldata mmrRoots,
    uint64[]  calldata epochIds,
    uint64[]  calldata leafCounts,
    uint64[]  calldata mmrSizes
) external onlyAuthorized {
    require(agentIds.length <= 16 && agentIds.length == mmrRoots.length, "invalid batch");
    for (uint256 i = 0; i < agentIds.length; i++) {
        _commitEpoch(agentIds[i], mmrRoots[i], epochIds[i], leafCounts[i], mmrSizes[i]);
    }
}
```

Multi-chain anchoring = paying EVM gas per epoch. At 1 epoch/hour = 720 tx/month.
Batch reduces that up to 16x. Not premature optimization — basic gas hygiene.

---

## 3. Adapter Domain Interfaces

Type-safe contracts between services and chain implementations. No capability flags —
the adapter either implements the interface or the config field is absent and the service throws.

```typescript
// --- IPassportAdapter ---
// Implemented by: SolanaAdapter (wraps lucid-passports PDA), EVMAdapter (wraps LucidPassportRegistry)

interface IPassportAdapter {
  anchorPassport(passportId: string, contentHash: string, owner: string): Promise<TxReceipt>;
  updatePassportStatus(passportId: string, status: number): Promise<TxReceipt>;
  verifyAnchor(passportId: string, contentHash: string): Promise<boolean>;
  setPaymentGate(passportId: string, priceNative: bigint, priceLucid: bigint): Promise<TxReceipt>;
  payForAccess(passportId: string, duration: number): Promise<TxReceipt>;
  checkAccess(passportId: string, user: string): Promise<boolean>;
  withdrawRevenue(passportId: string): Promise<TxReceipt>;
}

// --- IEpochAdapter ---
// Implemented by: SolanaAdapter (wraps thought-epoch), EVMAdapter (wraps EpochRegistry)

interface IEpochAdapter {
  commitEpoch(agentId: string, root: string, epochId: number, leafCount: number, mmrSize: number): Promise<TxReceipt>;
  commitEpochBatch(epochs: { agentId: string; root: string; epochId: number; leafCount: number; mmrSize: number }[]): Promise<TxReceipt>;
  verifyEpoch(agentId: string, epochId: number, expectedRoot: string): Promise<boolean>;
}

// --- IEscrowAdapter ---
// Implemented by: SolanaAdapter (wraps lucid-agent-wallet escrow ix), EVMAdapter (wraps LucidEscrow)

interface IEscrowAdapter {
  createEscrow(params: {
    beneficiary: string;
    token: string;
    amount: bigint;
    durationSeconds: number;
    expectedReceiptHash: string;
  }): Promise<{ escrowId: string; tx: TxReceipt }>;
  releaseEscrow(escrowId: string, receiptHash: string, signature: string): Promise<TxReceipt>;
  claimTimeout(escrowId: string): Promise<TxReceipt>;
  disputeEscrow(escrowId: string, reason: string): Promise<TxReceipt>;
}

// --- IAgentWalletAdapter ---
// Implemented by: SolanaAdapter (PDA wallet + policy + session), EVMAdapter (TBA + session module)
// Different mechanism, same outcome: "agent can execute within policy bounds via delegated session"

interface IAgentWalletAdapter {
  createWallet(passportRef: string): Promise<{ walletAddress: string; tx: TxReceipt }>;
  execute(walletAddress: string, instruction: { to: string; data: string }): Promise<TxReceipt>;
  setPolicy(walletAddress: string, policy: {
    maxPerTx: bigint;
    dailyLimit: bigint;
    allowedTargets: string[];     // program IDs (Solana) or contract addresses (EVM)
    timeWindowStart: number;
    timeWindowEnd: number;
  }): Promise<TxReceipt>;
  createSession(walletAddress: string, delegate: string, permissions: number, expiresAt: number, maxAmount: bigint): Promise<TxReceipt>;
  revokeSession(walletAddress: string, delegate: string): Promise<TxReceipt>;
}

// --- IGasAdapter ---
// Implemented by: SolanaAdapter ONLY. EVM uses native gas + LucidPaymaster.
// Not a parity gap — different economic model, same outcome (user pays for inference).

interface IGasAdapter {
  collectAndSplit(iGas: bigint, mGas: bigint, recipients: { address: string; bps: number }[], burnBps: number): Promise<TxReceipt>;
}
```

### Access Pattern

```typescript
// Services get typed adapters from the factory
const adapter = await blockchainAdapterFactory.getAdapter(chainId);

// Typed domain access — throws if chain doesn't have the contract
const passports = adapter.passports();  // throws if !config.passportRegistry
const epochs    = adapter.epochs();     // throws if !config.epochRegistry && !config.thoughtEpochProgram
const escrow    = adapter.escrow();     // throws if !config.escrowContract && !config.agentWalletProgram

// Optional domain — returns undefined instead of throwing
const gas = adapter.gas?.();            // only Solana has this
const wallet = adapter.agentWallet?.(); // Solana PDA or EVM TBA, undefined if neither configured

// SDK surface is identical regardless of chain
await passports.anchorPassport(id, hash, owner);
await epochs.commitEpoch(agentId, root, epochId, leafCount, mmrSize);
await escrow.createEscrow({ beneficiary, token, amount, durationSeconds, expectedReceiptHash });
```

No capability booleans. No `asEscrow()`. Config presence = capability. Type system does the rest.

---

## 4. Service → Adapter Wiring

| Service | Uses | Solana impl | EVM impl |
|---------|------|-------------|----------|
| `passportSyncService` | `IPassportAdapter` | Existing PDA sync (wrap) | **NEW**: `LucidPassportRegistry.anchorPassport()` |
| `paymentGateService` | `IPassportAdapter` | Existing Anchor calls | **NEW**: `LucidPassportRegistry.setGate/pay/withdraw` |
| `anchoringService` | `IEpochAdapter` | Existing (working) | **NEW**: `EpochRegistry.commitEpoch()` / `commitEpochBatch()` |
| `escrowService` | `IEscrowAdapter` | **FIX**: real Anchor tx | **FIX**: real viem ABI encoding |
| `disputeService` | `IEscrowAdapter.disputeEscrow` | **FIX**: real Anchor tx | **FIX**: real viem ABI encoding |
| `payoutService` | `IGasAdapter` | **FIX**: real gas-utils tx | N/A (EVM = native transfers) |

---

## 5. Unified Anchoring

### Current: Solana-only

`anchoringService.ts` → `commitEpochRoot()` → Solana `thought-epoch` program.

### Target: Multi-chain

```
ANCHORING_CHAINS=solana-devnet                # default (backward compat)
ANCHORING_CHAINS=solana-devnet,base-sepolia   # same root → both chains
ANCHORING_CHAINS=base-sepolia                 # EVM-only mode
```

1. `commitEpochRoot()` reads `ANCHORING_CHAINS`, splits on comma
2. For each chain, calls `adapter.epochs().commitEpoch()` with same root/metadata
3. Epoch record `chain_tx` changes from `string` to `Record<string, string>` (chain → txHash)
4. Status = `anchored` when >= 1 chain succeeds
5. Failed chains logged + retried next cycle

---

## 6. What Gets Skipped (and Why)

| Feature | Decision | Reason |
|---------|----------|--------|
| Solana arbitration program | **Skip** | `LucidArbitration.sol` isn't even working (adapter is all stubs). Fix EVM stubs first, then evaluate. |
| EVM attestations | **Skip** | No partner has asked. Solana has it, EVM doesn't need it yet. |
| EVM version linking | **Skip** | Same — no partner demand. |
| Bloom filter dedup on EVM | **Skip** | Not core. |
| zkML adapter methods | **Skip** | PoER ≠ correctness proof. Keep contracts deployed, remove adapter method. |
| ERC-4337 Paymaster parity | **N/A** | EVM-only by design. Solana doesn't need account abstraction. |
| ERC-7579 Module parity | **N/A** | EVM-only by design. Solana uses program instructions. |
| Frontend EVM wallet | **Out of scope** | Separate workstream. |

---

## 7. Phased Delivery

### Phase A — Adapter Honesty

**Goal:** Zero mocks. Every method does real work or throws a typed error.

| # | Task | Files |
|---|------|-------|
| A1 | Define `IEpochAdapter`, `IEscrowAdapter`, `IPassportAdapter`, `IAgentWalletAdapter`, `IGasAdapter` | `chains/domain-interfaces.ts` (new) |
| A2 | Add `passports()`, `epochs()`, `escrow()`, `agentWallet()`, `gas()` to `IBlockchainAdapter` | `chains/adapter-interface.ts` |
| A3 | Solana: wire `createAgentWallet` → real `create_wallet` Anchor ix (pattern: copy `anchoringService` instruction builder) | `chains/solana/adapter.ts` |
| A4 | Solana: wire `setPolicy` → real `set_policy` Anchor ix | `chains/solana/adapter.ts` |
| A5 | Solana: wire `createEscrow`, `releaseEscrow` → real Anchor ix | `chains/solana/adapter.ts` |
| A6 | Solana: persist validation/reputation to Supabase instead of ephemeral Map | `chains/solana/adapter.ts`, new migration |
| A7 | EVM: replace `encodeFunctionCall()` stub with `viem.encodeFunctionData()` | `finance/escrowService.ts` (line 387-399) |
| A8 | EVM: wire `disputeService` to real `LucidArbitration` ABI | `finance/disputeService.ts` |
| A9 | EVM: complete `payoutService.executePayoutSplit()` with gas estimation + error handling | `finance/payoutService.ts` |
| A10 | Remove `verifyZkMLProof()` from both adapters | `chains/solana/adapter.ts`, `chains/evm/EVMAdapter.ts` |

### Phase B — Unified Anchoring + Batch Epoch

**Goal:** Epoch roots anchor to both Solana and EVM. EVM batch commit for gas efficiency.

| # | Task | Files |
|---|------|-------|
| B1 | Add `commitEpochBatch()` to `EpochRegistry.sol` | `contracts/src/EpochRegistry.sol` |
| B2 | Deploy updated EpochRegistry to testnets | `contracts/scripts/deploy-epoch-registry.ts` |
| B3 | Implement `IEpochAdapter` on EVMAdapter (calls `commitEpoch` / `commitEpochBatch`) | `chains/evm/EVMAdapter.ts` |
| B4 | Implement `IEpochAdapter` on SolanaAdapter (wraps existing instruction builders) | `chains/solana/adapter.ts` |
| B5 | Refactor `anchoringService.commitEpochRoot()` → multi-chain loop via `ANCHORING_CHAINS` | `receipt/anchoringService.ts` |
| B6 | Change `chain_tx` from `string` to `Record<string, string>` in epoch schema | `receipt/epochService.ts`, migration |

### Phase C — Passport Registry on EVM

**Goal:** Global passport ID anchored on EVM with payment gating.

| # | Task | Files |
|---|------|-------|
| C1 | Write `LucidPassportRegistry.sol` (anchor + payment gate, ~150 lines) | `contracts/src/LucidPassportRegistry.sol` |
| C2 | Write tests | `contracts/test/LucidPassportRegistry.test.ts` |
| C3 | Deploy to testnets (base-sepolia, ethereum-sepolia, apechain-testnet) | `contracts/scripts/deploy-passport-registry.ts` |
| C4 | Add `passportRegistry` to `ChainConfig` + update configs | `chains/types.ts`, `chains/configs.ts` |
| C5 | Implement `IPassportAdapter` on EVMAdapter | `chains/evm/EVMAdapter.ts` |
| C6 | Implement `IPassportAdapter` on SolanaAdapter (wraps existing `lucid-passports`) | `chains/solana/adapter.ts` |
| C7 | Extend `passportSyncService` → multi-chain sync via `PASSPORT_SYNC_CHAINS` | `passport/passportSyncService.ts` |
| C8 | Wire `paymentGateService` to use `IPassportAdapter` for both chains | `finance/paymentGateService.ts` |

### Phase D — Agent Wallet Outcome Parity

**Goal:** "Agent can execute within policy bounds via delegated session" on both chains.

| # | Task | Files |
|---|------|-------|
| D1 | Write `LucidSessionKeys.sol` (or extend TBA) for EVM session delegation | `contracts/src/LucidSessionKeys.sol` |
| D2 | Implement `IAgentWalletAdapter` on EVMAdapter (TBA execute + session module) | `chains/evm/EVMAdapter.ts` |
| D3 | Implement `IAgentWalletAdapter` on SolanaAdapter (wraps agent-wallet program) | `chains/solana/adapter.ts` |

---

## 8. Success Criteria

After Phase C, these work identically on any chain:

```typescript
// Passport: create in DB, anchor on-chain, gate access
const passport = await sdk.passports.create({ type: 'model', slug: 'llama-3' });
await sdk.passports.anchor(passport.id, { chain: 'base-sepolia' });
await sdk.passports.setGate(passport.id, { priceNative: '0.001', chain: 'base-sepolia' });
await sdk.passports.payForAccess(passport.id, { duration: 86400, chain: 'base-sepolia' });

// Epoch: anchored to multiple chains automatically
// (backend handles via ANCHORING_CHAINS — SDK doesn't need to know)

// Escrow: same interface, different chain
await sdk.escrow.create({ chain: 'solana-devnet', beneficiary, token, amount, duration, receiptHash });
await sdk.escrow.create({ chain: 'base-sepolia', beneficiary, token, amount, duration, receiptHash });

// Unsupported feature: clear error, not a mock
await sdk.gas.collectAndSplit({ chain: 'base-sepolia', ... });
// → Error: 'gas.collectAndSplit not available on base-sepolia — EVM uses native gas via LucidPaymaster'
```

**The SDK is complete, simple, and honest.** Every method works or tells you why it doesn't.
