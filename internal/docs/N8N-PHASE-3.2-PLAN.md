# 🔀 Phase 3.2: LangGraph Executor + MCP Tools

**Status:** Ready to Begin  
**Prerequisites:** ✅ Phase 3.1 Complete (CrewAI Planner)  
**Time Estimate:** 1 week (7 days)  
**Goal:** Add alternative executor and tool ecosystem

---

## 📋 What We're Building

### LangGraph Executor Service
Alternative to n8n for complex agent workflows with better loop/recursion support.

### MCP Tool Registry
Catalog of tools agents can use (Twitter, IPFS, Solana, GitHub, Web Search).

### Executor Router
Smart routing between n8n and LangGraph based on workflow complexity.

---

## 🏗️ Architecture

```
FlowSpec DSL (from CrewAI)
         ↓
   Executor Router
    ↓         ↓
n8n       LangGraph
(simple)   (complex)
    ↓         ↓
      MCP Tools
         ↓
(Twitter, IPFS, Solana, etc.)
```

---

## 📅 Week Implementation Plan

### Day 1-2: LangGraph Service Setup

#### Deliverables
```
agent-services/langgraph-service/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── app.py
├── .env
└── executors/
    ├── flowspec_compiler.py
    └── node_factories.py
```

#### Docker Setup

**Dockerfile:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8083

# Run FastAPI
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8083"]
```

**requirements.txt:**
```
fastapi==0.104.1
uvicorn[standard]==0.24.0
langgraph==0.0.40
langchain==0.1.0
langchain-openai==0.0.2
pydantic==2.5.0
python-dotenv==1.0.0
httpx==0.25.2
```

**app.py (FastAPI server):**
```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langgraph.graph import StateGraph, END
from typing import Dict, Any, List
import httpx

app = FastAPI(title="LangGraph Executor Service")

class FlowSpecRequest(BaseModel):
    flowspec: Dict[str, Any]
    context: Dict[str, Any]

class FlowSpecCompiler:
    """Compile FlowSpec DSL to LangGraph"""
    
    def compile(self, spec: Dict) -> StateGraph:
        # Create state graph
        workflow = StateGraph(dict)
        
        # Add nodes
        for node in spec['nodes']:
            node_fn = self.create_node_function(node)
            workflow.add_node(node['id'], node_fn)
        
        # Add edges
        for edge in spec['edges']:
            if edge.get('when'):
                # Conditional edge
                workflow.add_conditional_edges(
                    edge['from'],
                    lambda state: edge['to'] if self.evaluate_condition(state, edge['when']) else END
                )
            else:
                # Regular edge
                workflow.add_edge(edge['from'], edge['to'])
        
        # Set entry point
        if spec['nodes']:
            workflow.set_entry_point(spec['nodes'][0]['id'])
        
        return workflow.compile()
    
    def create_node_function(self, node: Dict):
        """Create executable function for each node type"""
        node_type = node['type']
        
        if node_type == 'llm.chat':
            return self.make_llm_node(node)
        elif node_type == 'tool.http':
            return self.make_http_node(node)
        elif node_type == 'tool.mcp':
            return self.make_mcp_node(node)
        elif node_type == 'solana.write':
            return self.make_solana_node(node)
        elif node_type == 'transform':
            return self.make_transform_node(node)
        else:
            return lambda state: state
    
    def make_llm_node(self, node: Dict):
        async def llm_fn(state: Dict) -> Dict:
            # Call LLM API
            prompt = node['input'].get('prompt', '')
            model = node['input'].get('model', 'gpt-3.5-turbo')
            
            # Call llm-proxy
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"http://host.docker.internal:8001/invoke/model/{model}",
                    json={"prompt": prompt, "parameters": {"max_tokens": 150}}
                )
                data = response.json()
            
            state[node['id']] = data.get('output', '')
            return state
        
        return llm_fn
    
    def make_http_node(self, node: Dict):
        async def http_fn(state: Dict) -> Dict:
            url = node['input'].get('url', '')
            method = node['input'].get('method', 'GET')
            
            async with httpx.AsyncClient() as client:
                if method == 'POST':
                    response = await client.post(url, json=node['input'].get('body', {}))
                else:
                    response = await client.get(url)
                
                state[node['id']] = response.json()
            return state
        
        return http_fn
    
    def make_mcp_node(self, node: Dict):
        async def mcp_fn(state: Dict) -> Dict:
            tool_name = node['input'].get('tool', '')
            params = node['input'].get('params', {})
            
            # Call MCP tool via registry
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"http://localhost:3001/tools/execute",
                    json={"tool": tool_name, "params": params}
                )
                state[node['id']] = response.json()
            return state
        
        return mcp_fn
    
    def make_solana_node(self, node: Dict):
        async def solana_fn(state: Dict) -> Dict:
            # Call Lucid API for Solana write
            hash_data = node['input'].get('hash', '')
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://host.docker.internal:3001/run",
                    json={"text": hash_data}
                )
                state[node['id']] = response.json()
            return state
        
        return solana_fn
    
    def make_transform_node(self, node: Dict):
        def transform_fn(state: Dict) -> Dict:
            # JavaScript-like transform (limited for safety)
            transform_code = node['input'].get('code', '')
            # Execute safe transform logic
            state[node['id']] = self.safe_transform(state, transform_code)
            return state
        
        return transform_fn

