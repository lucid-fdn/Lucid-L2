<!-- generated: commit 505ae77, 2026-03-18T19:46:46.366Z -->
# deployment — Interface Reference

## Interfaces

### CreateDeploymentEvent
> `control-plane/types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `actor` | `string` | no |  |
| `correlation_id` | `string` | yes |  |
| `deployment_id` | `string` | no |  |
| `event_type` | `"stopped" | "terminated" | "failed" | "created" | "started" | "succeeded" | "restarted" | "health_changed" | "lease_extended" | "lease_expiring" | "config_updated" | "scaled" | "promoted" | "rolled_back"` | no |  |
| `idempotency_key` | `string` | yes |  |
| `metadata` | `Record<string, unknown>` | yes |  |
| `new_state` | `string` | yes |  |
| `previous_state` | `string` | yes |  |

**Extends:** —

### CreateDeploymentEvent
> `control-plane/types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `actor` | `string` | no |  |
| `correlation_id` | `string` | yes |  |
| `deployment_id` | `string` | no |  |
| `event_type` | `"stopped" | "terminated" | "failed" | "created" | "started" | "succeeded" | "restarted" | "health_changed" | "lease_extended" | "lease_expiring" | "config_updated" | "scaled" | "promoted" | "rolled_back"` | no |  |
| `idempotency_key` | `string` | yes |  |
| `metadata` | `Record<string, unknown>` | yes |  |
| `new_state` | `string` | yes |  |
| `previous_state` | `string` | yes |  |

**Extends:** —

### CreateDeploymentInput
> `control-plane/types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `code_bundle_hash` | `string` | yes |  |
| `created_by` | `string` | yes |  |
| `descriptor_snapshot` | `Record<string, unknown>` | no |  |
| `env_vars_hash` | `string` | yes |  |
| `idempotency_key` | `string` | yes |  |
| `lease_expires_at` | `number` | yes |  |
| `provider` | `string` | no |  |
| `runtime_adapter` | `string` | no |  |
| `tenant_id` | `string` | yes |  |

**Extends:** —

### CreateDeploymentInput
> `control-plane/types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_passport_id` | `string` | no |  |
| `code_bundle_hash` | `string` | yes |  |
| `created_by` | `string` | yes |  |
| `descriptor_snapshot` | `Record<string, unknown>` | no |  |
| `env_vars_hash` | `string` | yes |  |
| `idempotency_key` | `string` | yes |  |
| `lease_expires_at` | `number` | yes |  |
| `provider` | `string` | no |  |
| `runtime_adapter` | `string` | no |  |
| `tenant_id` | `string` | yes |  |

**Extends:** —

### Deployment
> `control-plane/types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `a2a_endpoint` | `string` | no |  |
| `actual_state` | `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"` | no |  |
| `agent_passport_id` | `string` | no |  |
| `code_bundle_hash` | `string` | no |  |
| `created_at` | `number` | no |  |
| `created_by` | `string` | no |  |
| `deployment_id` | `string` | no |  |
| `deployment_slot` | `string` | no |  |
| `deployment_url` | `string` | no |  |
| `descriptor_snapshot` | `Record<string, unknown>` | no |  |
| `desired_state` | `"running" | "stopped" | "terminated"` | no |  |
| `env_vars_hash` | `string` | no |  |
| `error` | `string` | no |  |
| `health_status` | `"healthy" | "degraded" | "unhealthy" | "unknown"` | no |  |
| `idempotency_key` | `string` | no |  |
| `last_health_at` | `number` | no |  |
| `last_transition_at` | `number` | no |  |
| `lease_expires_at` | `number` | no |  |
| `provider` | `string` | no |  |
| `provider_deployment_id` | `string` | no |  |
| `provider_region` | `string` | no |  |
| `provider_status` | `string` | no |  |
| `provider_status_detail` | `Record<string, unknown>` | no |  |
| `revision` | `number` | no |  |
| `runtime_adapter` | `string` | no |  |
| `tenant_id` | `string` | no |  |
| `terminated_at` | `number` | no |  |
| `terminated_reason` | `string` | no |  |
| `updated_at` | `number` | no |  |
| `updated_by` | `string` | no |  |
| `version` | `number` | no |  |
| `wallet_address` | `string` | no |  |

**Extends:** —

