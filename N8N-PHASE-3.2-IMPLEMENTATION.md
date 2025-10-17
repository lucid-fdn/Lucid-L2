# 🚀 Phase 3.2: LangGraph + MCP Tools - Complete Implementation Plan

**Phase:** 3.2 - Alternative Executor & Tool Ecosystem  
**Prerequisites:** ✅ Phase 3.1 Complete (CrewAI Planner)  
**Time:** 7 days  
**Start Date:** Ready Now

---

## 📋 Overview

### What We're Building

**3 Major Components:**
1. **LangGraph Executor** - Alternative to n8n for complex agent loops
2. **MCP Tool Registry** - 5 essential tools (Twitter, IPFS, Solana, GitHub, Search)
3. **Executor Router** - Smart selection between n8n and LangGraph

### Why LangGraph + MCP?

**LangGraph Benefits:**
- Better for complex agent loops with state
- Built-in persistence and checkpointing
- Native LangChain integration
- More flexible for AI-driven workflows

**MCP Benefits:**
- Standard protocol for AI tools
- Easy to add new capabilities
- Secure credential management
- Interoperable across agents/orchestrators

---

## 🗓️ Day-by-Day Implementation

### Day 1: LangGraph Service Foundation

**Files to Create:**
```
agent-services/langgraph-service/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example
├── app.py
└── README.md
```

**Tasks:**
- [ ] Create LangGraph service directory
- [ ] Write Dockerfile (Python 3.11 + dependencies)
- [ ] Create docker-compose.yml (port 8083)
- [ ] Install FastAPI + LangGraph dependencies
- [ ] Basic health check endpoint
- [ ] Test: `curl http://localhost:8083/health`

**Expected Output:**
```bash
docker compose up -d
curl http://localhost:8083/health
# Returns: {"status":"healthy","executor":"langgraph"}
```

---

### Day 2: FlowSpec → LangGraph Compiler

**Files to Create:**
```
agent-services/langgraph-service/
├── executors/
│   ├── __init__.py
│   ├── flowspec_compiler.py  # Main compiler
│   └── node_factories.py      # Node type handlers
└── app.py (update)
```

**Core Implementation:**

```python
# flowspec_compiler.py
class FlowSpecCompiler:
    def compile(self, spec: dict) -> StateGraph:
        workflow = StateGraph(dict)
        
        # Add all nodes
        for node in spec['nodes']:
            func = NodeFactories.create(node)
            workflow.add_node(node['id'], func)
        
        # Add edges
        for edge in spec['edges']:
            workflow.add_edge(edge['from'], edge['to'])
        
        # Set entry
        workflow.set_entry_point(spec['nodes'][0]['id'])
        
        return workflow.compile()
```

**Tasks:**
- [ ] Implement FlowSpecCompiler class
- [ ] Node factories for each FlowSpec node type
- [ ] Edge handling (regular + conditional)
- [ ] State management
- [ ] Error handling
- [ ] Unit tests

**Test:**
```bash
# Test with simple FlowSpec
curl -X POST http://localhost:8083/execute \
  -d '{"flowspec": {...}, "context": {...}}'
```

---

### Day 3: MCP Tool Catalog Setup

**Files to Create:**
```
agent-services/mcp-tools/
├── docker-compose.yml
├── .env.example
├── README.md
└── tools/
    ├── twitter-config.json
    ├── ipfs-config.json
    ├── solana-config.json
    ├── github-config.json
    └── search-config.json
```

**docker-compose.yml (5 MCP servers):**

