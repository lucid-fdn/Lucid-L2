# Autonomous AI Agent Pipeline — Design Document

**Date:** 2026-03-03
**Author:** Claude Opus 4.6 + DaishizenSensei
**Status:** Implementation-ready
**Scope:** Lucid-L2, lucid-plateform-core, LucidMerged

---

## Executive Summary

Build the industry's first **runtime-agnostic, one-click autonomous AI agent deployment pipeline** that bridges Web3 (on-chain identity, DePIN hosting, agent wallets, tokenized ownership) with Web2 (enterprise hosting, MCP tools, multi-framework support). This makes Lucid the **"Cloudflare for AI Agents"** — the trust/governance/deployment layer that every agent framework needs but none has built.

### The 300% Competitive Advantage (12-month moat)

| Advantage | Why Nobody Else Has It | Time to Replicate |
|-----------|----------------------|-------------------|
| **MCP Gateway + Agent Trust** | Only platform combining 88 MCP servers + RBAC + audit + plan enforcement | 8-12 months |
| **Runtime-Agnostic Deployment** | Single agent definition → deploy to OpenClaw, LangGraph, CrewAI, Vercel AI SDK, OpenAI Agents | 6-9 months |
| **On-Chain Agent Identity** | Passport NFT + agent wallet (Crossmint/ERC-6551) + Solana anchoring | 6-8 months |
| **DePIN Compute Routing** | One-click deploy to Akash, Phala TEE, io.net — routed through TrustGate | 9-12 months |
| **Agent Marketplace + Revenue Sharing** | Share tokens + revenue airdrop for agents (not just models) | 6-9 months |
| **EU AI Act Compliance Layer** | Audit trail + traceability + policy enforcement (Aug 2026 deadline) | 12+ months |
| **A2A + MCP + Passport Unified** | Only platform bridging Google A2A, Anthropic MCP, and on-chain identity | 8-12 months |

**Combined: no competitor can replicate all 7 layers in under 12 months.**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LucidMerged (UI)                             │
│  Agent Studio: Create → Configure → Deploy → Monitor → Monetize    │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│                    lucid-plateform-core                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐               │
│  │ TrustGate   │  │ MCPGate     │  │ Control-Plane│               │
│  │ (LLM proxy) │  │ (88 tools)  │  │ (Admin API)  │               │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘               │
│         │                │                 │                        │
│  ┌──────▼──────────────────▼─────────────────▼───────┐             │
│  │              AgentaaS Module (NEW)                  │             │
│  │  ┌────────────┐  ┌───────────┐  ┌──────────────┐  │             │
│  │  │ Agent      │  │ Runtime   │  │ Deployment   │  │             │
│  │  │ Registry   │  │ Adapters  │  │ Orchestrator │  │             │
│  │  └────────────┘  └───────────┘  └──────────────┘  │             │
│  │  ┌────────────┐  ┌───────────┐  ┌──────────────┐  │             │
│  │  │ Agent      │  │ A2A       │  │ Marketplace  │  │             │
│  │  │ Wallet     │  │ Protocol  │  │ & Revenue    │  │             │
│  │  └────────────┘  └───────────┘  └──────────────┘  │             │
│  └───────────────────────────────────────────────────┘             │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│                          Lucid-L2                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Passport │  │ DePIN    │  │ NFT      │  │ Share Token      │   │
│  │ Registry │  │ Storage  │  │ Providers│  │ Launcher         │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Receipt  │  │ Epoch    │  │ Matching │  │ Execution        │   │
│  │ Service  │  │ Anchoring│  │ Engine   │  │ Gateway          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Agent Orchestrator (Enhanced)                                │   │
│  │  Planner → Router → Executor → Receipt → Anchor             │   │
│  └──────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│                    Deployment Targets                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Railway  │  │ Akash    │  │ Phala    │  │ Vercel Edge      │   │
│  │ (Web2)   │  │ (DePIN)  │  │ (TEE)   │  │ (Serverless)     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                         │
│  │ io.net   │  │ AWS      │  │ Docker   │                         │
│  │ (GPU)    │  │ Bedrock  │  │ (Self)   │                         │
│  └──────────┘  └──────────┘  └──────────┘                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component 1: Universal Agent Descriptor (UAD)