### Deployment
> `control-plane/types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `a2a_endpoint` | `string` | no |  |
| `actual_state` | `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"` | no |  |
| `agent_passport_id` | `string` | no |  |
| `code_bundle_hash` | `string` | no |  |
| `created_at` | `number` | no |  |
| `created_by` | `string` | no |  |
| `deployment_id` | `string` | no |  |
| `deployment_slot` | `string` | no |  |
| `deployment_url` | `string` | no |  |
| `descriptor_snapshot` | `Record<string, unknown>` | no |  |
| `desired_state` | `"running" | "stopped" | "terminated"` | no |  |
| `env_vars_hash` | `string` | no |  |
| `error` | `string` | no |  |
| `health_status` | `"healthy" | "degraded" | "unhealthy" | "unknown"` | no |  |
| `idempotency_key` | `string` | no |  |
| `last_health_at` | `number` | no |  |
| `last_transition_at` | `number` | no |  |
| `lease_expires_at` | `number` | no |  |
| `provider` | `string` | no |  |
| `provider_deployment_id` | `string` | no |  |
| `provider_region` | `string` | no |  |
| `provider_status` | `string` | no |  |
| `provider_status_detail` | `Record<string, unknown>` | no |  |
| `revision` | `number` | no |  |
| `runtime_adapter` | `string` | no |  |
| `tenant_id` | `string` | no |  |
| `terminated_at` | `number` | no |  |
| `terminated_reason` | `string` | no |  |
| `updated_at` | `number` | no |  |
| `updated_by` | `string` | no |  |
| `version` | `number` | no |  |
| `wallet_address` | `string` | no |  |

**Extends:** —

### DeploymentEvent
> `control-plane/types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `actor` | `string` | no |  |
| `correlation_id` | `string` | no |  |
| `created_at` | `number` | no |  |
| `deployment_id` | `string` | no |  |
| `event_id` | `string` | no |  |
| `event_type` | `"stopped" | "terminated" | "failed" | "created" | "started" | "succeeded" | "restarted" | "health_changed" | "lease_extended" | "lease_expiring" | "config_updated" | "scaled" | "promoted" | "rolled_back"` | no |  |
| `idempotency_key` | `string` | no |  |
| `metadata` | `Record<string, unknown>` | no |  |
| `new_state` | `string` | no |  |
| `previous_state` | `string` | no |  |
| `sequence` | `number` | no |  |

**Extends:** —

### DeploymentEvent
> `control-plane/types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `actor` | `string` | no |  |
| `correlation_id` | `string` | no |  |
| `created_at` | `number` | no |  |
| `deployment_id` | `string` | no |  |
| `event_id` | `string` | no |  |
| `event_type` | `"stopped" | "terminated" | "failed" | "created" | "started" | "succeeded" | "restarted" | "health_changed" | "lease_extended" | "lease_expiring" | "config_updated" | "scaled" | "promoted" | "rolled_back"` | no |  |
| `idempotency_key` | `string` | no |  |
| `metadata` | `Record<string, unknown>` | no |  |
| `new_state` | `string` | no |  |
| `previous_state` | `string` | no |  |
| `sequence` | `number` | no |  |

**Extends:** —

### DeploymentFilters
> `control-plane/types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `actual_state` | `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed" | ("running" | "stopped" | "terminated" | "pending" | "deploying" | "failed")[]` | yes |  |
| `health_status` | `"healthy" | "degraded" | "unhealthy" | "unknown"` | yes |  |
| `limit` | `number` | yes |  |
| `offset` | `number` | yes |  |
| `order_by` | `"created_at" | "updated_at"` | yes |  |
| `order_dir` | `"asc" | "desc"` | yes |  |
| `provider` | `string` | yes |  |
| `tenant_id` | `string` | yes |  |

**Extends:** —

### DeploymentFilters
> `control-plane/types.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `actual_state` | `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed" | ("running" | "stopped" | "terminated" | "pending" | "deploying" | "failed")[]` | yes |  |
| `health_status` | `"healthy" | "degraded" | "unhealthy" | "unknown"` | yes |  |
| `limit` | `number` | yes |  |
| `offset` | `number` | yes |  |
| `order_by` | `"created_at" | "updated_at"` | yes |  |
| `order_dir` | `"asc" | "desc"` | yes |  |
| `provider` | `string` | yes |  |
| `tenant_id` | `string` | yes |  |

**Extends:** —

