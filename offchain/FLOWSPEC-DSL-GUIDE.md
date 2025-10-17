# FlowSpec DSL - Complete Guide

**Version:** 1.0.0  
**Status:** ✅ Implemented (Phase 2 Complete)

## Overview

FlowSpec is a domain-specific language (DSL) for defining n8n workflows programmatically. It enables AI agents and developers to create, execute, and manage complex workflows using a simple, declarative syntax that compiles into n8n-compatible workflow JSON.

## Table of Contents

1. [Architecture](#architecture)
2. [Core Concepts](#core-concepts)
3. [Node Types](#node-types)
4. [API Reference](#api-reference)
5. [Examples](#examples)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     FlowSpec DSL Layer                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   FlowSpec   │───▶│  N8nCompiler │───▶│   n8n API    │  │
│  │    Types     │    │              │    │   Integration │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   FlowSpec   │───▶│  Validation  │───▶│  Execution   │  │
│  │   Service    │    │   Engine     │    │   Engine     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │  n8n Server  │
                    │  (Workflows) │
                    └──────────────┘
```

### Key Components

1. **FlowSpec Types** (`src/flowspec/types.ts`)
   - TypeScript type definitions
   - Core data structures
   - Configuration interfaces

2. **N8nCompiler** (`src/flowspec/n8nCompiler.ts`)
   - Compiles FlowSpec → n8n JSON
   - Validates workflow structure
   - Maps node types to n8n nodes

3. **FlowSpecService** (`src/flowspec/flowspecService.ts`)
   - Workflow lifecycle management
   - n8n API integration
   - Execution tracking

4. **API Endpoints** (`src/services/api.ts`)
   - RESTful API for workflow operations
   - Authentication & authorization
   - Error handling

---

## Core Concepts

### FlowSpec Structure

```typescript
interface FlowSpec {
  name: string;              // Workflow name
  description?: string;      // Optional description
  nodes: FlowNode[];        // Array of workflow nodes
  edges: FlowEdge[];        // Connections between nodes
  credentials?: Record<string, string>;
  metadata?: Record<string, unknown>;
  version?: string;
}
```

### Nodes

Nodes represent individual steps in a workflow:

```typescript
interface FlowNode {
  id: string;                // Unique identifier
  type: FlowNodeType;        // Node type (see below)
  input?: Record<string, unknown>;  // Input data
  config?: Record<string, unknown>; // Configuration
  position?: { x: number; y: number }; // UI position
}
```

### Edges

Edges define the flow between nodes:

```typescript
interface FlowEdge {
  from: string;    // Source node ID
  to: string;      // Target node ID
  when?: string;   // Conditional expression
  label?: string;  // Edge label for UI
}
```

---

## Node Types

### Available Node Types

| Type | Description | Use Case |
|------|-------------|----------|
| `llm.chat` | LLM inference | AI text generation |
| `embed` | Text embedding | Vector generation |
| `search` | Vector/semantic search | Context retrieval |
| `tool.http` | HTTP API calls | External integrations |
| `tool.mcp` | MCP tool execution | Protocol operations |
| `solana.write` | Solana transaction | Blockchain writes |
| `solana.read` | Solana data query | Blockchain reads |
| `ipfs.pin` | IPFS pinning | Decentralized storage |
| `branch` | Conditional branching | Decision logic |
| `transform` | Data transformation | Data processing |
| `webhook` | Webhook trigger | External events |
| `schedule` | Scheduled execution | Time-based automation |

### Node Configuration Examples

#### LLM Chat Node

```typescript
{
  id: 'llm',
  type: 'llm.chat',
  input: {
    prompt: '{{ $json.text }}'
  },
  config: {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 1000,
    systemPrompt: 'You are a helpful assistant'
  }
}
```

#### Solana Write Node

```typescript
{
  id: 'commit',
  type: 'solana.write',
  input: {
    data: '{{ $json.hash }}'
  },
  config: {
    network: 'devnet',
    instruction: 'custom',
    programId: 'YourProgramId...'
  }
}
```

#### Branch Node

```typescript
{
  id: 'router',
  type: 'branch',
  config: {
    condition: '{{ $json.type === "code" }}'
  }
}
```

---

## API Reference

### Base URL

```
http://localhost:3001/flowspec
```

### Endpoints

#### 1. Create Workflow

**POST** `/flowspec/create`

Creates a new workflow from a FlowSpec definition.

**Request Body:**
```json
{
  "name": "My Workflow",
  "description": "Description here",
  "nodes": [...],
  "edges": [...]
}
```

**Response:**
```json
{
  "success": true,
  "workflowId": "abc123",
  "workflowUrl": "http://localhost:5678/workflow/abc123",
  "message": "Workflow 'My Workflow' created successfully"
}
```

#### 2. Execute Workflow

**POST** `/flowspec/execute`

Executes a workflow with provided context.

**Request Body:**
```json
{
  "workflowId": "abc123",
  "context": {
    "tenantId": "user-001",
    "userId": "user-123",
    "variables": {
      "input": "Hello world"
    },
    "timeout": 30000
  }
}
```

**Response:**
```json
{
  "success": true,
  "executionId": "exec-456",
  "outputs": {...},
  "duration": 1234
}
```

#### 3. Get Execution History

**GET** `/flowspec/history/:workflowId?limit=10`

Retrieves execution history for a workflow.

**Response:**
```json
{
  "success": true,
  "workflowId": "abc123",
  "history": [...],
  "message": "Retrieved 10 execution records"
}
```

#### 4. Update Workflow

**PUT** `/flowspec/update/:workflowId`

Updates an existing workflow.

**Request Body:** FlowSpec definition

#### 5. Delete Workflow

**DELETE** `/flowspec/delete/:workflowId`

Deletes a workflow.

#### 6. List Workflows

**GET** `/flowspec/list`

Lists all workflows.

**Response:**
```json
{
  "success": true,
  "count": 5,
  "workflows": [...]
}
```

---

## Examples

### Example 1: Simple LLM Chat

```javascript
const flowSpec = {
  name: 'Simple Chat',
  nodes: [
    {
      id: 'trigger',
      type: 'webhook',
      config: { path: 'chat', method: 'POST' }
    },
    {
      id: 'llm',
      type: 'llm.chat',
      input: { prompt: '{{ $json.text }}' },
      config: { model: 'gpt-3.5-turbo' }
    }
  ],
  edges: [
    { from: 'trigger', to: 'llm' }
  ]
};
```

### Example 2: AI Agent with Memory

```javascript
const flowSpec = {
  name: 'AI Agent',
  nodes: [
    { id: 'trigger', type: 'webhook' },
    { id: 'embed', type: 'embed' },
    { id: 'search', type: 'search' },
    { id: 'llm', type: 'llm.chat' },
    { id: 'commit', type: 'solana.write' }
  ],
  edges: [
    { from: 'trigger', to: 'embed' },
    { from: 'embed', to: 'search' },
    { from: 'search', to: 'llm' },
    { from: 'llm', to: 'commit' }
  ]
};
```

### Example 3: Conditional Routing

```javascript
const flowSpec = {
  name: 'Smart Router',
  nodes: [
    { id: 'trigger', type: 'webhook' },
    { id: 'classifier', type: 'llm.chat' },
    { id: 'branch', type: 'branch' },
    { id: 'handler_a', type: 'tool.http' },
    { id: 'handler_b', type: 'llm.chat' }
  ],
  edges: [
    { from: 'trigger', to: 'classifier' },
    { from: 'classifier', to: 'branch' },
    { from: 'branch', to: 'handler_a', when: 'typeA' },
    { from: 'branch', to: 'handler_b', when: 'typeB' }
  ]
};
```

---

## Best Practices

### 1. Node Naming

- Use descriptive, meaningful IDs
- Follow naming conventions: `verb_noun` (e.g., `fetch_data`, `process_text`)
- Keep IDs short but clear

### 2. Error Handling

- Always include error handling nodes
- Use conditional branches for error paths
- Log failures for debugging

### 3. Performance

- Minimize sequential dependencies
- Use parallel execution where possible
- Set appropriate timeouts
- Cache intermediate results

### 4. Security

- Never hardcode credentials in FlowSpec
- Use credential references
- Validate all inputs
- Implement rate limiting

### 5. Testing

- Test workflows in isolation
- Use mock data for development
- Validate edge cases
- Monitor execution logs

---

## Troubleshooting

### Common Issues

#### 1. Workflow Creation Fails

**Symptom:** API returns validation errors

**Solutions:**
- Check that all node IDs are unique
- Verify all edges reference existing nodes
- Ensure required fields are present
- Validate node type compatibility

#### 2. Execution Timeout

**Symptom:** Workflow execution times out

**Solutions:**
- Increase `context.timeout` value
- Optimize slow nodes
- Check external service availability
- Split into smaller workflows

#### 3. Node Connection Errors

**Symptom:** Data not flowing between nodes

**Solutions:**
- Verify edge configuration
- Check conditional expressions
- Review input/output mappings
- Validate data transformations

#### 4. n8n API Errors

**Symptom:** Cannot create/execute workflows

**Solutions:**
- Verify n8n is running
- Check N8N_URL configuration
- Validate HMAC secret
- Review n8n logs

---

## Advanced Topics

### Custom Node Types

To add new node types:

1. Update `FlowNodeType` in `types.ts`
2. Add mapping in `n8nCompiler.ts`
3. Implement parameter compilation
4. Update documentation

### Workflow Versioning

```typescript
const flowSpec = {
  name: 'My Workflow',
  version: '1.2.0',
  metadata: {
    changelog: 'Added error handling',
    author: 'developer@example.com'
  },
  // ... rest of spec
};
```

### Dynamic Workflows

Generate FlowSpecs programmatically:

```javascript
function generateWorkflow(config) {
  const nodes = config.steps.map((step, i) => ({
    id: `step_${i}`,
    type: step.type,
    config: step.config
  }));
  
  const edges = nodes.slice(0, -1).map((node, i) => ({
    from: node.id,
    to: nodes[i + 1].id
  }));
  
  return { name: config.name, nodes, edges };
}
```

---

## Migration Guide

### From Manual n8n to FlowSpec

1. Export existing workflow from n8n
2. Analyze node structure
3. Map nodes to FlowSpec types
4. Define edges
5. Test converted workflow
6. Deploy via API

### Example Conversion

**n8n JSON:**
```json
{
  "nodes": [
    {"name": "Start", "type": "webhook"},
    {"name": "Process", "type": "function"}
  ]
}
```

**FlowSpec:**
```javascript
{
  nodes: [
    {id: 'start', type: 'webhook'},
    {id: 'process', type: 'transform'}
  ],
  edges: [{from: 'start', to: 'process'}]
}
```

---

## Resources

- **Test Examples:** `test-flowspec-examples.js`
- **Type Definitions:** `src/flowspec/types.ts`
- **Compiler Source:** `src/flowspec/n8nCompiler.ts`
- **Service Layer:** `src/flowspec/flowspecService.ts`
- **API Implementation:** `src/services/api.ts`

---

## Support

For issues or questions:
1. Check this documentation
2. Review example code
3. Inspect n8n logs
4. Check API error responses
5. Review FlowSpec validation errors

---

**Last Updated:** Phase 2 Implementation  
**Status:** ✅ Production Ready
