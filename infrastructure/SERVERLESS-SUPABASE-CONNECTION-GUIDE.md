# Serverless Supabase Connection Guide

## Overview
Your local Supabase instance is now configured for external access via PostgREST API. This guide explains how to connect from a serverless application.

## 🔌 Connection Details

### API Endpoints
- **PostgREST API**: `http://13.221.253.195:3000`
- **Kong Gateway**: `http://13.221.253.195:8000`
- **Supabase Studio**: `http://13.221.253.195:3010`

### Authentication Keys
```bash
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1sb2NhbCIsInJvbGUiOiJhbm9uIiwiZXhwIjoxOTgzODEyOTk2fQ.z0ZM6XeVdZtyR1nhfFyaB0wFlzobe8_IZXvhqUCZPFg

SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1sb2NhbCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJleHAiOjE5ODM4MTI5OTZ9.QgI22wW2Xr8r7AqZJ3tpNuNBCASQ-tmJdTGowkqnnaU
```

⚠️ **Security Note**: For production, generate new keys with proper expiration times.

---

## 🚀 Quick Start Examples

### Option 1: Using Supabase JS Client (Recommended)

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://13.221.253.195:3000'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1sb2NhbCIsInJvbGUiOiJhbm9uIiwiZXhwIjoxOTgzODEyOTk2fQ.z0ZM6XeVdZtyR1nhfFyaB0wFlzobe8_IZXvhqUCZPFg'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Example: Query workflows
const { data, error } = await supabase
  .from('workflows')
  .select('*')
  .limit(10)

if (error) {
  console.error('Error:', error)
} else {
  console.log('Workflows:', data)
}
```

### Option 2: Using Direct HTTP Requests

```javascript
// GET request
const response = await fetch('http://13.221.253.195:3000/workflows?limit=10', {
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
  }
})

const workflows = await response.json()
```

### Option 3: Using Environment Variables (Best Practice)

```javascript
// .env file
SUPABASE_URL=http://13.221.253.195:3000
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// In your code
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)
```

---

## 📊 Available Tables

Your database includes the following main tables:

### Core Workflow Tables
- `workflows` - Workflow definitions with nodes and edges
- `workflow_executions` - Execution history and status
- `workflow_versions` - Version control for workflows
- `workflow_schedules` - Cron-based automation
- `workflow_variables` - Reusable workflow variables
- `workflow_webhooks` - Webhook endpoints

### User & Organization Tables
- `users` - User profiles (Privy-based)
- `profiles` - Extended user information
- `organizations` - Workspace organizations
- `organization_members` - Team membership
- `user_wallets` - Blockchain wallet addresses
- `session_signers` - Autonomous transaction signing

### OAuth & Integration Tables
- `user_oauth_connections` - Nango OAuth connections
- `oauth_usage_log` - API call audit trail
- `credentials` - Encrypted workflow credentials

### Reward System Tables
- `rewards` - User mGas and LUCID balances
- `reward_transactions` - Transaction audit log
- `user_achievements` - Unlocked achievements
- `mgas_conversions` - Conversion history
- `conversations` - ChatGPT interaction quality scores

### Other Tables
- `projects` - Project organization
- `environments` - Development environments
- `agents` - AI agent configurations
- `apps` - Application definitions
- `notifications` - User notifications
- `favorites` - Bookmarked items

---

## 🔐 Row Level Security (RLS)

Your database has extensive RLS policies already configured. Key points:

1. **Anon Key**: Limited read access to public data
2. **Service Key**: Full administrative access (use server-side only)
3. **User-based policies**: Users can only see their own data
4. **Organization-based policies**: Team members can access org data

### Example: User-scoped Query
```javascript
// Only returns workflows for the authenticated user
const { data } = await supabase
  .from('workflows')
  .select('*')
  .eq('user_id', userId)
```

---

## 📝 Common Query Patterns

### 1. Select with Filters
```javascript
const { data, error } = await supabase
  .from('workflows')
  .select('*')
  .eq('status', 'active')
  .order('created_at', { ascending: false })
  .limit(20)
```

### 2. Insert Data
```javascript
const { data, error } = await supabase
  .from('workflows')
  .insert({
    user_id: 'user-uuid',
    organization_id: 'org-uuid',
    name: 'My Workflow',
    nodes: [],
    edges: [],
    settings: {},
    pin_data: {}
  })
  .select()
```

### 3. Update Data
```javascript
const { data, error } = await supabase
  .from('workflows')
  .update({ status: 'active' })
  .eq('id', workflowId)
  .select()
```

### 4. Delete Data
```javascript
const { error } = await supabase
  .from('workflows')
  .delete()
  .eq('id', workflowId)
```

### 5. Complex Joins
```javascript
const { data, error } = await supabase
  .from('workflows')
  .select(`
    *,
    workflow_executions(*)
  `)
  .eq('user_id', userId)
```

### 6. Call RPC Functions
```javascript
const { data, error } = await supabase
  .rpc('get_user_workspace', {
    p_user_id: userId
  })