The core data model that enables runtime-agnostic deployment. Extends the existing Passport system.

### Schema: `AgentDescriptor`

```typescript
interface AgentDescriptor {
  // Identity (from Passport)
  passport_id: string;
  name: string;
  description: string;
  version: string;
  owner: string;
  tags: string[];

  // Agent Configuration
  agent_config: {
    // Core
    system_prompt: string;
    model_passport_id: string;           // Default LLM
    fallback_model_ids?: string[];       // Fallback models
    temperature?: number;                // 0-2
    max_tokens?: number;

    // Tools & Skills
    tool_passport_ids: string[];         // MCP tools via passport
    skill_slugs: string[];              // AgentSkills (SKILL.md format)
    mcp_servers: string[];              // MCPGate server references

    // Autonomy
    autonomy_level: 'supervised' | 'semi_autonomous' | 'fully_autonomous';
    stop_conditions: StopCondition[];
    guardrails: Guardrail[];

    // Memory
    memory_enabled: boolean;
    memory_provider: 'supabase' | 'lighthouse' | 'redis';
    memory_window_size: number;

    // Multi-agent
    workflow_type?: 'single' | 'sequential' | 'parallel' | 'dag';
    sub_agents?: string[];              // Passport IDs of sub-agents
    handoff_rules?: HandoffRule[];

    // Communication
    channels: ChannelConfig[];          // Telegram, Discord, WhatsApp, Web, A2A
    a2a_enabled: boolean;
    a2a_capabilities?: string[];        // A2A Agent Card capabilities
  };

  // Wallet & On-Chain
  wallet_config?: {
    enabled: boolean;
    provider: 'crossmint' | 'erc6551' | 'squads' | 'custom';
    chains: string[];                   // solana-devnet, base, ethereum
    spending_limits?: {
      per_tx_usd: number;
      daily_usd: number;
    };
    auto_fund?: boolean;
  };

  // Deployment
  deployment_config: {
    target: DeploymentTarget;
    replicas?: number;
    auto_scale?: boolean;
    health_check_interval_ms?: number;
    restart_policy: 'always' | 'on_failure' | 'never';
    env_vars?: Record<string, string>;  // Runtime env vars
    secrets?: string[];                 // Credential references
  };

  // Monetization
  monetization?: {
    enabled: boolean;
    pricing_model: 'free' | 'per_call' | 'subscription' | 'token_gated';
    price_per_call_usd?: number;
    share_token_mint?: string;          // SPL Token for revenue sharing
    revenue_split: {
      creator: number;                  // 0-100%
      compute: number;
      protocol: number;
    };
  };

  // Compliance
  compliance?: {
    audit_all_actions: boolean;
    require_human_approval: string[];   // Tool names requiring approval
    data_retention_days: number;
    eu_ai_act_category?: 'minimal' | 'limited' | 'high' | 'unacceptable';
  };
}

type DeploymentTarget =
  | { type: 'railway'; service_id?: string }
  | { type: 'akash'; sdl_template?: string }
  | { type: 'phala'; tee_required: boolean }
  | { type: 'ionet'; gpu_type?: string }
  | { type: 'vercel_edge' }
  | { type: 'docker'; image?: string }
  | { type: 'aws_bedrock' }
  | { type: 'self_hosted'; url: string };

interface StopCondition {
  type: 'max_steps' | 'max_cost_usd' | 'max_duration_ms' | 'goal_achieved' | 'human_stop';
  value: number | string;
}

interface Guardrail {
  type: 'input_filter' | 'output_filter' | 'tool_approval' | 'budget_limit' | 'scope_restriction';
  config: Record<string, unknown>;
}

interface HandoffRule {
  from_agent: string;
  to_agent: string;
  condition: string;                    // Natural language or regex
}

interface ChannelConfig {
  type: 'telegram' | 'discord' | 'whatsapp' | 'slack' | 'web' | 'a2a' | 'webhook';
  config: Record<string, unknown>;
}
```

