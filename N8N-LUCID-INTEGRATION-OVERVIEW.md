# 🔗 n8n Agent Services Integration with Lucid L2

**How the n8n/Agent Services Integrate with the Core Lucid Platform**

---

## 🎯 Quick Summary

The **n8n Agent Services** (Phases 1-3) add **workflow automation and AI agent capabilities** on top of Lucid L2's core blockchain thought commitment system.

**Think of it as:**
- **Core Lucid** = Individual thoughts committed to blockchain
- **n8n/Agents** = Complex multi-step workflows orchestrating those thoughts + external actions

---

## 🏗️ Complete Lucid L2 Architecture

### Layer 1: Core Blockchain (Existing)
```
Solana Blockchain (Devnet)
    ├── thought-epoch program (Rust/Anchor)
    ├── lucid-passports program (Asset registry)
    ├── gas-utils program (Token burning)
    └── $LUCID Token (Dual-gas: iGas + mGas)
```

### Layer 2: Lucid API (Existing)
```
Express API (Port 3001)
    ├── POST /run - Commit single thought
    ├── POST /batch - Commit multiple thoughts
    ├── /agents/* - MMR proof-of-contribution
    ├── /passports/* - Asset management
    └── /system/status - Health monitoring
```

### Layer 3: AI Processing (Existing)
```
LLM Proxy (Port 8001)
    ├── Multiple AI providers (Eden, HuggingFace, etc.)
    ├── Model abstraction layer
    └── Cost optimization
```

### Layer 4: Workflow Automation (NEW - n8n/Agents)
```
Agent Services
    ├── n8n (Port 5678) - Visual workflow editor
    ├── CrewAI (Port 8082) - AI planning
    ├── LangGraph (Port 8083) - Complex execution
    └── MCP Tools (Ports 9001-9005) - External APIs
```

---

## 🔄 Integration Points

### How n8n Integrates with Lucid

```
User Goal: "Analyze my last 10 thoughts and post insights to Twitter"
                            ↓
        ┌──────────────────────────────────────────┐
        │   n8n Agent Orchestrator (NEW)           │
        │   "Natural language → Automated workflow" │
        └──────────────────────────────────────────┘
                            ↓
        ┌─────────────┬──────────────┬─────────────┐
        ↓             ↓              ↓             ↓
    Fetch from    LLM Analysis   Store on     Post to
    Blockchain    (llm-proxy)    IPFS         Twitter
    (Existing)    (Existing)     (NEW)        (NEW)
        ↓
    Lucid Core API → thought-epoch program → Blockchain
```

### Concrete Example Flow

**User Request:** "Every hour, fetch my thoughts, analyze trends, and commit summary to blockchain"

**What Happens:**

1. **CrewAI Plans** (NEW Layer):
   ```
   Goal → FlowSpec:
   - Node 1: Fetch thoughts from blockchain (uses existing Lucid API)
   - Node 2: Analyze with AI (uses existing llm-proxy)
   - Node 3: Generate summary
   - Node 4: Commit summary (uses existing POST /run)
   ```

2. **Executor Routes** (NEW Layer):
   ```
   FlowSpec → LangGraph (complex workflow)
   ```

3. **LangGraph Executes** (NEW Layer):
   ```
   Calls existing Lucid APIs in sequence
   ```

4. **Results:**
   ```
   New thought committed to blockchain using existing infrastructure
   ```

---

## 🎯 What n8n Adds to Lucid

### Before n8n (Core Lucid Only):
```javascript
// Manual API calls
await fetch('http://localhost:3001/run', {
  method: 'POST',
  body: JSON.stringify({ text: 'My thought' })
});

// No automation, no workflows, no agents
```

### After n8n (With Agent Services):
```javascript
// Single natural language goal
await fetch('http://localhost:3001/api/agents/accomplish', {
  method: 'POST',
  body: JSON.stringify({
    goal: 'Fetch BTC price, analyze with AI, store on IPFS, commit to blockchain'
  })
});

// Automatic workflow planning and execution
```

---