@app.post("/execute")
async def execute_flowspec(request: FlowSpecRequest):
    try:
        compiler = FlowSpecCompiler()
        graph = compiler.compile(request.flowspec)
        
        # Execute workflow
        result = await graph.ainvoke(request.context)
        
        return {
            "success": True,
            "result": result,
            "executor": "langgraph"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy", "executor": "langgraph", "version": "0.0.40"}
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  langgraph-service:
    build: .
    container_name: lucid-langgraph
    restart: unless-stopped
    ports:
      - "8083:8083"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - LLM_PROXY_URL=http://host.docker.internal:8001
      - LUCID_API_URL=http://host.docker.internal:3001
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - lucid-network

networks:
  lucid-network:
    external: true
    name: n8n_lucid-network
```

---

### Day 3-4: MCP Tool Registry

#### Deliverables
```
agent-services/mcp-tools/
├── docker-compose.yml
├── .env
└── tools/
    ├── twitter/
    ├── ipfs/
    ├── solana/
    ├── github/
    └── web-search/
```

#### MCP Tools Docker Compose

```yaml
version: '3.8'

services:
  # Twitter MCP Server
  mcp-twitter:
    image: modelcontextprotocol/server-twitter:latest
    container_name: lucid-mcp-twitter
    environment:
      - TWITTER_API_KEY=${TWITTER_API_KEY}
      - TWITTER_API_SECRET=${TWITTER_API_SECRET}
    ports:
      - "9001:9001"
    networks:
      - lucid-network

  # IPFS MCP Server  
  mcp-ipfs:
    image: modelcontextprotocol/server-ipfs:latest
    container_name: lucid-mcp-ipfs
    volumes:
      - ipfs_data:/data
    ports:
      - "9002:9002"
    networks:
      - lucid-network

  # Solana MCP Server
  mcp-solana:
    image: modelcontextprotocol/server-solana:latest
    container_name: lucid-mcp-solana
    environment:
      - RPC_URL=https://api.devnet.solana.com
    ports:
      - "9003:9003"
    networks:
      - lucid-network

  # GitHub MCP Server
  mcp-github:
    image: modelcontextprotocol/server-github:latest
    container_name: lucid-mcp-github
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
    ports:
      - "9004:9004"
    networks:
      - lucid-network

  # Web Search MCP Server
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

#### MCP Tool Registry Service

```typescript
// offchain/src/services/mcpRegistry.ts

export interface MCPTool {
  name: string;
  url: string;
  description: string;
  schema: any;
  category: 'social' | 'storage' | 'blockchain' | 'data' | 'other';
}

export class MCPToolRegistry {
  private tools: Map<string, MCPTool> = new Map();
  
  constructor() {
    this.initializeDefaultTools();
  }
  
  private initializeDefaultTools() {
    // Register default MCP tools
    this.registerTool({
      name: 'twitter',
      url: 'http://localhost:9001',
      description: 'Post tweets, search, get trends',
      category: 'social',
      schema: {
        post: { content: 'string', media?: 'string[]' },
        search: { query: 'string', limit: 'number' }
      }
    });
    
    this.registerTool({
      name: 'ipfs',
      url: 'http://localhost:9002',
      description: 'Upload files, pin content, retrieve data',
      category: 'storage',
      schema: {
        upload: { content: 'string', filename: 'string' },
        pin: { cid: 'string' },
        get: { cid: 'string' }
      }
    });
    
    this.registerTool({
      name: 'solana',
      url: 'http://localhost:9003',
      description: 'Read/write Solana blockchain, PDA operations',
      category: 'blockchain',
      schema: {
        read: { address: 'string' },
        write: { data: 'object' },
        transfer: { to: 'string', amount: 'number' }
      }
    });
    
    this.registerTool({
      name: 'github',
      url: 'http://localhost:9004',
      description: 'Create issues, PRs, search repos',
      category: 'data',
      schema: {
        createIssue: { repo: 'string', title: 'string', body: 'string' },
        searchRepos: { query: 'string', limit: 'number' }
      }
    });
    
    this.registerTool({
      name: 'web-search',
      url
