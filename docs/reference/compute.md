<!-- generated: commit c7113a7, 2026-03-20T11:08:23.153Z -->
# compute — Interface Reference

## Interfaces

### A2AClientOptions
> `control-plane/agent/a2a/a2aClient.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `auth_token` | `string` | yes |  |
| `timeout_ms` | `number` | yes |  |

**Extends:** —

### A2AMessage
> `control-plane/agent/a2a/a2aServer.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `parts` | `A2APart[]` | no |  |
| `role` | `"user" | "agent"` | no |  |

**Extends:** —

### A2APart
> `control-plane/agent/a2a/a2aServer.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `data` | `Record<string, unknown>` | yes |  |
| `file` | `{ name: string; mimeType: string; bytes?: string; uri?: string; }` | yes |  |
| `text` | `string` | yes |  |
| `type` | `"text" | "file" | "data"` | no |  |

**Extends:** —

### A2ATask
> `control-plane/agent/a2a/a2aServer.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `artifacts` | `{ name?: string; parts: A2APart[]; }[]` | yes |  |
| `id` | `string` | no |  |
| `messages` | `A2AMessage[]` | no |  |
| `metadata` | `Record<string, unknown>` | yes |  |
| `status` | `{ state: A2ATaskState; message?: string; timestamp: string; }` | no |  |

**Extends:** —

### A2ATaskStore
> `control-plane/agent/a2a/a2aServer.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `tasks` | `Map<string, A2ATask>` | no |  |

**Extends:** —

### AgentCard
> `control-plane/agent/a2a/agentCard.ts`

A2A Agent Card Generator

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `authentication` | `{ type: "bearer" | "oauth2" | "none"; config?: Record<string, unknown>; }` | no |  |
| `capabilities` | `string[]` | no |  |
| `defaultInputModes` | `string[]` | no |  |
| `defaultOutputModes` | `string[]` | no |  |
| `description` | `string` | no |  |
| `name` | `string` | no |  |
| `provider` | `{ organization: string; url?: string; }` | yes |  |
| `skills` | `AgentCardSkill[]` | no |  |
| `url` | `string` | no |  |
| `version` | `string` | no |  |

**Extends:** —

### AgentCardSkill
> `control-plane/agent/a2a/agentCard.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `description` | `string` | no |  |
| `inputSchema` | `Record<string, unknown>` | yes |  |
| `name` | `string` | no |  |
| `outputSchema` | `Record<string, unknown>` | yes |  |

**Extends:** —

### AgentConfig
> `control-plane/agent/agentDescriptor.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `a2a_capabilities` | `string[]` | yes |  |
| `a2a_enabled` | `boolean` | no |  |
| `autonomy_level` | `AutonomyLevel` | no |  |
| `channels` | `ChannelConfig[]` | no |  |
| `fallback_model_ids` | `string[]` | yes |  |
| `guardrails` | `Guardrail[]` | no |  |
| `handoff_rules` | `HandoffRule[]` | yes |  |
| `max_tokens` | `number` | yes |  |
| `mcp_servers` | `string[]` | no |  |
| `memory_enabled` | `boolean` | no |  |
| `memory_provider` | `MemoryProvider` | no |  |
| `memory_window_size` | `number` | no |  |
| `model_passport_id` | `string` | no |  |
| `skill_slugs` | `string[]` | no |  |
| `stop_conditions` | `StopCondition[]` | no |  |
| `sub_agents` | `string[]` | yes |  |
| `system_prompt` | `string` | no |  |
| `temperature` | `number` | yes |  |
| `tool_passport_ids` | `string[]` | no |  |
| `workflow_type` | `WorkflowType` | no |  |

**Extends:** —

### AgentDescriptor
> `control-plane/agent/agentDescriptor.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `agent_config` | `AgentConfig` | no |  |
| `compliance` | `ComplianceConfig` | yes |  |
| `deployment_config` | `DeploymentConfig` | no |  |
| `monetization` | `MonetizationConfig` | yes |  |
| `wallet_config` | `WalletConfig` | yes |  |

**Extends:** —

