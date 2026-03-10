# Lucid Reputation System Design

**Date**: 2026-03-07
**Status**: Approved

## Problem

Solana validation/reputation in `SolanaAdapter` uses `pool.query()` (DB-backed) while EVM uses on-chain contracts. This is an unfinished gap, not a design choice. Additionally, existing standards (ERC-8004, 8004-solana) only cover agents -- they don't support Lucid's 5 asset types (model, compute, tool, dataset, agent).

## Strategy

1. **Partner with Metaplex** for identity (MIP #52 Agent Registry + Core Agent Identity Plugin)
2. **Build own reputation/validation** system (`lucid_reputation` Anchor program) -- receipt-backed, all 5 asset types
3. **Bidirectional reputation mesh** -- pull FROM and push TO external providers (8004-solana/QuantuLabs, SATI/Cascade, SAID Protocol, EVM ERC-8004)

## Architecture

```
                        Lucid-L2 (Truth Layer)
                               |
                    ReputationService (orchestrator)
                    /          |           \
        IReputationProvider  IReputationSyncer[]  IReputationSyncer[]
        (where OUR data      (pull external       (push OUR data
         lives)               data IN)             OUT)
           |                    |                    |
    +-----------+        +------------+        +------------+
    | OnChain   |        | 8004Bridge |        | 8004Bridge |
    | (Anchor)  |        | SATIBridge |        | SATIBridge |
    | DB        |        | SAIDBridge |        | SAIDBridge |
    +-----------+        | EVMBridge  |        | EVMBridge  |
                         +------------+        +------------+
```

Lucid-L2 is the truth layer. The gateway (platform-core) is an edge data source that feeds receipts into L2.

## Interfaces

### IReputationProvider

Where Lucid's own reputation data lives. Swappable between on-chain and DB.

```typescript
interface IReputationProvider {
  readonly providerName: string;
  submitValidation(params: ValidationParams): Promise<TxReceipt>;
  getValidation(validationId: string): Promise<ValidationResult | null>;
  submitFeedback(params: FeedbackParams): Promise<TxReceipt>;
  readFeedback(passportId: string, options?: ReadOptions): Promise<ReputationData[]>;
  getSummary(passportId: string): Promise<ReputationSummary>;
}
```

Implementations:
- `LucidOnChainProvider` -- interacts with `lucid_reputation` Anchor program
- `LucidDBProvider` -- PostgreSQL-backed (current behavior, for dev/test)

### IReputationSyncer

Bidirectional bridge to external reputation providers. Pull their data, push ours.

```typescript
interface IReputationSyncer {
  readonly syncerName: string;
  readonly supportedAssetTypes: string[];
  pullFeedback(passportId: string): Promise<ExternalFeedback[]>;
  pullSummary(passportId: string): Promise<ExternalSummary | null>;
  pushFeedback(params: FeedbackParams): Promise<TxReceipt | null>;
  resolveExternalId(passportId: string): Promise<string | null>;
  isAvailable(): Promise<boolean>;
}
```

Implementations:
- `Solana8004Syncer` -- wraps QuantuLabs 8004-solana SDK (agents only)
- `SATISyncer` -- Cascade/SATI ZK Compression (agents only, stub initially)
- `SAIDSyncer` -- SAID Protocol (agents only, stub initially)
- `EVM8004Syncer` -- EVM ERC-8004 ValidationRegistry + ReputationRegistry

### ReputationService

Orchestrator combining provider + syncers.

```typescript
class ReputationService {
  constructor(
    private provider: IReputationProvider,
    private syncers: IReputationSyncer[],
    private pushEnabled: boolean,
    private pullEnabled: boolean,
  ) {}

  async submitFeedback(params: FeedbackParams): Promise<TxReceipt> {
    const receipt = await this.provider.submitFeedback(params);
    if (this.pushEnabled) {
      await Promise.allSettled(
        this.syncers
          .filter(s => s.supportedAssetTypes.includes(params.assetType))
          .map(s => s.pushFeedback(params))
      );
    }
    return receipt;
  }

  async getUnifiedSummary(passportId: string): Promise<UnifiedSummary> {
    const local = await this.provider.getSummary(passportId);
    let external: ExternalSummary[] = [];
    if (this.pullEnabled) {
      const results = await Promise.allSettled(
        this.syncers.map(s => s.pullSummary(passportId))
      );
      external = results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => (r as PromiseFulfilledResult<ExternalSummary>).value);
    }
    return { local, external, merged: mergeScores(local, external) };
  }
}
```

### Environment Configuration

```
REPUTATION_PROVIDER=onchain|db        # default: db
REPUTATION_SYNCERS=8004,sati,said     # comma-separated, default: empty
REPUTATION_PUSH_ENABLED=true          # push our data to external providers
REPUTATION_PULL_ENABLED=true          # pull external data into unified view
```

## Anchor Program: `lucid_reputation`

The sixth Solana program in Lucid-L2. Receipt-backed, asset-type agnostic.

### PDA Layout

**FeedbackEntry** -- `["feedback", passport_id, u32_index]`

| Field | Type | Description |
|-------|------|-------------|
| passport_id | String(64) | Target passport (any type) |
| from | Pubkey | Signer who submitted |
| score | u8 | 1-100 |
| category | String(32) | "quality", "latency", "accuracy", etc. |
| receipt_hash | [u8; 32] | SHA-256 of linked receipt |
| asset_type | u8 | 0=model, 1=compute, 2=tool, 3=agent, 4=dataset |
| metadata | String(256) | Optional context |
| timestamp | i64 | Unix timestamp |
| revoked | bool | Soft-delete flag |

**ValidationEntry** -- `["validation", passport_id, receipt_hash]`

| Field | Type | Description |
|-------|------|-------------|
| passport_id | String(64) | Target passport |
| validator | Pubkey | Signer |
| valid | bool | Validation result |
| receipt_hash | [u8; 32] | Receipt being validated |
| asset_type | u8 | Asset type enum |
| metadata | String(256) | Optional context |
| timestamp | i64 | Unix timestamp |

**PassportStats** -- `["stats", passport_id]`

| Field | Type | Description |
|-------|------|-------------|
| passport_id | String(64) | Target passport |
| feedback_count | u32 | Total feedback entries |
| validation_count | u32 | Total validations |
| total_score | u64 | Running sum for avg |
| avg_score | u16 | Cached avg x 100 |
| last_updated | i64 | Last modification |

### Instructions

1. **`init_stats(passport_id)`** -- Creates PassportStats PDA with zeroed counters
2. **`submit_feedback(passport_id, score, category, receipt_hash, asset_type, metadata)`** -- Creates FeedbackEntry, atomically updates PassportStats
3. **`submit_validation(passport_id, receipt_hash, valid, asset_type, metadata)`** -- Creates ValidationEntry, increments validation_count
4. **`revoke_feedback(passport_id, index)`** -- Sets revoked=true, adjusts stats. Only original `from` signer can revoke

### Design Decisions

- **Receipt hash required** -- every feedback/validation links to a real cryptographic receipt. No arbitrary drive-by ratings.
- **Single program for all asset types** -- u8 enum, not separate programs per type.
- **Eager stats update** -- submit_feedback atomically updates running totals. Reads are O(1).
- **Index-based PDAs** -- sequential u32 from feedback_count. Enables enumeration without indexer.
- **Soft-delete revocation** -- PDA stays on-chain for auditability.
- **Permissionless** -- no admin authority. Valid receipt hash = authorization.

### Program Location

```
programs/lucid-reputation/
  src/
    lib.rs
    instructions/
      submit_feedback.rs
      submit_validation.rs
      revoke_feedback.rs
      init_stats.rs
    state/
      feedback.rs
      validation.rs
      stats.rs
    error.rs
```

### Offchain Provider Mapping

```
LucidOnChainProvider (implements IReputationProvider)
  submitFeedback()   --> submit_feedback instruction
  submitValidation() --> submit_validation instruction
  readFeedback()     --> fetch FeedbackEntry PDAs by index range
  getSummary()       --> fetch PassportStats PDA (single read)
  getValidation()    --> fetch ValidationEntry PDA by receipt_hash
```

## Testing Strategy

### On-Chain (Anchor)

```
tests/lucid-reputation.ts
  init_stats -- creates PassportStats PDA, zeroed counters
  submit_feedback -- creates FeedbackEntry, increments stats, verifies avg
  submit_feedback (invalid score) -- rejects score=0 or >100
  submit_feedback (multiple) -- sequential indices, correct running avg
  submit_validation -- creates ValidationEntry, increments validation_count
  submit_validation (duplicate receipt_hash) -- rejects same hash for same passport
  revoke_feedback -- sets revoked=true, adjusts stats totals
  revoke_feedback (wrong signer) -- rejects non-original submitter
  asset_type coverage -- feedback works for all 5 types (0-4)
```

### Offchain Providers

```
reputationProvider.test.ts
  LucidOnChainProvider -- submitFeedback, readFeedback, getSummary, getValidation
  LucidDBProvider -- same methods via SQL
  Provider switching -- env toggle selects correct impl

reputationSyncer.test.ts
  Solana8004Syncer -- pullFeedback, pushFeedback, resolveExternalId, isAvailable
  SATISyncer (stub) -- isAvailable returns false
  SAIDSyncer (stub) -- isAvailable returns false

reputationService.test.ts
  submitFeedback -- calls provider + pushes to enabled syncers
  getUnifiedSummary -- merges provider + syncer summaries
  readFeedback -- combines local + pulled external feedback
  syncer failure isolation -- one syncer failing doesn't break others
```

### Existing Code Changes

- Remove `submitValidation`, `getValidation`, `submitReputation`, `readReputation` from `IBlockchainAdapter`
- Remove corresponding tests from `solanaAdapter.test.ts`
- Extend `reputationAggregator.ts` to query `ReputationService` instead of direct EVM `getLogs`

## File Locations

```
offchain/packages/engine/src/reputation/
  types.ts                    # ValidationParams, FeedbackParams, ReputationSummary, etc.
  IReputationProvider.ts      # Provider interface
  IReputationSyncer.ts        # Syncer interface
  providers/
    LucidOnChainProvider.ts   # Anchor program interaction
    LucidDBProvider.ts        # PostgreSQL-backed
  syncers/
    Solana8004Syncer.ts       # Wraps 8004-solana SDK
    SATISyncer.ts             # Stub
    SAIDSyncer.ts             # Stub
    EVM8004Syncer.ts          # Wraps EVM registry clients
  reputationFactory.ts        # Factory from env config

offchain/packages/gateway-lite/src/reputation/
  reputationService.ts        # Orchestrator (provider + syncers)
```
