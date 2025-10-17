# 🚀 n8n Integration - Phase 2 Plan

**Current Status:** Phase 1 Complete, Solana Issue Persists  
**Next Goal:** Get Phase 1 fully working, then start Phase 2

---

## 🎯 Immediate Tasks (Complete Phase 1 Testing)

### Task 1: Verify n8n Configuration is Active

Check if Lucid API is actually using n8n:

```bash
cd /home/admin/Lucid/Lucid-L2/offchain

# Check environment variables
cat .env | grep N8N

# Should show:
# N8N_ENABLED=true
# N8N_URL=http://localhost:5678
# N8N_HMAC_SECRET=3444456ba671ebc1e92f13da7e0775c5f81b147031a1301f63597c4bff2bf9e4
```

### Task 2: Restart Lucid API

```bash
# If API is running, stop it (Ctrl+C)
cd /home/admin/Lucid/Lucid-L2/offchain

# Start with environment variables loaded
npm start

# Look for these log lines:
# "✅ n8n Gateway enabled at http://localhost:5678"
# "Lucid L2 API listening on http://localhost:3001"
```

### Task 3: Test n8n Directly (Bypass API)

Test if n8n workflows work independently:

```bash
cd /home/admin/Lucid/Lucid-L2/offchain

# Create direct n8n test
cat > test-n8n-direct.js << 'EOF'
const axios = require('axios');
const crypto = require('crypto');

const secret = '3444456ba671ebc1e92f13da7e0775c5f81b147031a1301f63597c4bff2bf9e4';
const payload = {
  workflowType: 'llm-inference',
  text: 'Test n8n directly without API',
  model: 'openai-gpt35-turbo'
};

const signature = crypto
  .createHmac('sha256', secret)
  .update(JSON.stringify(payload))
  .digest('hex');

console.log('📡 Calling n8n gateway directly...');
axios.post('http://localhost:5678/webhook/lucid-gateway', payload, {
  headers: {
    'Content-Type': 'application/json',
    'X-Signature': signature,
    'X-Tenant-Id': 'test'
  }
}).then(res => {
  console.log('✅ n8n Response:', JSON.stringify(res.data, null, 2));
  console.log('\n🎉 n8n is working! Check n8n UI → Executions tab to see the workflow run.');
}).catch(err => {
  console.error('❌ n8n Error:', err.response?.data || err.message);
});
EOF

node test-n8n-direct.js
```

**Expected:** Success response + execution visible in n8n UI

### Task 4: Check n8n Executions

1. Open n8n UI: http://54.204.114.86:5678
2. Click "Executions" tab (left sidebar)
3. You should see workflow runs from the test above
4. Click on execution to see detailed logs

---

## 📋 Phase 1 Completion Checklist

- [ ] n8n containers running (`docker compose ps`)
- [ ] All 3 workflows imported and ACTIVE in n8n UI
- [ ] `offchain/.env` has N8N_ENABLED=true
- [ ] Lucid API restarted and shows "n8n Gateway enabled"
- [ ] Direct n8n test passes (`test-n8n-direct.js`)
- [ ] n8n Executions tab shows successful runs
- [ ] Solana issue fully resolved
- [ ] Full pipeline test passes

---

## 🚀 Phase 2: FlowSpec DSL (If Approved)

**Goal:** Create an internal DSL so AI agents can generate workflows programmatically

### What We'll Build

**1. FlowSpec Schema (TypeScript)**

```typescript
// packages/flow-spec/src/types.ts
export type FlowNodeType = 
  | 'llm.chat' 
  | 'embed' 
  | 'search' 
  | 'tool.http' 
  | 'tool.mcp' 
  | 'solana.write'
  | 'solana.read'
  | 'ipfs.pin'
  | 'branch' 
  | 'transform';

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  input?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface FlowEdge {
  from: string;
  to: string;
  when?: string; // Conditional logic
}

export interface FlowSpec {
  name: string;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  credentials?: Record<string, string>; // Named refs
  metadata?: Record<string, unknown>;
}
```

**2. FlowSpec → n8n Compiler**

```typescript
// packages/flow-compiler/src/n8nCompiler.ts
export class N8nCompiler {
  compile(spec: FlowSpec): n8nWorkflowJSON