### AgentRevenuePool
> `control-plane/agent/agentRevenueService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `accumulated_lamports` | `bigint` | no |  |
| `agent_passport_id` | `string` | no |  |
| `last_airdrop_at` | `number` | no |  |
| `total_distributed_lamports` | `bigint` | no |  |

**Extends:** —

### ChannelConfig
> `control-plane/agent/agentDescriptor.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `config` | `Record<string, unknown>` | no |  |
| `type` | `ChannelType` | no |  |

**Extends:** —

### DeployAgentInput
> `control-plane/agent/agentDeploymentService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `description` | `string` | yes | Description |
| `descriptor` | `AgentDescriptor` | no | The Universal Agent Descriptor |
| `idempotency_key` | `string` | yes | Idempotency key to prevent duplicate deploys |
| `list_on_marketplace` | `boolean` | yes | Create marketplace listing |
| `name` | `string` | no | Agent name |
| `owner` | `string` | no | Owner address (Solana base58 or EVM 0x) |
| `preferred_adapter` | `string` | yes | Preferred runtime adapter (auto-select if omitted) |
| `tags` | `string[]` | yes | Tags for discovery |

**Extends:** —

### DeployAgentResult
> `control-plane/agent/agentDeploymentService.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `a2a_endpoint` | `string` | yes |  |
| `adapter_used` | `string` | yes |  |
| `deployment_id` | `string` | yes |  |
| `deployment_url` | `string` | yes |  |
| `error` | `string` | yes |  |
| `files` | `Record<string, string>` | yes |  |
| `nft_mint` | `string` | yes |  |
| `passport_id` | `string` | yes |  |
| `success` | `boolean` | no |  |
| `target_used` | `string` | yes |  |
| `wallet_address` | `string` | yes |  |

**Extends:** —

### DeploymentConfig
> `providers/IDeployer.ts`

Configuration for a deployment

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `auto_scale` | `boolean` | yes | Enable auto-scaling (if supported by target) |
| `env_vars` | `Record<string, string>` | yes | Additional environment variables (merged with artifact env_vars) |
| `health_check_interval_ms` | `number` | yes | Health check interval in milliseconds |
| `replicas` | `number` | yes | Number of replicas (default: 1) |
| `restart_policy` | `"always" | "on_failure" | "never"` | yes | Container restart policy |
| `secrets` | `string[]` | yes | Secret names to inject (platform-specific resolution) |
| `target` | `{ [key: string]: unknown; type: string; }` | no | Target platform config — type field identifies the deployer |

**Extends:** —

### DeploymentResult
> `providers/IDeployer.ts`

Result of a deploy operation

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `deployment_id` | `string` | no | Unique deployment identifier |
| `error` | `string` | yes | Error message (if failed) |
| `metadata` | `Record<string, unknown>` | yes | Platform-specific metadata |
| `success` | `boolean` | no | Whether deployment succeeded |
| `target` | `string` | no | Target platform name |
| `url` | `string` | yes | Public URL of the deployed agent (if available) |

**Extends:** —

### DeploymentStatus
> `providers/IDeployer.ts`

Current status of a deployment

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `deployment_id` | `string` | no | Unique deployment identifier |
| `error` | `string` | yes | Error message (if failed) |
| `health` | `"healthy" | "degraded" | "unhealthy" | "unknown"` | yes | Health state of the running deployment |
| `last_check` | `number` | yes | Timestamp of last health check |
| `status` | `DeploymentStatusType` | no | Current lifecycle status |
| `uptime_ms` | `number` | yes | Uptime in milliseconds since deployment start |
| `url` | `string` | yes | Public URL (if available) |

**Extends:** —

### Guardrail
> `control-plane/agent/agentDescriptor.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `config` | `Record<string, unknown>` | no |  |
| `type` | `GuardrailType` | no |  |

**Extends:** —

### HandoffRule
> `control-plane/agent/agentDescriptor.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `condition` | `string` | no |  |
| `from_agent` | `string` | no |  |
| `to_agent` | `string` | no |  |

**Extends:** —

### IDeployer
> `providers/IDeployer.ts`

