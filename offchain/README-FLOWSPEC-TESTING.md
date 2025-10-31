# FlowSpec API Testing Guide

Complete guide for testing the FlowSpec routes with real results.

## Overview

The test suite validates:
- **`POST /flowspec/create`** - Workflow creation from FlowSpec DSL
- **`POST /flowspec/execute`** - Workflow execution with context
- **`GET /flowspec/history/:workflowId`** - Execution history retrieval
- **`DELETE /flowspec/delete/:workflowId`** - Workflow cleanup

## Quick Start

### Prerequisites

1. **n8n must be running**:
   ```bash
   cd Lucid-L2/n8n
   docker-compose up -d
   ```

2. **Environment variables configured** (`.env` file):
   ```bash
   N8N_URL=http://localhost:5678
   N8N_HMAC_SECRET=your-secret-key
   N8N_API_KEY=your-api-key  # Optional
   ```

3. **API server running**:
   ```bash
   cd Lucid-L2/offchain
   npm run dev
   ```

### Running Tests

```bash
# Install dependencies (if not already installed)
npm install axios

# Run the test suite
node test-flowspec.js
```

The script will:
1. ✅ Check prerequisites (Docker, n8n, API server)
2. 🔧 Create test workflows
3. ▶️ Execute workflows with test data
4. 📊 Retrieve execution history
5. 🧹 Clean up test workflows
6. 📝 Generate detailed report

## Test Scenarios

### Test 1: Echo Workflow (Basic)
Tests fundamental workflow creation and execution:
- Creates a simple webhook → transform workflow
- Executes with test data
- Validates output structure

**Expected Result:**
```json
{
  "message": "Hello from FlowSpec test suite!",
  "timestamp": "2025-10-26T17:00:00.000Z",
  "echo": true
}
```

### Test 2: HTTP API Integration
Tests external API calls:
- Fetches real data from GitHub API
- Validates HTTP request handling
- Tests external service integration

**Expected Result:**
```json
{
  "name": "node",
  "full_name": "nodejs/node",
  "description": "Node.js JavaScript runtime",
  "stargazers_count": 100000+
}
```

### Test 3: Conditional Branch
Tests workflow branching logic:
- Routes based on priority level
- Validates conditional execution
- Tests multiple execution paths

**Expected Results:**
- High priority → `{ "status": "urgent", "priority": "high" }`
- Normal priority → `{ "status": "normal", "priority": "normal" }`

## Sample Output

```
═══════════════════════════════════════════════════════════
          FlowSpec API Test Suite
═══════════════════════════════════════════════════════════

============================================================
  Pre-flight Checks
============================================================
✓ Docker is installed
✓ n8n container running: lucid-n8n
✓ API server accessible at http://localhost:3001
✓ n8n API accessible at http://localhost:5678

Environment Variables:
✓ N8N_URL: Set
✓ N8N_HMAC_SECRET: Set

============================================================
  Test 1: Echo Workflow (Basic)
============================================================
ℹ Tests basic workflow creation and execution with data transformation

ℹ Creating workflow: Echo Workflow - Create
✓ Created workflow: 123
ℹ   URL: http://localhost:5678/workflow/123

ℹ Executing workflow: Echo Workflow - Execute (ID: 123)
✓ Execution completed successfully
ℹ   Execution ID: exec-456
ℹ   Duration: 1234ms
ℹ   Outputs: {
  "message": "Hello from FlowSpec test suite!",
  "timestamp": "2025-10-26T17:00:00.000Z",
  "echo": true
}

ℹ Fetching execution history for workflow: 123
✓ Retrieved 1 execution records
ℹ   [1] exec-456 - Completed
ℹ       Started: 2025-10-26T17:00:00.000Z

============================================================
  Test 2: HTTP API Integration
============================================================
...

============================================================
  Cleanup
============================================================
ℹ Cleaning up 3 test workflows...
✓ Deleted workflow: 123
✓ Deleted workflow: 124
✓ Deleted workflow: 125

============================================================
  Test Report
============================================================

Total Tests: 9
Passed: 9
Failed: 0
Skipped: 0
Success Rate: 100.0%

Detailed Results:

[1] Echo Workflow - Create
    Status: PASS
    Duration: 1523ms
    Workflow ID: 123

[2] Echo Workflow - Execute
    Status: PASS
    Duration: 2341ms
    Execution ID: exec-456

...

ℹ Detailed results saved to: test-results-1730000000000.json

✓ TEST SUITE PASSED
```

## Configuration Options

### Environment Variables

```bash
# Required
N8N_URL=http://localhost:5678          # n8n server URL
N8N_HMAC_SECRET=your-secret-key        # Webhook signature secret

# Optional
N8N_API_KEY=your-api-key               # n8n API authentication
API_URL=http://localhost:3001          # Override API server URL
OPENAI_API_KEY=sk-...                  # For AI workflow tests (future)
```

### Custom Configuration

Edit `test-flowspec.js` to customize:

```javascript
// Line 12-14: Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3001';
const N8N_URL = process.env.N8N_URL || 'http://localhost:5678';
const TENANT_ID = 'test-' + Date.now();
```

## Troubleshooting

### Error: Cannot connect to API server

**Problem:**
```
✗ Cannot connect to API server at http://localhost:3001
```

**Solution:**
1. Check if API server is running:
   ```bash
   cd Lucid-L2/offchain
   npm run dev
   ```
2. Verify port 3001 is not blocked
3. Check `.env` file configuration

### Error: n8n container not found

**Problem:**
```
⚠ n8n container not found - some tests may fail
```

