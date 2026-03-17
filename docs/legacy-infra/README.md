# Lucid OAuth Infrastructure

Complete OAuth integration infrastructure using Supabase (database) and Nango (OAuth orchestration) for the Lucid platform.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Infrastructure                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Supabase   │  │    Nango     │  │   OAuth API  │      │
│  │   Database   │  │OAuth Server  │  │   Service    │      │
│  │              │  │              │  │              │      │
│  │  PostgreSQL  │◄─┤  Token Mgmt  │◄─┤  REST API    │      │
│  │    +RLS      │  │  + Refresh   │  │  + Privy     │      │
│  │              │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         ▲                 ▲                 ▲               │
└─────────┼─────────────────┼─────────────────┼───────────────┘
          │                 │                 │
    ┌─────┴─────┐     ┌─────┴─────┐     ┌─────┴─────┐
    │ Supabase  │     │   OAuth   │     │  Frontend │
    │  Studio   │     │ Providers │     │    App    │
    │   :3010   │     │  (Google, │     │  (Privy)  │
    │           │     │   Slack)  │     │           │
    └───────────┘     └───────────┘     └───────────┘
```

## 📦 What's Included

### Supabase Stack
- **PostgreSQL 15**: Main database with Row Level Security (RLS)
- **Supabase Studio**: Web UI for database management (port 3010)
- **Supabase Auth**: GoTrue authentication service
- **Supabase REST**: PostgREST API
- **Supabase Storage**: File storage with image transformation
- **Kong Gateway**: API gateway for routing

### Nango OAuth
- **Nango Server**: OAuth orchestration and token management (port 3003)
- **Redis**: Session management for Nango
- **Auto Token Refresh**: Automatic refresh of expired OAuth tokens

### Database Schema
- **credentials**: Store OAuth connections and API keys
- **credential_usage**: Track credential usage and analytics
- **oauth_providers**: OAuth provider configurations

## 🚀 Quick Start

### 1. Generate Secure Keys

```bash
cd infrastructure/scripts
chmod +x generate-keys.sh
./generate-keys.sh
```

This will:
- Generate secure database password
- Generate JWT secret for Supabase
- Generate Nango encryption key
- Create Supabase API keys (anon & service_role)
- Optionally write to `.env` file

### 2. Configure Environment

Edit `infrastructure/.env` and add:

```bash
# Privy Authentication (get from https://dashboard.privy.io)
PRIVY_APP_ID=your-privy-app-id
PRIVY_APP_SECRET=your-privy-app-secret

# Frontend URL
FRONTEND_APP_URL=http://localhost:3000

# Update domain when deploying to production
NANGO_SERVER_URL=https://oauth.yourdomain.com
```

### 3. Start Infrastructure

```bash
cd infrastructure
docker-compose up -d
```

This starts:
- ✅ Supabase (PostgreSQL, Studio, Auth, REST, Storage)
- ✅ Nango OAuth Server
- ✅ Redis (for Nango)

### 4. Run Database Migration

```bash
# Access database
docker exec -it lucid-supabase-db psql -U postgres -d postgres

# Run migration
\i /path/to/migrations/001_oauth_credentials.sql

