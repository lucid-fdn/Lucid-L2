<!-- generated: commit d2cfd9e, 2026-03-18T17:01:12.129Z -->
<!-- WARNING: unverified identifiers: InvalidTransitionError, LeaseManagerService, ReconcilerService, extend, getDeployer, reconcileDeployment, sweep -->
# Deployment

## Purpose
The deployment module in the Lucid L2 platform manages the lifecycle of deployments across various providers. It ensures that deployments transition through their lifecycle states correctly, handles provider-specific interactions, and maintains synchronization between the desired and actual states of deployments. This module is crucial for automating deployment management, handling state transitions, and ensuring deployments are healthy and up-to-date with provider states.

## Architecture
The module is structured around several key components:

- **Control Plane**: Manages deployment state and transitions. It includes interfaces like `IDeploymentStore` for CRUD operations on deployments and events, and functions like `canTransition` and `assertValidTransition` for state management.
  
- **Reconciler**: Ensures deployments are in their desired state by periodically checking and correcting any drift. It uses `ReconcilerService` to perform sweeps and reconcile individual deployments.

- **Provider Sync**: Handles interactions with deployment providers, mapping provider-specific statuses to Lucid's internal states using functions like `mapProviderStatus` and `syncProviderState`.

- **Lease Manager**: Manages deployment leases, extending them when possible and warning when they are about to expire.

Key design choices include using a state machine for managing deployment transitions, a singleton pattern for managing store instances, and a provider capability map to handle provider-specific operations.

## Data Flow
1. **Deployment Creation**: A deployment is created using the `create` method in `IDeploymentStore` (file: `control-plane/store.ts`). The input is a `CreateDeploymentInput` object, and the result is a `Deployment` object stored in the database.

2. **State Transitions**: State transitions are managed by `transition` in `IDeploymentStore` (file: `control-plane/store.ts`). The `assertValidTransition` function (file: `control-plane/state-machine.ts`) ensures transitions are valid before they are applied.

3. **Provider State Sync**: The `syncProviderState` function (file: `reconciler/provider-sync.ts`) fetches the current state from the provider using `getDeployer` (file: `compute/deploy`) and updates the deployment's state in the store.

4. **Reconciliation**: The `ReconcilerService` (file: `reconciler/service.ts`) periodically calls `sweep` to check for drifted or stuck deployments, using `reconcileDeployment` to correct them.

5. **Lease Management**: The `LeaseManagerService` (file: `lease-manager/service.ts`) checks for expiring leases and attempts to extend them using `extend`.

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
- **Singleton Pattern**: The deployment store and reconciler are managed as singletons, initialized based on environment variables. This can lead to unexpected behavior if not reset properly in tests using `resetDeploymentStore`.

- **State Machine**: The state machine enforces strict transitions. Any attempt to transition to an invalid state will throw an `InvalidTransitionError`, which must be handled.

- **Provider Capabilities**: Not all providers support the same operations. The `PROVIDER_CAPABILITIES` map dictates what actions can be performed, which can lead to no-ops if a capability is not supported.

- **Cooldown Mechanism**: The reconciler uses a cooldown mechanism to prevent repeatedly attempting to fix broken deployments, which can delay recovery if not understood.

- **Lease Extension**: Only specific providers (e.g., io.net) support lease extensions. Attempting to extend leases with unsupported providers will result in warnings rather than errors.