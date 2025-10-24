# OAuth Integration with Nango - Complete Implementation Guide

**Status**: Infrastructure Phase Complete ✅  
**Next Phase**: API Routes Implementation  
**Estimated Time**: 2-3 days for full completion

## 📋 Overview

This guide covers the complete OAuth integration for the Lucid platform using:
- **Nango**: OAuth orchestration and token management
- **Supabase**: PostgreSQL database with Row Level Security
- **Privy**: User authentication
- **Docker**: Containerized infrastructure

## 🎯 What's Been Completed

### ✅ Phase 1: Infrastructure Setup (COMPLETE)

1. **Docker Compose Configuration** (`infrastructure/docker-compose.yml`)
   - Supabase stack (PostgreSQL, Studio, Auth, REST, Storage, Kong)
   - Nango OAuth server
   - Redis for Nango session management
   - All services networked together

2. **Database Schema** (`infrastructure/migrations/001_oauth_credentials.sql`)
   - `credentials` table: Store OAuth connections and API keys
   - `credential_usage` table: Track credential usage analytics
   - `oauth_providers` table: Provider configurations
   - Row Level Security (RLS) policies
   - Automatic triggers for updated_at timestamps
   - Pre-seeded with 12 popular providers

3. **Environment Configuration**
   - `.env.example` with all required variables
   - `generate-keys.sh` script for secure key generation
   - Kong configuration for Supabase API gateway

4. **Documentation** (`infrastructure/README.md`)
   - Complete setup instructions
   - Troubleshooting guide
   - Production deployment checklist

### ✅ Phase 2: OAuth Provider Registry & Client Libraries (COMPLETE)

1. **TypeScript Configuration** (`oauth-api/`)
   - Package.json with all dependencies
   - TypeScript configuration
   - Project structure

2. **Provider Registry** (`oauth-api/src/types/providers.ts`)
   - 12 pre-configured OAuth providers:
     - **OAuth**: Google, Slack, GitHub, Microsoft, Linear, Notion, Airtable, Asana
     - **API Key**: OpenAI, Stripe, SendGrid, Anthropic
   - Type-safe provider definitions
   - Helper functions for provider validation

3. **Nango Client Wrapper** (`oauth-api/src/lib/nango.ts`)
   - Authorization URL generation
   - Connection management
   - Auto-refreshing token retrieval
   - Connection testing and validation

4. **Supabase Client Wrapper** (`oauth-api/src/lib/supabase.ts`)
   - Fully typed database access
   - CRUD operations for credentials
   - Usage tracking and analytics
   - RLS-aware queries

5. **Privy Authentication** (`oauth-api/src/middleware/auth.ts`)
   - JWT token validation
   - User ID extraction
   - Required and optional auth middleware

## 🚀 Quick Start

### Step 1: Generate Secure Keys

```bash
cd infrastructure/scripts
chmod +x generate-keys.sh
./generate-keys.sh
```

This generates:
- Database password
- JWT secret
- Nango encryption key
- Supabase API keys (anon & service_role)

### Step 2: Configure Environment

Edit `infrastructure/.env`:

```bash
# Add your Privy credentials
PRIVY_APP_ID=your-app-id-from-privy-dashboard
PRIVY_APP_SECRET=your-app-secret-from-privy-dashboard

# Set your frontend URL
FRONTEND_APP_URL=http://localhost:3000

# Domain (update for production)
NANGO_SERVER_URL=http://localhost:3003
```

### Step 3: Start Infrastructure

```bash
cd infrastructure
docker-compose up -d
```

Services will be available at:
- **Supabase Studio**: http://localhost:3010
- **Supabase API**: http://localhost:8000
- **Nango Dashboard**: http://localhost:3003
- **PostgreSQL**: localhost:5432

### Step 4: Run Database Migration

```bash
# Access database
docker exec -it lucid-supabase-db psql -U postgres -d postgres

# Run migration
\i /path/to/migrations/001_oauth_credentials.sql

# Verify tables
\dt

# Exit
\q
```

Or use Supabase Studio SQL editor at http://localhost:3010

### Step 5: Install OAuth API Dependencies

```bash
cd oauth-api
npm install
```

## 📝 Next Steps: Implementing API Routes

### Route Structure to Implement

Create these files in `oauth-api/src/routes/`:

```
oauth-api/src/routes/
├── oauth.ts          # OAuth flow endpoints
├── credentials.ts    # Credential CRUD
├── providers.ts      # Provider listing
└── health.ts         # Health check
```