Deployer interface — all deployment providers implement this.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `description` | `string` | no | Human-readable description |
| `target` | `string` | no | Target platform name (e.g., 'docker', 'railway', 'akash') |

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `deploy` | `input`: `RuntimeArtifact | ImageDeployInput`, `config`: `DeploymentConfig`, `passportId`: `string` | `Promise<DeploymentResult>` | Deploy an agent artifact or pre-built image to this target |
| `isHealthy` |  | `Promise<boolean>` | Health check for the deployer itself |
| `logs` | `deploymentId`: `string`, `options`?: `LogOptions` | `Promise<string>` | Get deployment logs |
| `scale` | `deploymentId`: `string`, `replicas`: `number` | `Promise<void>` | Scale replicas (if supported) |
| `status` | `deploymentId`: `string` | `Promise<DeploymentStatus>` | Get deployment status |
| `terminate` | `deploymentId`: `string` | `Promise<void>` | Terminate a deployment |

**Extends:** —

### ImageDeployInput
> `providers/types.ts`

Input for deploying a pre-built Docker image (BYOI or base runtime).

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `entrypoint` | `string[]` | yes | Override image's CMD/ENTRYPOINT — only if user explicitly specifies |
| `env_vars` | `Record<string, string>` | no | Environment variables to inject into the container |
| `image` | `string` | no | Docker image reference, e.g. "ghcr.io/myorg/my-agent:latest" |
| `port` | `number` | yes | Container port (default 3100) |
| `registry_auth` | `{ username: string; password: string; }` | yes | Credentials for private registries |
| `verification` | `"full" | "minimal"` | no | Verification mode |

**Extends:** —

### IRuntimeAdapter
> `providers/IRuntimeAdapter.ts`

Runtime Adapter Interface

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `language` | `"typescript" | "python"` | no | Target language |
| `name` | `string` | no | Adapter name (e.g., 'vercel-ai', 'openclaw', 'openai-agents') |
| `version` | `string` | no | Adapter version |

**Methods**

| Method | Params | Return Type | Description |
|--------|--------|-------------|-------------|
| `canHandle` | `descriptor`: `any` | `boolean` | Check if this adapter can handle the given descriptor. |
| `generate` | `descriptor`: `any`, `passportId`: `string` | `Promise<RuntimeArtifact>` | Generate framework-specific agent code from a Universal Agent Descriptor. |

**Extends:** —

### LogOptions
> `providers/IDeployer.ts`

Options for fetching deployment logs

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `follow` | `boolean` | yes | Stream logs continuously (not all deployers support this) |
| `since` | `number` | yes | Unix timestamp — only return logs after this time |
| `tail` | `number` | yes | Number of most recent log lines to return |

**Extends:** —

### MonetizationConfig
> `control-plane/agent/agentDescriptor.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `enabled` | `boolean` | no |  |
| `price_per_call_usd` | `number` | yes |  |
| `pricing_model` | `PricingModel` | no |  |
| `revenue_split` | `RevenueSplit` | yes |  |
| `share_token` | `ShareTokenConfig` | yes |  |
| `share_token_mint` | `string` | yes |  |

**Extends:** —

### RuntimeArtifact
> `providers/IDeployer.ts`

Agent runtime artifact — the output of code generation, input to deployment

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `adapter` | `string` | no | Adapter name that generated this artifact (e.g., 'mcp', 'openai-assistant') |
| `dependencies` | `Record<string, string>` | no | NPM dependencies (name → version) |
| `dockerfile` | `string` | yes | Optional Dockerfile content (if pre-generated) |
| `entrypoint` | `string` | no | Entry point file path within the artifact |
| `env_vars` | `Record<string, string>` | no | Environment variables required at runtime |
| `files` | `Map<string, string>` | no | Map of filename → file content |

**Extends:** —

### RuntimeArtifact
> `providers/IRuntimeAdapter.ts`

Result of a runtime adapter code generation.

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `adapter` | `string` | no | Which adapter generated this |
| `dependencies` | `Record<string, string>` | no | npm/pip dependencies |
| `dockerfile` | `string` | yes | Optional Dockerfile for containerized deployment |
| `entrypoint` | `string` | no | Main entrypoint file |
| `env_vars` | `Record<string, string>` | no | Required environment variables |
| `files` | `Map<string, string>` | no | Generated files: filename → content |

**Extends:** —

### SpendingLimits
> `control-plane/agent/agentDescriptor.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `daily_usd` | `number` | no |  |
| `per_tx_usd` | `number` | no |  |

