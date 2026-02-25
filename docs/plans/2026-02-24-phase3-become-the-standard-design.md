# Phase 3: "Become the Standard" — Design Document

**Date**: 2026-02-24
**Scope**: Weeks 15-20
**Goal**: Lucid becomes the "Chainlink of AI agents" — critical infrastructure the ecosystem can't do without.

---

## Overview

Phase 3 adds 5 deliverables that transform Lucid from a useful service into **indispensable infrastructure**:

1. **D1: Agent Insurance/Escrow Protocol** — Time-locked escrow for high-stakes agent transactions
2. **D2: Automated Dispute Resolution** — On-chain arbitration when escrows are contested
3. **D3: ERC-4337 Paymaster** — Agents pay gas in $LUCID instead of ETH
4. **D4: ERC-7579 Modules** — Policy, Payout, and Receipt modules for smart accounts
5. **D5: zkML Proof Integration** — Cryptographic inference verification on receipts

**Implementation order**: D1 → D2 → D3 + D4 (parallel) → D5

**Constraint**: All 364 existing tests must continue passing.

---

## D1: Agent Insurance/Escrow Protocol

### Purpose
Enable high-stakes agent-to-agent transactions by holding funds in escrow until work is verified via receipt. Currently, payouts happen immediately with no recourse — escrow adds a trust layer.

### On-Chain: `contracts/src/LucidEscrow.sol`

```solidity
// State per escrow
struct Escrow {
    bytes32 escrowId;
    address depositor;          // Agent requesting work
    address beneficiary;        // Agent performing work
    address token;              // $LUCID or USDC address
    uint256 amount;
    uint256 createdAt;
    uint256 expiresAt;          // Auto-refund deadline
    bytes32 expectedReceiptHash; // Optional: specific receipt required
    EscrowStatus status;        // Created, Released, Refunded, Disputed
}

// Core functions
function createEscrow(address beneficiary, address token, uint256 amount, uint256 duration, bytes32 expectedReceiptHash) external returns (bytes32 escrowId);
function releaseEscrow(bytes32 escrowId, bytes32 receiptHash, bytes calldata receiptSignature, bytes32 signerPubkey) external;
function claimTimeout(bytes32 escrowId) external;
function disputeEscrow(bytes32 escrowId, string calldata reason) external;
function getEscrow(bytes32 escrowId) external view returns (Escrow memory);

// Events
event EscrowCreated(bytes32 indexed escrowId, address indexed depositor, address indexed beneficiary, uint256 amount);
event EscrowReleased(bytes32 indexed escrowId, bytes32 receiptHash);
event EscrowRefunded(bytes32 indexed escrowId);
event EscrowDisputed(bytes32 indexed escrowId, address indexed disputer);
```

**Release logic**: Calls `LucidValidator.validateReceipt()` to verify the receipt before releasing funds. If `expectedReceiptHash` is set, the submitted receipt must match.

**Timeout**: After `expiresAt`, depositor can call `claimTimeout()` for full refund (unless disputed).

### Off-Chain

| File | Purpose |
|------|---------|
| `offchain/src/services/escrowService.ts` | Singleton service: `createEscrow()`, `releaseWithReceipt()`, `checkTimeout()`, `getEscrow()`, `listEscrows()` |
| `offchain/src/services/escrowTypes.ts` | TypeScript interfaces mirroring on-chain structs |
| `offchain/src/routes/escrowRoutes.ts` | `POST /v2/escrow/create`, `POST /v2/escrow/release`, `POST /v2/escrow/dispute`, `GET /v2/escrow/:escrowId` |
| `offchain/src/__tests__/escrowService.test.ts` | Unit tests |
| `contracts/test/LucidEscrow.test.ts` | Hardhat tests |

### Modified Files

| File | Change |
|------|--------|
| `offchain/src/blockchain/types.ts` | Add `escrowContract?: string` to `ChainConfig` |
| `offchain/src/blockchain/chains.ts` | Add escrow addresses to chain configs |
| `offchain/src/index.ts` | Mount escrow routes |