```yaml
version: '3.8'

services:
  mcp-twitter:
    image: modelcontextprotocol/server-twitter:latest
    container_name: lucid-mcp-twitter
    environment:
      - TWITTER_API_KEY=${TWITTER_API_KEY}
    ports:
      - "9001:9001"
    networks:
      - lucid-network

  mcp-ipfs:
    image: modelcontextprotocol/server-ipfs:latest
    container_name: lucid-mcp-ipfs
    volumes:
      - ipfs_data:/data
    ports:
      - "9002:9002"
    networks:
      - lucid-network

  mcp-solana:
    image: modelcontextprotocol/server-solana:latest
    container_name: lucid-mcp-solana
    environment:
      - RPC_URL=https://api.devnet.solana.com
    ports:
      - "9003:9003"
    networks:
      - lucid-network

  mcp-github:
    image: modelcontextprotocol/server-github:latest
    container_name: lucid-mcp-github
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
    ports:
      - "9004:9004"
    networks:
      - lucid-network

  mcp-search:
    image: modelcontextprotocol/server-brave-search:latest
    container_name: lucid-mcp-search
    environment:
      - BRAVE_API_KEY=${BRAVE_API_KEY}
    ports:
      - "9005:9005"
    networks:
      - lucid-network

volumes:
  ipfs_data:

networks:
  lucid-network:
    external: true
    name: n8n_lucid-network
```

**Tasks:**
- [ ] Create MCP tools directory structure
- [ ] Write docker-compose.yml with 5 tools
- [ ] Configure .env with API keys
- [ ] Start MCP containers
- [ ] Verify all 5 tools responding
- [ ] Test each tool individually

**Test:**
```bash
cd agent-services/mcp-tools
docker compose up -d

# Test each tool
curl http://localhost:9001/health  # Twitter
curl http://localhost:9002/health  # IPFS
curl http://localhost:9003/health  # Solana
curl http://localhost:9004/health  # GitHub
curl http://localhost:9005/health  # Search
```

---

### Day 4: MCP Registry Service

**Files to Create:**
```
offchain/src/services/
├── mcpRegistry.ts
└── mcpTypes.ts
```

**Implementation:**

```typescript
// mcpRegistry.ts
export class MCPToolRegistry {
  private tools: Map<string, MCPTool> = new Map();
  
  constructor() {
    this.registerDefaultTools();
  }
  
  registerDefaultTools() {
    this.registerTool({
      name: 'twitter',
      url: 'http://localhost:9001',
      description: 'Twitter API via MCP',
      category: 'social',
      operations: ['post', 'search', 'trends']
    });
    
    // ... register 4 more tools
  }
  
  async listTools(): Promise<MCPTool[]> {
    return Array.from(this.tools.values());
  }
  
  async executeTool(
    name: string,
    operation: string,
    params: any
  ): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    
    const response = await axios.post(
      `${tool.url}/${operation}`,
      params
    );
    
    return response.data;
  }
}
```

**API Endpoints:**

```typescript
// Add to api.ts
router.get('/tools/list', async (req, res) => {
  const registry = getMCPRegistry();
  const tools = await registry.listTools();
  res.json({ success: true, tools });
});

router.post('/tools/execute', async (req, res) => {
  const { tool, operation, params } = req.body;
  const registry = getMCPRegistry();
  const result = await registry.executeTool(tool, operation, params);
  res.json({ success: true, result });
});
```

**Tasks:**
- [ ] Implement MCPToolRegistry class
- [ ] Register 5 default tools
- [ ] Add `/tools/list` endpoint
- [ ] Add `/tools/execute` endpoint
- [ ] Test tool execution
- [ ] Error handling

**Test:**
```bash
# List tools
curl http://localhost:3001/tools/list

# Execute Twitter post
curl -X POST http://localhost:3001/tools/execute \
  -d '{"tool":"twitter","operation":"post","params":{"content":"Hello from Lucid!"}}'
```

---

### Day 5: Executor Router

**Files to Create:**
```
offchain/src/services/
└── executorRouter.ts
```

**Implementation:**

