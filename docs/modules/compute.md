<!-- generated: commit 8a415ae, 2026-03-18T17:36:09.251Z -->
<!-- WARNING: unverified identifiers: AgentDeploymentService, IDeploymentStore, compute, deployAgent -->
# Compute

## Purpose
The `compute` domain module in the Lucid L2 platform is designed to manage the lifecycle of AI agents, from deployment to revenue management. It provides a comprehensive framework for deploying AI agents to various runtime environments, handling agent-to-agent (A2A) communication, and managing agent revenue streams. This module solves the problem of orchestrating complex deployment workflows, ensuring seamless integration with runtime environments, and facilitating revenue distribution for deployed agents.

## Architecture
The module is structured around several key components:

1. **Deployment Management**: The `AgentDeploymentService` orchestrates the deployment pipeline, integrating schema validation, runtime adapter selection, and deployment execution via the `IDeployer` interface. It ensures durable state management through `IDeploymentStore`.

2. **A2A Communication**: The A2A protocol is implemented via server-side components in `a2aServer.ts`, which handle task creation, state updates, and artifact management. The client-side interactions are managed through functions in `a2aClient.ts`.

3. **Revenue Management**: The `agentRevenueService.ts` manages the revenue lifecycle, from processing agent receipts to distributing revenue through airdrops. It uses an in-memory `AgentRevenuePool` to track accumulated revenues.

4. **Runtime and Deployment Interfaces**: The `IRuntimeAdapter` and `IDeployer` interfaces abstract the specifics of runtime environments and deployment targets, allowing for flexible integration with various platforms.

## Data Flow
1. **Deployment Flow**:
   - `agent/agentDeploymentService.ts` → `deployAgent(input: DeployAgentInput)` → `getDeploymentStore()` → `IDeployer.deploy()`
   - The deployment process begins with validating the agent descriptor, creating a passport, selecting a runtime adapter, and generating code. The deployment record is created in a 'pending' state, transitioning to 'deploying' upon calling the deployer.

2. **A2A Task Management**:
   - `agent/a2a/a2aServer.ts` → `createA2ATask(message: A2AMessage)` → `storeTask(task: A2ATask)` → `getSharedTaskStore()`
   - Tasks are created from incoming messages, stored in a shared task store, and can be updated or queried for status.

3. **Revenue Processing**:
   - `agent/agentRevenueService.ts` → `processAgentRevenue(receipt)` → `revenuePools.set()` → `triggerAgentAirdrop()`
   - Revenue from agent operations is processed, split according to predefined configurations, and accumulated in revenue pools. Airdrops are triggered when thresholds are met.

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
- **Idempotency in Deployment**: The `deployAgent` function checks for existing deployments using an idempotency key to prevent duplicate deployments. Ensure this key is unique for each deployment attempt.
  
- **Shared Task Store**: The `getSharedTaskStore()` function provides a singleton task store, which persists tasks across requests. Be cautious of state persistence issues in concurrent environments.

- **Lazy Imports**: Functions like `processAgentRevenue` use lazy imports to avoid circular dependencies. This pattern can obscure dependencies and should be documented clearly.

- **Revenue Split Validation**: The revenue split configuration in the agent descriptor must not exceed 100%. This cross-field validation is crucial to prevent configuration errors.

- **Non-blocking Operations**: Several operations, such as wallet creation and airdrop execution, are designed to be non-blocking. Errors in these operations are logged but do not halt the deployment process, which can lead to silent failures if not monitored.

- **Deployment State Transitions**: The deployment service uses explicit state transitions and event emissions to track deployment progress. Ensure that state transitions are correctly handled to maintain consistency in the deployment lifecycle.