### IDeploymentStore
> `control-plane/store.ts`

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `appendEvent` | `event`: `CreateDeploymentEvent` | `Promise<DeploymentEvent>` | Append an event to the deployment event log. Idempotent via idempotency_key. |
| `create` | `input`: `CreateDeploymentInput` | `Promise<Deployment>` | Create a new deployment. Idempotent when `idempotency_key` is provided. |
| `getActiveByAgent` | `agentPassportId`: `string` | `Promise<Deployment>` | Get the active (non-terminated, non-failed) deployment for an agent in the 'primary' slot. |
| `getById` | `deploymentId`: `string` | `Promise<Deployment>` | Get a single deployment by ID. |
| `getByIdempotencyKey` | `key`: `string` | `Promise<Deployment>` | Find a deployment by its idempotency key. |
| `getByProviderDeploymentId` | `provider`: `string`, `providerDeploymentId`: `string` | `Promise<Deployment>` | Find a deployment by its provider-assigned ID. |
| `getBySlot` | `agentPassportId`: `string`, `slot`: `string` | `Promise<Deployment>` | Find a deployment by agent + slot. |
| `getEvents` | `deploymentId`: `string`, `options`?: `{ limit?: number; since?: number; types?: DeploymentEventType[]; }` | `Promise<DeploymentEvent[]>` | Get events for a deployment, ordered by created_at DESC. |
| `incrementRevision` | `deploymentId`: `string`, `newDescriptor`: `Record<string, unknown>`, `actor`: `string` | `Promise<Deployment>` | Increment revision, update descriptor snapshot. Bumps both version and revision. |
| `list` | `filters`?: `DeploymentFilters` | `Promise<Deployment[]>` | List all deployments matching filters. |
| `listByAgent` | `agentPassportId`: `string`, `filters`?: `DeploymentFilters` | `Promise<Deployment[]>` | List deployments for a specific agent, optionally filtered. |
| `listByState` | `state`: `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"` | `Promise<Deployment[]>` | List all deployments in a given actual_state. |
| `listDrifted` |  | `Promise<Deployment[]>` | List deployments where desired_state != actual_state (excluding terminated). |
| `listExpiringLeases` | `withinMs`: `number` | `Promise<Deployment[]>` | List deployments whose lease expires within `withinMs` milliseconds from now. |
| `promoteBlue` | `agentPassportId`: `string` | `Promise<{ promoted: Deployment; terminated: Deployment; }>` | Atomically promote blue → primary, old primary → terminated. |
| `transition` | `deploymentId`: `string`, `newState`: `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"`, `version`: `number`, `opts`?: `{ actor?: string; error?: string; providerStatus?: string; providerStatusDetail?: Record<string, unknown>; metadata?: Record<string, unknown>; terminatedReason?: string; }` | `Promise<Deployment>` | Transition a deployment to a new actual_state. |
| `updateHealth` | `deploymentId`: `string`, `health`: `"healthy" | "degraded" | "unhealthy" | "unknown"`, `lastCheckAt`: `number` | `Promise<void>` | Update health status. Increments version. |
| `updateLease` | `deploymentId`: `string`, `expiresAt`: `number` | `Promise<void>` | Update lease expiry. Increments version. |
| `updateProviderResources` | `deploymentId`: `string`, `resources`: `{ provider_deployment_id?: string; deployment_url?: string; a2a_endpoint?: string; wallet_address?: string; provider_status?: string; provider_status_detail?: Record<string, unknown>; provider_region?: string; }` | `Promise<void>` | Update provider-side resource fields. Increments version. |

**Extends:** —