---

## D2: Automated Dispute Resolution

### Purpose
When an escrow is disputed, provide a structured resolution process: evidence submission → automated ruling → optional appeal. Reuses `LucidValidator` for evidence verification.

### On-Chain: `contracts/src/LucidArbitration.sol`

```solidity
struct Dispute {
    bytes32 disputeId;
    bytes32 escrowId;           // Link to LucidEscrow
    address claimant;           // Who opened the dispute
    address respondent;
    DisputeStatus status;       // Open, EvidencePhase, Resolved, Appealed
    uint256 createdAt;
    uint256 evidenceDeadline;   // End of evidence submission window
    bytes32 ruling;             // Final ruling hash
    address resolver;           // Who resolved (automated or arbiter)
}

struct Evidence {
    address submitter;
    bytes32 receiptHash;        // Receipt proving work was done
    bytes32 mmrRoot;            // MMR root for proof-of-contribution
    bytes mmrProof;             // Encoded MMR siblings
    string description;
    uint256 submittedAt;
}

// Core functions
function openDispute(bytes32 escrowId, string calldata reason) external returns (bytes32 disputeId);
function submitEvidence(bytes32 disputeId, Evidence calldata evidence) external;
function resolveDispute(bytes32 disputeId) external;  // Automated: verify receipts via LucidValidator
function appealDecision(bytes32 disputeId) external payable;  // Requires stake
function getDispute(bytes32 disputeId) external view returns (Dispute memory);

// Events
event DisputeOpened(bytes32 indexed disputeId, bytes32 indexed escrowId, address indexed claimant);
event EvidenceSubmitted(bytes32 indexed disputeId, address indexed submitter, bytes32 receiptHash);
event DisputeResolved(bytes32 indexed disputeId, address winner, bytes32 ruling);
event DisputeAppealed(bytes32 indexed disputeId, address indexed appellant);
```

**Resolution logic**:
1. **Automated phase**: If beneficiary submits a valid receipt (verified by `LucidValidator`), funds release to beneficiary. If no valid receipt within evidence deadline, funds return to depositor.
2. **Appeal phase**: Either party can appeal by staking $LUCID. Appeals are resolved by checking additional evidence (more receipts, MMR proofs for contribution volume).

### Off-Chain

| File | Purpose |
|------|---------|
| `offchain/src/services/disputeService.ts` | `openDispute()`, `submitEvidence()`, `resolveDispute()`, `getDispute()`, `listDisputes()` |
| `offchain/src/services/disputeTypes.ts` | TypeScript types |
| `offchain/src/routes/disputeRoutes.ts` | `POST /v2/disputes/open`, `POST /v2/disputes/:id/evidence`, `POST /v2/disputes/:id/resolve`, `GET /v2/disputes/:id` |
| `offchain/src/__tests__/disputeService.test.ts` | Unit tests |
| `contracts/test/LucidArbitration.test.ts` | Hardhat tests |

### Modified Files

| File | Change |
|------|--------|
| `contracts/src/LucidEscrow.sol` | Add `setArbitrationContract()` for bidirectional linking |
| `offchain/src/blockchain/types.ts` | Add `arbitrationContract?: string` to `ChainConfig` |
| `offchain/src/blockchain/chains.ts` | Add arbitration addresses |
| `offchain/src/index.ts` | Mount dispute routes |

---

## D3: ERC-4337 Paymaster ($LUCID as Gas)

### Purpose
Enable agents to pay gas fees in $LUCID instead of ETH. The paymaster sponsors UserOps and deducts $LUCID from the agent's TBA at an oracle exchange rate. Directly extends Phase 2's ERC-6551 TBA work.

### On-Chain: `contracts/src/LucidPaymaster.sol`

