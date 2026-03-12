# 🤖 CrewAI Integration Guide - Phase 3.1

**AI Workflow Planning Service for Lucid L2**

This guide covers the CrewAI Planner Service, which generates FlowSpec workflows from natural language goals using AI agents.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Setup Instructions](#setup-instructions)
4. [API Reference](#api-reference)
5. [Usage Examples](#usage-examples)
6. [Integration with Lucid API](#integration-with-lucid-api)
7. [Troubleshooting](#troubleshooting)

---

## Overview

### What is the CrewAI Planner Service?

The CrewAI Planner Service is an AI-powered workflow planning system that:
- Converts natural language goals into structured FlowSpec DSL workflows
- Uses CrewAI agents to architect efficient automation pipelines
- Integrates with n8n for workflow execution
- Supports automatic workflow execution (optional)

### Key Features

✅ **Natural Language to Workflow** - Describe what you want in plain English  
✅ **AI-Powered Planning** - CrewAI agents design optimal workflows  
✅ **FlowSpec Generation** - Outputs structured, executable DSL  
✅ **Auto-Execution** - Optionally execute workflows immediately  
✅ **Validation** - Validates FlowSpec structures before execution

---

## Architecture

```
User Goal (Natural Language)
    ↓
CrewAI Planner Agent (GPT-4)
    ↓
FlowSpec DSL (JSON)
    ↓
Optional: n8n Executor
    ↓
Results
```

### Components

1. **FastAPI Service** (Port 8082)
   - REST API for workflow planning
   - Health checks and validation endpoints

2. **CrewAI Agent**
   - "Workflow Architect" role
   - Understands FlowSpec DSL
   - Generates optimal workflows

3. **TypeScript Client**
   - `AgentPlannerService` class
   - Integrates with Lucid API
   - Handles communication

---

## Setup Instructions

### Prerequisites

- Docker and Docker Compose
- OpenAI API key
- Lucid L2 n8n instance running
- Node.js 18+ (for TypeScript client)

### Step 1: Configure Environment

Create `.env` file in `agent-services/crewai-service/`:

```bash
# Copy example
cp .env.example .env

# Edit with your API key
OPENAI_API_KEY=sk-your-openai-api-key-here
LLM_MODEL=gpt-4  # or gpt-3.5-turbo for cost savings
PORT=8082
HOST=0.0.0.0
LOG_LEVEL=INFO
```

### Step 2: Start the Service

#### Option A: Using Docker Compose (Recommended)

```bash
cd Lucid-L2/agent-services/crewai-service

# Build and start
docker-compose up -d

# Check logs
docker-compose logs -f

# Check health
curl http://localhost:8082/health
```

#### Option B: Local Development

```bash
cd Lucid-L2/agent-services/crewai-service

# Install dependencies
pip install -r requirements.txt

# Run service
python app.py
```

### Step 3: Verify Installation

```bash
# Test health endpoint
curl http://localhost:8082/health
# Should return: {"status": "healthy"}

# Test service info
curl http://localhost:8082/
# Should return service metadata
```

---

## API Reference

### Base URL

```
http://localhost:8082
```

### Endpoints

#### 1. Health Check

**GET** `/health`

Check if service is operational.

**Response:**
```json
{
  "status": "healthy"
}
```

#### 2. Service Info

**GET** `/`

Get service metadata.

**Response:**
```json
{
  "service": "CrewAI Workflow Planner",
  "version": "1.0.0",
  "status": "operational"
}
```

#### 3. Plan Workflow

**POST** `/plan`

Generate a FlowSpec workflow from a natural language goal.

**Request Body:**
```json
{
  "goal": "Fetch BTC price and post to Twitter if > $50k",
  "context": {
    "twitter_handle": "@mybot",
    "tenantId": "user123"
  },
  "constraints": [
    "must complete in < 30 seconds",
    "use cached data if available"
  ]
}
```

**Response:**
```json
{
  "flowspec": {
    "version": "1.0",
    "name": "Workflow for: Fetch BTC price...",
    "nodes": [...],
    "edges": [...]
  },
  "reasoning": "Generated workflow with 4 nodes to accomplish: ...",
  "estimated_complexity": "moderate"
}
```

#### 4. Validate FlowSpec

**POST** `/validate`

Validate a FlowSpec structure.

**Request Body:**
```json
{
  "nodes": [...],
  "edges": [...]
}
```

**Response:**
```json
{
  "valid": true,
  "message": "FlowSpec structure is valid"
}
```

---

## Usage Examples

### Example 1: Simple Workflow

```bash
curl -X POST http://localhost:8082/plan \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Get current BTC price from CoinGecko API",
    "context": {
      "tenantId": "user123"
    }
  }'
```

**Generated FlowSpec:**
```json
{
  "version": "1.0",
  "name": "Workflow for: Get current BTC price",
  "nodes": [
    {
      "id": "fetch_price",
      "type": "tool.http",
      "config": {
        "url": "https://api.coingecko.com/api/v3/simple/price",
        "method": "GET",
        "params": {
          "ids": "bitcoin",
          "vs_currencies": "usd"
        }
      }
    },
    {
      "id": "format_output",
      "type": "data.transform",
      "config": {
        "operation": "format",
        "template": "BTC Price: ${{input.bitcoin.usd}}"
      }
    }
  ],
  "edges": [
    {
      "from": "fetch_price",
      "to": "format_output",
      "data": "response"
    }
  ]
}
```

### Example 2: Conditional Workflow

```bash
curl -X POST http://localhost:8082/plan \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Monitor Solana gas prices and alert if > 100 LUCID",
    "context": {
      "tenantId": "monitor-bot",
      "alert_channel": "slack"
    }
  }'
```

### Example 3: Complex Multi-Step

```bash
curl -X POST http://localhost:8082/plan \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Analyze DeFi trends, generate report, store on IPFS, post summary to Twitter",
    "context": {
      "tenantId": "defi-analyst",
      "data_sources": ["CoinGecko", "DeFiLlama"]
    },
    "constraints": [
      "use GPT-4 for analysis",
      "report must be < 1000 words"
    ]
  }'
```

---

## Integration with Lucid API

### TypeScript Client Usage

```typescript
import { getAgentPlanner } from './services/agentPlanner';

// Get planner instance
const planner = getAgentPlanner('http://localhost:8082');

// Plan a workflow
const response = await planner.planWorkflow({
  goal: 'Fetch BTC price and save to database',
  context: {
    tenantId: 'user123',
    database: 'postgres'
  }
});

console.log('Generated FlowSpec:', response.flowspec);
console.log('Complexity:', response.estimated_complexity);
```

### Lucid API Endpoints

The CrewAI service is integrated into the Lucid API with these endpoints:

#### 1. Plan Only

**POST** `http://localhost:3001/api/agents/plan`

```bash
curl -X POST http://localhost:3001/api/agents/plan \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Fetch and analyze crypto market data",
    "context": {
      "tenantId": "user123"
    }
  }'
```

#### 2. Plan and Execute

**POST** `http://localhost:3001/api/agents/plan`

```bash
curl -X POST http://localhost:3001/api/agents/plan \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Fetch BTC price and log it",
    "context": {
      "tenantId": "user123"
    },
    "autoExecute": true
  }'
```

#### 3. Accomplish Goal (Plan + Execute in one call)

**POST** `http://localhost:3001/api/agents/accomplish`

```bash
curl -X POST http://localhost:3001/api/agents/accomplish \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Monitor ETH gas prices every hour",
    "context": {
      "tenantId": "gas-monitor",
      "interval": "1h"
    }
  }'
```

#### 4. Validate FlowSpec

**POST** `http://localhost:3001/api/agents/validate`

```bash
curl -X POST http://localhost:3001/api/agents/validate \
  -H "Content-Type: application/json" \
  -d '{
    "nodes": [...],
    "edges": [...]
  }'
```

#### 5. Get Planner Info

**GET** `http://localhost:3001/api/agents/planner/info`

```bash
curl http://localhost:3001/api/agents/planner/info
```

---

## Troubleshooting

### Service Won't Start

**Problem:** Docker container fails to start

**Solutions:**
1. Check OpenAI API key is set: `echo $OPENAI_API_KEY`
2. Verify port 8082 is available: `lsof -i :8082`
3. Check logs: `docker-compose logs crewai-planner`

### Connection Refused

**Problem:** Cannot connect to CrewAI service

**Solutions:**
1. Verify service is running: `docker ps | grep crewai`
2. Test health endpoint: `curl http://localhost:8082/health`
3. Check network: `docker network ls | grep lucid`

### Invalid FlowSpec Generated

**Problem:** Generated FlowSpec doesn't execute properly

**Solutions:**
1. Add more specific constraints in your request
2. Use validation endpoint before execution
3. Provide better context in the goal description
4. Try a simpler goal first to test

### OpenAI API Errors

**Problem:** Rate limits or API errors

**Solutions:**
1. Switch to `gpt-3.5-turbo` model (faster, cheaper)
2. Add retry logic in your application
3. Check OpenAI dashboard for quota
4. Implement caching for similar requests

### Service Crashes

**Problem:** CrewAI service keeps restarting

**Solutions:**
1. Check memory usage: `docker stats`
2. Review logs for Python errors
3. Verify all dependencies installed
4. Try running locally to debug

---

## Performance Tips

### 1. Model Selection

- **gpt-4**: More accurate, slower, $$$
- **gpt-3.5-turbo**: Faster, cheaper, good for simple workflows
- **gpt-4-turbo**: Balance of speed and accuracy

### 2. Caching

Implement caching for similar goals:

```typescript
const cache = new Map<string, FlowSpec>();

async function getCachedPlan(goal: string) {
  if (cache.has(goal)) {
    return cache.get(goal);
  }
  
  const plan = await planner.planWorkflow({ goal });
  cache.set(goal, plan.flowspec);
  return plan.flowspec;
}
```

### 3. Timeout Configuration

Set appropriate timeouts:

```typescript
const planner = new AgentPlannerService('http://localhost:8082');
// Default timeout is 60 seconds
```

---

## Security Considerations

### API Key Management

❌ **Don't:**
- Commit API keys to version control
- Share API keys in logs
- Use the same key for dev/prod

✅ **Do:**
- Use environment variables
- Rotate keys regularly
- Monitor API usage

### Access Control

Implement authentication for production:

```python
# Add to app.py
from fastapi import Depends, HTTPException, Header

async def verify_token(x_api_key: str = Header(...)):
    if x_api_key != os.getenv("SERVICE_API_KEY"):
        raise HTTPException(status_code=403, detail="Invalid API key")
    return x_api_key

@app.post("/plan", dependencies=[Depends(verify_token)])
async def plan_workflow(request: PlanRequest):
    # ...
```

---

## Next Steps

1. ✅ **Phase 3.1 Complete**: CrewAI Planner Service
2. 🔄 **Phase 3.2**: LangGraph Executor Service
3. 🔄 **Phase 3.3**: MCP Tool Registry
4. 🔄 **Phase 3.4**: Agent Orchestration Layer

See [N8N-PHASE-3-AGENT-SERVICES.md](./N8N-PHASE-3-AGENT-SERVICES.md) for the complete roadmap.

---

## Support

- **Issues**: Report bugs in the project repo
- **Documentation**: This guide + [FlowSpec DSL Guide](./offchain/FLOWSPEC-DSL-GUIDE.md)
- **Examples**: See `test-agent-planner.js` for more examples

---

## License

Part of Lucid L2 Project - See main LICENSE file