## 🔌 Integration Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     LUCID L2 PLATFORM                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  EXISTING CORE COMPONENTS:                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │ Blockchain │  │  LLM Proxy │  │  Frontend  │            │
│  │  (Solana)  │  │  (AI APIs) │  │ (Next.js)  │            │
│  └─────┬──────┘  └──────┬─────┘  └──────┬─────┘            │
│        │                 │                │                  │
│        └─────────────────┴────────────────┘                  │
│                          ↓                                   │
│                  ┌───────────────┐                           │
│                  │  Lucid API    │                           │
│                  │  (Port 3001)  │                           │
│                  └───────┬───────┘                           │
│                          │                                   │
├──────────────────────────┼───────────────────────────────────┤
│                          │                                   │
│  NEW AGENT SERVICES:     ↓                                   │
│  ┌────────────────────────────────────────────────┐         │
│  │         Agent Orchestrator (Phase 3.4)         │         │
│  │   "Natural language → Automated workflows"     │         │
│  └───────┬────────────────────────────────┬───────┘         │
│          │                                │                  │
│    ┌─────┴─────┐                    ┌─────┴─────┐          │
│    │  CrewAI   │                    │ Executor  │          │
│    │  Planner  │                    │  Router   │          │
│    │ (8082)    │                    └─────┬─────┘          │
│    └───────────┘                          │                  │
│                                     ┌─────┴─────┐            │
│                                     │           │            │
│                              ┌──────┴────┐ ┌────┴──────┐   │
│                              │    n8n    │ │ LangGraph │   │
│                              │  (5678)   │ │  (8083)   │   │
│                              └──────┬────┘ └────┬──────┘   │
│                                     │           │            │
│                                     └─────┬─────┘            │
│                                           │                  │
│                                    ┌──────┴──────┐          │
│                                    │  MCP Tools  │          │
│                                    │ (9001-9005) │          │
│                                    └─────────────┘          │
│                                    Twitter, IPFS,           │
│                                    GitHub, etc.             │
└─────────────────────────────────────────────────────────────┘
```

---

## 💡 Use Case Examples

### Use Case 1: Automated Thought Processing

**Without n8n (Manual):**
```bash
# Step 1: Commit thought
curl -X POST http://localhost:3001/run -d '{"text":"Market analysis"}'

# Step 2: Manually analyze
# (developer writes code)

# Step 3: Manually post to Twitter
# (developer writes code)
```

**With n8n/Agents (Automated):**
```bash
# Single call handles everything
curl -X POST http://localhost:3001/api/agents/accomplish \
  -d '{
    "goal": "Commit market analysis thought, analyze with AI, share on Twitter",
    "context": {"tenantId": "trader-bot"}
  }'

# Agent automatically:
# 1. Calls POST /run (existing Lucid API)
# 2. Calls llm-proxy for analysis (existing)
# 3. Posts to Twitter (new MCP tool)
```

### Use Case 2: Scheduled MMR Proofs

**What Agents Enable:**
```bash
# Create a workflow that runs every hour
curl -X POST http://localhost:3001/api/agents/accomplish \
  -d '{
    "goal": "Every hour, process new vectors for agent X, generate MMR proof, store on IPFS",
    "context": {"agentId": "my-agent"}
  }'

# This calls existing Lucid APIs:
# - POST /agents/epoch (MMR processing)
# - POST /agents/proof (proof generation)
# Plus new capabilities:
# - IPFS storage (MCP tool)
# - Scheduling (n8n)
```

### Use Case 3: Multi-Step Blockchain Workflows

**Complex Workflow:**
```bash
curl -X POST http://localhost:3001/api/agents/accomplish \
  -d '{
    "goal": "Fetch Solana price, if > $100 then commit bullish thought to blockchain and register as passport",
    "context": {"tenantId": "price-tracker"}
  }'

# Agent orchestrates:
# 1. HTTP call to price API (new MCP tool)
# 2. Conditional logic (new LangGraph)
# 3. POST /run to commit thought (existing Lucid API)
# 4. POST /passports/register (existing Lucid API)
```

---

## 🔗 API Integration Points

### Existing Lucid APIs Used by Agents

**Blockchain Operations:**
```typescript
// Agents can call these existing endpoints
POST /run                    // Commit single thought
POST /batch                  // Commit batch thoughts
POST /agents/init            // Initialize MMR agent
POST /agents/epoch           // Process MMR epoch
POST /agents/proof           // Generate proof
```

**These endpoints remain unchanged!** n8n workflows just call them programmatically.

### New Agent APIs

**Workflow Automation:**
```typescript
// New endpoints for automation
POST /api/agents/plan         // Generate workflow from goal
POST /api/agents/accomplish   // Execute goal end-to-end
POST /api/agents/execute      // Execute existing FlowSpec
GET  /api/agents/history/:id  // View execution history
```

---

## 📊 Data Flow Integration

### Example: Thought Commitment Workflow

```
User → "Commit thought with AI enhancement"
    ↓
Agent Orchestrator
    ↓
CrewAI Plans FlowSpec:
{
  "nodes": [
    {"type": "llm.chat", "input": {"text": "user input"}},  ← Uses llm-proxy
    {"type": "solana.write", "input": {"data": "$ref.1"}}  ← Uses POST /run
  ]
}
    ↓
LangGraph Executes:
    ├─→ Calls http://localhost:8001 (llm-proxy)
    └─→ Calls http://localhost:3001/run (Lucid API)
    ↓
Blockchain Transaction (existing flow)
```

### Example: MMR Proof Workflow

```
User → "Generate monthly MMR proof for my agent"
    ↓
Agent Orchestrator
    ↓