```solidity
// Inherits OpenZeppelin's BasePaymaster (ERC-4337 v0.7)
contract LucidPaymaster is BasePaymaster {
    IERC20 public lucidToken;
    IEntryPoint public entryPoint;
    uint256 public lucidPerEth;         // Exchange rate (fixed for MVP, oracle later)
    uint256 public maxCostLucid;        // Max gas cost in $LUCID per UserOp

    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal override returns (bytes memory context, uint256 validationData);

    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) internal override;

    // Admin
    function setExchangeRate(uint256 newRate) external onlyOwner;
    function setMaxCost(uint256 newMax) external onlyOwner;
    function deposit() external payable;  // Fund the paymaster with ETH
    function withdrawLucid(uint256 amount) external onlyOwner;
}
```

**Flow**:
1. Agent builds a UserOp with `paymasterAndData` pointing to `LucidPaymaster`
2. Paymaster validates: checks agent's $LUCID allowance >= estimated cost
3. EntryPoint executes the UserOp, paymaster pays ETH gas
4. PostOp: paymaster deducts $LUCID from agent via `transferFrom()`

### Off-Chain

| File | Purpose |
|------|---------|
| `offchain/src/services/paymasterService.ts` | `buildUserOp()`, `estimateGasInLucid()`, `submitUserOp()`, `getExchangeRate()` |
| `offchain/src/services/paymasterTypes.ts` | UserOp types, PaymasterConfig |
| `offchain/src/routes/paymasterRoutes.ts` | `POST /v2/paymaster/sponsor`, `GET /v2/paymaster/rate`, `POST /v2/paymaster/estimate` |
| `offchain/src/__tests__/paymasterService.test.ts` | Unit tests |
| `contracts/test/LucidPaymaster.test.ts` | Hardhat tests |

### Modified Files

| File | Change |
|------|--------|
| `offchain/src/blockchain/types.ts` | Add `entryPoint?: string`, `paymaster?: string` to `ChainConfig` |
| `offchain/src/blockchain/chains.ts` | Add EntryPoint v0.7 and paymaster addresses |
| `offchain/src/blockchain/evm/EVMAdapter.ts` | Add `sendUserOp()` method for ERC-4337 submission |
| `offchain/src/index.ts` | Mount paymaster routes |
| `contracts/package.json` | Add `@account-abstraction/contracts` dependency |

---

## D4: ERC-7579 Modules (Policy, Payout, Receipt)

### Purpose
Three installable smart account modules following ERC-7579. Any ERC-7579-compatible wallet (Safe, Kernel, Biconomy) can install these to get Lucid capabilities natively.

### On-Chain: Three Modules

#### `contracts/src/modules/LucidPolicyModule.sol`

```solidity
// Validator module: checks transactions against Lucid policies before execution
contract LucidPolicyModule is IModule {
    // Module type: Validator (type 1)
    function onInstall(bytes calldata data) external;  // Configure allowed policies
    function onUninstall(bytes calldata data) external;
    function isValidSignatureWithSender(address sender, bytes32 hash, bytes calldata sig) external view returns (bytes4);
    function validateUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash) external returns (uint256);

    // Policy enforcement
    function setPolicy(bytes32 policyHash, bool allowed) external;
    function isPolicyAllowed(bytes32 policyHash) external view returns (bool);
}
```

#### `contracts/src/modules/LucidPayoutModule.sol`

```solidity
// Executor module: auto-splits incoming payments
contract LucidPayoutModule is IModule {
    // Module type: Executor (type 2)
    struct SplitConfig {
        address[] recipients;
        uint16[] basisPoints;    // Must sum to 10000
    }

    function onInstall(bytes calldata data) external;  // Configure split
    function onUninstall(bytes calldata data) external;
    function execute(address token, uint256 amount) external;  // Split and distribute
    function setSplit(SplitConfig calldata config) external;
    function getSplit(address account) external view returns (SplitConfig memory);
}
```

#### `contracts/src/modules/LucidReceiptModule.sol`