### 1. OAuth Flow Routes (`routes/oauth.ts`)

**Endpoints to implement**:

```typescript
// POST /api/oauth/:provider/authorize
// Generate OAuth authorization URL
router.post('/:provider/authorize', requireAuth, async (req, res) => {
  const { provider } = req.params;
  const userId = req.userId!;
  
  const result = await getAuthorizationURL(provider, userId);
  
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  
  res.json({ url: result.url, provider });
});

// GET /api/oauth/:provider/callback
// Handle OAuth callback from provider
router.get('/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const { code, state, connection_id } = req.query;
  
  // Get connection from Nango
  const connection = await getConnection(provider, connection_id as string);
  
  // Save to Supabase
  const credential = await createCredential({
    userId: connection_id,
    service: provider,
    name: `${provider} Account`,
    authType: 'oauth',
    nangoConnectionId: connection_id,
    metadata: connection.connectionConfig
  });
  
  // Redirect back to frontend
  res.redirect(`${process.env.FRONTEND_APP_URL}/settings/credentials?success=true&id=${credential.data.id}`);
});
```

### 2. Credentials CRUD Routes (`routes/credentials.ts`)

**Endpoints to implement**:

```typescript
// GET /api/credentials
// List user's credentials
router.get('/', requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { service, auth_type } = req.query;
  
  const result = await listCredentials(userId, {
    service: service as string,
    authType: auth_type as string
  });
  
  res.json({
    credentials: result.data,
    count: result.data.length
  });
});

// GET /api/credentials/:id
// Get specific credential
router.get('/:id', requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  
  const result = await getCredential(id, userId);
  
  if (result.error) {
    return res.status(404).json({ error: result.error });
  }
  
  res.json(result.data);
});

// GET /api/credentials/:id/token
// Get fresh access token (auto-refreshed)
router.get('/:id/token', requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  
  const credResult = await getCredential(id, userId);
  
  if (credResult.error || !credResult.data) {
    return res.status(404).json({ error: 'Credential not found' });
  }
  
  const credential = credResult.data;
  
  if (credential.authType === 'oauth') {
    const tokenResult = await getToken(credential.service, credential.nangoConnectionId!);
    
    if (tokenResult.error) {
      return res.status(401).json({ error: tokenResult.error });
    }
    
    res.json({
      access_token: tokenResult.accessToken,
      expires_at: tokenResult.expiresAt,
      type: 'oauth'
    });
  } else {
    // Return encrypted data for API keys
    res.json({
      encrypted_data: credential.encryptedData,
      type: credential.authType
    });
  }
});

// DELETE /api/credentials/:id
// Revoke/delete credential
router.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  
  // If OAuth, also delete from Nango
  const credResult = await getCredential(id, userId);
  if (credResult.data?.authType === 'oauth' && credResult.data.nangoConnectionId) {
    await deleteConnection(credResult.data.service, credResult.data.nangoConnectionId);
  }
  
  const result = await deleteCredential(id, userId);
  
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  
  res.json({ success: true, message: 'Credential deleted' });
});
```

### 3. Provider Listing Routes (`routes/providers.ts`)

```typescript
// GET /api/providers
// List all available OAuth providers
router.get('/', optionalAuth, async (req, res) => {
  const providers = getEnabledProviders();
  
  res.json({
    providers: providers.map(p => ({
      key: p.key,
      name: p.name,
      type: p.type,
      description: p.description,
      icon: p.icon,
      scopes: p.scopes
    })),
    count: providers.length
  });
});

// GET /api/providers/:key
// Get specific provider details
router.get('/:key', async (req, res) => {
  const { key } = req.params;
  const validation = validateProvider(key);
  
  if (!validation.valid) {
    return res.status(404).json({ error: validation.error });
  }
  
  res.json(validation.provider);
});
```

### 4. Main Server Setup (`src/index.ts`)

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../infrastructure/.env' });

// Import routes
import oauthRoutes from './routes/oauth';
import credentialsRoutes from './routes/credentials';
import providersRoutes from './routes/providers';
import healthRoutes from './routes/health';

const app = express();
const PORT = process.env.OAUTH_API_PORT || 3004;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_APP_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(morgan('combined'));

