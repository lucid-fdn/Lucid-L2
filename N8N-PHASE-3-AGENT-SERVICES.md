# 🤖 Phase 3: Agent Services - Implementation Plan

**Goal:** Add AI agents that can plan and execute workflows autonomously  
**Time Estimate:** 2-3 weeks  
**Prerequisites:** ✅ Phase 1 & 2 Complete

---

## 📋 Phase 3 Overview

### What We're Building

**Phase 3 adds autonomous AI agents that:**
- Plan complex workflows based on natural language goals
- Generate FlowSpec DSL programmatically
- Execute workflows via n8n or LangGraph
- Use tools via MCP (Model Context Protocol)
- Adapt and learn from execution results

### Architecture

```
User Request ("Analyze this dataset and post results to Twitter")
    ↓
CrewAI Planner Service
    ↓ (generates)
FlowSpec DSL
    ↓ (routes to)
┌─────────┴──────────┐
│                    │
n8n Executor    LangGraph Executor
│                    │
└────────┬───────────┘
         ↓
    MCP Tools
         ↓
   (Twitter, IPFS, Solana, etc.)
```

---

## 🔧 Phase 3.1: CrewAI Planner Service (Week 1)

### Objective
Build a service that takes natural language goals and generates FlowSpec workflows.

### What We'll Create

**1. CrewAI Service (Docker container)**

```python
# crewai-service/app.py
from crewai import Agent, Task, Crew
from fastapi import FastAPI

app = FastAPI()

class WorkflowPlanner:
    def __init__(self):
        self.planner_agent = Agent(
            role='Workflow Architect',
            goal='Design efficient workflows for AI tasks',
            backstory='Expert in orchestration and AI pipelines'
        )
    
    def plan_workflow(self, goal: str) -> dict:
        # Returns FlowSpec JSON
        task = Task(
            description=f"Create a workflow for: {goal}",
            agent=self.planner_agent
        )
        
        crew = Crew(agents=[self.planner_agent], tasks=[task])
        result = crew.kickoff()
        
        return self.parse_to_flowspec(result)

@app.post("/plan")
async def plan_workflow(request: dict):
    planner = WorkflowPlanner()
    flowspec = planner.plan_workflow(request["goal"])
    return {"flowspec": flowspec}
```

**2. Integration with Lucid API**

```typescript
// offchain/src/services/agentPlanner.ts
export class AgentPlannerService {
  async planWorkflow(goal: string): Promise<FlowSpec> {
    const response = await axios.post(
      'http://localhost:8082/plan',
      { goal }
    );
    return response.data.flowspec;
  }
}

// New API endpoint
router.post('/agents/plan', async (req, res) => {
  const { goal } = req.body;
  const planner = new AgentPlannerService();
  const flowspec = await planner.planWorkflow(goal);
  
  // Optionally auto-execute
  if (req.body.autoExecute) {
    const flowspecService = getFlowSpecService();
    const result = await flowspecService.createWorkflow(flowspec);
    return res.json({ flowspec, workflowId: result.id });
  }
  
  res.json({ flowspec });
});
```

### Deliverables (Week 1)

- [ ] `crewai-service/` Docker container
- [ ] CrewAI agent configuration
- [ ] FlowSpec generation logic
- [ ] API integration (`/agents/plan` endpoint)
- [ ] Test suite for planning
- [ ] Documentation: CREWAI-INTEGRATION-GUIDE.md

---

## 🔧 Phase 3.2: LangGraph Executor Service (Week 2)

### Objective
Provide an alternative to n8n using LangGraph for more complex agent workflows.

### What We'll Create

**1. LangGraph Service (Docker container)**

```python
# langgraph-service/app.py
from langgraph.graph import Graph, StateGraph
from fastapi import FastAPI

app = FastAPI()

class FlowSpecExecutor:
    def execute_flowspec(self, spec: dict, context: dict):
        # Build LangGraph from FlowSpec
        graph = self.compile_flowspec(spec)
        
        # Execute
        result = graph.invoke(context)
        return result
    
    def compile_flowspec(self, spec: dict) -> Graph:
        # Convert FlowSpec nodes → LangGraph nodes
        graph = StateGraph(dict)
        
        for node in spec['nodes']:
            graph.add_node(node['id'], self.make_node_fn(node))
        
        for edge in spec['edges']:
            graph.add_edge(edge['from'], edge['to'])
        
        return graph.compile()

@app.post("/execute")
async def execute_workflow(request: dict):
    executor = FlowSpecExecutor()
    result = executor.execute_flowspec(
        request["flowspec"],
        request["context"]
    )
    return {"result": result}
```

**2. Executor Router (Choose n8n or LangGraph)**