**Extends:** —

### StopCondition
> `control-plane/agent/agentDescriptor.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `type` | `StopConditionType` | no |  |
| `value` | `string | number` | no |  |

**Extends:** —

### WalletConfig
> `control-plane/agent/agentDescriptor.ts`

**Properties**

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
| `auto_fund` | `boolean` | yes |  |
| `chains` | `string[]` | no |  |
| `enabled` | `boolean` | no |  |
| `provider` | `WalletProvider` | yes |  |
| `spending_limits` | `SpendingLimits` | yes |  |

**Extends:** —

## Functions

### addTaskArtifact
> `control-plane/agent/a2a/a2aServer.ts`

Add an artifact (result) to a task.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `task` | `A2ATask` | no | — |
| `text` | `string` | no | — |
| `name` | `string` | yes | — |

**Returns:** `void`

**Async:** no

### cancelTask
> `control-plane/agent/a2a/a2aClient.ts`

Cancel a task on an external agent.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `agentUrl` | `string` | no | — |
| `taskId` | `string` | no | — |
| `options` | `A2AClientOptions` | yes | — |

**Returns:** `Promise<boolean>`

**Async:** yes

### createA2ATask
> `control-plane/agent/a2a/a2aServer.ts`

Create a new A2A task from an incoming request.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `message` | `A2AMessage` | no | — |
| `metadata` | `Record<string, unknown>` | yes | — |

**Returns:** `A2ATask`

**Async:** no

### createTaskStore
> `control-plane/agent/a2a/a2aServer.ts`

Create an A2A task store.

**Returns:** `A2ATaskStore`

**Async:** no

### discoverAgent
> `control-plane/agent/a2a/a2aClient.ts`

Discover an agent by fetching its Agent Card.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `agentUrl` | `string` | no | — |
| `options` | `A2AClientOptions` | yes | — |

**Returns:** `Promise<AgentCard>`

**Async:** yes

### extractText
> `control-plane/agent/a2a/a2aServer.ts`

Extract text from an A2A message.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `message` | `A2AMessage` | no | — |

**Returns:** `string`

**Async:** no

### generateAgentCard
> `control-plane/agent/a2a/agentCard.ts`

Generate an A2A Agent Card from a passport and agent descriptor.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `passportId` | `string` | no | — |
| `descriptor` | `any` | no | — |
| `agentUrl` | `string` | no | — |

**Returns:** `AgentCard`

**Async:** no

### getAgentDeploymentService
> `control-plane/agent/agentDeploymentService.ts`

**Returns:** `AgentDeploymentService`

**Async:** no

### getAgentRevenuePool
> `control-plane/agent/agentRevenueService.ts`

Get revenue pool for an agent.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `agentPassportId` | `string` | no | — |

**Returns:** `AgentRevenuePool`

**Async:** no

### getAllDeployers
> `providers/index.ts`

Get all registered deployers

**Returns:** `IDeployer[]`

**Async:** no

### getAllRevenuePools
> `control-plane/agent/agentRevenueService.ts`

Get all revenue pools.

**Returns:** `AgentRevenuePool[]`

**Async:** no

### getAllRuntimeAdapters
> `providers/index.ts`

Get all registered runtime adapters.

**Returns:** `IRuntimeAdapter[]`

**Async:** no

### getDeployer
> `providers/index.ts`

Get a deployer by target name.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `target` | `string` | yes | — |

**Returns:** `IDeployer`

**Async:** no

### getRuntimeAdapter
> `providers/index.ts`

Get a specific runtime adapter by name.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `name` | `string` | no | — |

**Returns:** `IRuntimeAdapter`

**Async:** no

### getTaskStatus
> `control-plane/agent/a2a/a2aClient.ts`

Get the status of an existing task.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `agentUrl` | `string` | no | — |
| `taskId` | `string` | no | — |
| `options` | `A2AClientOptions` | yes | — |

**Returns:** `Promise<A2ATask>`

**Async:** yes

### isImageDeploy
> `providers/types.ts`

Type guard: is this an image deploy or a code-gen artifact?

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `input` | `unknown` | no | — |

**Returns:** `boolean`

**Async:** no

### listAdapterNames
> `providers/index.ts`

List available adapter names.

**Returns:** `string[]`

**Async:** no

### listDeployerTargets
> `providers/index.ts`

List available deployer target names

**Returns:** `string[]`

**Async:** no

### processAgentRevenue
> `control-plane/agent/agentRevenueService.ts`

Process revenue from an agent receipt.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `receipt` | `{ agent_passport_id: string; run_id: string; tokens_in: number; tokens_out: number; model: string; compute_wallet?: string; model_wallet?: string; agent_owner_wallet?: string; }` | no | — |

**Returns:** `Promise<void>`

**Async:** yes

### resetAgentDeploymentService
> `control-plane/agent/agentDeploymentService.ts`

**Returns:** `void`

**Async:** no

### resetDeployers
> `providers/index.ts`

Reset singletons (for tests)

**Returns:** `void`

**Async:** no

### resetRevenuePools
> `control-plane/agent/agentRevenueService.ts`

Reset all revenue pools (testing only).

**Returns:** `void`

**Async:** no

### resetRuntimeAdapters
> `providers/index.ts`

Reset registry (for tests)

**Returns:** `void`

**Async:** no

### selectBestAdapter
> `providers/index.ts`

Find the best adapter for a given descriptor.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `descriptor` | `any` | no | — |
| `preferred` | `string` | yes | — |

**Returns:** `IRuntimeAdapter`

**Async:** no

### sendTask
> `control-plane/agent/a2a/a2aClient.ts`

Send a task to an external A2A agent.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `agentUrl` | `string` | no | — |
| `text` | `string` | no | — |
| `options` | `A2AClientOptions` | yes | — |

**Returns:** `Promise<A2ATask>`

**Async:** yes

### triggerAgentAirdrop
> `control-plane/agent/agentRevenueService.ts`

Trigger an airdrop of accumulated revenue to share token holders.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `agentPassportId` | `string` | no | — |

**Returns:** `Promise<{ distributed_lamports: bigint; holder_count: number; }>`

**Async:** yes

### updateTaskState
> `control-plane/agent/a2a/a2aServer.ts`

Update task state.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `task` | `A2ATask` | no | — |
| `state` | `A2ATaskState` | no | — |
| `message` | `string` | yes | — |

**Returns:** `void`

**Async:** no

### validateAgentCard
> `control-plane/agent/a2a/agentCard.ts`

Validate an incoming Agent Card from an external agent.

| Param | Type | Optional | Default |
|-------|------|----------|---------|
| `card` | `any` | no | — |

**Returns:** `{ valid: boolean; errors: string[]; }`

**Async:** no

## Types

### A2ATaskState
> `control-plane/agent/a2a/a2aServer.ts`

A2A Protocol Server

```ts
type A2ATaskState = "failed" | "submitted" | "working" | "input-required" | "completed" | "canceled"
```

### AutonomyLevel
> `control-plane/agent/agentDescriptor.ts`

```ts
type AutonomyLevel = "supervised" | "semi_autonomous" | "fully_autonomous"
```

### DeploymentStatusType
> `providers/IDeployer.ts`

Deployment lifecycle status

```ts
type DeploymentStatusType = "deploying" | "running" | "stopped" | "failed" | "terminated"
```

### DeploymentTargetType
> `control-plane/agent/agentDescriptor.ts`

```ts
type DeploymentTargetType = "railway" | "akash" | "phala" | "ionet" | "nosana" | "vercel_edge" | "docker" | "aws_bedrock" | "self_hosted"
```

### MemoryProvider
> `control-plane/agent/agentDescriptor.ts`

```ts
type MemoryProvider = "supabase" | "lighthouse" | "redis"
```

### WalletProvider
> `control-plane/agent/agentDescriptor.ts`

```ts
type WalletProvider = "crossmint" | "erc6551" | "squads" | "custom"
```

### WorkflowType
> `control-plane/agent/agentDescriptor.ts`

```ts
type WorkflowType = "single" | "sequential" | "parallel" | "dag"
```