### JSON Schema: `AgentDescriptor.schema.json`

To be placed in `/c/Lucid-L2/schemas/AgentDescriptor.schema.json` for AJV validation (same pattern as existing ModelMeta, ComputeMeta, etc.).

---

## Component 2: Runtime Adapters

Translates UAD into framework-specific agent definitions.

### Adapter Interface

```typescript
interface IRuntimeAdapter {
  readonly name: string;
  readonly version: string;

  // Can this adapter handle the given descriptor?
  canHandle(descriptor: AgentDescriptor): boolean;

  // Generate framework-specific agent definition
  generate(descriptor: AgentDescriptor): Promise<RuntimeArtifact>;

  // Deploy the generated artifact
  deploy(artifact: RuntimeArtifact, target: DeploymentTarget): Promise<DeploymentResult>;

  // Health check for a deployed agent
  healthCheck(deploymentId: string): Promise<HealthStatus>;

  // Terminate a deployed agent
  terminate(deploymentId: string): Promise<void>;
}

interface RuntimeArtifact {
  adapter: string;
  files: Map<string, string>;          // filename → content
  entrypoint: string;
  dependencies: Record<string, string>;
  env_vars: Record<string, string>;
  dockerfile?: string;
}
```

### Priority Adapters (Implementation Order)

| # | Adapter | Output | Why |
|---|---------|--------|-----|
| 1 | `VercelAIAdapter` | ToolLoopAgent TypeScript | Already using Vercel AI SDK |
| 2 | `OpenClawAdapter` | SKILL.md + gateway config | 13,729+ skill ecosystem |
| 3 | `OpenAIAgentsAdapter` | Python Agent definition | Simplest SDK, widest model support |
| 4 | `LangGraphAdapter` | Python StateGraph | Industry standard for complex flows |
| 5 | `CrewAIAdapter` | YAML agents + tasks | Best for multi-agent teams |
| 6 | `GoogleADKAdapter` | Python ADK Agent | Native A2A + MCP |
| 7 | `DockerAdapter` | Dockerfile + compose | Universal fallback |

### Adapter 1: VercelAIAdapter (Primary)

Generates a standalone Next.js API route or Node.js server:

```typescript
// Generated output
import { ToolLoopAgent } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const provider = createOpenAI({
  baseURL: process.env.TRUSTGATE_URL,
  apiKey: process.env.TRUSTGATE_API_KEY,
});

const agent = new ToolLoopAgent({
  model: provider("{{model_id}}"),
  system: `{{system_prompt}}`,
  tools: {
    {{#each tools}}
    {{name}}: mcpTool("{{mcp_server}}", "{{tool_name}}"),
    {{/each}}
  },
  stopWhen: stepCountIs({{max_steps}}),
});
```

### Adapter 2: OpenClawAdapter

Generates a SKILL.md directory structure:

```yaml
---
name: {{name}}
description: {{description}}
metadata:
  lucid:
    passport_id: {{passport_id}}
    model: {{model_id}}
  openclaw:
    env:
      - TRUSTGATE_API_KEY
    tools:
      {{#each tools}}
      - {{name}}
      {{/each}}
    user-invocable: true
---

# {{name}}

{{system_prompt}}

## Available Tools

{{#each tools}}
- **{{name}}**: {{description}}
{{/each}}

## Behavior

{{#each guardrails}}
- {{description}}
{{/each}}
```

---

## Component 3: Deployment Orchestrator

Manages the lifecycle of deployed agents across targets.

### Architecture

