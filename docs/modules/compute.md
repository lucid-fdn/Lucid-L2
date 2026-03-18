<!-- generated: commit d2cfd9e, 2026-03-18T17:01:04.539Z -->
<!-- WARNING: unverified identifiers: compute, deployAgent, getDeploymentStore, resetSharedTaskStore, storeTask -->
# Compute

## Purpose
The `compute` domain module in the Lucid L2 platform is designed to facilitate the deployment and management of AI agents across various runtime environments. It provides a comprehensive framework for defining agent configurations, deploying them to target platforms, and managing their lifecycle. This module addresses the need for a seamless, one-click deployment process that integrates schema validation, runtime adaptation, deployment orchestration, and revenue management.

## Architecture
The module is structured around several key components:

- **Agent Descriptor**: Defined in `agent/agentDescriptor.ts`, this is a runtime-agnostic specification for AI agents, enabling deployment across multiple platforms. It includes configurations for autonomy, memory, workflow, monetization, and compliance.

- **Deployment Service**: Implemented in `agent/agentDeploymentService.ts`, this service orchestrates the deployment pipeline, handling tasks such as schema validation, runtime code generation, deployment record management, and wallet creation.

- **A2A Protocol**: The server-side implementation of the A2A protocol is found in `agent/a2a/a2aServer.ts`, which manages task creation, state updates, and artifact handling for agent-to-agent communication.

- **Revenue Management**: The `agent/agentRevenueService.ts` handles the processing of agent-generated revenue, calculating payout splits, and managing revenue pools for potential airdrops.

Key design choices include the use of a universal agent descriptor for cross-platform compatibility, a modular deployment service that integrates with various runtime adapters and deployers, and an in-memory revenue pool system that will transition to a database-backed solution.

## Data Flow
1. **Agent Deployment**:
   - `agent/agentDeploymentService.ts` → `deployAgent` function: Initiates the deployment process by validating the agent descriptor and selecting a runtime adapter.
   - `runtime/index.ts` → `selectBestAdapter`: Chooses the most suitable runtime adapter based on the descriptor.
   - `deploy/index.ts` → `getDeployer`: Retrieves the appropriate deployer for the target platform.
   - Deployment records are managed through `getDeploymentStore` from `deployment/control-plane`.

2. **Task Management**:
   - `agent/a2a/a2aServer.ts` → `createA2ATask`: Creates tasks from incoming A2A messages.
   - `agent/a2a/a2aServer.ts` → `storeTask`: Persists tasks in a shared in-memory store.

3. **Revenue Processing**:
   - `agent/agentRevenueService.ts` → `processAgentRevenue`: Processes revenue from agent receipts, updating the revenue pool and triggering airdrops if thresholds are met.

## Key Interfaces

| Interface | File | Role |
|-----------|------|------|
| `A2AClientOptions` | `agent/a2a/a2aClient.ts` | — |
| `A2AMessage` | `agent/a2a/a2aServer.ts` | — |
| `A2APart` | `agent/a2a/a2aServer.ts` | — |
| `A2ATask` | `agent/a2a/a2aServer.ts` | — |
| `A2ATaskStore` | `agent/a2a/a2aServer.ts` | — |
| `AgentCard` | `agent/a2a/agentCard.ts` | A2A Agent Card Generator |
| `AgentCardSkill` | `agent/a2a/agentCard.ts` | — |
| `AgentConfig` | `agent/agentDescriptor.ts` | — |
| `AgentDescriptor` | `agent/agentDescriptor.ts` | — |
| `AgentRevenuePool` | `agent/agentRevenueService.ts` | — |
| `ChannelConfig` | `agent/agentDescriptor.ts` | — |
| `DeployAgentInput` | `agent/agentDeploymentService.ts` | — |
| `DeployAgentResult` | `agent/agentDeploymentService.ts` | — |
| `DeploymentConfig` | `deploy/IDeployer.ts` | Configuration for a deployment |
| `DeploymentResult` | `deploy/IDeployer.ts` | Result of a deploy operation |
| `DeploymentStatus` | `deploy/IDeployer.ts` | Current status of a deployment |
| `Guardrail` | `agent/agentDescriptor.ts` | — |
| `HandoffRule` | `agent/agentDescriptor.ts` | — |
| `IDeployer` | `deploy/IDeployer.ts` | Deployer interface — all deployment providers implement this. |
| `IRuntimeAdapter` | `runtime/IRuntimeAdapter.ts` | Runtime Adapter Interface |
| `LogOptions` | `deploy/IDeployer.ts` | Options for fetching deployment logs |
| `MonetizationConfig` | `agent/agentDescriptor.ts` | — |
| `RuntimeArtifact` | `deploy/IDeployer.ts` | Agent runtime artifact — the output of code generation, input to deployment |
| `SpendingLimits` | `agent/agentDescriptor.ts` | — |
| `StopCondition` | `agent/agentDescriptor.ts` | — |
| `WalletConfig` | `agent/agentDescriptor.ts` | — |

### Key Types

| Type | File | Kind | Description |
|------|------|------|-------------|
| `A2ATaskState` | `agent/a2a/a2aServer.ts` | alias | A2A Protocol Server |
| `DeploymentStatusType` | `deploy/IDeployer.ts` | alias | Deployment lifecycle status |

## Cross-Domain Dependencies

| Direction | Domain | Symbols | Purpose |
|-----------|--------|---------|---------|
| imports | deployment | `ActualState`, `Deployment`, `IDeploymentStore`, `getDeploymentStore` | — |
| imports | identity | `CreatePassportInput`, `getAgentWalletProvider`, `getPassportManager` | — |
| imports | payment | `SplitConfig` | — |
| imports | shared | `logger`, `validateWithSchema` | — |
| imports | utils | `RetryOptions`, `withRetryAndTimeout` | — |
| exports to | deployment | `getDeployer` | — |

## Patterns & Gotchas
- **Idempotency in Deployment**: The `deployAgent` function checks for existing deployments using an idempotency key to prevent duplicate deployments. This requires careful management of deployment records to ensure consistency.

- **Shared Task Store**: The A2A server uses a singleton pattern for task storage, which can lead to state persistence issues across requests. Resetting the store (`resetSharedTaskStore`) is crucial for testing.

- **Revenue Pool Management**: The current in-memory implementation of revenue pools is a temporary solution. Developers should be aware of the planned transition to a database-backed system, which will affect how revenue data is persisted and accessed.

- **Error Handling**: The deployment service includes extensive error handling and state transitions to manage deployment failures gracefully. Understanding these transitions is key to maintaining the deployment pipeline's robustness.

- **Non-blocking Operations**: Many operations, such as wallet creation and airdrop execution, are designed to be non-blocking to ensure the main deployment flow is not interrupted by optional features. This requires careful consideration of asynchronous behavior and potential race conditions.