```solidity
// Executor module: emits structured receipt events
contract LucidReceiptModule is IModule {
    event ReceiptEmitted(
        address indexed account,
        bytes32 indexed receiptHash,
        bytes32 policyHash,
        string modelPassportId,
        string computePassportId,
        uint256 tokensIn,
        uint256 tokensOut,
        uint256 timestamp
    );

    function onInstall(bytes calldata data) external;
    function onUninstall(bytes calldata data) external;
    function emitReceipt(bytes calldata receiptData) external;
}
```

### Shared Interface

```solidity
// contracts/src/modules/IModule.sol
interface IModule {
    function onInstall(bytes calldata data) external;
    function onUninstall(bytes calldata data) external;
    function isModuleType(uint256 moduleTypeId) external view returns (bool);
}
```

### Off-Chain

| File | Purpose |
|------|---------|
| `offchain/src/services/erc7579Service.ts` | `installModule()`, `uninstallModule()`, `listInstalledModules()`, `configurePolicyModule()`, `configurePayoutModule()` |
| `offchain/src/services/erc7579Types.ts` | Module types, installation params |
| `offchain/src/routes/erc7579Routes.ts` | `POST /v2/modules/install`, `POST /v2/modules/uninstall`, `GET /v2/modules/:account`, `POST /v2/modules/policy/configure`, `POST /v2/modules/payout/configure` |
| `offchain/src/__tests__/erc7579Service.test.ts` | Unit tests |
| `contracts/test/LucidModules.test.ts` | Hardhat tests for all 3 modules |

### Modified Files

| File | Change |
|------|--------|
| `offchain/src/blockchain/types.ts` | Add `modules?: { policy?, payout?, receipt? }` to `ChainConfig` |
| `offchain/src/blockchain/chains.ts` | Add module addresses |
| `offchain/src/index.ts` | Mount module routes |

---

## D5: zkML Proof Integration for Receipts

### Purpose
Attach cryptographic proofs to receipts that prove a specific model produced a specific output without revealing inputs. Uses EZKL framework for proof generation and a Groth16 verifier on-chain.

### On-Chain: `contracts/src/ZkMLVerifier.sol`

```solidity
contract ZkMLVerifier {
    // Groth16 verification key (set per model circuit)
    struct VerifyingKey {
        uint256[2] alpha;
        uint256[2][2] beta;
        uint256[2][2] gamma;
        uint256[2][2] delta;
        uint256[2][] ic;
    }

    mapping(bytes32 => VerifyingKey) public modelVerifyingKeys;  // modelHash -> VK

    function registerModel(bytes32 modelHash, VerifyingKey calldata vk) external onlyOwner;
    function verifyProof(
        bytes32 modelHash,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata publicInputs   // [outputHash, modelHash, policyHash]
    ) external view returns (bool);

    // Batch verification for receipt batches
    function verifyBatch(bytes32[] calldata modelHashes, bytes[] calldata proofs, uint256[][] calldata inputs) external view returns (bool[] memory);

    event ModelRegistered(bytes32 indexed modelHash);
    event ProofVerified(bytes32 indexed modelHash, bytes32 indexed receiptHash, bool valid);
}
```

### Off-Chain

| File | Purpose |
|------|---------|
| `offchain/src/services/zkmlService.ts` | `generateProof()`, `verifyProofOffchain()`, `verifyProofOnchain()`, `registerModelCircuit()` |
| `offchain/src/services/zkmlTypes.ts` | Proof types, circuit metadata, verification key format |
| `offchain/src/routes/zkmlRoutes.ts` | `POST /v2/zkml/prove`, `POST /v2/zkml/verify`, `POST /v2/zkml/register-model`, `GET /v2/zkml/models` |
| `offchain/src/__tests__/zkmlService.test.ts` | Unit tests (mock EZKL) |
| `contracts/test/ZkMLVerifier.test.ts` | Hardhat tests with sample proofs |

### Receipt Schema Extension

Add to `ExtendedReceiptBody` in `offchain/src/types/fluidCompute.ts`:

