<!-- generated: commit 505ae77, 2026-03-18T19:46:46.368Z -->
# reputation — Interface Reference

## Interfaces

### ExternalFeedback
> `IReputationSyncer.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `category` | `string` | yes |  |
| `externalId` | `string` | no |  |
| `metadata` | `Record<string, any>` | yes |  |
| `score` | `number` | no |  |
| `source` | `string` | no |  |
| `timestamp` | `number` | no |  |

**Extends:** —

### ExternalSummary
> `IReputationSyncer.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `avgScore` | `number` | no |  |
| `externalId` | `string` | no |  |
| `feedbackCount` | `number` | no |  |
| `lastUpdated` | `number` | no |  |
| `source` | `string` | no |  |

**Extends:** —

### FeedbackParams
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `assetType` | `AssetType` | no |  |
| `category` | `string` | no |  |
| `metadata` | `string` | yes |  |
| `passportId` | `string` | no |  |
| `receiptHash` | `string` | no |  |
| `score` | `number` | no |  |

**Extends:** —

### IReputationProvider
> `IReputationProvider.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `providerName` | `string` | no |  |

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `getSummary` | `passportId`: `string` | `Promise<ReputationSummary>` |  |
| `getValidation` | `passportId`: `string`, `receiptHash`: `string` | `Promise<ValidationResult>` |  |
| `isHealthy` |  | `Promise<boolean>` |  |
| `readFeedback` | `passportId`: `string`, `options`?: `ReadOptions` | `Promise<ReputationData[]>` |  |
| `submitFeedback` | `params`: `FeedbackParams` | `Promise<TxReceipt>` |  |
| `submitValidation` | `params`: `ValidationParams` | `Promise<TxReceipt>` |  |

**Extends:** —

### IReputationSyncer
> `IReputationSyncer.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `supportedAssetTypes` | `AssetType[]` | no |  |
| `syncerName` | `string` | no |  |

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `isAvailable` |  | `Promise<boolean>` |  |
| `pullFeedback` | `passportId`: `string` | `Promise<ExternalFeedback[]>` |  |
| `pullSummary` | `passportId`: `string` | `Promise<ExternalSummary>` |  |
| `pushFeedback` | `params`: `FeedbackParams` | `Promise<TxReceipt>` |  |
| `resolveExternalId` | `passportId`: `string` | `Promise<string>` |  |

**Extends:** —

### ReadOptions
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `assetType` | `AssetType` | yes |  |
| `category` | `string` | yes |  |
| `limit` | `number` | yes |  |
| `offset` | `number` | yes |  |

**Extends:** —

### ReputationData
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `assetType` | `AssetType` | no |  |
| `category` | `string` | no |  |
| `from` | `string` | no |  |
| `index` | `number` | no |  |
| `passportId` | `string` | no |  |
| `receiptHash` | `string` | no |  |
| `revoked` | `boolean` | no |  |
| `score` | `number` | no |  |
| `timestamp` | `number` | no |  |

**Extends:** —

### ReputationSummary
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `avgScore` | `number` | no |  |
| `feedbackCount` | `number` | no |  |
| `lastUpdated` | `number` | no |  |
| `passportId` | `string` | no |  |
| `totalScore` | `number` | no |  |
| `validationCount` | `number` | no |  |

**Extends:** —

### TxReceipt
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `id` | `string` | yes |  |
| `success` | `boolean` | no |  |
| `txHash` | `string` | yes |  |

**Extends:** —

### ValidationParams
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `assetType` | `AssetType` | no |  |
| `metadata` | `string` | yes |  |
| `passportId` | `string` | no |  |
| `receiptHash` | `string` | no |  |
| `valid` | `boolean` | no |  |

**Extends:** —

### ValidationResult
> `types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `assetType` | `AssetType` | no |  |
| `passportId` | `string` | no |  |
| `receiptHash` | `string` | no |  |
| `timestamp` | `number` | no |  |
| `valid` | `boolean` | no |  |
| `validator` | `string` | no |  |

**Extends:** —

## Functions

### getReputationProvider
> `index.ts`

Get the primary reputation provider.

**Returns:** `IReputationProvider`

**Async:** no

### getReputationSyncers
> `index.ts`

Get all configured reputation syncers.

**Returns:** `IReputationSyncer[]`

**Async:** no

### resetReputationFactory
> `index.ts`

Reset singletons (for tests)

**Returns:** `void`

**Async:** no

### setReputationProvider
> `index.ts`

Explicitly set the reputation provider (required for on-chain provider

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `provider` | `IReputationProvider` | no | — |

**Returns:** `void`

**Async:** no

## Types

### AssetType
> `types.ts`

```ts
type AssetType = "model" | "compute" | "tool" | "agent" | "dataset"
```