```typescript
// offchain/src/services/executorRouter.ts
export class ExecutorRouter {
  async execute(
    flowspec: FlowSpec,
    context: FlowExecutionContext,
    preferredExecutor?: 'n8n' | 'langgraph'
  ): Promise<FlowExecutionResult> {
    
    const executor = preferredExecutor || this.selectBestExecutor(flowspec);
    
    if (executor === 'langgraph') {
      return this.executeLangGraph(flowspec, context);
    } else {
      return this.executeN8n(flowspec, context);
    }
  }
  
  private selectBestExecutor(flowspec: FlowSpec): 'n8n' | 'langgraph' {
    // Decision logic:
    // - Simple workflows → n8n (visual debugging)
    // - Complex agent loops → LangGraph (better for AI)
    // - Long-running → LangGraph (built-in persistence)
    
    if (flowspec.nodes.length > 10) return 'langgraph';
    if (flowspec.edges.some(e => e.when)) return 'langgraph'; // Has conditions
    return 'n8n';
  }
}
```

### Deliverables (Week 2)

- [ ] `langgraph-service/` Docker container
- [ ] FlowSpec → LangGraph compiler
- [ ] Executor router with selection logic
- [ ] `/agents/execute` endpoint (router)
- [ ] Canary testing (shadow mode)
- [ ] Documentation: LANGGRAPH-INTEGRATION-GUIDE.md

---

## 🔧 Phase 3.3: MCP Tool Registry (Week 2-3)

### Objective
Integrate MCP (Model Context Protocol) tools for agent capabilities.

### What We'll Create

**1. MCP Docker Catalog**

```yaml
# mcp-tools/docker-compose.yml
version: '3.8'

services:
  mcp-twitter:
    image: mcp/twitter-server:latest
    environment:
      - TWITTER_API_KEY=${TWITTER_API_KEY}
    networks:
      - lucid-network
  
  mcp-ipfs:
    image: mcp/ipfs-server:latest
    volumes:
      - ipfs_data:/data
    networks:
      - lucid-network
  
  mcp-solana:
    image: mcp/solana-server:latest
    environment:
      - RPC_URL=https://api.devnet.solana.com
    networks:
      - lucid-network
```

**2. MCP Tool Registry**

```typescript
// offchain/src/services/mcpRegistry.ts
export class MCPToolRegistry {
  private tools: Map<string, MCPTool> = new Map();
  
  async registerTool(name: string, mcpUrl: string) {
    const tool = await this.fetchToolSchema(mcpUrl);
    this.tools.set(name, tool);
  }
  
  async listTools(): Promise<MCPTool[]> {
    return Array.from(this.tools.values());
  }
  
  async executeTool(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    
    return await axios.post(tool.url, params);
  }
}
```

**3. FlowSpec Tool Node Support**

```typescript
// Add to FlowSpec types
export type FlowNodeType = 
  | 'llm.chat'
  | 'tool.mcp'  // NEW
  | 'tool.http'
  | 'solana.write'
  // ...

export interface MCPToolNode extends FlowNode {
  type: 'tool.mcp';
  tool: string; // Tool name from registry
  input: Record<string, unknown>;
}
```

### Deliverables (Week 2-3)

- [ ] MCP Docker catalog setup
- [ ] 3-5 pre-configured MCP servers (Twitter, IPFS, Solana, GitHub, Web Search)
- [ ] MCPToolRegistry service
- [ ] FlowSpec compiler support for MCP tools
- [ ] `/tools/list` and `/tools/execute` endpoints
- [ ] Documentation: MCP-TOOLS-GUIDE.md

---

## 🔧 Phase 3.4: Agent Orchestration Layer (Week 3)

### Objective
Tie everything together: user goals → agent planning → workflow execution → results.

### What We'll Create

**1. Agent Orchestrator**

```typescript
// offchain/src/services/agentOrchestrator.ts
export class AgentOrchestrator {
  private planner: AgentPlannerService;
  private executor: ExecutorRouter;
  private registry: MCPToolRegistry;
  
  async accomplish(goal: string, context: any): Promise<any> {
    console.log(`🎯 Agent: Accomplishing goal: ${goal}`);
    
    // Step 1: Plan workflow
    const flowspec = await this.planner.planWorkflow(goal);
    console.log(`📋 Generated FlowSpec with ${flowspec.nodes.length} nodes`);
    
    // Step 2: Execute workflow
    const result = await this.executor.execute(flowspec, context);
    console.log(`✅ Execution complete: ${result.success}`);
    
    // Step 3: Return results
    return {
      goal,
      flowspec,
      executionResult: result,
      timestamp: Date.now()
    };
  }
}
```

**2. New API Endpoints**

```typescript
// POST /agents/accomplish
router.post('/agents/accomplish', async (req, res) => {
  const { goal, context } = req.body;
  const orchestrator = new AgentOrchestrator();
  const result = await orchestrator.accomplish(goal, context);
  res.json(result);
});

// POST /agents/plan-and-execute
router.post('/agents/plan-and-execute', async (req, res) => {
  // Combines planning + execution in one call
});
```