// Routes
app.use('/api/oauth', oauthRoutes);
app.use('/api/credentials', credentialsRoutes);
app.use('/api/providers', providersRoutes);
app.use('/health', healthRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 OAuth API server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Nango URL: ${process.env.NANGO_SERVER_URL}`);
  console.log(`🗄️  Supabase URL: ${process.env.SUPABASE_PUBLIC_URL}`);
});
```

## 🔧 Configuring OAuth Providers in Nango

### Adding Google OAuth

1. **Create OAuth App** at https://console.cloud.google.com/apis/credentials
   - Click "Create Credentials" → "OAuth 2.0 Client ID"
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3003/oauth/callback`
   - Copy Client ID and Client Secret

2. **Add to Nango Dashboard** at http://localhost:3003
   - Click "Add Integration"
   - Select "Google"
   - Paste Client ID and Secret
   - Configure scopes: email, profile, gmail.send
   - Save

3. **Test Integration**
   - Use Nango's built-in test feature
   - Verify connection works

### Adding Other Providers

Repeat similar process for:
- **Slack**: https://api.slack.com/apps
- **GitHub**: https://github.com/settings/developers
- **Microsoft**: https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps
- **Linear**: https://linear.app/settings/api/applications
- **Notion**: https://www.notion.so/my-integrations

## 🧪 Testing

### Test Infrastructure

```bash
# Check all services are running
docker-compose ps

# Test Supabase API
curl http://localhost:8000/rest/v1/ \
  -H "apikey: YOUR_SUPABASE_ANON_KEY"

# Test Nango
curl http://localhost:3003/health

# Check database
docker exec -it lucid-supabase-db psql -U postgres -c "SELECT * FROM oauth_providers;"
```

### Test OAuth Flow

```bash
# 1. Get authorization URL
curl -X POST http://localhost:3004/api/oauth/google/authorize \
  -H "Authorization: Bearer YOUR_PRIVY_TOKEN" \
  -H "Content-Type: application/json"

# Response: { "url": "https://accounts.google.com/o/oauth2/..." }

# 2. Visit URL in browser, complete OAuth flow

# 3. List credentials
curl http://localhost:3004/api/credentials \
  -H "Authorization: Bearer YOUR_PRIVY_TOKEN"

# 4. Get access token
curl http://localhost:3004/api/credentials/{ID}/token \
  -H "Authorization: Bearer YOUR_PRIVY_TOKEN"
```

## 🌍 Production Deployment

### 1. Update Environment Variables

```bash
# Production domain
NANGO_SERVER_URL=https://oauth.yourdomain.com
SUPABASE_PUBLIC_URL=https://api.yourdomain.com
FRONTEND_APP_URL=https://app.yourdomain.com

# Production mode
NODE_ENV=production

# Disable development features
ENABLE_EMAIL_AUTOCONFIRM=false
DEBUG=false
```

### 2. Update OAuth Redirect URLs

For each OAuth provider, update redirect URLs to:
```
https://oauth.yourdomain.com/oauth/callback
```

### 3. Set Up Reverse Proxy

**Nginx example**:

```nginx
# Nango OAuth server
server {
    listen 443 ssl;
    server_name oauth.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# OAuth API
server {
    listen 443 ssl;
    server_name api.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location /api/ {
        proxy_pass http://localhost:3004;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 4. Database Backups

```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker exec lucid-supabase-db pg_dump -U postgres postgres > backup_$DATE.sql
```

## 📊 Monitoring & Analytics

### Query Examples

```sql
-- Credential statistics
SELECT 
    service,
    auth_type,
    COUNT(*) as total_credentials,
    COUNT(*) FILTER (WHERE is_active = true) as active_credentials
FROM credentials
GROUP BY service, auth_type;

-- Usage analytics
SELECT 
    DATE(used_at) as date,
    COUNT(*) as total_uses,
    COUNT(*) FILTER (WHERE success = true) as successful_uses,
    ROUND(100.0 * COUNT(*) FILTER (WHERE success = true) / COUNT(*), 2) as success_rate
FROM credential_usage
GROUP BY DATE(used_at)
ORDER BY date DESC
LIMIT 30;

-- Most used credentials
SELECT 
    c.service,
    c.name,
    COUNT(cu.id) as usage_count,
    MAX(cu.used_at) as last_used
FROM credentials c
JOIN credential_usage cu ON c.id = cu.credential_id
GROUP BY c.id, c.service, c.name
ORDER BY usage_count DESC
LIMIT 10;
```

## 🎨 Frontend Integration Example

```typescript
// In your separate frontend app

import { usePrivy } from '@privy-io/react-auth';
import { useState } from 'react';

export function ConnectServiceButton({ provider }) {
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    
    try {
      // Get Privy token
      const token = await getAccessToken();
      
      // Request OAuth URL
      const res = await fetch(`http://localhost:3004/api/oauth/${provider}/authorize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const { url } = await res.json();
      
      // Open OAuth popup
      const width = 600;
      const height = 700;
      const left = (window.innerWidth - width) / 2;
      const top = (window.innerHeight - height) / 2;
      
      const popup = window.open(
        url,
        'oauth',
        `width=${width},height=${height},left=${left},top=${top}`
      );
      
      // Listen for completion
      const checkInterval = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkInterval);
          // Refresh credentials list
          refetchCredentials();
          setLoading(false);
        }
      }, 500);
      
    } catch (error) {
      console.error('OAuth error:', error);
      setLoading(false);
    }
  }

  return (
    <button onClick={handleConnect} disabled={loading}>
      {loading ? 'Connecting...' : `Connect ${provider}`}
    </button>
  );
}
```

## 📚 API Reference

### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/oauth/:provider/authorize` | Required | Get OAuth URL |
| GET | `/api/oauth/:provider/callback` | None | OAuth callback |
| GET | `/api/credentials` | Required | List credentials |
| GET | `/api/credentials/:id` | Required | Get credential |
| GET | `/api/credentials/:id/token` | Required | Get access token |
| DELETE | `/api/credentials/:id` | Required | Delete credential |
| GET | `/api/providers` | Optional | List providers |
| GET | `/api/providers/:key` | None | Get provider details |
| GET | `/health` | None | Health check |