### IDeploymentStore
> `control-plane/store.ts`

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `appendEvent` | `event`: `CreateDeploymentEvent` | `Promise<DeploymentEvent>` | Append an event to the deployment event log. Idempotent via idempotency_key. |
| `create` | `input`: `CreateDeploymentInput` | `Promise<Deployment>` | Create a new deployment. Idempotent when `idempotency_key` is provided. |
| `getActiveByAgent` | `agentPassportId`: `string` | `Promise<Deployment>` | Get the active (non-terminated, non-failed) deployment for an agent in the 'primary' slot. |
| `getById` | `deploymentId`: `string` | `Promise<Deployment>` | Get a single deployment by ID. |
| `getByIdempotencyKey` | `key`: `string` | `Promise<Deployment>` | Find a deployment by its idempotency key. |
| `getByProviderDeploymentId` | `provider`: `string`, `providerDeploymentId`: `string` | `Promise<Deployment>` | Find a deployment by its provider-assigned ID. |
| `getBySlot` | `agentPassportId`: `string`, `slot`: `string` | `Promise<Deployment>` | Find a deployment by agent + slot. |
| `getEvents` | `deploymentId`: `string`, `options`?: `{ limit?: number; since?: number; types?: DeploymentEventType[]; }` | `Promise<DeploymentEvent[]>` | Get events for a deployment, ordered by created_at DESC. |
| `incrementRevision` | `deploymentId`: `string`, `newDescriptor`: `Record<string, unknown>`, `actor`: `string` | `Promise<Deployment>` | Increment revision, update descriptor snapshot. Bumps both version and revision. |
| `list` | `filters`?: `DeploymentFilters` | `Promise<Deployment[]>` | List all deployments matching filters. |
| `listByAgent` | `agentPassportId`: `string`, `filters`?: `DeploymentFilters` | `Promise<Deployment[]>` | List deployments for a specific agent, optionally filtered. |
| `listByState` | `state`: `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"` | `Promise<Deployment[]>` | List all deployments in a given actual_state. |
| `listDrifted` |  | `Promise<Deployment[]>` | List deployments where desired_state != actual_state (excluding terminated). |
| `listExpiringLeases` | `withinMs`: `number` | `Promise<Deployment[]>` | List deployments whose lease expires within `withinMs` milliseconds from now. |
| `promoteBlue` | `agentPassportId`: `string` | `Promise<{ promoted: Deployment; terminated: Deployment; }>` | Atomically promote blue → primary, old primary → terminated. |
| `transition` | `deploymentId`: `string`, `newState`: `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"`, `version`: `number`, `opts`?: `{ actor?: string; error?: string; providerStatus?: string; providerStatusDetail?: Record<string, unknown>; metadata?: Record<string, unknown>; terminatedReason?: string; }` | `Promise<Deployment>` | Transition a deployment to a new actual_state. |
| `updateHealth` | `deploymentId`: `string`, `health`: `"healthy" | "degraded" | "unhealthy" | "unknown"`, `lastCheckAt`: `number` | `Promise<void>` | Update health status. Increments version. |
| `updateLease` | `deploymentId`: `string`, `expiresAt`: `number` | `Promise<void>` | Update lease expiry. Increments version. |
| `updateProviderResources` | `deploymentId`: `string`, `resources`: `{ provider_deployment_id?: string; deployment_url?: string; a2a_endpoint?: string; wallet_address?: string; provider_status?: string; provider_status_detail?: Record<string, unknown>; provider_region?: string; }` | `Promise<void>` | Update provider-side resource fields. Increments version. |

**Extends:** —

### IProviderNormalizer
> `webhooks/types.ts`

Per-provider normalizer.

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `normalize` | `body`: `unknown`, `headers`: `Record<string, string>` | `NormalizedProviderEvent` |  |
| `validateSignature` | `body`: `unknown`, `headers`: `Record<string, string>`, `secret`: `string` | `boolean` |  |

**Extends:** —

### IProviderNormalizer
> `webhooks/types.ts`

Per-provider normalizer.

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `normalize` | `body`: `unknown`, `headers`: `Record<string, string>` | `NormalizedProviderEvent` |  |
| `validateSignature` | `body`: `unknown`, `headers`: `Record<string, string>`, `secret`: `string` | `boolean` |  |

**Extends:** —

### ISecretsResolver
> `secrets/interface.ts`

Resolves secret references to their actual values.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `provider` | `string` | no | The provider name (e.g. 'env', 'mock', 'vault'). |

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `resolve` | `refs`: `string[]` | `Promise<Record<string, string>>` | Resolve an array of secret refs to key-value pairs. |

**Extends:** —

### ISecretsResolver
> `secrets/interface.ts`

Resolves secret references to their actual values.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `provider` | `string` | no | The provider name (e.g. 'env', 'mock', 'vault'). |

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `resolve` | `refs`: `string[]` | `Promise<Record<string, string>>` | Resolve an array of secret refs to key-value pairs. |

**Extends:** —

### LeaseConfig
> `lease-manager/policies.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `extensionHours` | `number` | no | Extension duration in hours (default 24) |
| `warningThresholdMs` | `number` | no | Warning threshold in ms before expiry (default 2h) |

**Extends:** —

### LeaseConfig
> `lease-manager/policies.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `extensionHours` | `number` | no | Extension duration in hours (default 24) |
| `warningThresholdMs` | `number` | no | Warning threshold in ms before expiry (default 2h) |