# Or use Supabase Studio at http://localhost:3010
```

### 5. Access Services

| Service | URL | Description |
|---------|-----|-------------|
| Supabase Studio | http://localhost:3010 | Database management UI |
| Supabase API | http://localhost:8000 | REST API endpoint |
| Nango Dashboard | http://localhost:3003 | OAuth configuration UI |
| PostgreSQL | localhost:5432 | Direct database access |

## 📊 Database Schema

### credentials
Stores OAuth connections linked to Privy users:

```sql
CREATE TABLE credentials (
    id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,              -- Privy user ID
    service TEXT NOT NULL,              -- google, slack, etc.
    name TEXT NOT NULL,
    auth_type TEXT DEFAULT 'oauth',    -- oauth, api_key, manual
    nango_connection_id TEXT,          -- Nango reference
    metadata JSONB,                     -- email, scopes, etc.
    encrypted_data TEXT,                -- For API keys
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### credential_usage
Tracks how credentials are used:

```sql
CREATE TABLE credential_usage (
    id UUID PRIMARY KEY,
    credential_id UUID REFERENCES credentials(id),
    workflow_id TEXT,
    workflow_name TEXT,
    execution_id TEXT,
    success BOOLEAN,
    error_message TEXT,
    used_at TIMESTAMPTZ DEFAULT NOW()
);
```

### oauth_providers
Pre-configured OAuth providers:

```sql
CREATE TABLE oauth_providers (
    id UUID PRIMARY KEY,
    provider_key TEXT UNIQUE,          -- google, slack, etc.
    provider_name TEXT,
    integration_id TEXT,               -- Nango integration ID
    auth_type TEXT,
    default_scopes TEXT[],
    description TEXT,
    is_enabled BOOLEAN DEFAULT true
);
```

## 🔐 Security Features

### Row Level Security (RLS)
All tables have RLS enabled to ensure users can only access their own data:

```sql
-- Users can only see their own credentials
CREATE POLICY credentials_user_isolation ON credentials
    FOR ALL
    USING (user_id = current_setting('app.user_id', true));
```

### Service Role Access
The service role can bypass RLS for backend operations:

```sql
CREATE POLICY credentials_service_access ON credentials
    FOR ALL
    TO service_role
    USING (true);
```

### Encryption
- OAuth tokens stored in Nango (encrypted at rest)
- API keys encrypted in `encrypted_data` column
- JWT secrets for Supabase authentication
- Nango encryption key for OAuth data

## 🔧 Configuration

### Supabase Configuration

The Supabase stack is configured via environment variables in `.env`:

```bash
# Database
SUPABASE_DB_PASSWORD=<secure-password>

# JWT
JWT_SECRET=<32-char-hex>
JWT_EXPIRY=3600

# API Keys
SUPABASE_ANON_KEY=<jwt-token>
SUPABASE_SERVICE_KEY=<jwt-token>

# URLs
SUPABASE_PUBLIC_URL=http://localhost:8000
```

### Nango Configuration

Nango connects to the Supabase PostgreSQL:

```bash
NANGO_SERVER_URL=http://localhost:3003
NANGO_SECRET_KEY=<32-char-hex>
NANGO_DB_HOST=supabase-db
NANGO_DB_NAME=postgres
```

### OAuth Providers

OAuth providers are configured in two places:

1. **In Nango Dashboard** (http://localhost:3003):
   - Add OAuth app credentials (Client ID, Secret)
   - Configure scopes
   - Set callback URLs

2. **In Database** (`oauth_providers` table):
   - Pre-seeded with popular providers
   - Stores provider metadata
   - Enable/disable providers

## 📝 Adding a New OAuth Provider

### 1. Create OAuth App

Visit the provider's developer console:

- **Google**: https://console.cloud.google.com/apis/credentials
- **Slack**: https://api.slack.com/apps
- **GitHub**: https://github.com/settings/developers
- **Microsoft**: https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps

Configure:
- **Redirect URI**: `http://localhost:3003/oauth/callback` (dev)
- **Scopes**: Based on your needs
- Copy **Client ID** and **Client Secret**

### 2. Add to Nango

Access Nango dashboard: http://localhost:3003

1. Click "Add Integration"
2. Select provider type
3. Enter Client ID and Secret
4. Configure scopes
5. Test connection

### 3. Add to Database

```sql
INSERT INTO oauth_providers (
    provider_key,
    provider_name,
    integration_id,
    auth_type,
    default_scopes,
    description
) VALUES (
    'newprovider',
    'New Provider',
    'newprovider',
    'oauth',
    ARRAY['scope1', 'scope2'],
    'Description of what this provider does'
);
```

## 🧪 Testing

### Test Database Connection

```bash
# Connect to PostgreSQL
docker exec -it lucid-supabase-db psql -U postgres -d postgres

# Check tables
\dt

# Query providers
SELECT * FROM oauth_providers;
```

### Test Supabase REST API

```bash
# Get providers (requires anon key)
curl http://localhost:8000/rest/v1/oauth_providers \
  -H "apikey: YOUR_SUPABASE_ANON_KEY"
```

### Test Nango

```bash
# Health check
curl http://localhost:3003/health

# Should return: {"status": "ok"}
```

## 📈 Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f nango
docker-compose logs -f supabase-db
```

### Check Service Health

```bash
# Check running containers
docker-compose ps

# Check Nango health
curl http://localhost:3003/health

# Check Supabase
curl http://localhost:8000/rest/v1/
```

### Database Queries

```sql
-- Active credentials count
SELECT service, COUNT(*) 
FROM credentials 
WHERE is_active = true 
GROUP BY service;

-- Recent usage
SELECT * FROM credential_usage 
ORDER BY used_at DESC 
LIMIT 10;

-- Provider statistics
SELECT 
    p.provider_name,
    COUNT(c.id) as connection_count
FROM oauth_providers p
LEFT JOIN credentials c ON p.provider_key = c.service
WHERE p.is_enabled = true
GROUP BY p.provider_name;
```

## 🚨 Troubleshooting

### Supabase Studio Not Loading

1. Check Kong is running:
   ```bash
   docker-compose ps supabase-kong
   ```

2. Check kong.yml is mounted correctly:
   ```bash
   docker exec lucid-supabase-kong ls /var/lib/kong/
   ```

3. Restart Kong:
   ```bash
   docker-compose restart supabase-kong
   ```

### Nango Connection Issues

1. Check database connection:
   ```bash
   docker-compose logs nango | grep -i database
   ```

2. Verify Nango can reach PostgreSQL:
   ```bash
   docker exec lucid-nango ping supabase-db
   ```

3. Check Redis is running:
   ```bash
   docker-compose ps nango-redis
   ```

### Migration Errors

1. Check PostgreSQL is ready:
   ```bash
   docker exec lucid-supabase-db pg_isready -U postgres
   ```

2. Run migration manually:
   ```bash
   docker exec -i lucid-supabase-db psql -U postgres -d postgres < migrations/001_oauth_credentials.sql
   ```

## 🔄 Backup & Restore

### Backup Database

```bash
# Full backup
docker exec lucid-supabase-db pg_dump -U postgres postgres > backup.sql

# Credentials only
docker exec lucid-supabase-db pg_dump -U postgres -t credentials -t credential_usage postgres > credentials_backup.sql
```

### Restore Database

```bash
# Restore from backup
docker exec -i lucid-supabase-db psql -U postgres postgres < backup.sql
```

## 🌍 Production Deployment

### Update Environment Variables

```bash
# Production URLs
NANGO_SERVER_URL=https://oauth.yourdomain.com
SUPABASE_PUBLIC_URL=https://api.yourdomain.com
FRONTEND_APP_URL=https://app.yourdomain.com

# Production mode
NODE_ENV=production

# Disable auto-confirm in production
ENABLE_EMAIL_AUTOCONFIRM=false
```

### Update OAuth Redirect URLs

For each OAuth provider, update redirect URLs to:
```
https://oauth.yourdomain.com/oauth/callback
```

### Enable SSL

1. Configure reverse proxy (nginx/Caddy)
2. Obtain SSL certificates (Let's Encrypt)
3. Update docker-compose.yml ports if needed

### Scale Services

```yaml
# In docker-compose.yml
services:
  nango:
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1'
          memory: 1G
```

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Nango Documentation](https://docs.nango.dev)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [OAuth 2.0 Specification](https://oauth.net/2/)

## 🤝 Support

For issues or questions:
1. Check this README
2. Review logs: `docker-compose logs`
3. Check Nango dashboard for OAuth errors
4. Use Supabase Studio to inspect database

## 📄 License

MIT License - Part of the Lucid project