CrewAI Plans:
{
  "nodes": [
    {"type": "tool.http", "input": {"url": "/agents/my-agent/stats"}},
    {"type": "tool.http", "input": {"url": "/agents/proof", "data": "..."}},
    {"type": "tool.mcp", "tool": "ipfs", "op": "upload"}
  ]
}
    ↓
Executes against existing Lucid APIs
    ↓
Results: Proof generated and stored
```

---

## 🎨 Frontend Integration

### Browser Extension (Existing)
```javascript
// Existing: Direct API calls
await fetch('http://localhost:3001/run', {
  method: 'POST',
  body: JSON.stringify({ text: userInput })
});
```

### Browser Extension + Agents (Enhanced)
```javascript
// New: Agent-powered workflows
await fetch('http://localhost:3001/api/agents/accomplish', {
  method: 'POST',
  body: JSON.stringify({
    goal: `Commit this thought: ${userInput}, analyze it, and share insights`
  })
});
```

### Next.js Frontend (Existing)
- Can add "Automate" button that uses `/api/agents/accomplish`
- Visual workflow builder integration (future Phase 5)
- Real-time execution monitoring

---

## 💾 Database & State Integration

### Existing Lucid State:
```
- Blockchain: Thought epochs (on-chain)
- Memory Wallet: Local thought roots (memory-wallet.json)
- MMR State: Agent epochs and proofs (in-memory + IPFS)
- Passport Registry: Asset metadata (on-chain)
```

### n8n Adds:
```
- n8n Database: Workflow definitions (PostgreSQL)
- Execution History: Workflow run logs (PostgreSQL)
- Agent History: Execution tracking (in-memory, can persist)
- MCP Tool State: Tool metadata (in-memory)
```

**Important:** These are **separate** data stores. n8n doesn't modify Lucid's core data.

---

## 🔧 Configuration Integration

### Shared Configuration

Both systems use the same config file:

```typescript
// offchain/src/utils/config.ts

// Core Lucid configs (existing)
export const LUCID_MINT = '7cBsSHBB4nSVQy6ceUvmrA8Z2ks8Me8AjxSUqvJ2q1S9';
export const PROGRAM_ID = 'GdbWhvXLg55ACeauwTPB4rXpcgHxjKyT6YuTGeH5orCo';

// LLM Proxy (existing)
export const LLM_PROXY_URL = 'http://localhost:8001';

// n8n Integration (new)
export const N8N_URL = 'http://localhost:5678';
export const N8N_HMAC_SECRET = process.env.N8N_HMAC_SECRET;

// Agent Services (new)
export const CREWAI_URL = 'http://localhost:8082';
export const LANGGRAPH_URL = 'http://localhost:8083';
```

---

## 🌟 Practical Integration Examples

### Example 1: Enhanced Thought Commitment

**Traditional Flow:**
```bash
# User commits a thought
POST /run {"text": "My market insight"}
→ Blockchain commitment
→ Done
```

**Agent-Enhanced Flow:**
```bash
# User commits with automation
POST /api/agents/accomplish {
  "goal": "Commit 'My market insight', analyze it, generate related thoughts, commit those too"
}
→ Agent plans 4-step workflow
→ Commits original thought (calls POST /run)
→ Analyzes with AI (calls llm-proxy)
→ Generates 3 related thoughts (calls llm-proxy)
→ Commits all 3 in batch (calls POST /batch)
→ Returns complete results
```

### Example 2: Cross-Platform Integration

**Scenario:** Twitter monitoring + Blockchain storage

```bash
POST /api/agents/accomplish {
  "goal": "Monitor Twitter for 'Solana' mentions, commit relevant ones to blockchain"
}

Agent workflow:
1. Twitter MCP Tool → Search for tweets
2. LLM Analysis → Filter relevant ones
3. Lucid API POST /batch → Commit to blockchain
4. Repeat on schedule
```

### Example 3: MMR Automation

**Scenario:** Automated proof generation

```bash
POST /api/agents/accomplish {
  "goal": "Process today's vectors for agent-X, generate proofs, publish to IPFS"
}

Agent workflow:
1. Calls POST /agents/epoch (existing Lucid MMR API)
2. Calls POST /agents/proof (existing Lucid MMR API)
3. IPFS MCP Tool → Upload proofs
4. Returns IPFS CIDs
```

---

## 📦 Service Dependencies

### Startup Order

1. **Solana Validator** (Foundation)
   ```bash
   solana-test-validator
   ```

2. **LLM Proxy** (Core AI)
   ```bash
   cd llm-proxy && docker compose up -d
   ```

3. **Lucid API** (Core Backend)
   ```bash
   cd Lucid-L2/offchain && npm start
   ```

4. **n8n Services** (Optional Automation)
   ```bash
   cd Lucid-L2/n8n && docker compose up -d
   cd Lucid-L2/agent-services/crewai-service && docker compose up -d
   cd Lucid-L2/agent-services/langgraph-service && docker compose up -d