**Extends:** —

### MappedProviderStatus
> `reconciler/provider-sync.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `actualState` | `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"` | yes |  |
| `health` | `"healthy" | "degraded" | "unhealthy" | "unknown"` | yes |  |
| `isTerminal` | `boolean` | no |  |
| `isTransitional` | `boolean` | no |  |

**Extends:** —

### MappedProviderStatus
> `reconciler/provider-sync.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `actualState` | `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"` | yes |  |
| `health` | `"healthy" | "degraded" | "unhealthy" | "unknown"` | yes |  |
| `isTerminal` | `boolean` | no |  |
| `isTransitional` | `boolean` | no |  |

**Extends:** —

### NormalizedProviderEvent
> `webhooks/types.ts`

Standard shape for provider webhook callbacks.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `deployment_url` | `string` | yes |  |
| `provider` | `string` | no |  |
| `provider_deployment_id` | `string` | no |  |
| `provider_status` | `string` | no |  |
| `provider_status_detail` | `Record<string, unknown>` | no |  |
| `timestamp` | `number` | no |  |

**Extends:** —

### NormalizedProviderEvent
> `webhooks/types.ts`

Standard shape for provider webhook callbacks.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `deployment_url` | `string` | yes |  |
| `provider` | `string` | no |  |
| `provider_deployment_id` | `string` | no |  |
| `provider_status` | `string` | no |  |
| `provider_status_detail` | `Record<string, unknown>` | no |  |
| `timestamp` | `number` | no |  |

**Extends:** —

### ProviderCapabilities
> `reconciler/provider-sync.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `supportsExtend` | `boolean` | no |  |
| `supportsLogs` | `boolean` | no |  |
| `supportsResume` | `boolean` | no |  |
| `supportsScale` | `boolean` | no |  |
| `supportsStatus` | `boolean` | no |  |
| `supportsStop` | `boolean` | no |  |

**Extends:** —

### ProviderCapabilities
> `reconciler/provider-sync.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `supportsExtend` | `boolean` | no |  |
| `supportsLogs` | `boolean` | no |  |
| `supportsResume` | `boolean` | no |  |
| `supportsScale` | `boolean` | no |  |
| `supportsStatus` | `boolean` | no |  |
| `supportsStop` | `boolean` | no |  |

**Extends:** —

### ReconcilerConfig
> `reconciler/policies.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `leaseWarningMs` | `number` | no | Lease expiry warning threshold in ms (default 2h) |
| `maxRetries` | `number` | no | Max retries for stuck transitions (default 3) |
| `pollIntervalMs` | `number` | no | Safety sweep polling interval in ms (default 60s) |
| `providerStalenessMs` | `number` | no | Provider state stale threshold in ms (default 5 min) |
| `stuckTimeoutMs` | `number` | no | Deploying stuck threshold in ms (default 10 min) |

**Extends:** —

### ReconcilerConfig
> `reconciler/policies.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `leaseWarningMs` | `number` | no | Lease expiry warning threshold in ms (default 2h) |
| `maxRetries` | `number` | no | Max retries for stuck transitions (default 3) |
| `pollIntervalMs` | `number` | no | Safety sweep polling interval in ms (default 60s) |
| `providerStalenessMs` | `number` | no | Provider state stale threshold in ms (default 5 min) |
| `stuckTimeoutMs` | `number` | no | Deploying stuck threshold in ms (default 10 min) |

**Extends:** —

### RolloutConfig
> `rollout/policies.ts`

Configuration for blue-green rollout behavior.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `autoPromote` | `boolean` | no | If true, automatically promote blue after health gate passes. Default: false (manual promote). |
| `healthGateDurationMs` | `number` | no | Duration (ms) the blue deployment must be healthy before auto-promote. Default: 30000 (30s). |
| `rollbackOnFailure` | `boolean` | no | If true, automatically rollback when blue fails. Default: false (future). |

**Extends:** —

### RolloutConfig
> `rollout/policies.ts`

Configuration for blue-green rollout behavior.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `autoPromote` | `boolean` | no | If true, automatically promote blue after health gate passes. Default: false (manual promote). |
| `healthGateDurationMs` | `number` | no | Duration (ms) the blue deployment must be healthy before auto-promote. Default: 30000 (30s). |
| `rollbackOnFailure` | `boolean` | no | If true, automatically rollback when blue fails. Default: false (future). |