```typescript
class DeploymentOrchestrator {
  private adapters: Map<string, IRuntimeAdapter>;
  private deployers: Map<string, IDeployer>;

  // One-click deployment pipeline
  async deployAgent(descriptor: AgentDescriptor): Promise<DeploymentResult> {
    // 1. Validate descriptor against schema
    const validation = validateAgentDescriptor(descriptor);
    if (!validation.ok) throw new ValidationError(validation.errors);

    // 2. Select best adapter for target
    const adapter = this.selectAdapter(descriptor);

    // 3. Generate runtime artifact
    const artifact = await adapter.generate(descriptor);

    // 4. Create agent wallet (if enabled)
    let wallet: AgentWallet | undefined;
    if (descriptor.wallet_config?.enabled) {
      wallet = await this.createAgentWallet(descriptor);
    }

    // 5. Register agent passport (if not exists)
    const passport = await this.ensurePassport(descriptor);

    // 6. Mint agent NFT (if enabled)
    if (passport.on_chain_pda === null) {
      await this.mintAgentNFT(passport, descriptor);
    }

    // 7. Deploy to target
    const deployer = this.deployers.get(descriptor.deployment_config.target.type);
    const deployment = await deployer.deploy(artifact, descriptor.deployment_config);

    // 8. Configure channels
    await this.configureChannels(descriptor, deployment);

    // 9. Setup monitoring
    await this.setupMonitoring(descriptor, deployment);

    // 10. Store deployment state
    await this.storeDeployment(descriptor, deployment, wallet);

    // 11. Create receipt
    await this.createDeploymentReceipt(descriptor, deployment);

    return deployment;
  }
}
```

### Deployers

```typescript
interface IDeployer {
  readonly target: string;
  deploy(artifact: RuntimeArtifact, config: DeploymentConfig): Promise<DeploymentResult>;
  status(deploymentId: string): Promise<DeploymentStatus>;
  logs(deploymentId: string, options?: LogOptions): Promise<string>;
  terminate(deploymentId: string): Promise<void>;
  scale(deploymentId: string, replicas: number): Promise<void>;
}
```

| Deployer | Target | Method |
|----------|--------|--------|
| `RailwayDeployer` | Railway | Railway API (existing infra) |
| `DockerDeployer` | Docker/self-hosted | Docker SDK |
| `AkashDeployer` | Akash Network | SDL manifest + Akash CLI |
| `PhalaDeployer` | Phala TEE | Phala Cloud API |
| `IoNetDeployer` | io.net | IO Intelligence API |
| `VercelDeployer` | Vercel Edge | Vercel API |

---

## Component 4: Agent Wallet System

### Solana Agent Wallets (via Crossmint)

```typescript
interface IAgentWalletProvider {
  createWallet(agentPassportId: string, config: WalletConfig): Promise<AgentWallet>;
  getWallet(agentPassportId: string): Promise<AgentWallet | null>;
  getBalance(walletAddress: string): Promise<WalletBalance>;
  executeTransaction(walletAddress: string, tx: TransactionRequest): Promise<TxResult>;
  setSpendingLimits(walletAddress: string, limits: SpendingLimits): Promise<void>;
}

// Implementations
class CrossmintWalletProvider implements IAgentWalletProvider { ... }
class ERC6551WalletProvider implements IAgentWalletProvider { ... }  // EVM TBA
class SquadsWalletProvider implements IAgentWalletProvider { ... }   // Solana multisig
class MockWalletProvider implements IAgentWalletProvider { ... }     // Dev/test
```

### Factory Pattern (same as existing DePIN/NFT pattern)

```typescript
function getAgentWalletProvider(): IAgentWalletProvider {
  switch (process.env.AGENT_WALLET_PROVIDER) {
    case 'crossmint': return new CrossmintWalletProvider();
    case 'erc6551': return new ERC6551WalletProvider();
    case 'squads': return new SquadsWalletProvider();
    default: return new MockWalletProvider();
  }
}
```

---

## Component 5: A2A Protocol Implementation

### Agent Card (Discovery)

```typescript
// Served at /.well-known/agent.json for each deployed agent
interface AgentCard {
  name: string;
  description: string;
  url: string;                          // Agent's A2A endpoint
  version: string;
  capabilities: string[];
  authentication: {
    type: 'bearer' | 'oauth2';
    config: Record<string, unknown>;
  };
  skills: Array<{
    name: string;
    description: string;
    inputSchema: JSONSchema;
    outputSchema: JSONSchema;
  }>;
  defaultInputModes: string[];          // text, file, data
  defaultOutputModes: string[];
}
```

### A2A Server (per deployed agent)