```typescript
// executorRouter.ts
export class ExecutorRouter {
  private n8nService: FlowSpecService;
  private langGraphUrl: string;
  
  async execute(
    flowspec: FlowSpec,
    context: FlowExecutionContext,
    preferredExecutor?: 'n8n' | 'langgraph'
  ): Promise<FlowExecutionResult> {
    
    const executor = preferredExecutor || this.selectBestExecutor(flowspec);
    
    console.log(`🔀 Routing to ${executor} executor`);
    
    if (executor === 'langgraph') {
      return await this.executeLangGraph(flowspec, context);
    } else {
      return await this.executeN8n(flowspec, context);
    }
  }
  
  private selectBestExecutor(flowspec: FlowSpec): 'n8n' | 'langgraph' {
    // Decision logic
    
    // 1. If has loops/recursion → LangGraph
    if (this.hasLoops(flowspec)) return 'langgraph';
    
    // 2. If many conditional branches → LangGraph
    const conditionalCount = flowspec.edges.filter(e => e.when).length;
    if (conditionalCount > 3) return 'langgraph';
    
    // 3. If uses MCP tools → LangGraph (better integration)
    if (flowspec.nodes.some(n => n.type === 'tool.mcp')) return 'langgraph';
    
    // 4. If complex (>10 nodes) → LangGraph
    if (flowspec.nodes.length > 10) return 'langgraph';
    
    // 5. Default → n8n (visual debugging)
    return 'n8n';
  }
  
  private async executeLangGraph(
    flowspec: FlowSpec,
    context: FlowExecutionContext
  ): Promise<FlowExecutionResult> {
    const response = await axios.post(
      `${this.langGraphUrl}/execute`,
      { flowspec, context }
    );
    return response.data;
  }
  
  private async executeN8n(
    flowspec: FlowSpec,
    context: FlowExecutionContext
  ): Promise<FlowExecutionResult> {
    return await this.n8nService.executeWorkflow(flowspec.name, context);
  }
}
```

**API Endpoint:**

```typescript
// Add to api.ts
router.post('/agents/execute', async (req, res) => {
  const { flowspec, context, executor } = req.body;
  
  const router = getExecutorRouter();
  const result = await router.execute(flowspec, context, executor);
  
  res.json(result);
});
```

**Tasks:**
- [ ] Implement ExecutorRouter class
- [ ] Selection logic (decision tree)
- [ ] n8n execution path
- [ ] LangGraph execution path
- [ ] Add `/agents/execute` endpoint
- [ ] Canary testing (shadow mode)

**Test:**
```bash
# Test automatic selection
curl -X POST http://localhost:3001/agents/execute \
  -d '{"flowspec": {...}, "context": {...}}'

# Test forced executor
curl -X POST http://localhost:3001/agents/execute \
  -d '{"flowspec": {...}, "context": {...}, "executor": "langgraph"}'
```

---

### Day 6: Integration & Testing

**Files to Create:**
```
offchain/
├── test-langgraph.js
├── test-mcp-tools.js
├── test-executor-router.js
└── test-phase-3.2.js (comprehensive)
```

**Test Scenarios:**

**Test 1: Simple Workflow (n8n)**
```javascript
const simpleFlow = {
  name: "Simple LLM",
  nodes: [
    { id: "llm1", type: "llm.chat", input: { prompt: "Hello" } }
  ],
  edges: []
};

// Should route to n8n (visual debugging)
```

**Test 2: Complex Agent Loop (LangGraph)**
```javascript
const complexFlow = {
  name: "Research Agent",
  nodes: [
    { id: "search1", type: "tool.mcp", tool: "web-search" },
    { id: "analyze1", type: "llm.chat" },
    { id: "search2", type: "tool.mcp", tool: "web-search" },
    { id: "synthesize", type: "llm.chat" },
    { id: "publish", type: "tool.mcp", tool: "ipfs" }
  ],
  edges: [/* ... */]
};

// Should route to LangGraph (complex, uses MCP)
```

**Test 3: MCP Tool Usage**
```javascript
// Test Twitter
await registry.executeTool('twitter', 'post', { 
  content: 'Test from Lucid L2!' 
});

// Test IPFS
await registry.executeTool('ipfs', 'upload', { 
  content: 'Hello IPFS', 
  filename: 'test.txt' 
});

// Test Solana
await registry.executeTool('solana', 'read', { 
  address: '<some-address>' 
});
```

