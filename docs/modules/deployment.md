<!-- generated: commit 0dd79c5, 2026-03-18T16:39:26.310Z -->
# Deployment

## Purpose
*AI enrichment pending.*

## Architecture
*AI enrichment pending.*

## Data Flow
*AI enrichment pending.*

## Key Interfaces

| Interface | File | Role |
|-----------|------|------|
| `CreateDeploymentEvent` | `control-plane/types.ts` | — |
| `CreateDeploymentEvent` | `control-plane/types.ts` | — |
| `CreateDeploymentInput` | `control-plane/types.ts` | — |
| `CreateDeploymentInput` | `control-plane/types.ts` | — |
| `Deployment` | `control-plane/types.ts` | — |
| `Deployment` | `control-plane/types.ts` | — |
| `DeploymentEvent` | `control-plane/types.ts` | — |
| `DeploymentEvent` | `control-plane/types.ts` | — |
| `DeploymentFilters` | `control-plane/types.ts` | — |
| `DeploymentFilters` | `control-plane/types.ts` | — |
| `IDeploymentStore` | `control-plane/store.ts` | — |
| `IDeploymentStore` | `control-plane/store.ts` | — |
| `IProviderNormalizer` | `webhooks/types.ts` | Per-provider normalizer. |
| `IProviderNormalizer` | `webhooks/types.ts` | Per-provider normalizer. |
| `ISecretsResolver` | `secrets/interface.ts` | Resolves secret references to their actual values. |
| `ISecretsResolver` | `secrets/interface.ts` | Resolves secret references to their actual values. |
| `LeaseConfig` | `lease-manager/policies.ts` | — |
| `LeaseConfig` | `lease-manager/policies.ts` | — |
| `MappedProviderStatus` | `reconciler/provider-sync.ts` | — |
| `MappedProviderStatus` | `reconciler/provider-sync.ts` | — |
| `NormalizedProviderEvent` | `webhooks/types.ts` | Standard shape for provider webhook callbacks. |
| `NormalizedProviderEvent` | `webhooks/types.ts` | Standard shape for provider webhook callbacks. |
| `ProviderCapabilities` | `reconciler/provider-sync.ts` | — |
| `ProviderCapabilities` | `reconciler/provider-sync.ts` | — |
| `ReconcilerConfig` | `reconciler/policies.ts` | — |
| `ReconcilerConfig` | `reconciler/policies.ts` | — |
| `RolloutConfig` | `rollout/policies.ts` | Configuration for blue-green rollout behavior. |
| `RolloutConfig` | `rollout/policies.ts` | Configuration for blue-green rollout behavior. |
| `SweepResult` | `reconciler/policies.ts` | — |
| `SweepResult` | `reconciler/policies.ts` | — |
| `WebhookResult` | `webhooks/handler.ts` | — |
| `WebhookResult` | `webhooks/handler.ts` | — |

## Cross-Domain Dependencies

| Direction | Domain | Symbols | Purpose |
|-----------|--------|---------|---------|
| imports | compute | `getDeployer` | — |
| imports | shared | `pool` | — |
| exports to | compute | `ActualState`, `Deployment`, `IDeploymentStore`, `getDeploymentStore` | — |

## Patterns & Gotchas
*AI enrichment pending.*