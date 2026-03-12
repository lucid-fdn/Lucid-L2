# AI Agent API Guide for Lucid L2™

This guide provides comprehensive documentation for AI agents to communicate with the Lucid L2™ system through REST API endpoints. The system provides cryptographic proof-of-contribution capabilities with MMR (Merkle Mountain Range) integration and dual-gas metering.

## Table of Contents
- [Overview](#overview)
- [Authentication & Setup](#authentication--setup)
- [Agent Management](#agent-management)
- [Epoch Processing](#epoch-processing)
- [Proof Generation](#proof-generation)
- [Monitoring & Status](#monitoring--status)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Overview

The Lucid L2™ AI Agent API provides:
- **Agent Registration**: Initialize and manage AI agents with unique identifiers
- **Epoch Processing**: Submit vector data for cryptographic commitment
- **Proof Generation**: Generate and verify contribution proofs
- **MMR Integration**: Merkle Mountain Range for efficient proof-of-contribution
- **Dual-Gas System**: Transparent cost structure with iGas + mGas metering
- **IPFS Storage**: Content-addressed storage for off-chain MMR state
- **Blockchain Commitment**: Immutable on-chain root storage via Solana

### Base URL
```
http://localhost:3001
```

### Gas Costs
- **iGas (Inference Gas)**: 1 LUCID per single operation, 2 LUCID per batch
- **mGas (Memory Gas)**: 5 LUCID per MMR root stored on-chain
- **Total Cost**: Single epoch = 6 LUCID, Batch operations provide significant savings

## Authentication & Setup

Currently, the system uses the configured Solana wallet for all operations. Future versions will support agent-specific authentication.

### Prerequisites
1. Lucid L2™ system running on `http://localhost:3001`
2. Solana test validator active
3. LUCID tokens available for gas payments
4. System initialized with proper configuration

## Agent Management

### Initialize Agent
Create or load an AI agent with optional IPFS restoration.

**Endpoint:** `POST /agents/init`

**Request Body:**
```json
{
  "agentId": "my-ai-agent",
  "ipfsCid": "Qm..." // Optional: restore from IPFS
}
```

**Response:**
```json
{
  "success": true,
  "agentId": "my-ai-agent",
  "initialized": true,
  "stats": {
    "agentId": "my-ai-agent",
    "mmrSize": 0,
    "totalEpochs": 0,
    "currentRoot": "0000000000000000000000000000000000000000000000000000000000000000",
    "ipfsCid": null,
    "lastUpdated": null
  },
  "message": "New agent initialized"
}
```

### List All Agents
Get all registered agents with their statistics.

**Endpoint:** `GET /agents`

**Response:**
```json
{
  "success": true,
  "totalAgents": 2,
  "agents": [
    {
      "agentId": "agent-1",
      "mmrSize": 5,
      "totalEpochs": 2,
      "currentRoot": "bef61c0e...",
      "ipfsCid": "Qm799fbb...",
      "lastUpdated": 1704672000000
    }
  ],
  "message": "Retrieved 2 registered agents"
}
```

## Epoch Processing

### Process Single Epoch
Submit vectors for a single epoch commitment.

**Endpoint:** `POST /agents/epoch`

**Request Body:**
```json
{
  "agentId": "my-ai-agent",
  "vectors": [
    "Hello world",
    "AI processing data",
    "Blockchain commitment"
  ],
  "epochNumber": 1 // Optional: auto-increments if not provided
}
```

**Response:**
```json
{
  "success": true,
  "agentId": "my-ai-agent",
  "epochNumber": 1,
  "vectorCount": 3,
  "mmrRoot": "40141e27c5b3f3f58bf3c4d3c3e8f7a2b1c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5",
  "ipfsCid": "Qmc0ebc7a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8",
  "transactionSignature": "EZDsdtbf...",
  "gasCost": {
    "iGas": 1,
    "mGas": 5,
    "total": 6
  },
  "message": "Epoch 1 processed successfully for agent my-ai-agent"
}
```

### Process Batch Epochs
Submit multiple epochs across one or more agents efficiently.

**Endpoint:** `POST /agents/batch-epochs`

**Request Body:**
```json
{
  "epochs": [
    {
      "agentId": "agent-1",
      "vectors": ["data1", "data2"],
      "epochNumber": 1
    },
    {
      "agentId": "agent-1",
      "vectors": ["data3", "data4"],
      "epochNumber": 2
    },
    {
      "agentId": "agent-2",
      "vectors": ["other-data1", "other-data2"]
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "processedEpochs": 3,
  "results": [
    {
      "agentId": "agent-1",
      "epochNumber": 1,
      "mmrRoot": "abc123...",
      "ipfsCid": "Qm456...",
      "transactionSignature": "tx123...",
      "gasCost": { "iGas": 1, "mGas": 5, "total": 6 }
    }
  ],
  "totalGasCost": {
    "iGas": 3,
    "mGas": 15,
    "total": 18
  },
  "message": "Successfully processed 3 epochs across 2 agents"
}
```

## Proof Generation

### Generate Contribution Proof
Create cryptographic proof that a specific vector was committed in a specific epoch.

**Endpoint:** `POST /agents/proof`

**Request Body:**
```json
{
  "agentId": "my-ai-agent",
  "vectorText": "Hello world",
  "epochNumber": 1
}
```

**Response:**
```json
{
  "success": true,
  "agentId": "my-ai-agent",
  "vectorText": "Hello world",
  "epochNumber": 1,
  "proof": {
    "leafIndex": 0,
    "leafHash": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    "siblings": ["hash1", "hash2"],
    "peaks": ["peak1", "peak2"],
    "mmrSize": 3
  },
  "verified": true,
  "message": "Proof generated and verified"
}
```

## Monitoring & Status

### Get Agent Statistics
Retrieve comprehensive statistics for a specific agent.

**Endpoint:** `GET /agents/:agentId/stats`

**Response:**
```json
{
  "success": true,
  "stats": {
    "agentId": "my-ai-agent",
    "mmrSize": 5,
    "totalEpochs": 2,
    "currentRoot": "bef61c0e1234567890abcdef1234567890abcdef1234567890abcdef12345678",
    "ipfsCid": "Qm799fbb1234567890abcdef1234567890abcdef1234567890abcdef",
    "lastUpdated": 1704672000000
  },
  "message": "Statistics retrieved for agent my-ai-agent"
}
```

### Get Agent History
Retrieve complete epoch history for an agent.

**Endpoint:** `GET /agents/:agentId/history`

**Response:**
```json
{
  "success": true,
  "agentId": "my-ai-agent",
  "history": [
    {
      "epoch": 1,
      "root": "40141e27c5b3f3f58bf3c4d3c3e8f7a2b1c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5",
      "timestamp": 1704672000000,
      "date": "2024-01-07T20:00:00.000Z"
    },
    {
      "epoch": 2,
      "root": "bef61c0e1234567890abcdef1234567890abcdef1234567890abcdef12345678",
      "timestamp": 1704672300000,
      "date": "2024-01-07T20:05:00.000Z"
    }
  ],
  "totalEpochs": 2,
  "message": "History retrieved for agent my-ai-agent"
}
```

### Get Current Root
Get the current MMR root for an agent.

**Endpoint:** `GET /agents/:agentId/root`

**Response:**
```json
{
  "success": true,
  "agentId": "my-ai-agent",
  "currentRoot": "bef61c0e1234567890abcdef1234567890abcdef1234567890abcdef12345678",
  "message": "Current root retrieved for agent my-ai-agent"
}
```

### Verify Agent MMR
Verify the integrity of an agent's MMR structure.

**Endpoint:** `GET /agents/:agentId/verify`

**Response:**
```json
{
  "success": true,
  "agentId": "my-ai-agent",
  "verification": {
    "valid": true,
    "errors": [],
    "stats": {
      "agentId": "my-ai-agent",
      "mmrSize": 5,
      "totalEpochs": 2,
      "currentRoot": "bef61c0e...",
      "ipfsCid": "Qm799fbb...",
      "lastUpdated": 1704672300000
    }
  },
  "message": "MMR verification passed for agent my-ai-agent"
}
```

### System Status
Get overall system health and status.

**Endpoint:** `GET /system/status`

**Response:**
```json
{
  "success": true,
  "system": {
    "status": "operational",
    "timestamp": "2024-01-07T20:10:00.000Z",
    "uptime": 3600,
    "version": "1.0.0"
  },
  "blockchain": {
    "connected": true,
    "error": null
  },
  "ipfs": {
    "connected": true
  },
  "agents": {
    "total": 3,
    "registered": ["agent-1", "agent-2", "my-ai-agent"]
  },
  "message": "System status retrieved successfully"
}
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Detailed error message"
}
```

### Common HTTP Status Codes
- **200**: Success
- **400**: Bad Request (invalid input)
- **404**: Not Found (agent doesn't exist)
- **500**: Internal Server Error

### Common Error Scenarios
1. **Agent Not Found**: Agent must be initialized before use
2. **Invalid Vectors**: Empty or non-string vectors are filtered out
3. **Gas Insufficient**: Ensure LUCID tokens are available
4. **Blockchain Connection**: Solana validator must be running
5. **IPFS Issues**: Storage operations may fail if IPFS is unavailable

## Examples

### Complete Agent Workflow

```bash
# 1. Initialize agent
curl -X POST http://localhost:3001/agents/init \
  -H "Content-Type: application/json" \
  -d '{"agentId": "demo-agent"}'

# 2. Process first epoch
curl -X POST http://localhost:3001/agents/epoch \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "demo-agent",
    "vectors": ["Hello", "World", "AI"],
    "epochNumber": 1
  }'

# 3. Process second epoch
curl -X POST http://localhost:3001/agents/epoch \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "demo-agent",
    "vectors": ["Machine", "Learning", "Blockchain"],
    "epochNumber": 2
  }'

# 4. Generate proof for specific vector
curl -X POST http://localhost:3001/agents/proof \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "demo-agent",
    "vectorText": "Hello",
    "epochNumber": 1
  }'

# 5. Get agent statistics
curl http://localhost:3001/agents/demo-agent/stats

# 6. Get agent history
curl http://localhost:3001/agents/demo-agent/history

# 7. Verify agent MMR
curl http://localhost:3001/agents/demo-agent/verify
```

### Batch Processing Example

```bash
curl -X POST http://localhost:3001/agents/batch-epochs \
  -H "Content-Type: application/json" \
  -d '{
    "epochs": [
      {
        "agentId": "agent-1",
        "vectors": ["data1", "data2", "data3"],
        "epochNumber": 1
      },
      {
        "agentId": "agent-1",
        "vectors": ["data4", "data5", "data6"],
        "epochNumber": 2
      },
      {
        "agentId": "agent-2",
        "vectors": ["other1", "other2"]
      }
    ]
  }'
```

### System Monitoring

```bash
# Check system status
curl http://localhost:3001/system/status

# List all agents
curl http://localhost:3001/agents

# Monitor specific agent
curl http://localhost:3001/agents/my-agent/stats
```

## Integration Patterns

### Continuous Processing
For AI agents that continuously generate data:

1. Initialize agent once at startup
2. Batch vectors into epochs (recommended: 10-100 vectors per epoch)
3. Process epochs regularly (every few minutes/hours)
4. Monitor gas costs and optimize batch sizes
5. Verify MMR integrity periodically

### Proof-of-Work Integration
For systems requiring proof-of-contribution:

1. Process agent work in epochs
2. Generate proofs for specific contributions
3. Use proofs for reward distribution or verification
4. Maintain historical records via MMR

### Multi-Agent Coordination
For systems with multiple AI agents:

1. Use unique agent IDs for isolation
2. Process epochs in batches for gas efficiency
3. Monitor system status for coordination
4. Use agent statistics for load balancing

## Gas Optimization

### Single vs Batch Operations
- **Single Epoch**: 6 LUCID (1 iGas + 5 mGas)
- **Batch Operations**: 2 iGas + (5 × epochs) mGas
- **Savings**: Significant for multiple epochs

### Recommended Batch Sizes
- **Small batches**: 2-5 epochs (good for testing)
- **Medium batches**: 10-20 epochs (balanced efficiency)
- **Large batches**: 50+ epochs (maximum efficiency)

### Cost Monitoring
Monitor gas costs through:
- Response `gasCost` fields
- System status endpoint
- Agent statistics

## Security Considerations

1. **Input Validation**: All vector data is validated and sanitized
2. **Agent Isolation**: Each agent maintains separate MMR state
3. **Cryptographic Integrity**: SHA-256 hashing ensures data integrity
4. **Blockchain Verification**: All roots are committed on-chain
5. **Proof Verification**: All generated proofs are automatically verified

## Future Enhancements

Planned improvements include:
- Agent-specific authentication tokens
- Real-time WebSocket notifications
- Advanced batch optimization
- Cross-chain compatibility
- Enhanced monitoring dashboards

---

For technical support or questions about the AI Agent API, refer to the system documentation or check the system status endpoint for operational information.