**Tasks:**
- [ ] Create comprehensive test suite
- [ ] Test all 5 MCP tools
- [ ] Test executor routing logic
- [ ] Performance benchmarking
- [ ] Load testing
- [ ] Bug fixes

---

### Day 7: Documentation & Polish

**Files to Create:**
```
Lucid-L2/
├── LANGGRAPH-INTEGRATION-GUIDE.md
├── MCP-TOOLS-GUIDE.md
├── EXECUTOR-ROUTER-GUIDE.md
└── N8N-PHASE-3.2-COMPLETE.md
```

**Documentation Topics:**
- LangGraph setup and configuration
- Adding new MCP tools
- Executor selection criteria
- Performance comparison (n8n vs LangGraph)
- Troubleshooting guide

**Tasks:**
- [ ] Write LangGraph integration guide
- [ ] Write MCP tools guide
- [ ] Write executor router guide
- [ ] Update main N8N-INTEGRATION-GUIDE.md
- [ ] Create completion report

---

## 📦 Complete Deliverables

### Infrastructure
- [ ] LangGraph Docker service (port 8083)
- [ ] 5 MCP tool containers (ports 9001-9005)
- [ ] All services connected to lucid-network

### Code
- [ ] FlowSpecCompiler (Python)
- [ ] Node factories for 5+ node types
- [ ] MCPToolRegistry (TypeScript)
- [ ] ExecutorRouter (TypeScript)
- [ ] 3 new API endpoints

### Testing
- [ ] test-langgraph.js
- [ ] test-mcp-tools.js
- [ ] test-executor-router.js
- [ ] test-phase-3.2.js (comprehensive)

### Documentation
- [ ] 3 integration guides
- [ ] API reference updates
- [ ] Completion report

---

## 🧪 Success Criteria

Phase 3.2 is complete when:

### Technical
- [x] Phase 3.1 Complete (CrewAI working)
- [ ] LangGraph service running and healthy
- [ ] Can compile FlowSpec to LangGraph
- [ ] All 5 MCP tools responding
- [ ] ExecutorRouter selecting appropriately
- [ ] `/agents/execute` endpoint working
- [ ] Can execute workflows via LangGraph
- [ ] MCP tools accessible from workflows

### Testing
- [ ] Simple workflows route to n8n
- [ ] Complex workflows route to LangGraph
- [ ] All MCP tools tested individually
- [ ] End-to-end agent workflow tested
- [ ] Performance benchmarks recorded

### Documentation
- [ ] 3 guides written
- [ ] API docs updated
- [ ] Example workflows provided

---

## 🔧 Configuration Files

### LangGraph .env
```bash
# LangGraph Service Configuration
OPENAI_API_KEY=<your-key>
LLM_PROXY_URL=http://host.docker.internal:8001
LUCID_API_URL=http://host.docker.internal:3001
PORT=8083
```

### MCP Tools .env
```bash
# Twitter
TWITTER_API_KEY=<your-key>
TWITTER_API_SECRET=<your-secret>

# GitHub
GITHUB_TOKEN=<your-token>

# Brave Search
BRAVE_API_KEY=<your-key>

# Other tools (optional)
```

### Lucid API .env (additions)
```bash
# LangGraph Configuration
LANGGRAPH_ENABLED=true
LANGGRAPH_URL=http://localhost:8083

# MCP Tools
MCP_ENABLED=true
MCP_TWITTER_URL=http://localhost:9001
MCP_IPFS_URL=http://localhost:9002
MCP_SOLANA_URL=http://localhost:9003
MCP_GITHUB_URL=http://localhost:9004
MCP_SEARCH_URL=http://localhost:9005
```

---

## 🚀 Quick Start (After Implementation)

### Start All Services

