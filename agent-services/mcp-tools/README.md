# MCP Tools Catalog

Placeholder MCP (Model Context Protocol) tool services for Lucid L2 agent workflows.

## Overview

This directory contains 5 placeholder MCP tool services that agents can use:

1. **Twitter** (Port 9001) - Social media operations
2. **IPFS** (Port 9002) - Decentralized storage
3. **Solana** (Port 9003) - Blockchain operations
4. **GitHub** (Port 9004) - Code repository operations
5. **Web Search** (Port 9005) - Internet search

## Important Note

These are **placeholder services** using nginx to serve tool information. In production, these would be replaced with actual MCP server implementations that provide the full functionality.

The placeholders serve the architecture purpose of:
- Defining the tool catalog structure
- Establishing port allocations
- Documenting tool capabilities
- Enabling the MCP Registry service (Day 4)

## Quick Start

### Start All Tools

```bash
cd /home/admin/Lucid/Lucid-L2/agent-services/mcp-tools
docker compose up -d
```

### Verify Tools Running

```bash
docker ps | grep mcp

# Should show 5 containers:
# lucid-mcp-twitter (9001)
# lucid-mcp-ipfs (9002)
# lucid-mcp-solana (9003)
# lucid-mcp-github (9004)
# lucid-mcp-search (9005)
```

### Test Tool Info Endpoints

```bash
# Twitter
curl http://localhost:9001/info.json

# IPFS
curl http://localhost:9002/info.json

# Solana
curl http://localhost:9003/info.json

# GitHub
curl http://localhost:9004/info.json

# Web Search
curl http://localhost:9005/info.json
```

## Tool Capabilities

### Twitter (Port 9001)
- **Type**: Social
- **Operations**: post, search, trends
- **Auth**: API Key

### IPFS (Port 9002)
- **Type**: Storage
- **Operations**: upload, pin, get
- **Auth**: None (public network)

### Solana (Port 9003)
- **Type**: Blockchain
- **Operations**: read, write, transfer
- **Auth**: Wallet-based
- **Network**: Devnet

### GitHub (Port 9004)
- **Type**: Data
- **Operations**: createIssue, searchRepos, getFile
- **Auth**: Personal Access Token

### Web Search (Port 9005)
- **Type**: Data
- **Operations**: search, news
- **Auth**: API Key (Brave Search)

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
# Edit .env with your API keys
```

## Architecture

```
Agent Workflow
    ↓
tool.mcp Node
    ↓
MCP Registry (Day 4)
    ↓
MCP Tool Server (Ports 9001-9005)
    ↓
External API (Twitter, GitHub, etc.)
```

## Network

All tools are connected to the `n8n_lucid-network` shared network, allowing communication with:
- n8n (workflow orchestrator)
- CrewAI (planner)
- LangGraph (executor)
- Lucid API

## Health Checks

Each tool has a health check configured:
- **Interval**: 30s
- **Timeout**: 10s
- **Endpoint**: `/info.json`

## Production Migration

To migrate to production MCP servers:

1. Replace nginx placeholders with actual MCP server images
2. Update docker-compose.yml with real implementations
3. Configure authentication per tool
4. Test each tool independently
5. Update MCP Registry (Day 4) with real endpoints

## Tool Info Schema

Each tool provides a JSON info file:

```json
{
  "name": "tool-name",
  "type": "social|storage|blockchain|data",
  "description": "Tool description",
  "version": "1.0.0",
  "status": "available",
  "operations": [
    {
      "name": "operation-name",
      "description": "Operation description",
      "parameters": {...}
    }
  ],
  "port": 9001,
  "protocol": "mcp",
  "authentication": "api_key|token|none"
}
```

## Logs

```bash
# All tools
docker compose logs -f

# Specific tool
docker logs lucid-mcp-twitter
docker logs lucid-mcp-ipfs
docker logs lucid-mcp-solana
docker logs lucid-mcp-github
docker logs lucid-mcp-search
```

## Stop Tools

```bash
docker compose down
```

## Next Steps

- **Day 4**: Implement MCP Registry service (TypeScript)
- **Day 5**: Implement Executor Router
- **Future**: Replace placeholders with real MCP servers

## Links

- [Phase 3.2 Plan](../../N8N-PHASE-3.2-PLAN.md)
- [Phase 3.2 Implementation](../../N8N-PHASE-3.2-IMPLEMENTATION.md)
- [MCP Protocol Documentation](https://modelcontextprotocol.io)