**Extends:** —

### SweepResult
> `reconciler/policies.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `drifted` | `number` | no |  |
| `health` | `number` | no |  |
| `leases` | `number` | no |  |
| `stuck` | `number` | no |  |

**Extends:** —

### SweepResult
> `reconciler/policies.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `drifted` | `number` | no |  |
| `health` | `number` | no |  |
| `leases` | `number` | no |  |
| `stuck` | `number` | no |  |

**Extends:** —

### WebhookResult
> `webhooks/handler.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `success` | `boolean` | no |  |
| `warning` | `string` | yes |  |

**Extends:** —

### WebhookResult
> `webhooks/handler.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `success` | `boolean` | no |  |
| `warning` | `string` | yes |  |

**Extends:** —

## Functions

### assertValidTransition
> `control-plane/state-machine.ts`

Assert a transition is valid. Throws InvalidTransitionError if not.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `from` | `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"` | no | — |
| `to` | `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"` | no | — |

**Returns:** `void`

**Async:** no

### assertValidTransition
> `control-plane/state-machine.ts`

Assert a transition is valid. Throws InvalidTransitionError if not.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `from` | `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"` | no | — |
| `to` | `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"` | no | — |

**Returns:** `void`

**Async:** no

### canTransition
> `control-plane/state-machine.ts`

Check whether a transition from `from` to `to` is valid.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `from` | `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"` | no | — |
| `to` | `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"` | no | — |

**Returns:** `boolean`

**Async:** no

### canTransition
> `control-plane/state-machine.ts`

Check whether a transition from `from` to `to` is valid.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `from` | `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"` | no | — |
| `to` | `"running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"` | no | — |

**Returns:** `boolean`

**Async:** no

### getDefaultLeaseConfig
> `lease-manager/policies.ts`

Get default lease config with env var overrides.

**Returns:** `LeaseConfig`

**Async:** no

### getDefaultLeaseConfig
> `lease-manager/policies.ts`

Get default lease config with env var overrides.

**Returns:** `LeaseConfig`

**Async:** no

### getDefaultReconcilerConfig
> `reconciler/policies.ts`

Get default reconciler config with env var overrides.

**Returns:** `ReconcilerConfig`

**Async:** no

### getDefaultReconcilerConfig
> `reconciler/policies.ts`

Get default reconciler config with env var overrides.

**Returns:** `ReconcilerConfig`

**Async:** no

### getDefaultRolloutConfig
> `rollout/policies.ts`

Returns default rollout config, reading from env vars when available.

**Returns:** `RolloutConfig`

**Async:** no

### getDefaultRolloutConfig
> `rollout/policies.ts`

Returns default rollout config, reading from env vars when available.

**Returns:** `RolloutConfig`

**Async:** no

### getDeploymentStore
> `control-plane/index.ts`

Get the deployment store singleton.

**Returns:** `IDeploymentStore`

**Async:** no

### getLeaseManager
> `lease-manager/index.ts`

Get or create the LeaseManagerService singleton.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `store` | `IDeploymentStore` | no | — |

**Returns:** `LeaseManagerService`

**Async:** no

### getNormalizer
> `webhooks/normalizers/index.ts`

Get a normalizer for a given provider.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `provider` | `string` | no | — |

**Returns:** `IProviderNormalizer`

**Async:** no

### getNormalizer
> `webhooks/normalizers/index.ts`

Get a normalizer for a given provider.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `provider` | `string` | no | — |

**Returns:** `IProviderNormalizer`

**Async:** no

### getProviderCapabilities
> `reconciler/provider-sync.ts`

Get capabilities for a provider. Defaults to all-false for unknown providers.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `provider` | `string` | no | — |

**Returns:** `ProviderCapabilities`

**Async:** no

### getProviderCapabilities
> `reconciler/provider-sync.ts`

Get capabilities for a provider. Defaults to all-false for unknown providers.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `provider` | `string` | no | — |

**Returns:** `ProviderCapabilities`

**Async:** no

### getReconciler
> `reconciler/index.ts`

Get or create the ReconcilerService singleton.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `store` | `IDeploymentStore` | no | — |
| `leaseManager` | `LeaseManagerService` | no | — |

**Returns:** `ReconcilerService`

**Async:** no

