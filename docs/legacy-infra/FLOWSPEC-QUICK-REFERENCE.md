# FlowSpec API - Quick Reference

**Quick reference for FlowSpec API endpoints and format**

## API Endpoints Overview

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/flowspec/create` | Create a new workflow |
| POST | `/flowspec/execute` | Execute a workflow |
| GET | `/flowspec/history/:id` | Get execution history |
| PUT | `/flowspec/update/:id` | Update existing workflow |
| DELETE | `/flowspec/delete/:id` | Delete a workflow |
| GET | `/flowspec/list` | List all workflows |

**Base URL:** `http://localhost:3001/flowspec`

---

## 1. Create Workflow

```bash
POST /flowspec/create
```

**Minimal Example:**
```json
{
  "name": "My Workflow",
  "nodes": [
    { "id": "start", "type": "webhook" },
    { "id": "process", "type": "llm.chat" }
  ],
  "edges": [
    { "from": "start", "to": "process" }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "workflowId": "123",
  "workflowUrl": "http://localhost:5678/workflow/123"
}
```

---

## 2. Execute Workflow

```bash
POST /flowspec/execute
```

**Request:**
```json
{
  "workflowId": "123",
  "context": {
    "tenantId": "user-001",
    "variables": {
      "input": "your data here"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "executionId": "exec-456",
  "outputs": { ... },
  "duration": 1234
}
```

---

## 3. Get History

```bash
GET /flowspec/history/:workflowId?limit=10
```

**Example:**
```bash
curl http://localhost:3001/flowspec/history/123?limit=5
```

---

## 4. Update Workflow

```bash
PUT /flowspec/update/:workflowId
```

Send complete FlowSpec definition (same as create).

---

## 5. Delete Workflow

```bash
DELETE /flowspec/delete/:workflowId
```

---

## 6. List Workflows

```bash
GET /flowspec/list
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "workflows": [...]
}
```

---

## FlowSpec Format

### Basic Structure

```typescript
{
  name: string;              // Required
  description?: string;
  nodes: FlowNode[];        // Required
  edges: FlowEdge[];        // Required
  credentials?: {...};
  metadata?: {...};
}
```

### Predefined Node Types

| Type | Use Case | Maps to |
|------|----------|---------|
| `webhook` | HTTP trigger | `n8n-nodes-base.webhook` |
| `schedule` | Cron-based trigger | `n8n-nodes-base.cron` |
| `llm.chat` | AI text generation | `n8n-nodes-langchain.lmChatOpenAi` |
| `embed` | Create text embeddings | `n8n-nodes-langchain.embeddingsOpenAi` |
| `search` | Vector/semantic search | `n8n-nodes-base.httpRequest` |
| `tool.http` | Call external APIs | `n8n-nodes-base.httpRequest` |
| `tool.mcp` | Execute MCP tools | `n8n-nodes-base.function` |
| `solana.write` | Write to blockchain | `n8n-nodes-base.httpRequest` |
| `solana.read` | Read from blockchain | `n8n-nodes-base.httpRequest` |
| `ipfs.pin` | Pin to IPFS | `n8n-nodes-base.httpRequest` |
| `branch` | Conditional routing | `n8n-nodes-base.if` |
| `transform` | Data transformation | `n8n-nodes-base.function` |

### Using ANY n8n Node

You can use **any n8n node** by specifying its full type:

```json
{
  "id": "slack_msg",
  "type": "n8n-nodes-base.slack",
  "config": {
    "resource": "message",
    "operation": "post"
  },
  "input": {
    "channel": "#general",
    "text": "{{ $json.message }}"
  }
}
```

**Find available nodes:**
```bash
curl http://localhost:3001/flow/nodes
```

### Node Example

```json
{
  "id": "my_llm",
  "type": "llm.chat",
  "input": {
    "prompt": "{{ $json.userInput }}"
  },
  "config": {
    "provider": "openai",
    "model": "gpt-3.5-turbo",
    "temperature": 0.7,
    "maxTokens": 1000
  }
}
```

### Edge Example

```json
{
  "from": "node1",
  "to": "node2",
  "when": "{{ $json.type === 'urgent' }}"  // Optional condition
}
```

---

## Variable Interpolation

Use `{{ }}` to reference data:

- `{{ $json.field }}` - Input data
- `{{ $node["prev"].json.result }}` - Previous node output
- `{{ $credentials.key }}` - Credentials
- `{{ $vars.custom }}` - Variables

---

## Common Patterns

### Pattern 1: Simple Webhook + LLM

```json
{
  "name": "Chat",
  "nodes": [
    { "id": "webhook", "type": "webhook" },
    { 
      "id": "llm", 
      "type": "llm.chat",
      "input": { "prompt": "{{ $json.text }}" },
      "config": { "model": "gpt-3.5-turbo" }
    }
  ],
  "edges": [
    { "from": "webhook", "to": "llm" }
  ]
}
```

### Pattern 2: Search + LLM (RAG)

