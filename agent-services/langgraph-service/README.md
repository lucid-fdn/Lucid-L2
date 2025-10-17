# LangGraph Executor Service

Alternative workflow executor for Lucid L2 using LangGraph for complex agent workflows.

## Features

- **FlowSpec DSL Execution**: Compiles FlowSpec to LangGraph state machines
- **State Management**: Built-in state persistence and checkpointing
- **Loop Support**: Native support for loops and recursion
- **Conditional Routing**: Complex branching logic
- **MCP Tool Integration**: Seamless integration with MCP tools

## Quick Start

### Prerequisites

- Docker & Docker Compose
- OpenAI API Key
- Lucid network running (`n8n_lucid-network`)

### Setup

1. **Create environment file:**
```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

2. **Build and start service:**
```bash
docker compose build
docker compose up -d
```

3. **Verify service is running:**
```bash
curl http://localhost:8083/health
```

Expected response:
```json
{
  "status": "healthy",
  "executor": "langgraph",
  "version": "0.1.0",
  "environment": "development"
}
```

## API Endpoints

### GET /health
Health check endpoint

### GET /info
Service information and capabilities

### POST /execute
Execute a FlowSpec workflow

**Request:**
```json
{
  "flowspec": {
    "name": "My Workflow",
    "nodes": [
      {
        "id": "node1",
        "type": "llm.chat",
        "input": {"prompt": "Hello"}
      }
    ],
    "edges": []
  },
  "context": {
    "tenantId": "user123",
    "variables": {}
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {...},
  "executor": "langgraph",
  "executionTime": 1.234
}
```

### POST /validate
Validate FlowSpec structure without executing

## Supported Node Types

- `llm.chat` - LLM chat completions
- `tool.http` - HTTP requests
- `tool.mcp` - MCP tool calls
- `solana.write` - Write to Solana blockchain
- `solana.read` - Read from Solana blockchain
- `data.transform` - Data transformation
- `control.condition` - Conditional routing
- `control.loop` - Loop constructs

## Development

### Running locally (without Docker)

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export OPENAI_API_KEY=your_key_here
export PORT=8083

# Run service
python app.py
```

### Logs

```bash
docker compose logs -f langgraph-service
```

## Architecture

```
FlowSpec DSL
    ↓
LangGraph Compiler
    ↓
State Graph
    ↓
Node Executors
    ↓
Result
```

## Configuration

Environment variables:

- `OPENAI_API_KEY` - OpenAI API key (required)
- `LLM_PROXY_URL` - LLM proxy URL (optional)
- `LUCID_API_URL` - Lucid API URL for Solana operations
- `PORT` - Service port (default: 8083)
- `ENVIRONMENT` - Environment name (development/production)

## Next Steps

- Day 2: Implement FlowSpec compiler
- Add node type factories
- Integrate with MCP tools
- Add execution testing

## Links

- [Phase 3.2 Plan](../../N8N-PHASE-3.2-PLAN.md)
- [Phase 3.2 Implementation](../../N8N-PHASE-3.2-IMPLEMENTATION.md)
- [FlowSpec DSL Guide](../../offchain/FLOWSPEC-DSL-GUIDE.md)
