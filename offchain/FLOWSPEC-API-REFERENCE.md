# FlowSpec API Reference

**Complete guide for using the FlowSpec API endpoints**

## Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [FlowSpec Format](#flowspec-format)
5. [Complete Examples](#complete-examples)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)

---

## Quick Start

### Base URL

```
http://localhost:3001/flowspec
```

### Prerequisites

- n8n server running and accessible
- `N8N_URL` environment variable configured
- `N8N_API_KEY` set (if n8n requires authentication)
- `N8N_HMAC_SECRET` configured for webhook signatures

### Quick Example

```javascript
// 1. Create a workflow
const response = await fetch('http://localhost:3001/flowspec/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Hello World',
    nodes: [
      { id: 'start', type: 'webhook' },
      { id: 'llm', type: 'llm.chat', config: { model: 'gpt-3.5-turbo' } }
    ],
    edges: [{ from: 'start', to: 'llm' }]
  })
});

const { workflowId } = await response.json();

// 2. Execute the workflow
await fetch('http://localhost:3001/flowspec/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workflowId,
    context: {
      tenantId: 'user-001',
      variables: { input: 'Hello!' }
    }
  })
});
```

---

## Authentication

Currently, the FlowSpec API doesn't require authentication for the offchain service itself, but it does use:

- **HMAC Signatures**: Workflow executions are signed using `N8N_HMAC_SECRET`
- **Tenant Isolation**: Each execution requires a `tenantId` for multi-tenant support
- **n8n API Key**: If n8n requires authentication, set `N8N_API_KEY` in your environment

### Security Headers

When executing workflows, these headers are automatically added:

```javascript
{
  'Content-Type': 'application/json',
  'X-Signature': '<hmac-sha256-signature>',
  'X-Tenant-Id': '<tenant-id>'
}
```

---

## API Endpoints

### 1. Create Workflow

Creates a new n8n workflow from a FlowSpec definition.

#### Endpoint

```
POST /flowspec/create
```

#### Request Body

```typescript
{
  name: string;              // Required: Workflow name
  description?: string;      // Optional: Workflow description
  nodes: FlowNode[];        // Required: Array of workflow nodes
  edges: FlowEdge[];        // Required: Node connections
  credentials?: Record<string, string>;  // Optional: Credential references
  metadata?: Record<string, unknown>;    // Optional: Additional metadata
  version?: string;          // Optional: Workflow version
}
```

#### Example Request

```bash
curl -X POST http://localhost:3001/flowspec/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Content Generator",
    "description": "Generates content using LLM and stores on IPFS",
    "nodes": [
      {
        "id": "trigger",
        "type": "webhook",
        "config": {
          "path": "generate",
          "method": "POST"
        }
      },
      {
        "id": "llm",
        "type": "llm.chat",
        "input": {
          "prompt": "{{ $json.text }}"
        },
        "config": {
          "provider": "openai",
          "model": "gpt-3.5-turbo",
          "temperature": 0.7,
          "maxTokens": 1000
        }
      },
      {
        "id": "ipfs",
        "type": "ipfs.pin",
        "input": {
          "content": "{{ $json.output }}"
        }
      }
    ],
    "edges": [
      { "from": "trigger", "to": "llm" },
      { "from": "llm", "to": "ipfs" }
    ]
  }'
```

#### Response

```json
{
  "success": true,
  "workflowId": "123",
  "workflowUrl": "http://localhost:5678/workflow/123",
  "message": "Workflow 'AI Content Generator' created successfully"
}
```

#### Error Response

```json
{
  "success": false,
  "error": "Invalid FlowSpec: Node 'llm' references non-existent edge target"
}
```

---

### 2. Execute Workflow

Executes a workflow with provided input data and context.

#### Endpoint

```
POST /flowspec/execute
```

#### Request Body

```typescript
{
  workflowId: string;        // Required: Workflow ID from create
  context: {
    tenantId: string;        // Required: Tenant identifier
    userId?: string;         // Optional: User identifier
    variables?: Record<string, unknown>;  // Optional: Input variables
    timeout?: number;        // Optional: Timeout in ms (default: 30000)
  }
}
```

#### Example Request

```bash
curl -X POST http://localhost:3001/flowspec/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "123",
    "context": {
      "tenantId": "tenant-001",
      "userId": "user-456",
      "variables": {
        "text": "Write a short poem about AI",
        "style": "haiku"
      },
      "timeout": 60000
    }
  }'
```

#### Response (Success)

```json
{
  "success": true,
  "executionId": "exec-789",
  "outputs": {
    "result": "AI learns and grows\nIn silicon gardens blooms\nDigital wisdom"
  },
  "duration": 2341
}
```

#### Response (Failure)

```json
{
  "success": false,
  "executionId": "error",
  "outputs": {},
  "errors": [
    "Connection timeout to LLM provider"
  ],
  "duration": 30000
}
```

---

### 3. Get Execution History

Retrieves execution history for a specific workflow.

#### Endpoint

```
GET /flowspec/history/:workflowId?limit=10
```

#### Parameters

- **workflowId** (path, required): The workflow ID
- **limit** (query, optional): Number of records to return (default: 10)

#### Example Request

```bash
curl http://localhost:3001/flowspec/history/123?limit=5
```

#### Response

```json
{
  "success": true,
  "workflowId": "123",
  "history": [
    {
      "id": "exec-789",
      "finished": true,
      "mode": "webhook",
      "startedAt": "2025-10-21T20:00:00.000Z",
      "stoppedAt": "2025-10-21T20:00:02.341Z",
      "workflowData": {
        "name": "AI Content Generator"
      },
      "data": {
        "resultData": {
          "runData": {...}
        }
      }
    },
    {
      "id": "exec-788",
      "finished": false,
      "mode": "webhook",
      "startedAt": "2025-10-21T19:55:00.000Z",
      "error": "Timeout exceeded"
    }
  ],
  "message": "Retrieved 5 execution records"
}
```

---

### 4. Update Workflow

Updates an existing workflow with a new FlowSpec definition.

#### Endpoint

```
PUT /flowspec/update/:workflowId
```

#### Parameters

- **workflowId** (path, required): The workflow ID to update

#### Request Body

Same as Create Workflow - complete FlowSpec definition

#### Example Request

```bash
curl -X PUT http://localhost:3001/flowspec/update/123 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Content Generator v2",
    "description": "Updated with better prompts",
    "nodes": [
      {
        "id": "trigger",
        "type": "webhook"
      },
      {
        "id": "llm",
        "type": "llm.chat",
        "config": {
          "model": "gpt-4",
          "temperature": 0.8
        }
      }
    ],
    "edges": [
      { "from": "trigger", "to": "llm" }
    ]
  }'
```

#### Response

```json
{
  "success": true,
  "workflowId": "123",
  "message": "Workflow 'AI Content Generator v2' updated successfully"
}
```

#### Error Response

```json
{
  "success": false,
  "error": "Workflow not found: 123"
}
```

---

### 5. Delete Workflow

Permanently deletes a workflow.

#### Endpoint

```
DELETE /flowspec/delete/:workflowId
```

#### Parameters

- **workflowId** (path, required): The workflow ID to delete

#### Example Request

```bash
curl -X DELETE http://localhost:3001/flowspec/delete/123
```

#### Response

```json
{
  "success": true,
  "workflowId": "123",
  "message": "Workflow deleted successfully"
}
```

#### Error Response

```json
{
  "success": false,
  "error": "Failed to delete workflow: Workflow not found"
}
```

---

### 6. List Workflows

Lists all workflows managed by the FlowSpec service.

#### Endpoint

```
GET /flowspec/list
```

#### Example Request

```bash
curl http://localhost:3001/flowspec/list
```

#### Response

```json
{
  "success": true,
  "count": 3,
  "workflows": [
    {
      "id": "123",
      "name": "AI Content Generator",
      "active": true,
      "createdAt": "2025-10-21T10:00:00.000Z",
      "updatedAt": "2025-10-21T15:30:00.000Z",
      "nodes": 3,
      "tags": []
    },
    {
      "id": "124",
      "name": "Data Pipeline",
      "active": true,
      "createdAt": "2025-10-21T11:00:00.000Z",
      "updatedAt": "2025-10-21T11:00:00.000Z",
      "nodes": 5,
      "tags": ["pipeline", "etl"]
    },
    {
      "id": "125",
      "name": "Blockchain Monitor",
      "active": false,
      "createdAt": "2025-10-21T12:00:00.000Z",
      "updatedAt": "2025-10-21T14:00:00.000Z",
      "nodes": 4,
      "tags": ["solana"]
    }
  ],
  "message": "Retrieved 3 workflows"
}
```

---

## FlowSpec Format

### Complete Structure

```typescript
interface FlowSpec {
  name: string;                              // Workflow name
  description?: string;                      // Optional description
  nodes: FlowNode[];                        // Array of nodes
  edges: FlowEdge[];                        // Node connections
  credentials?: Record<string, string>;      // Named credentials
  metadata?: Record<string, unknown>;        // Custom metadata
  version?: string;                          // Workflow version
}
```

### Node Definition

```typescript
interface FlowNode {
  id: string;                                // Unique node identifier
  type: FlowNodeType;                        // Node type (see below)
  input?: Record<string, unknown>;           // Input data/variables
  config?: Record<string, unknown>;          // Node configuration
  position?: { x: number; y: number };       // UI position (optional)
}
```

### Edge Definition

```typescript
interface FlowEdge {
  from: string;      // Source node ID
  to: string;        // Target node ID
  when?: string;     // Conditional expression (optional)
  label?: string;    // Edge label for UI (optional)
}
```

### Available Node Types

**Predefined FlowSpec Types** (abstracted, cross-compatible):

| Type | Description | Maps to n8n Node |
|------|-------------|------------------|
| `llm.chat` | LLM inference | `n8n-nodes-langchain.lmChatOpenAi` |
| `embed` | Text embedding | `n8n-nodes-langchain.embeddingsOpenAi` |
| `search` | Vector/semantic search | `n8n-nodes-base.httpRequest` |
| `tool.http` | HTTP API calls | `n8n-nodes-base.httpRequest` |
| `tool.mcp` | MCP tool execution | `n8n-nodes-base.function` |
| `solana.write` | Solana transaction | `n8n-nodes-base.httpRequest` |
| `solana.read` | Solana data query | `n8n-nodes-base.httpRequest` |
| `ipfs.pin` | IPFS pinning | `n8n-nodes-base.httpRequest` |
| `branch` | Conditional branching | `n8n-nodes-base.if` |
| `transform` | Data transformation | `n8n-nodes-base.function` |
| `webhook` | Webhook trigger | `n8n-nodes-base.webhook` |
| `schedule` | Scheduled execution | `n8n-nodes-base.cron` |

**Using Raw n8n Nodes:**

FlowSpec can be extended to support ANY n8n node by using the raw n8n node type:

```json
{
  "id": "my_custom_node",
  "type": "n8n-nodes-base.slack",  // Use actual n8n node type
  "config": {
    "resource": "message",
    "operation": "post"
  },
  "input": {
    "channel": "{{ $json.channel }}",
    "text": "{{ $json.message }}"
  }
}
```

To find available n8n node types, use the n8n API:
```bash
curl http://localhost:3001/flow/nodes
```

### Using Native n8n Nodes - Examples

**Slack Integration:**
```json
{
  "id": "notify_slack",
  "type": "n8n-nodes-base.slack",
  "config": {
    "resource": "message",
    "operation": "post"
  },
  "input": {
    "channel": "#alerts",
    "text": "{{ $json.alert }}"
  }
}
```

**Gmail Integration:**
```json
{
  "id": "send_email",
  "type": "n8n-nodes-base.gmail",
  "config": {
    "resource": "message",
    "operation": "send"
  },
  "input": {
    "to": "{{ $json.recipient }}",
    "subject": "Alert",
    "message": "{{ $json.body }}"
  }
}
```

**Google Sheets:**
```json
{
  "id": "log_to_sheet",
  "type": "n8n-nodes-base.googleSheets",
  "config": {
    "resource": "sheet",
    "operation": "append"
  },
  "input": {
    "sheetId": "your-sheet-id",
    "range": "A:Z",
    "values": [["{{ $json.data }}"]]
  }
}
```

**PostgreSQL:**
```json
{
  "id": "query_db",
  "type": "n8n-nodes-base.postgres",
  "config": {
    "operation": "executeQuery"
  },
  "input": {
    "query": "SELECT * FROM users WHERE id = {{ $json.userId }}"
  }
}
```

**Airtable:**
```json
{
  "id": "update_airtable",
  "type": "n8n-nodes-base.airtable",
  "config": {
    "operation": "create",
    "resource": "record"
  },
  "input": {
    "baseId": "your-base",
    "table": "Tasks",
    "fields": {
      "Name": "{{ $json.taskName }}",
      "Status": "{{ $json.status }}"
    }
  }
}
```

**Discovering Available Nodes:**
```bash
# List all available nodes
curl http://localhost:3001/flow/nodes

# Search for specific nodes
curl "http://localhost:3001/flow/nodes?search=slack"

# Filter by category
curl "http://localhost:3001/flow/nodes?category=Communication"
```

### Node Type Configurations

#### LLM Chat

```typescript
{
  id: 'llm',
  type: 'llm.chat',
  input: {
    prompt: '{{ $json.userInput }}'
  },
  config: {
    provider: 'openai' | 'anthropic' | 'cohere' | 'local',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,              // 0.0 - 2.0
    maxTokens: 1000,               // Max output tokens
    systemPrompt: 'You are...'     // System instructions
  }
}
```

#### Solana Write

```typescript
{
  id: 'commit',
  type: 'solana.write',
  input: {
    data: '{{ $json.hash }}'
  },
  config: {
    network: 'mainnet-beta' | 'devnet' | 'testnet',
    instruction: 'transfer' | 'createAccount' | 'custom',
    programId: 'YourProgramId...'   // For custom instructions
  }
}
```

#### Search

```typescript
{
  id: 'search',
  type: 'search',
  input: {
    query: '{{ $json.searchText }}'
  },
  config: {
    index: 'documents',
    topK: 5,                       // Number of results
    minScore: 0.7,                 // Minimum similarity score
    filters: {                     // Optional filters
      category: 'technical'
    }
  }
}
```

#### HTTP Tool

```typescript
{
  id: 'api',
  type: 'tool.http',
  config: {
    url: 'https://api.example.com/data',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer {{ $credentials.apiKey }}'
    },
    body: {
      data: '{{ $json.input }}'
    }
  }
}
```

#### Branch

```typescript
{
  id: 'router',
  type: 'branch',
  config: {
    condition: '{{ $json.type === "urgent" }}'
  }
}
```

### Variable Interpolation

Use `{{ }}` syntax to reference data:

- `{{ $json.fieldName }}` - Access input JSON data
- `{{ $node["previous_node"].json.result }}` - Access specific node output
- `{{ $credentials.apiKey }}` - Access credentials
- `{{ $vars.customVar }}` - Access execution variables

---

## Complete Examples

### Example 1: Simple AI Chatbot

```json
{
  "name": "AI Chatbot",
  "description": "Basic chatbot with LLM",
  "nodes": [
    {
      "id": "webhook",
      "type": "webhook",
      "config": {
        "path": "chat",
        "method": "POST"
      }
    },
    {
      "id": "llm",
      "type": "llm.chat",
      "input": {
        "prompt": "{{ $json.message }}"
      },
      "config": {
        "provider": "openai",
        "model": "gpt-3.5-turbo",
        "temperature": 0.7,
        "systemPrompt": "You are a helpful assistant."
      }
    }
  ],
  "edges": [
    { "from": "webhook", "to": "llm" }
  ]
}
```

### Example 2: AI Agent with Memory

```json
{
  "name": "Memory Agent",
  "description": "AI agent with vector search memory",
  "nodes": [
    {
      "id": "trigger",
      "type": "webhook"
    },
    {
      "id": "embed_query",
      "type": "embed",
      "input": {
        "text": "{{ $json.query }}"
      }
    },
    {
      "id": "search_memory",
      "type": "search",
      "input": {
        "query": "{{ $node.embed_query.json.embedding }}"
      },
      "config": {
        "index": "agent_memory",
        "topK": 3,
        "minScore": 0.7
      }
    },
    {
      "id": "llm_respond",
      "type": "llm.chat",
      "input": {
        "prompt": "Query: {{ $json.query }}\nContext: {{ $node.search_memory.json.results }}"
      },
      "config": {
        "model": "gpt-4",
        "temperature": 0.8
      }
    },
    {
      "id": "commit",
      "type": "solana.write",
      "input": {
        "data": "{{ $node.llm_respond.json.hash }}"
      },
      "config": {
        "network": "devnet"
      }
    }
  ],
  "edges": [
    { "from": "trigger", "to": "embed_query" },
    { "from": "embed_query", "to": "search_memory" },
    { "from": "search_memory", "to": "llm_respond" },
    { "from": "llm_respond", "to": "commit" }
  ]
}
```

### Example 3: Conditional Workflow

```json
{
  "name": "Smart Router",
  "description": "Routes requests based on content type",
  "nodes": [
    {
      "id": "trigger",
      "type": "webhook"
    },
    {
      "id": "classifier",
      "type": "llm.chat",
      "input": {
        "prompt": "Classify this as 'question' or 'command': {{ $json.text }}"
      },
      "config": {
        "model": "gpt-3.5-turbo",
        "temperature": 0.1
      }
    },
    {
      "id": "branch",
      "type": "branch",
      "config": {
        "condition": "{{ $node.classifier.json.type }}"
      }
    },
    {
      "id": "handle_question",
      "type": "search",
      "config": {
        "index": "knowledge_base"
      }
    },
    {
      "id": "handle_command",
      "type": "tool.http",
      "config": {
        "url": "https://api.internal/execute",
        "method": "POST"
      }
    }
  ],
  "edges": [
    { "from": "trigger", "to": "classifier" },
    { "from": "classifier", "to": "branch" },
    { 
      "from": "branch", 
      "to": "handle_question",
      "when": "question"
    },
    { 
      "from": "branch", 
      "to": "handle_command",
      "when": "command"
    }
  ]
}
```

### Example 4: Scheduled Data Pipeline

```json
{
  "name": "Daily Data Sync",
  "description": "Syncs data daily and commits to blockchain",
  "nodes": [
    {
      "id": "schedule",
      "type": "schedule",
      "config": {
        "cron": "0 0 * * *",
        "timezone": "UTC"
      }
    },
    {
      "id": "fetch",
      "type": "tool.http",
      "config": {
        "url": "https://api.data-source.com/daily",
        "method": "GET"
      }
    },
    {
      "id": "transform",
      "type": "transform",
      "config": {
        "expression": "{{ $json.data.map(item => item.value) }}"
      }
    },
    {
      "id": "pin_ipfs",
      "type": "ipfs.pin",
      "input": {
        "content": "{{ $node.transform.json.result }}"
      }
    },
    {
      "id": "commit_chain",
      "type": "solana.write",
      "input": {
        "cid": "{{ $node.pin_ipfs.json.cid }}"
      },
      "config": {
        "network": "mainnet-beta"
      }
    }
  ],
  "edges": [
    { "from": "schedule", "to": "fetch" },
    { "from": "fetch", "to": "transform" },
    { "from": "transform", "to": "pin_ipfs" },
    { "from": "pin_ipfs", "to": "commit_chain" }
  ]
}
```

---

## Error Handling

### Common Errors

#### 1. Validation Errors

```json
{
  "success": false,
  "error": "Invalid FlowSpec: Node 'xyz' references non-existent edge source"
}
```

**Causes:**
- Missing required fields
- Invalid node types
- Broken edge references
- Duplicate node IDs

**Solutions:**
- Validate FlowSpec structure before submission
- Ensure all node IDs are unique
- Verify all edges reference existing nodes

#### 2. Execution Errors

```json
{
  "success": false,
  "executionId": "error",
  "errors": ["Connection timeout"],
  "duration": 30000
}
```

**Causes:**
- External service unavailable
- Timeout exceeded
- Invalid credentials
- Network issues

**Solutions:**
- Increase timeout value
- Verify external service availability
- Check credentials configuration
- Implement retry logic

#### 3. n8n API Errors

```json
{
  "success": false,
  "error": "Failed to create workflow: Unauthorized"
}
```

**Causes:**
- n8n not running
- Invalid API key
- Network connectivity issues

**Solutions:**
- Verify n8n is running: `docker ps | grep n8n`
- Check `N8N_API_KEY` environment variable
- Test n8n API directly: `curl http://localhost:5678/api/v1/workflows`

### Error Response Format

All errors follow this structure:

```typescript
{
  success: false,
  error: string,           // Error message
  details?: any,          // Additional error details
  code?: string           // Error code (if applicable)
}
```

---

## Best Practices

### 1. Workflow Design

✅ **DO:**
- Use descriptive node IDs (`fetch_data`, not `node1`)
- Keep workflows focused and single-purpose
- Include error handling paths
- Document complex logic in `description`

❌ **DON'T:**
- Create overly complex workflows (split into smaller ones)
- Hardcode sensitive data (use credentials)
- Ignore timeout considerations
- Skip validation before deployment

### 2. Node Configuration

✅ **DO:**
- Use variable interpolation for dynamic data
- Set appropriate timeouts for external calls
- Validate input data early in the workflow
- Use type-appropriate node types

❌ **DON'T:**
- Nest too many variable references
- Use excessive chaining without error handling
- Ignore rate limits on external APIs
- Mix concerns within single nodes

### 3. Execution Context

✅ **DO:**
- Always provide a `tenantId`
- Set realistic timeout values
- Pass minimal necessary variables
- Use consistent naming conventions

❌ **DON'T:**
- Share tenantIds across users
- Set extremely high timeouts
- Pass sensitive data in variables
- Reuse execution contexts unsafely

### 4. Performance Optimization

✅ **DO:**
- Cache intermediate results when possible
- Use parallel execution for independent nodes
- Set appropriate resource limits
- Monitor execution times

❌ **DON'T:**
- Create unnecessarily sequential workflows
- Ignore performance metrics
- Skip optimization for high-volume workflows
- Over-complicate simple operations

### 5. Security

✅ **DO:**
- Use credential references for sensitive data
- Validate all input data
- Implement rate limiting
- Log security-relevant events

❌ **DON'T:**
- Expose API keys in workflow definitions
- Trust user input without validation
- Skip authentication checks
- Log sensitive information

---

## Testing

### Manual Testing with cURL

```bash
# Test workflow creation
curl -X POST http://localhost:3001/flowspec/create \
  -H "Content-Type: application/json" \
  -d @test-workflow.json

# Test execution
curl -X POST http://localhost:3001/flowspec/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "123",
    "context": {
      "tenantId": "test",
      "variables": {"input": "test"}
    }
  }'

# Check history
curl http://localhost:3001/flowspec/history/123
```

### Testing with JavaScript

```javascript
const FlowSpecClient = {
  baseUrl: 'http://localhost:3001/flowspec',
  
  async create(spec) {
    const res = await fetch(`${this.baseUrl}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spec)
    });
    return res.json();
  },
  
  async execute(workflowId, context) {
    const res = await fetch(`${this.baseUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId, context })
    });
    return res.json();
  },
  
  async history(workflowId, limit = 10) {
    const res = await fetch(
      `${this.baseUrl}/history/${workflowId}?limit=${limit}`
    );
    return res.json();
  },
  
  async update(workflowId, spec) {
    const res = await fetch(`${this.baseUrl}/update/${workflowId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spec)
    });
    return res.json();
  },
  
  async delete(workflowId) {
    const res = await fetch(`${this.baseUrl}/delete/${workflowId}`, {
      method: 'DELETE'
    });
    return res.json();
  },
  
  async list() {
    const res = await fetch(`${this.baseUrl}/list`);
    return res.json();
  }
};