```bash
# 1. LangGraph
cd /home/admin/Lucid/Lucid-L2/agent-services/langgraph-service
docker compose up -d

# 2. MCP Tools
cd /home/admin/Lucid/Lucid-L2/agent-services/mcp-tools
docker compose up -d

# 3. Verify
docker ps | grep lucid

# Should show:
# lucid-n8n (Phase 1)
# lucid-crewai (Phase 3.1)
# lucid-langgraph (Phase 3.2)
# lucid-mcp-twitter (Phase 3.2)
# lucid-mcp-ipfs (Phase 3.2)
# ... 3 more MCP tools
```

### Test Complete System

```bash
cd /home/admin/Lucid/Lucid-L2/offchain

# 1. Plan workflow with CrewAI
curl -X POST http://localhost:3001/agents/plan \
  -d '{"goal":"Fetch BTC price and tweet if >$50k"}'

# 2. Execute with auto-routing
curl -X POST http://localhost:3001/agents/execute \
  -d '{"flowspec": <from-step-1>, "context": {}}'

# 3. Check which executor was used
# Response will show: "executor": "n8n" or "langgraph"
```

---

## 📊 Performance Targets

### LangGraph Service
- Startup time: < 10s
- FlowSpec compilation: < 500ms
- Simple workflow execution: < 2s
- Complex workflow: < 10s

### MCP Tools
- Health check: < 100ms
- Tool execution: < 3s average
- Concurrent requests: 10+

### Executor Router
- Selection decision: < 50ms
- Routing overhead: < 100ms

---

## 🔒 Security Considerations

### LangGraph
- Sandboxed execution environment
- No arbitrary code execution
- Resource limits (memory, CPU, time)
- Rate limiting per tenant

### MCP Tools
- Per-tenant credentials
- API key rotation
- Usage quotas
- Audit logging

### Executor Router
- Workflow validation before execution
- Cost estimation
- Approval workflow (optional)
- Execution history

---

## 💡 Example Workflows After Phase 3.2

### Example 1: Social Media Automation
```javascript
{
  name: "Twitter Bot",
  nodes: [
    { id: "search", type: "tool.mcp", tool: "web-search", 
      input: { query: "Solana news today" } },
    { id: "summarize", type: "llm.chat", 
      input: { prompt: "Summarize: $ref.search" } },
    { id: "tweet", type: "tool.mcp", tool: "twitter", 
      input: { content: "$ref.summarize" } }
  ]
}
// Routes to: LangGraph (uses MCP tools)
```

### Example 2: Data Pipeline
```javascript
{
  name: "IPFS + Blockchain",
  nodes: [
    { id: "generate", type: "llm.chat", 
      input: { prompt: "Create analysis report" } },
    { id: "store", type: "tool.mcp", tool: "ipfs", 
      input: { content: "$ref.generate" } },
    { id: "record", type: "tool.mcp", tool: "solana", 
      input: { cid: "$ref.store.cid" } }
  ]
}
// Routes to: LangGraph (uses MCP tools)
```

---

## 🎯 Phase 3.2 Completion Checklist

- [ ] Day 1: LangGraph service foundation
- [ ] Day 2: FlowSpec compiler implemented
- [ ] Day 3: MCP tools deployed (5 containers)
- [ ] Day 4: MCP registry service created
- [ ] Day 5: Executor router implemented
- [ ] Day 6: Comprehensive testing
- [ ] Day 7: Documentation complete

**When all checked:**
- ✅ Phase 3.2 COMPLETE
- ✅ Ready for Phase 3.3 (Agent Orchestration)

---

## 📝 Next After Phase 3.2

**Phase 3.3: Agent Orchestration (3-5 days)**
- Combine CrewAI + ExecutorRouter + MCP Tools
- `/agents/accomplish` endpoint
- End-to-end autonomous agents
- Example agent scenarios

**Then:** Phase 3 COMPLETE! 🎉

---

**Ready to start Day 1? I'll create the LangGraph service!** 🚀
