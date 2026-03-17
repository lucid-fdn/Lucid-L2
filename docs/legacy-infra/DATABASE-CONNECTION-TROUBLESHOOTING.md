# Database Connection Troubleshooting Guide

## ✅ Issue Resolved: Password Authentication Fixed

Your PostgREST API is now successfully connecting to the database! The password authentication issue has been resolved.

## Current Status

### ✅ Working
- PostgREST is running (v11.2.0)
- Database connection successful
- API is accessible at `http://localhost:3000`
- Kong Gateway is responding at `http://localhost:8000`

### ⚠️ Next Steps Required
- **Database is empty** - You need to run migrations to create tables
- Tables like `workflows`, `organizations`, etc. don't exist yet

## How to Set Up Your Database

### Step 1: Run Database Migrations

You have migrations in `infrastructure/migrations/` directory. Run them to create your database schema:

```bash
cd infrastructure

# Method 1: If you have a migration script
./scripts/run-migrations.sh

# Method 2: Run migrations manually with psql
docker exec -i lucid-supabase-db psql -U postgres -d postgres < migrations/your_migration_file.sql
```

### Step 2: Verify Tables Were Created

After running migrations, test again:

```bash
node test-supabase-connection.js localhost
```

You should now see tables listed and no more 404 errors.

## What Was Fixed

### The Problem
PostgREST container was continuously restarting with this error:
```
password authentication failed for user "postgres"
```

### The Cause
The database volume was created with a different password than what was in your `.env` file. This happens when:
1. Docker volumes persist between container restarts
2. The `.env` file password was changed after the initial setup
3. PostgreSQL had  already initialized with the old password

### The Solution
We recreated the database with the correct password by:
1. Stopping all containers
2. Removing the old database volume
3. Restarting containers with the password from `.env`

## Testing Your API

### Basic Test
```bash
# Check if PostgREST is running
curl http://localhost:3000/

# After running migrations, query a table
curl http://localhost:3000/workflows?limit=1 \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "apikey: YOUR_ANON_KEY"
```

### Using the Test Script
```bash
# Test local connection
cd infrastructure
node test-supabase-connection.js localhost

# Test external IP (replace with your server IP)
node test-supabase-connection.js 13.221.253.195
```

## Common Issues & Solutions

### Issue: Still Getting 404 Errors After Migrations

**Cause**: Migrations didn't run correctly or PostgREST cache needs refresh

**Solution**:
```bash
# Restart PostgREST to reload schema cache
docker restart lucid-supabase-rest

# Wait 10 seconds, then test again
sleep 10
node test-supabase-connection.js localhost
```

### Issue: "Connection Refused" on Port 3000

**Cause**: PostgREST container not running or port not exposed

**Solution**:
```bash
# Check container status
docker ps | grep postgrest

# Check logs
docker logs lucid-supabase-rest

# Restart if needed
cd infrastructure
docker compose restart supabase-rest
```

### Issue: External IP Not Accessible

**Cause**: Firewall blocking ports

**Solution**:
```bash
# Check if ports are listening
sudo netstat -tlnp | grep -E '3000|8000'

# Configure firewall (Ubuntu/Debian)
sudo ufw allow 3000/tcp
sudo ufw allow 8000/tcp

# Configure firewall (CentOS/RHEL)
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --add-port=8000/tcp --permanent
sudo firewall-cmd --reload
```

## Monitoring

### Check Container Health
```bash
cd infrastructure
docker compose ps
```

All containers should show "Up" status. Key containers:
- `lucid-supabase-db` - Should be "healthy"
# Check rules
sudo ufw status
```

## 🔒 Security Considerations

### Before Production Deployment

1. **Change the database password**:
   ```bash
   # Generate a new secure password
   NEW_PASSWORD=$(openssl rand -hex 32)
   
   # Update .env file
   sed -i "s/SUPABASE_DB_PASSWORD=.*/SUPABASE_DB_PASSWORD=$NEW_PASSWORD/" .env
   
   # Recreate containers
   ./diagnose-and-fix-db.sh
   ```

2. **Regenerate JWT secrets**:
   ```bash
   # Generate new JWT secret
   NEW_JWT_SECRET=$(openssl rand -hex 32)
   
   # Update .env
   sed -i "s/JWT_SECRET=.*/JWT_SECRET=$NEW_JWT_SECRET/" .env
   ```

3. **Generate new API keys** (with proper expiration):
   ```bash
   ./scripts/generate-keys.sh
   ```

