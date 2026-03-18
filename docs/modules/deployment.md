<!-- generated: commit 8a415ae, 2026-03-18T17:36:32.810Z -->
<!-- WARNING: unverified identifiers: LeaseManagerService, ReconcilerService, canExtend, getDeployer, reconcileDeployment -->
# Deployment

## Purpose
The deployment module in the Lucid L2 platform is designed to manage the lifecycle of deployments across various cloud providers. It handles the creation, monitoring, updating, and termination of deployments, ensuring that the desired state of each deployment is maintained. This module abstracts the complexities of interacting with different provider APIs and provides a unified interface for managing deployments, which is crucial for maintaining consistency and reliability in a multi-cloud environment.

## Architecture
The module is structured around several key components:

1. **Deployment Store**: Implemented via `IDeploymentStore` in `control-plane/store.ts`, it acts as the central repository for deployment data, supporting operations like creation, state transitions, and health updates. The store can be backed by either an in-memory or PostgreSQL database, determined by the `DEPLOYMENT_STORE` environment variable.

2. **State Machine**: Defined in `control-plane/state-machine.ts`, it enforces valid state transitions for deployments, preventing illegal state changes through functions like `canTransition` and `assertValidTransition`.

3. **Reconciler Service**: Located in `reconciler/service.ts`, it periodically checks for discrepancies between the desired and actual states of deployments, attempting to repair any drift or stuck states. It uses provider capabilities and status mappings to make informed decisions.

4. **Provider Sync**: The `reconciler/provider-sync.ts` file contains logic for mapping provider-specific statuses to the platform's canonical states and syncing provider states into the deployment store.

5. **Lease Manager**: Found in `lease-manager/service.ts`, it manages lease expirations, extending leases when supported by the provider, or issuing warnings when leases are about to expire.

## Data Flow
1. **Deployment Creation**: A deployment is created using `IDeploymentStore.create` with input from `control-plane/types.ts`. The deployment is stored in the configured backend (memory or PostgreSQL).

2. **State Transitions**: Transitions are managed via `IDeploymentStore.transition`, which updates the deployment's state in the store. Validity is checked using `assertValidTransition` from `control-plane/state-machine.ts`.

3. **Provider State Sync**: The `syncProviderState` function in `reconciler/provider-sync.ts` fetches the current state from the provider using `getDeployer` from `compute/deploy`, updates the deployment's provider resources, and health status in the store.

4. **Reconciliation**: The `ReconcilerService` in `reconciler/service.ts` periodically calls `reconcileDeployment` to ensure deployments are in their desired state, using data from the store and provider sync results.

5. **Lease Management**: The `LeaseManagerService` in `lease-manager/service.ts` checks for expiring leases and either extends them or logs warnings, updating the store with new lease expiry times or events.

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
- **Singleton Pattern**: The deployment store and reconciler services are implemented as singletons, initialized once per application lifecycle. Use `resetDeploymentStore` and `resetReconciler` for test environments to clear state.

- **State Transition Validation**: Always use `assertValidTransition` to enforce legal state changes. Direct state updates without validation can lead to inconsistent states.

- **Provider Capabilities**: The `getProviderCapabilities` function provides a centralized way to check what operations are supported by each provider. This prevents unsupported operations from being attempted.

- **Cooldown Mechanism**: The reconciler uses a cooldown mechanism to avoid repeatedly attempting to reconcile deployments that are in a known broken state, which can prevent unnecessary load and potential throttling by providers.

- **Lease Extension**: Not all providers support lease extensions. The `canExtend` method in `LeaseManagerService` checks provider capabilities before attempting an extension, which is crucial for avoiding unsupported operations.

- **Error Handling**: The module is designed to be resilient to provider errors. Functions like `syncProviderState` and `reconcileDeployment` catch errors and update the deployment's health status to 'unknown' rather than crashing, ensuring the system remains operational even when providers are unreachable.