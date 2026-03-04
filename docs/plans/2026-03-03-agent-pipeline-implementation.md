# Autonomous Agent Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a runtime-agnostic, one-click autonomous AI agent deployment pipeline in Lucid-L2 with wallet integration, multi-target deployment, and A2A protocol support.

**Architecture:** Extend existing Passport system with AgentDescriptor schema, add runtime adapters that translate universal agent definitions to framework-specific code, deployers that handle target infrastructure, and agent wallet providers for on-chain identity. All following existing factory/interface patterns.

**Tech Stack:** TypeScript, Express, AJV validation, Solana Web3.js, Docker SDK, existing Lucid-L2 engine/gateway-lite patterns.

---

## Task 1: AgentDescriptor JSON Schema

**Files:**
- Create: `schemas/AgentDescriptor.schema.json`
- Create: `offchain/packages/engine/src/agent/agentDescriptor.ts`

**Step 1: Create JSON Schema**

Create `schemas/AgentDescriptor.schema.json` with full validation for the Universal Agent Descriptor — matching the pattern of existing ModelMeta.schema.json, ComputeMeta.schema.json, etc.

**Step 2: Create TypeScript types**

Create `offchain/packages/engine/src/agent/agentDescriptor.ts` with all TypeScript interfaces matching the schema.

**Step 3: Wire into schema validator**

Update `passportManager.ts` TYPE_SCHEMA_MAP to include `agent: 'AgentDescriptor'` (replacing 'AgentMeta').

**Step 4: Test schema validation**

Write test in `offchain/packages/engine/src/__tests__/agentDescriptor.test.ts`.

---

## Task 2: Runtime Adapter Interface + VercelAIAdapter

**Files:**
- Create: `offchain/packages/engine/src/runtime/IRuntimeAdapter.ts`
- Create: `offchain/packages/engine/src/runtime/VercelAIAdapter.ts`
- Create: `offchain/packages/engine/src/runtime/index.ts`

**Step 1: Create IRuntimeAdapter interface**

Define the universal adapter interface with canHandle, generate, healthCheck methods.

**Step 2: Create VercelAIAdapter**

Generates standalone ToolLoopAgent TypeScript code from an AgentDescriptor.

**Step 3: Create registry + factory**

Index file with getRuntimeAdapter() factory.

**Step 4: Test adapter generation**

Write test verifying correct TypeScript output.

---

## Task 3: OpenClawAdapter + OpenAIAgentsAdapter

**Files:**
- Create: `offchain/packages/engine/src/runtime/OpenClawAdapter.ts`
- Create: `offchain/packages/engine/src/runtime/OpenAIAgentsAdapter.ts`

**Step 1: Create OpenClawAdapter**

Generates SKILL.md directory structure from AgentDescriptor (YAML frontmatter + markdown).

**Step 2: Create OpenAIAgentsAdapter**

Generates Python agent definition using OpenAI Agents SDK format.

**Step 3: Test both adapters**

---

## Task 4: LangGraphAdapter + CrewAIAdapter + GoogleADKAdapter

**Files:**
- Create: `offchain/packages/engine/src/runtime/LangGraphAdapter.ts`
- Create: `offchain/packages/engine/src/runtime/CrewAIAdapter.ts`
- Create: `offchain/packages/engine/src/runtime/GoogleADKAdapter.ts`

---

## Task 5: Deployer Interface + DockerDeployer + RailwayDeployer

**Files:**
- Create: `offchain/packages/engine/src/deploy/IDeployer.ts`
- Create: `offchain/packages/engine/src/deploy/DockerDeployer.ts`
- Create: `offchain/packages/engine/src/deploy/RailwayDeployer.ts`
- Create: `offchain/packages/engine/src/deploy/index.ts`

---

## Task 6: DePIN Deployers (Akash + Phala + IoNet)

**Files:**
- Create: `offchain/packages/engine/src/deploy/AkashDeployer.ts`
- Create: `offchain/packages/engine/src/deploy/PhalaDeployer.ts`
- Create: `offchain/packages/engine/src/deploy/IoNetDeployer.ts`

---

## Task 7: Agent Wallet Providers

**Files:**
- Create: `offchain/packages/engine/src/agent/wallet/IAgentWalletProvider.ts`
- Create: `offchain/packages/engine/src/agent/wallet/CrossmintWalletProvider.ts`
- Create: `offchain/packages/engine/src/agent/wallet/ERC6551WalletProvider.ts`
- Create: `offchain/packages/engine/src/agent/wallet/MockWalletProvider.ts`
- Create: `offchain/packages/engine/src/agent/wallet/index.ts`

---

## Task 8: AgentDeploymentService (Core Orchestrator)

**Files:**
- Create: `offchain/packages/engine/src/agent/agentDeploymentService.ts`

The central service that wires together: schema validation, runtime adapters, deployers, wallet providers, passport management, NFT minting, and monitoring.

---

## Task 9: A2A Protocol Implementation

**Files:**
- Create: `offchain/packages/engine/src/agent/a2a/agentCard.ts`
- Create: `offchain/packages/engine/src/agent/a2a/a2aServer.ts`
- Create: `offchain/packages/engine/src/agent/a2a/a2aClient.ts`
- Create: `offchain/packages/engine/src/agent/a2a/index.ts`

---

## Task 10: Agent Marketplace Service

**Files:**
- Create: `offchain/packages/engine/src/agent/marketplace/marketplaceService.ts`
- Create: `offchain/packages/engine/src/agent/marketplace/revenueService.ts`
- Create: `offchain/packages/engine/src/agent/marketplace/index.ts`

---

## Task 11: REST API Routes

**Files:**
- Create: `offchain/packages/gateway-lite/src/routes/agentDeployRoutes.ts`
- Create: `offchain/packages/gateway-lite/src/routes/agentMarketplaceRoutes.ts`
- Create: `offchain/packages/gateway-lite/src/routes/a2aRoutes.ts`
- Modify: `offchain/packages/gateway-lite/src/routes/index.ts`

---

## Task 12: Comprehensive Tests

**Files:**
- Create: `offchain/packages/engine/src/__tests__/agentDescriptor.test.ts`
- Create: `offchain/packages/engine/src/__tests__/runtimeAdapters.test.ts`
- Create: `offchain/packages/engine/src/__tests__/deployers.test.ts`
- Create: `offchain/packages/engine/src/__tests__/agentWallet.test.ts`
- Create: `offchain/packages/engine/src/__tests__/agentDeploymentService.test.ts`
- Create: `offchain/packages/engine/src/__tests__/a2a.test.ts`
- Create: `offchain/packages/engine/src/__tests__/marketplace.test.ts`