**3. Example Usage**

```bash
# User makes a request
curl -X POST http://localhost:3001/agents/accomplish \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Fetch BTC price, analyze trend, post to Twitter if bullish",
    "context": {
      "tenantId": "user123",
      "credentials": {
        "twitter": "twitter-cred-ref",
        "solana": "solana-wallet-ref"
      }
    }
  }'

# Agent plans workflow:
# 1. HTTP call to CoinGecko API
# 2. LLM analysis of price data
# 3. Conditional: if bullish → Twitter MCP tool
# 4. Solana write (record analysis on-chain)

# Executes via n8n/LangGraph, returns results
```

### Deliverables (Week 3)

- [ ] AgentOrchestrator service
- [ ] `/agents/accomplish` endpoint
- [ ] `/agents/plan-and-execute` endpoint
- [ ] Example agent scenarios
- [ ] Testing suite
- [ ] Documentation: AGENT-ORCHESTRATION-GUIDE.md

---

## 📦 Complete Phase 3 Deliverables

### Services (4 new Docker containers)
1. **crewai-service** (port 8082) - Workflow planning
2. **langgraph-service** (port 8083) - Alternative executor
3. **mcp-tools** (multiple ports) - Tool catalog
4. **agent-orchestrator** (integrated in Lucid API)

### Code Files (~20 new files)
```
Lucid-L2/
├── agent-services/
│   ├── crewai-service/
│   │   ├── Dockerfile
│   │   ├── app.py
│   │   ├── requirements.txt
│   │   └── agents/
│   ├── langgraph-service/
│   │   ├── Dockerfile
│   │   ├── app.py
│   │   └── executors/
│   └── mcp-tools/
│       ├── docker-compose.yml
│       └── tools/
├── offchain/src/
│   ├── services/
│   │   ├── agentPlanner.ts
│   │   ├── executorRouter.ts
│   │   ├── mcpRegistry.ts
│   │   └── agentOrchestrator.ts
│   └── types/
│       └── agent.ts
└── docs/
    ├── N8N-PHASE-3-AGENT-SERVICES.md (this file)
    ├── CREWAI-INTEGRATION-GUIDE.md
    ├── LANGGRAPH-INTEGRATION-GUIDE.md
    ├── MCP-TOOLS-GUIDE.md
    └── AGENT-ORCHESTRATION-GUIDE.md
```

### New API Endpoints (5 endpoints)
- `POST /agents/plan` - Generate workflow from goal
- `POST /agents/execute` - Execute with executor selection
- `POST /agents/accomplish` - Plan + execute in one call
- `GET /tools/list` - List available MCP tools
- `POST /tools/execute` - Execute MCP tool directly

---

## 🚀 Implementation Roadmap

### Week 1: CrewAI Planner

**Day 1-2: CrewAI Docker Setup**
- Create `crewai-service/` directory
- Dockerfile with Python + CrewAI dependencies
- Basic FastAPI server
- Test with simple planning task

**Day 3-4: FlowSpec Generation**
- Implement goal → FlowSpec logic
- Handle different workflow patterns
- Validate generated FlowSpec
- Test with 10+ example goals

**Day 5: API Integration**
- Add `/agents/plan` endpoint
- Connect to CrewAI service
- Error handling
- Documentation

### Week 2: LangGraph Executor + MCP Tools

**Day 1-2: LangGraph Service**
- Create `langgraph-service/` directory
- FlowSpec → LangGraph compiler
- Execution engine
- Test with sample FlowSpecs

**Day 3-4: MCP Tool Registry**
- Set up MCP Docker catalog
- 5 essential tools: Twitter, IPFS, Solana, GitHub, Web Search
- MCPToolRegistry service
- Tool execution wrapper

**Day 5: Executor Router**
- Implement selection logic (n8n vs LangGraph)
- Canary testing (shadow mode)
- Performance comparison
- `/agents/execute` endpoint

### Week 3: Agent Orchestration + Polish

**Day 1-2: Agent Orchestrator**
- Combine planner + executor
- End-to-end flow
- `/agents/accomplish` endpoint
- Error recovery

**Day 3-4: Testing & Examples**
- 10+ example agent scenarios
- Performance benchmarks
- Load testing
- Bug fixes

**Day 5: Documentation**
- Complete all 4 guides
- API reference
- Example workflows
- Deployment instructions

---

## 🧪 Success Criteria

Phase 3 is complete when:

- [ ] CrewAI service running and generating valid FlowSpec
- [ ] LangGraph service executing FlowSpec workflows
- [ ] 5 MCP tools available and functional
- [ ] Can plan workflow from natural language goal
- [ ] Can execute via either n8n or LangGraph
- [ ] `/agents/accomplish` endpoint working end-to-end
- [ ] 10+ example scenarios documented and tested
- [ ] All services running in Docker
- [ ] Complete documentation delivered