```

---

## 🌐 Framework-Specific Examples

### Next.js (App Router)
```typescript
// app/api/workflows/route.ts
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  )

  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .limit(10)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ workflows: data })
}
```

### Vercel Serverless Function
```javascript
// api/workflows.js
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  )

  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .limit(10)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  res.status(200).json({ workflows: data })
}
```

### AWS Lambda
```javascript
import { createClient } from '@supabase/supabase-js'

export const handler = async (event) => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  )

  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .limit(10)

  return {
    statusCode: error ? 500 : 200,
    body: JSON.stringify(error ? { error: error.message } : { workflows: data })
  }
}
```

### Netlify Function
```javascript
// netlify/functions/workflows.js
import { createClient } from '@supabase/supabase-js'

exports.handler = async (event, context) => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  )

  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .limit(10)

  return {
    statusCode: error ? 500 : 200,
    body: JSON.stringify(error ? { error: error.message } : { workflows: data })
  }
}
```

---

## 🔍 Testing Your Connection

### Test 1: Basic Connectivity
```bash
curl http://13.221.253.195:3000/
```
Expected: OpenAPI spec (JSON)

### Test 2: List Tables
```bash
curl http://13.221.253.195:3000/workflows?limit=1 \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY"
```

### Test 3: Test from Your Serverless App
```javascript
// test-connection.js
const fetch = require('node-fetch')

const SUPABASE_URL = 'http://13.221.253.195:3000'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

async function testConnection() {
  try {
    const response = await fetch(`${SUPABASE_URL}/workflows?limit=1`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      }
    })
    
    const data = await response.json()
    console.log('✅ Connection successful!')
    console.log('Data:', data)
  } catch (error) {
    console.error('❌ Connection failed:', error)
  }
}

testConnection()
```

---

## ⚙️ Configuration Tips

### For Development
1. Use HTTP (port 3000)
2. Use ANON_KEY for client-side calls
3. Use SERVICE_KEY for server-side admin operations

### For Production
1. Set up SSL/TLS (use Nginx or Caddy)
2. Configure firewall rules
3. Set up CORS properly
4. Use environment-specific URLs
5. Rotate API keys regularly
6. Enable rate limiting

### Environment Variables Template
```bash
# .env for your serverless app
SUPABASE_URL=http://13.221.253.195:3000
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1sb2NhbCIsInJvbGUiOiJhbm9uIiwiZXhwIjoxOTgzODEyOTk2fQ.z0ZM6XeVdZtyR1nhfFyaB0wFlzobe8_IZXvhqUCZPFg
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1sb2NhbCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJleHAiOjE5ODM4MTI5OTZ9.QgI22wW2Xr8r7AqZJ3tpNuNBCASQ-tmJdTGowkqnnaU
```

---

## 🚨 Important Security Considerations

### 1. API Keys
- **ANON_KEY**: Safe for client-side use, respects RLS policies
- **SERVICE_KEY**: ⚠️ **NEVER** expose in client-side code - server-side only!

### 2. CORS Configuration
If you need to call from a browser-based serverless function, you may need to configure CORS in Kong.

### 3. Rate Limiting
Consider implementing rate limiting to prevent abuse:
- Use Kong's rate-limiting plugin
- Monitor usage via `usage_metrics` table
- Set up alerts for unusual activity

### 4. SSL/TLS for Production
```bash
# Add to docker-compose.yml for production
# Use Caddy for automatic SSL
caddy:
  image: caddy:alpine
  ports:
    - "443:443"
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile
```

---

## 📚 Real-World Use Cases

### Use Case 1: Reward System Integration
```javascript
// Get user rewards
const { data: rewards } = await supabase
  .from('rewards')
  .select('*')
  .eq('user_id', userId)
  .single()

console.log(`mGas balance: ${rewards.mgas_balance}`)
console.log(`LUCID balance: ${rewards.lucid_balance}`)
```

### Use Case 2: Workflow Management
```javascript
// Create a new workflow
const { data: workflow } = await supabase
  .from('workflows')
  .insert({
    user_id: userId,
    organization_id: orgId,
    name: 'AI Trading Bot',
    nodes: [/* node definitions */],
    edges: [/* connections */],
    status: 'draft'
  })
  .select()
  .single()

// Execute the workflow
const { data: execution } = await supabase
  .from('workflow_executions')
  .insert({
    workflow_id: workflow.id,
    triggered_by: userId
  })
  .select()
  .single()
```

### Use Case 3: OAuth Connection Tracking
```javascript
// Get user's OAuth connections
const { data: connections } = await supabase
  .from('user_oauth_connections')
  .select('*')
  .eq('privy_user_id', privyUserId)

console.log(`Connected accounts:`, connections.map(c => c.provider))
```

### Use Case 4: Session Signer Management
```javascript
// Check if user has enabled session signing
const { data: permissions } = await supabase
  .from('session_signer_permissions')
  .select('*')
  .eq('user_id', userId)
  .eq('enabled', true)

if (permissions.length > 0) {
  console.log('User has autonomous trading enabled')
}
```

---

## 🔧 Debugging Tips

### 1. Check Connectivity
```bash
# From your serverless environment
curl -v http://13.221.253.195:3000/
```

### 2. Inspect Logs
```bash
# View PostgREST logs
docker logs lucid-supabase-rest -f