**Solution:**
1. Start n8n:
   ```bash
   cd Lucid-L2/n8n
   docker-compose up -d
   ```
2. Verify container is running:
   ```bash
   docker ps | grep n8n
   ```

### Error: Workflow execution timeout

**Problem:**
```
✗ Execution failed: timeout of 60000ms exceeded
```

**Solution:**
1. Check n8n logs:
   ```bash
   docker logs lucid-n8n
   ```
2. Verify n8n webhook is accessible
3. Increase timeout in test script (line 257)

### Error: N8N_HMAC_SECRET not set

**Problem:**
```
✗ N8N_HMAC_SECRET: Not set (REQUIRED)
```

**Solution:**
1. Add to `.env` file:
   ```bash
   echo "N8N_HMAC_SECRET=your-secret-key" >> .env
   ```
2. Restart API server

### Tests pass but no real execution results

**Problem:**
- Tests show success but outputs are empty
- Workflows created but not executing

**Solution:**
1. Check n8n webhook configuration
2. Verify HMAC secret matches between API and n8n
3. Check n8n logs for execution errors:
   ```bash
   docker logs -f lucid-n8n
   ```

## Test Results File

After each run, a detailed JSON report is saved:

**File:** `test-results-<timestamp>.json`

**Structure:**
```json
{
  "timestamp": "2025-10-26T17:00:00.000Z",
  "summary": {
    "total": 9,
    "passed": 9,
    "failed": 0,
    "skipped": 0,
    "successRate": "100.0"
  },
  "tests": [
    {
      "name": "Echo Workflow - Create",
      "status": "pass",
      "startTime": 1730000000000,
      "endTime": 1730000001523,
      "duration": 1523,
      "workflowId": "123",
      "url": "http://localhost:5678/workflow/123"
    },
    {
      "name": "Echo Workflow - Execute",
      "status": "pass",
      "startTime": 1730000002000,
      "endTime": 1730000004341,
      "duration": 2341,
      "workflowId": "123",
      "executionId": "exec-456",
      "executionDuration": 1234,
      "outputs": {
        "message": "Hello from FlowSpec test suite!",
        "timestamp": "2025-10-26T17:00:00.000Z",
        "echo": true
      }
    }
  ]
}
```

## Manual Testing

If you prefer to test manually without the script:

### 1. Create a Workflow

```bash
curl -X POST http://localhost:3001/flowspec/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Manual Test",
    "nodes": [
      {
        "id": "webhook",
        "type": "webhook",
        "config": { "path": "test", "method": "POST" }
      },
      {
        "id": "transform",
        "type": "transform",
        "config": {
          "expression": "{ result: $json.input, status: \"ok\" }"
        }
      }
    ],
    "edges": [
      { "from": "webhook", "to": "transform" }
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "workflowId": "123",
  "workflowUrl": "http://localhost:5678/workflow/123",
  "message": "Workflow 'Manual Test' created successfully"
}
```

### 2. Execute the Workflow

```bash
curl -X POST http://localhost:3001/flowspec/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "123",
    "context": {
      "tenantId": "test-user",
      "variables": {
        "input": "Hello World"
      }
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "executionId": "exec-456",
  "outputs": {
    "result": "Hello World",
    "status": "ok"
  },
  "duration": 1234
}
```

### 3. Check History

```bash
curl http://localhost:3001/flowspec/history/123?limit=5
```

### 4. Delete Workflow

```bash
curl -X DELETE http://localhost:3001/flowspec/delete/123
```

## Advanced Testing

### Custom Test Workflows

Add your own test workflows by editing the test script:

```javascript
// Add after Test 3 in runTests() function
section('Test 4: My Custom Test');

const customFlowSpec = {
  name: 'My Custom Workflow',
  nodes: [
    // Your nodes here
  ],
  edges: [
    // Your edges here
  ]
};

const customCreate = await testWorkflowCreate('Custom - Create', customFlowSpec);
if (customCreate.success) {
  await testWorkflowExecute('Custom - Execute', customCreate.workflowId, {
    variables: { /* your test data */ }
  });
}
```

### Performance Testing

Modify the script to test performance:

```javascript
// Add timing for multiple executions
const iterations = 10;
const timings = [];

for (let i = 0; i < iterations; i++) {
  const start = Date.now();
  await testWorkflowExecute('Performance Test', workflowId, context);
  timings.push(Date.now() - start);
}

console.log('Average execution time:', 
  timings.reduce((a, b) => a + b) / iterations);
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test-flowspec.yml
name: FlowSpec API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      n8n:
        image: n8nio/n8n:latest
        ports:
          - 5678:5678
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Install dependencies
        run: cd offchain && npm install
      - name: Start API server
        run: cd offchain && npm run dev &
      - name: Wait for services
        run: sleep 10
      - name: Run tests
        run: cd offchain && node test-flowspec.js
```

## Next Steps

After running successful tests:

1. **Review Results**: Check the generated JSON report
2. **Verify in n8n UI**: Visit http://localhost:5678 to see created workflows
3. **Add Custom Tests**: Extend the test suite with your own workflows
4. **Integration**: Use FlowSpec in your application code

## Related Documentation

- [FlowSpec DSL Guide](./FLOWSPEC-DSL-GUIDE.md) - Learn FlowSpec syntax
- [FlowSpec API Reference](./FLOWSPEC-API-REFERENCE.md) - Complete API docs
- [n8n Documentation](https://docs.n8n.io/) - n8n workflow automation

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review test output and JSON report
3. Check n8n and API server logs
4. Verify all prerequisites are met

## License

MIT License - See project root for details