// Usage
const { workflowId } = await FlowSpecClient.create({
  name: 'Test Workflow',
  nodes: [...],
  edges: [...]
});

const result = await FlowSpecClient.execute(workflowId, {
  tenantId: 'test-user',
  variables: { input: 'Hello' }
});
```

---

## Troubleshooting

### Issue: Workflow creation fails with validation error

**Symptom:**
```json
{
  "success": false,
  "error": "Invalid FlowSpec: ..."
}
```

**Diagnosis:**
1. Check all node IDs are unique
2. Verify all edges reference existing nodes
3. Ensure required fields are present
4. Validate node type compatibility

**Solution:**
```javascript
// Use validation helper
function validateFlowSpec(spec) {
  const nodeIds = new Set();
  for (const node of spec.nodes) {
    if (nodeIds.has(node.id)) {
      throw new Error(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);
  }
  
  for (const edge of spec.edges) {
    if (!nodeIds.has(edge.from)) {
      throw new Error(`Invalid edge source: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      throw new Error(`Invalid edge target: ${edge.to}`);
    }
  }
}
```

### Issue: Execution times out

**Symptom:**
```json
{
  "success": false,
  "errors": ["Execution timeout"],
  "duration": 30000
}
```

**Diagnosis:**
1. Check if external services are slow
2. Verify network connectivity
3. Review node complexity

**Solution:**
```javascript
// Increase timeout
await FlowSpecClient.execute(workflowId, {
  tenantId: 'user',
  timeout: 60000,  // Increase to 60 seconds
  variables: {...}
});
```

### Issue: Cannot connect to n8n

**Symptom:**
```json
{
  "success": false,
  "error": "Failed to create workflow: connect ECONNREFUSED"
}
```

**Diagnosis:**
```bash
# Check n8n is running
docker ps | grep n8n

# Check n8n logs
docker logs lucid-n8n

# Test n8n API
curl http://localhost:5678/api/v1/workflows
```

**Solution:**
1. Start n8n if not running
2. Verify `N8N_URL` environment variable
3. Check firewall/network settings

---

## Migration & Integration

### Migrating from Manual n8n

1. **Export existing workflow:**
```bash
# From n8n UI: Export workflow as JSON
```

2. **Convert to FlowSpec:**
```javascript
function convertN8nToFlowSpec(n8nWorkflow) {
  return {
    name: n8nWorkflow.name,
    nodes: n8nWorkflow.nodes.map(node => ({
      id: node.name,
      type: mapN8nType(node.type),
      config: node.parameters
    })),
    edges: extractEdges(n8nWorkflow.connections)
  };
}
```

3. **Test and deploy:**