---

## 💡 Example Use Cases (What Users Can Do After Phase 3)

### Use Case 1: Automated Data Analysis

```bash
curl -X POST http://localhost:3001/agents/accomplish \
  -d '{
    "goal": "Fetch latest Solana price, analyze trend using GPT-4, store analysis on IPFS, post summary to Twitter",
    "context": {
      "tenantId": "data-analyst-bot"
    }
  }'

# Agent plans 5-node workflow:
# 1. HTTP → CoinGecko API
# 2. LLM → GPT-4 analysis
# 3. IPFS → Store full analysis
# 4. Twitter → Post summary
# 5. Solana → Record CID on-chain

# Executes automatically, returns results
```

### Use Case 2: Content Creation Pipeline

```bash
curl -X POST http://localhost:3001/agents/accomplish \
  -d '{
    "goal": "Generate blog post about Solana DeFi, create cover image, publish to IPFS, mint as NFT",
    "context": {
      "topic": "Solana DeFi trends 2025"
    }
  }'

# Agent plans multi-step workflow
# Selects appropriate tools
# Executes end-to-end
```

### Use Case 3: Monitoring & Alerts

```bash
curl -X POST http://localhost:3001/agents/accomplish \
  -d '{
    "goal": "Monitor Lucid L2 smart contract, alert on Twitter if gas > 100 LUCID/day",
    "context": {
      "monitorInterval": "1hour"
    }
  }'

# Agent creates scheduled workflow
# Monitoring + conditional alerts
```

---

## 📊 Architecture Evolution

### Before Phase 3
```
Manual workflow creation in n8n UI
```

### After Phase 3
```
Natural Language Goal
    ↓
AI Agent Plans Workflow
    ↓
Automatic Execution
    ↓
Results Delivered
```

**Benefits:**
- Non-technical users can create workflows
- AI optimizes workflow design
- Autonomous execution
- Learn and improve over time

---

## 🔐 Security Considerations

**Phase 3 Security Requirements:**

1. **Agent Sandboxing**: Agents can only access tools they're authorized for
2. **Credential Management**: MCP tools use per-tenant credentials (not hardcoded)
3. **Workflow Approval**: Option to review auto-generated workflows before execution
4. **Rate Limiting**: Agents can't spam tool APIs
5. **Audit Logs**: All agent actions logged for review
6. **Cost Caps**: Max spend limits per agent/tenant

---

## 💰 Cost Estimate

**Infrastructure costs for Phase 3:**

- CrewAI service: ~$50/month (EC2 t3.medium)
- LangGraph service: ~$50/month (EC2 t3.medium)
- MCP tools: ~$20/month (EC2 t3.small)
- **Total**: ~$120/month additional

**Plus API costs:**
- CrewAI planning: ~$0.01-0.05 per plan (OpenAI API)
- LangGraph execution: Free (open source)
- MCP tools: Varies (Twitter API, etc.)

---

## 🎯 Phase 3 vs Current Capabilities

### What You Have Now (Phase 1 & 2)
- ✅ Manual workflow creation (n8n UI)
- ✅ Programmatic workflow creation (FlowSpec API)
- ✅ Workflow execution (n8n)
- ✅ 3 base adapters (LLM, Solana, HTTP)

### What Phase 3 Adds
- ✅ AI agent planning (natural language → workflow)
- ✅ Alternative executor (LangGraph for complex agents)
- ✅ Tool ecosystem (MCP catalog)
- ✅ Autonomous execution (goal → result)
- ✅ Multi-step agent workflows

---

## 🚦 Ready to Start Phase 3?

**Prerequisites:**
- [x] Phase 1 & 2 complete and verified
- [x] n8n running and healthy
- [x] FlowSpec endpoints operational
- [ ] Decision: Do you need agent autonomy?

**Time Investment:**
- Phase 3.1 (CrewAI): 1 week
- Phase 3.2 (LangGraph): 1 week  
- Phase 3.3 (MCP Tools): 3-5 days
- Phase 3.4 (Orchestration): 3-5 days
- **Total**: 2-3 weeks

**What You Get:**
- AI agents that plan their own workflows
- Natural language interface ("Do X, then Y")
- Tool ecosystem (Twitter, IPFS, etc.)
- Production-ready agent infrastructure

---

## 📝 Next Steps

1. **Approve Phase 3 scope** - Confirm you want agent capabilities
2. **Set up Docker environments** - CrewAI, LangGraph, MCP containers
3. **Start with CrewAI** - Begin Week 1 implementation
4. **Iterative development** - Test each component before moving forward

**Ready to begin Phase 3?** Let me know and I'll start building! 🚀