```typescript
// POST /tasks/send — create a task
// GET /tasks/:id — get task status
// POST /tasks/:id/sendSubscribe — SSE streaming
// DELETE /tasks/:id — cancel task

class A2AServer {
  async handleTask(task: A2ATask): Promise<A2ATaskResult> {
    // Route through TrustGate for auth + metering
    // Execute via agent's runtime adapter
    // Return structured result with provenance (receipt)
  }
}
```

---

## Component 6: Agent Marketplace

### Database Schema (new migration)

```sql
-- Agent marketplace listings
CREATE TABLE agent_marketplace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_passport_id TEXT REFERENCES passports(passport_id),
  listing_type TEXT CHECK (listing_type IN ('free', 'per_call', 'subscription', 'token_gated')),
  price_per_call_usd NUMERIC(10,6),
  monthly_price_usd NUMERIC(10,2),
  token_gate_mint TEXT,                 -- SPL token required for access
  category TEXT,
  featured BOOLEAN DEFAULT false,
  total_calls BIGINT DEFAULT 0,
  total_revenue_usd NUMERIC(12,2) DEFAULT 0,
  avg_rating NUMERIC(3,2),
  review_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent usage tracking
CREATE TABLE agent_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_passport_id TEXT NOT NULL,
  caller_tenant_id TEXT NOT NULL,
  session_id TEXT,
  tool_calls INT DEFAULT 0,
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  cost_usd NUMERIC(10,6),
  duration_ms INT,
  status TEXT CHECK (status IN ('success', 'error', 'timeout')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Agent deployments state
CREATE TABLE agent_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_passport_id TEXT REFERENCES passports(passport_id),
  tenant_id TEXT NOT NULL,
  deployment_target TEXT NOT NULL,
  deployment_id TEXT,                   -- External deployment reference
  status TEXT CHECK (status IN ('deploying', 'running', 'stopped', 'failed', 'terminated')),
  runtime_adapter TEXT NOT NULL,
  wallet_address TEXT,
  a2a_endpoint TEXT,
  health_status TEXT DEFAULT 'unknown',
  last_health_check TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent reviews
CREATE TABLE agent_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_passport_id TEXT NOT NULL,
  reviewer_tenant_id TEXT NOT NULL,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_passport_id, reviewer_tenant_id)
);
```

---

## Component 7: Enterprise Features ("Cloudflare for AI Agents")

### What We Monetize

| Feature | Free/Starter | Pro | Business |
|---------|-------------|-----|----------|
| Agent deployments | 1 | 10 | 100 |
| Runtime adapters | Vercel AI only | +OpenClaw, OpenAI | All 7 |
| Deployment targets | Railway only | +Docker, Akash | All targets |
| Agent wallet | No | Solana only | Multi-chain |
| A2A protocol | No | Yes | Yes |
| Marketplace listing | No | Yes | Featured |
| Audit trail | 7 days | 30 days | Unlimited |
| EU AI Act compliance | No | Basic | Full |
| DePIN compute | No | Akash | +Phala TEE, io.net |
| Custom guardrails | No | 5 | Unlimited |
| Revenue sharing | 80/10/10 | 90/5/5 | Custom |

### Enterprise API Gateway Features

Leverage TrustGate as the "Cloudflare for AI Agents":

1. **Agent DDoS Protection** — Rate limit agent-to-agent calls
2. **Agent Traffic Analytics** — Real-time dashboards for agent interactions
3. **Agent WAF** — Filter malicious tool calls / prompt injection
4. **Agent CDN** — Cache frequent tool call responses at edge
5. **Agent Observability** — OpenTelemetry traces for every agent action
6. **Agent Compliance** — Automatic EU AI Act logging
7. **Agent Billing** — Usage-based billing per agent call (OpenMeter)

---

## Implementation Plan

### Phase 1: Core Agent Pipeline (Week 1-2)
**Repo: Lucid-L2**