# View Kong logs
docker logs lucid-supabase-kong -f
```

### 3. Test RLS Policies
```javascript
// This should fail if RLS is working correctly
const { data, error } = await supabase
  .from('workflows')
  .select('*')
  // No user filter - RLS will restrict automatically
```

### 4. Use Service Role for Admin Operations
```javascript
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // Bypasses RLS
)

// Now you can access all data
const { data } = await supabaseAdmin
  .from('workflows')
  .select('*')
```

---

## 📦 Installation

Install the Supabase client in your serverless project:

```bash
# npm
npm install @supabase/supabase-js

# yarn
yarn add @supabase/supabase-js

# pnpm
pnpm add @supabase/supabase-js
```

---

## 🎯 Best Practices

### 1. Connection Pooling
For high-traffic serverless apps, consider using Supavisor or PgBouncer:

```yaml
# Add to docker-compose.yml
supavisor:
  image: supabase/supavisor:latest
  ports:
    - "6543:6543"
  environment:
    DATABASE_URL: postgres://postgres:${SUPABASE_DB_PASSWORD}@supabase-db:5432/postgres
```

### 2. Caching Strategy
```javascript
// Cache frequently accessed data
const cache = new Map()

async function getWorkflow(id) {
  if (cache.has(id)) {
    return cache.get(id)
  }

  const { data } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', id)
    .single()

  cache.set(id, data)
  return data
}
```

### 3. Error Handling
```javascript
async function safeQuery() {
  try {
    const { data, error } = await supabase
      .from('workflows')
      .select('*')

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Supabase error:', error)
    return { success: false, error: error.message }
  }
}
```

### 4. Batch Operations
```javascript
// Insert multiple records efficiently
const { data, error } = await supabase
  .from('workflow_executions')
  .insert([
    { workflow_id: 'uuid1', status: 'running' },
    { workflow_id: 'uuid2', status: 'running' },
    { workflow_id: 'uuid3', status: 'running' }
  ])
```

---

## 🔒 Production Checklist

Before deploying to production:

- [ ] Generate new JWT secret with `openssl rand -hex 32`
- [ ] Create new API keys with proper expiration
- [ ] Set up SSL/TLS certificates
- [ ] Configure firewall to allow only specific IPs
- [ ] Enable rate limiting in Kong
- [ ] Set up monitoring and alerting
- [ ] Configure automatic backups
- [ ] Test all RLS policies thoroughly
- [ ] Use connection pooling (Supavisor/PgBouncer)
- [ ] Set up proper logging
- [ ] Configure CORS for your domains only
- [ ] Review and update all default passwords

---

## 📞 API Reference

### OpenAPI Documentation
View the full API spec at:
```
http://13.221.253.195:3000/
```

### PostgREST Query Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equals | `.eq('status', 'active')` |
| `neq` | Not equals | `.neq('status', 'deleted')` |
| `gt` | Greater than | `.gt('created_at', '2024-01-01')` |
| `lt` | Less than | `.lt('created_at', '2024-12-31')` |
| `gte` | Greater or equal | `.gte('score', 5)` |
| `lte` | Less or equal | `.lte('score', 10)` |
| `like` | Pattern match | `.like('name', '%workflow%')` |
| `ilike` | Case-insensitive match | `.ilike('name', '%bot%')` |
| `in` | In array | `.in('status', ['active', 'pending'])` |
| `is` | Is null/true/false | `.is('deleted_at', null)` |

---

## 🆘 Troubleshooting

### Problem: Connection Refused
**Solution**: Ensure your firewall allows connections on port 3000
```bash
# Check if port is accessible
nc -zv 13.221.253.195 3000
```

### Problem: 401 Unauthorized
**Solution**: Verify your API key is correct and not expired
```bash
# Decode JWT to check expiration
echo "YOUR_JWT" | cut -d'.' -f2 | base64 -d | jq
```

### Problem: RLS Blocking Queries
**Solution**: Use service key for admin operations, or ensure user is authenticated properly

### Problem: Slow Queries
**Solution**: 
1. Check indexes on frequently queried columns
2. Use `.select('specific,columns')` instead of `.select('*')`
3. Enable connection pooling

---

## 🚀 Next Steps

1. **Replace `13.221.253.195`** with your actual server IP or domain
2. **Test the connection** from your serverless environment
3. **Implement pagination** for large datasets
4. **Set up monitoring** to track API usage
5. **Configure SSL** for production deployment

---

## 📖 Additional Resources

- [PostgREST Documentation](https://postgrest.org/en/stable/)
- [Supabase JS Client Docs](https://supabase.com/docs/reference/javascript/introduction)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Kong API Gateway](https://docs.konghq.com/)

---

## 🎉 Summary

Your Supabase database is now accessible from any serverless application via:

1. **PostgREST API** → Direct table access with automatic REST endpoints
2. **Kong Gateway** → API management and routing
3. **RLS Policies** → Automatic security and data isolation
4. **JWT Authentication** → Secure access control

Connect using the Supabase JS client or direct HTTP requests to `http://13.221.253.195:3000`.