### Response Formats

**Success Response**:
```json
{
  "data": {},
  "success": true
}
```

**Error Response**:
```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

## 🐛 Troubleshooting

### Common Issues

1. **"NANGO_SECRET_KEY is required"**
   - Run `./scripts/generate-keys.sh`
   - Ensure `.env` file exists in `infrastructure/`

2. **Supabase Studio not loading**
   - Check Kong is running: `docker-compose ps supabase-kong`
   - Verify `kong.yml` is mounted correctly

3. **OAuth callback fails**
   - Verify redirect URL in provider settings matches Nango URL
   - Check Nango logs: `docker-compose logs nango`

4. **401 Unauthorized from API**
   - Verify Privy token is valid
   - Check `PRIVY_APP_ID` and `PRIVY_APP_SECRET` are set

## 🎯 Next Steps

1. **Implement API Routes** (2-3 days)
   - Create route files as outlined above
   - Test each endpoint
   - Add error handling

2. **Configure OAuth Providers** (1 day)
   - Set up OAuth apps for top 6 providers
   - Add credentials to Nango
   - Test OAuth flows

3. **Frontend Integration** (2-3 days)
   - Create UI components
   - Implement OAuth popup flow
   - Add credential management interface

4. **Testing & QA** (1-2 days)
   - End-to-end testing
   - Security audit
   - Performance testing

5. **Production Deployment** (1 day)
   - Set up production infrastructure
   - Configure domains and SSL
   - Deploy and monitor

## 📞 Support

- **Infrastructure Issues**: Check `infrastructure/README.md`
- **Database Issues**: Use Supabase Studio at http://localhost:3010
- **OAuth Issues**: Check Nango dashboard at http://localhost:3003

## 📄 Files Created

```
Lucid-L2/
├── infrastructure/
│   ├── docker-compose.yml          ✅ Complete
│   ├── .env.example                ✅ Complete
│   ├── README.md                   ✅ Complete
│   ├── supabase/
│   │   └── kong.yml                ✅ Complete
│   ├── migrations/
│   │   └── 001_oauth_credentials.sql ✅ Complete
│   └── scripts/
│       └── generate-keys.sh        ✅ Complete
├── oauth-api/
│   ├── package.json                ✅ Complete
│   ├── tsconfig.json               ✅ Complete
│   └── src/
│       ├── types/
│       │   └── providers.ts        ✅ Complete
│       ├── lib/
│       │   ├── nango.ts            ✅ Complete
│       │   └── supabase.ts         ✅ Complete
│       ├── middleware/
│       │   └── auth.ts             ✅ Complete
│       ├── routes/                 ⏳ To implement
│       │   ├── oauth.ts
│       │   ├── credentials.ts
│       │   ├── providers.ts
│       │   └── health.ts
│       └── index.ts                ⏳ To implement
└── OAUTH-INTEGRATION-GUIDE.md      ✅ Complete (this file)
```

---

**Ready to proceed?** Start with implementing the API routes following the examples above!