```json
{
  "name": "RAG",
  "nodes": [
    { "id": "webhook", "type": "webhook" },
    { 
      "id": "search", 
      "type": "search",
      "config": { "index": "docs", "topK": 5 }
    },
    { 
      "id": "llm", 
      "type": "llm.chat",
      "input": { 
        "prompt": "Context: {{ $node.search.json.results }}\nQ: {{ $json.question }}"
      }
    }
  ],
  "edges": [
    { "from": "webhook", "to": "search" },
    { "from": "search", "to": "llm" }
  ]
}
```

### Pattern 3: Conditional Branching

```json
{
  "name": "Router",
  "nodes": [
    { "id": "webhook", "type": "webhook" },
    { "id": "branch", "type": "branch" },
    { "id": "path_a", "type": "llm.chat" },
    { "id": "path_b", "type": "tool.http" }
  ],
  "edges": [
    { "from": "webhook", "to": "branch" },
    { "from": "branch", "to": "path_a", "when": "{{ $json.type === 'A' }}" },
    { "from": "branch", "to": "path_b", "when": "{{ $json.type === 'B' }}" }
  ]
}
```

---

## LLM Node Configuration

```json
{
  "id": "llm",
  "type": "llm.chat",
  "input": {
    "prompt": "{{ $json.text }}"
  },
  "config": {
    "provider": "openai",        // openai | anthropic | cohere | local
    "model": "gpt-3.5-turbo",    // Model name
    "temperature": 0.7,          // 0.0 - 2.0
    "maxTokens": 1000,           // Max output tokens
    "systemPrompt": "You are..." // System instructions
  }
}
```

---

## Solana Node Configuration

```json
{
  "id": "commit",
  "type": "solana.write",
  "input": {
    "data": "{{ $json.hash }}"
  },
  "config": {
    "network": "devnet",         // mainnet-beta | devnet | testnet
    "instruction": "custom",     // transfer | createAccount | custom
    "programId": "Your..."       // Required for custom
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common errors:
- **Validation Error**: Invalid FlowSpec structure
- **Execution Timeout**: Workflow took too long
- **n8n Connection Error**: Cannot reach n8n server

---

## Environment Setup

Required environment variables:

```bash
N8N_URL=http://localhost:5678
N8N_API_KEY=your-api-key-here      # Optional, if n8n requires auth
N8N_HMAC_SECRET=your-secret-here   # For webhook signatures
```

---

## Testing with cURL

```bash
# Create workflow
curl -X POST http://localhost:3001/flowspec/create \
  -H "Content-Type: application/json" \
  -d @workflow.json

# Execute workflow
curl -X POST http://localhost:3001/flowspec/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "123",
    "context": {
      "tenantId": "test",
      "variables": {"input": "test"}
    }
  }'

# Get history
curl http://localhost:3001/flowspec/history/123

# List workflows
curl http://localhost:3001/flowspec/list

# Delete workflow
curl -X DELETE http://localhost:3001/flowspec/delete/123
```

---

## JavaScript Client

```javascript
const FlowSpec = {
  baseUrl: 'http://localhost:3001/flowspec',
  
  async create(spec) {
    return fetch(`${this.baseUrl}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spec)
    }).then(r => r.json());
  },
  
  async execute(id, context) {
    return fetch(`${this.baseUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId: id, context })
    }).then(r => r.json());
  },
  
  async list() {
    return fetch(`${this.baseUrl}/list`).then(r => r.json());
  }
};

// Usage
const { workflowId } = await FlowSpec.create({
  name: "Test",
  nodes: [...],
  edges: [...]
});

await FlowSpec.execute(workflowId, {
  tenantId: "user-001",
  variables: { input: "test" }
});
```

---

## Best Practices

✅ **DO:**
- Use descriptive node IDs
- Validate FlowSpec before creating
- Set appropriate timeouts
- Handle errors gracefully
- Use credentials for sensitive data

❌ **DON'T:**
- Hardcode API keys in workflows
- Create overly complex workflows
- Ignore timeout settings
- Skip input validation
- Use duplicate node IDs

---

## Troubleshooting

### Workflow won't create
- Check all node IDs are unique
- Verify edges reference existing nodes
- Ensure required fields are present

### Execution times out
- Increase `context.timeout`
- Check external service availability
- Verify network connectivity

### Cannot connect to n8n
- Ensure n8n is running: `docker ps | grep n8n`
- Check `N8N_URL` environment variable
- Test n8n API: `curl http://localhost:5678/api/v1/workflows`

---

## Documentation

For detailed documentation, see:
- **Full API Reference**: `FLOWSPEC-API-REFERENCE.md`
- **DSL Guide**: `FLOWSPEC-DSL-GUIDE.md`
- **Type Definitions**: `src/flowspec/types.ts`

---

## Support Resources

- **Service Implementation**: `src/flowspec/flowspecService.ts`
- **Compiler**: `src/flowspec/n8nCompiler.ts`
- **API Handlers**: `src/services/api.ts`
- **Existing DSL Guide**: `FLOWSPEC-DSL-GUIDE.md`

---

**Version:** 1.0.0  
**Last Updated:** Phase 2 Complete  
**Status:** ✅ Production Ready