### getRolloutManager
> `rollout/index.ts`

Get the RolloutManager singleton.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `overrides` | `{ store?: IDeploymentStore; secretsResolver?: ISecretsResolver; config?: RolloutConfig; }` | yes | — |

**Returns:** `RolloutManager`

**Async:** no

### getSecretsResolver
> `secrets/index.ts`

Factory — reads SECRETS_PROVIDER env (default 'env').

**Returns:** `ISecretsResolver`

**Async:** no

### isDeploymentControlPlaneRunning
> `boot.ts`

Check if the control plane is running.

**Returns:** `boolean`

**Async:** no

### mapProviderStatus
> `reconciler/provider-sync.ts`

Map provider-specific status strings to Lucid platform state.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `provider` | `string` | no | — |
| `rawStatus` | `string` | no | — |

**Returns:** `MappedProviderStatus`

**Async:** no

### mapProviderStatus
> `reconciler/provider-sync.ts`

Map provider-specific status strings to Lucid platform state.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `provider` | `string` | no | — |
| `rawStatus` | `string` | no | — |

**Returns:** `MappedProviderStatus`

**Async:** no

### resetDeploymentStore
> `control-plane/index.ts`

Reset the singleton — for tests only.

**Returns:** `void`

**Async:** no

### resetLeaseManager
> `lease-manager/index.ts`

Reset the singleton -- for tests only.

**Returns:** `void`

**Async:** no

### resetReconciler
> `reconciler/index.ts`

Reset the singleton -- for tests only.

**Returns:** `void`

**Async:** no

### resetRolloutManager
> `rollout/index.ts`

Reset the singleton — for tests only.

**Returns:** `void`

**Async:** no

### startDeploymentControlPlane
> `boot.ts`

Start the Deployment Control Plane.

**Returns:** `void`

**Async:** no

### stopDeploymentControlPlane
> `boot.ts`

Stop the Deployment Control Plane.

**Returns:** `void`

**Async:** no

### syncProviderState
> `reconciler/provider-sync.ts`

Sync actual provider state into the deployment store.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `deployment` | `Deployment` | no | — |
| `store` | `IDeploymentStore` | no | — |

**Returns:** `Promise<void>`

**Async:** yes

### syncProviderState
> `reconciler/provider-sync.ts`

Sync actual provider state into the deployment store.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `deployment` | `Deployment` | no | — |
| `store` | `IDeploymentStore` | no | — |

**Returns:** `Promise<void>`

**Async:** yes

## Types

### ActualState
> `control-plane/types.ts`

```ts
type ActualState = "running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"
```

### ActualState
> `control-plane/types.ts`

```ts
type ActualState = "running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"
```

### ActualState
> `control-plane/types.ts`

```ts
type ActualState = "running" | "stopped" | "terminated" | "pending" | "deploying" | "failed"
```

### DeploymentEventType
> `control-plane/types.ts`

```ts
type DeploymentEventType = "stopped" | "terminated" | "failed" | "created" | "started" | "succeeded" | "restarted" | "health_changed" | "lease_extended" | "lease_expiring" | "config_updated" | "scaled" | "promoted" | "rolled_back"
```

### DeploymentEventType
> `control-plane/types.ts`

```ts
type DeploymentEventType = "stopped" | "terminated" | "failed" | "created" | "started" | "succeeded" | "restarted" | "health_changed" | "lease_extended" | "lease_expiring" | "config_updated" | "scaled" | "promoted" | "rolled_back"
```

### DeploymentEventType
> `control-plane/types.ts`

```ts
type DeploymentEventType = "stopped" | "terminated" | "failed" | "created" | "started" | "succeeded" | "restarted" | "health_changed" | "lease_extended" | "lease_expiring" | "config_updated" | "scaled" | "promoted" | "rolled_back"
```

### DesiredState
> `control-plane/types.ts`

```ts
type DesiredState = "running" | "stopped" | "terminated"
```

### DesiredState
> `control-plane/types.ts`

```ts
type DesiredState = "running" | "stopped" | "terminated"
```

### DesiredState
> `control-plane/types.ts`

```ts
type DesiredState = "running" | "stopped" | "terminated"
```

### HealthStatus
> `control-plane/types.ts`

```ts
type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown"
```

### HealthStatus
> `control-plane/types.ts`

```ts
type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown"
```

### HealthStatus
> `control-plane/types.ts`

```ts
type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown"
```