1. Create `AgentDescriptor.schema.json` in `/schemas/`
2. Extend `passportManager.ts` to validate AgentDescriptor
3. Create `agentDeploymentService.ts` in engine
4. Create `IRuntimeAdapter` interface + VercelAIAdapter
5. Create `IDeployer` interface + RailwayDeployer + DockerDeployer
6. Create `DeploymentOrchestrator` class
7. Create deployment state management (agent_deployments table)
8. Add REST routes: `POST /v1/agents/deploy`, `GET /v1/agents/:id/status`, etc.
9. Update OpenAPI spec
10. Tests for all new code

### Phase 2: Agent Wallets + On-Chain (Week 2-3)
**Repo: Lucid-L2**

1. Create `IAgentWalletProvider` interface
2. Implement `CrossmintWalletProvider` (Solana)
3. Implement `ERC6551WalletProvider` (EVM)
4. Implement `MockWalletProvider`
5. Wire wallet creation into deployment pipeline
6. Agent NFT minting on deployment
7. Share token integration for agents
8. Tests

### Phase 3: Runtime Adapters (Week 3-4)
**Repo: Lucid-L2 + lucid-plateform-core**

1. Implement `OpenClawAdapter` (SKILL.md generation)
2. Implement `OpenAIAgentsAdapter`
3. Implement `LangGraphAdapter`
4. Implement `CrewAIAdapter`
5. Implement `GoogleADKAdapter`
6. Implement `DockerAdapter` (universal fallback)
7. Tests for each adapter

### Phase 4: DePIN Deployment (Week 4-5)
**Repo: lucid-plateform-core**

1. Implement `AkashDeployer` (SDL generation + deployment)
2. Implement `PhalaDeployer` (TEE deployment)
3. Implement `IoNetDeployer` (GPU deployment)
4. DePIN compute matching (extend existing matching engine)
5. Health monitoring for DePIN deployments
6. Tests

### Phase 5: A2A Protocol + Marketplace (Week 5-6)
**Repo: lucid-plateform-core + LucidMerged**

1. A2A server implementation
2. Agent Card generation from passport
3. A2A client for agent discovery
4. Marketplace database migration
5. Marketplace API routes
6. Agent usage tracking
7. Revenue sharing integration
8. Tests

### Phase 6: Frontend Agent Studio (Week 6-7)
**Repo: LucidMerged**

1. Agent creation wizard (step-by-step)
2. Runtime adapter selector
3. Deployment target picker
4. Agent wallet configuration
5. Channel configuration
6. Agent monitoring dashboard
7. Marketplace browser
8. Agent deployment logs

### Phase 7: Enterprise Features (Week 7-8)
**Repo: lucid-plateform-core + LucidMerged**

1. Plan enforcement for agent features
2. EU AI Act compliance logging
3. Agent observability (OpenTelemetry)
4. Agent traffic analytics dashboard
5. Custom guardrail builder
6. Enterprise billing integration
7. Documentation

---

## File Placement

### Lucid-L2
```
schemas/
  AgentDescriptor.schema.json          # New
offchain/packages/engine/src/
  agent/
    agentDescriptor.ts                 # UAD type definitions
    agentDeploymentService.ts          # Core deployment logic
    agentWallet/
      IAgentWalletProvider.ts          # Interface
      CrossmintWalletProvider.ts       # Solana wallets
      ERC6551WalletProvider.ts         # EVM TBA wallets
      MockWalletProvider.ts            # Dev/test
      index.ts                         # Factory
  runtime/
    IRuntimeAdapter.ts                 # Interface
    VercelAIAdapter.ts                 # Primary adapter
    OpenClawAdapter.ts                 # SKILL.md generation
    OpenAIAgentsAdapter.ts             # OpenAI Agents SDK
    LangGraphAdapter.ts                # LangGraph
    CrewAIAdapter.ts                   # CrewAI
    GoogleADKAdapter.ts                # Google ADK
    DockerAdapter.ts                   # Universal fallback
    index.ts                           # Registry
  deploy/
    IDeployer.ts                       # Interface
    RailwayDeployer.ts                 # Railway API
    DockerDeployer.ts                  # Docker SDK
    AkashDeployer.ts                   # Akash Network
    PhalaDeployer.ts                   # Phala TEE
    IoNetDeployer.ts                   # io.net
    index.ts                           # Registry
offchain/packages/gateway-lite/src/
  routes/
    agentDeployRoutes.ts               # REST API
    agentMarketplaceRoutes.ts          # Marketplace API
    a2aRoutes.ts                       # A2A protocol
```