```typescript
// New optional fields
zkml_proof?: {
    proof: string;              // Hex-encoded Groth16 proof (a, b, c)
    public_inputs: string[];    // Public signals
    model_circuit_hash: string; // Hash of the EZKL circuit
    verified_onchain?: boolean;
    verification_tx?: string;
}
```

### Modified Files

| File | Change |
|------|--------|
| `offchain/src/types/fluidCompute.ts` | Add `zkml_proof` to `ExtendedReceiptBody` |
| `offchain/src/services/receiptService.ts` | Optionally attach zkML proof during receipt creation |
| `contracts/src/LucidValidator.sol` | Add `verifyZkMLProof()` that delegates to `ZkMLVerifier` |
| `offchain/src/blockchain/types.ts` | Add `zkmlVerifier?: string` to `ChainConfig` |
| `offchain/src/blockchain/chains.ts` | Add verifier addresses |
| `offchain/src/index.ts` | Mount zkml routes |
| `contracts/package.json` | Add `@openzeppelin/contracts` (already present), potentially `snarkjs` for test proof generation |

---

## File Summary

### New Files (est. 38)

| Deliverable | New Files | Count |
|-------------|-----------|-------|
| D1: Escrow | `LucidEscrow.sol`, `LucidEscrow.test.ts`, `escrowService.ts`, `escrowTypes.ts`, `escrowRoutes.ts`, `escrowService.test.ts` | 6 |
| D2: Arbitration | `LucidArbitration.sol`, `LucidArbitration.test.ts`, `disputeService.ts`, `disputeTypes.ts`, `disputeRoutes.ts`, `disputeService.test.ts` | 6 |
| D3: Paymaster | `LucidPaymaster.sol`, `LucidPaymaster.test.ts`, `paymasterService.ts`, `paymasterTypes.ts`, `paymasterRoutes.ts`, `paymasterService.test.ts` | 6 |
| D4: Modules | `IModule.sol`, `LucidPolicyModule.sol`, `LucidPayoutModule.sol`, `LucidReceiptModule.sol`, `LucidModules.test.ts`, `erc7579Service.ts`, `erc7579Types.ts`, `erc7579Routes.ts`, `erc7579Service.test.ts` | 9 |
| D5: zkML | `ZkMLVerifier.sol`, `ZkMLVerifier.test.ts`, `zkmlService.ts`, `zkmlTypes.ts`, `zkmlRoutes.ts`, `zkmlService.test.ts` | 6 |
| **Total** | | **33** |

### Modified Files (est. 10)

| File | Deliverables |
|------|-------------|
| `offchain/src/blockchain/types.ts` | D1, D2, D3, D4, D5 |
| `offchain/src/blockchain/chains.ts` | D1, D2, D3, D4, D5 |
| `offchain/src/index.ts` | D1, D2, D3, D4, D5 |
| `offchain/src/blockchain/evm/EVMAdapter.ts` | D3 |
| `offchain/src/types/fluidCompute.ts` | D5 |
| `offchain/src/services/receiptService.ts` | D5 |
| `contracts/src/LucidValidator.sol` | D5 |
| `contracts/src/LucidEscrow.sol` | D2 (add arbitration link) |
| `contracts/package.json` | D3 |
| `offchain/src/services/payoutService.ts` | D1 (escrow-aware payouts) |

---

## Testing Strategy

- **Solidity**: Hardhat + Chai for all 5 new contracts + module tests
- **Off-chain**: Jest for all 5 new service tests
- **Integration**: Each deliverable's routes tested via supertest
- **Regression**: Full `npm test` must pass (364+ tests) after each deliverable

---

## Dependencies

```
D1 (Escrow) ──→ D2 (Arbitration) depends on escrow contract
D3 (Paymaster) ─┐
                 ├─ independent, can run in parallel
D4 (Modules) ───┘
D5 (zkML) ──→ last, extends receipt system
```
