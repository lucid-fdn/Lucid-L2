<!-- generated: commit 0dd79c5, 2026-03-18T16:39:20.843Z -->
# Compute

## Purpose
*AI enrichment pending.*

## Architecture
*AI enrichment pending.*

## Data Flow
*AI enrichment pending.*

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
*AI enrichment pending.*