### lucid-plateform-core
```
modules/agentaas/src/
  a2a/
    a2aServer.ts                       # A2A protocol server
    agentCard.ts                       # Agent Card generation
    a2aClient.ts                       # A2A client for discovery
  marketplace/
    marketplaceService.ts              # Listing management
    revenueService.ts                  # Revenue sharing
    reviewService.ts                   # Reviews
  enterprise/
    complianceLogger.ts                # EU AI Act logging
    agentWAF.ts                        # Agent request filtering
    agentAnalytics.ts                  # Traffic analytics
migrations/
  020_agent_deployments.sql            # New tables
  021_agent_marketplace.sql            # Marketplace tables
```

### LucidMerged
```
src/app/(app)/[workspace-slug]/agents/
  page.tsx                             # Agent list
  [id]/
    page.tsx                           # Agent detail
    deploy/
      page.tsx                         # Deployment wizard
src/components/agents/
  agent-create-wizard.tsx              # Step-by-step creation
  agent-deploy-panel.tsx               # Deployment UI
  agent-monitor.tsx                    # Health dashboard
  agent-marketplace.tsx                # Marketplace browser
  runtime-selector.tsx                 # Runtime picker
  deployment-target-selector.tsx       # Target picker
  agent-wallet-config.tsx              # Wallet setup
```

---

## Partner vs Build vs Fork Analysis

| Component | Strategy | Rationale |
|-----------|----------|-----------|
| Agent wallets (Solana) | **Partner: Crossmint** | Best-in-class, dual-key, fleet management, 10 lines to integrate |
| Agent wallets (EVM) | **Build: ERC-6551** | Open standard, integrate with existing EVMNFTProvider |
| DePIN compute (Akash) | **Partner: Akash API** | Open source SDL, we generate manifests |
| DePIN compute (Phala) | **Partner: Phala Cloud API** | TEE is specialized hardware, can't replicate |
| DePIN compute (io.net) | **Partner: IO Intelligence API** | GPU fleet, API access |
| A2A Protocol | **Build: implement spec** | Open spec (Linux Foundation), straightforward |
| MCP Protocol | **Already built: MCPGate** | 88 servers, RBAC, audit |
| OpenClaw adapter | **Build: SKILL.md generator** | Our skills already compatible |
| LangGraph adapter | **Build: code generator** | Standard Python, well-documented |
| CrewAI adapter | **Build: YAML generator** | YAML format, straightforward |
| Agent marketplace | **Build** | Core monetization, must own |
| EU AI Act compliance | **Build** | Competitive moat, Aug 2026 deadline |
| Revenue sharing | **Already built: revenueAirdrop.ts** | Extend to agents |

---

## Key Design Decisions

1. **Runtime-agnostic via adapters** — We don't build our own agent runtime. We generate code for existing runtimes. This is the Cloudflare model: sit in front of everything, own nothing at the execution layer.

2. **Passport is the anchor** — Every agent gets a Passport. The Passport is the on-chain identity, the marketplace listing, the audit trail root. Everything connects through it.

3. **MCP as the universal tool layer** — All tool access goes through MCPGate. Runtime adapters map their framework's tool format to MCP calls. This means TrustGate meters/audits every tool call regardless of which framework is running.

4. **Deploy anywhere, trust through us** — Whether the agent runs on Railway, Akash, Phala, or self-hosted Docker, all LLM calls route through TrustGate and all tool calls route through MCPGate. We are the trust layer.

5. **Wallet per agent, not per user** — Each agent gets its own wallet (Crossmint dual-key or ERC-6551 TBA). The agent can transact autonomously within spending limits. The passport holder controls the wallet.

6. **A2A for inter-agent commerce** — Agents discover each other via A2A Agent Cards, negotiate tasks, and pay each other via x402. All metered through TrustGate.
