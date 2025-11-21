# Supabase Cloud Migration Guide
**For Production Hardening Migration**

Since you're using Supabase Cloud (not local Docker), here's how to run the security hardening migration.

---

## 🌐 **Quick Migration (Supabase Cloud)**

### Option 1: Using Supabase Dashboard (Recommended)

1. **Go to your Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Copy and Paste Migration**
   ```bash
   # Copy the migration file contents
   cat Lucid-L2/infrastructure/migrations/20250213_production_hardening.sql
   ```
   - Paste the entire contents into the SQL Editor
   - Click "Run" button

4. **Verify Success**
   - You should see "Success. No rows returned" message
   - Check the "Indexes" tab to verify new indexes were created

### Option 2: Using Connection String from .env

If you have your `SUPABASE_URL` set in your environment:

```bash
cd Lucid-L2/infrastructure

# Method 1: Direct connection string (from Supabase Dashboard > Settings > Database)
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  -f migrations/20250213_production_hardening.sql

# Method 2: If SUPABASE_URL is set in your .env
source ../offchain/.env
psql "$SUPABASE_URL" -f migrations/20250213_production_hardening.sql
```

### Option 3: Automated (Using the Setup Script)

The setup script will automatically detect your Supabase connection:

```bash
cd Lucid-L2

# Make sure SUPABASE_URL is set in offchain/.env
./setup-security-hardening.sh
```

The script will:
1. Check if `SUPABASE_URL` is set
2. Test the connection
3. Run the migration automatically
4. Verify indexes were created

---

## 🔍 **Verification**

After running the migration, verify it worked:

### Check Indexes (Supabase Dashboard)

1. Go to: Database > Indexes
2. You should see new indexes like:
   - `idx_user_wallets_wallet_id`
   - `idx_session_signers_privy_id`
   - `idx_oauth_usage_success`
   - etc.

### Check Views (SQL Editor)

```sql
-- Check if materialized view exists
SELECT * FROM user_wallet_stats LIMIT 5;

-- Check if monitoring views exist
SELECT * FROM system_health_summary;
SELECT * FROM oauth_connection_health LIMIT 5;
SELECT * FROM recent_failed_transactions LIMIT 5;
```

### Check Functions (SQL Editor)

```sql
-- Check if cleanup functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN ('cleanup_expired_signers', 'cleanup_old_audit_logs', 'cleanup_expired_oauth_states', 'refresh_user_wallet_stats');
```

You should see all 4 functions listed.

---

## ⚙️ **Supabase-Specific Considerations**

### 1. Connection Pooling

Supabase uses PgBouncer for connection pooling. Your environment should have:

```bash
# In offchain/.env
SUPABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:6543/postgres?pgbouncer=true
SUPABASE_SERVICE_KEY=eyJ... # Your service role key
```

**Note:** Port `6543` is for connection pooling (session mode). Use `5432` for direct connection (transaction mode).

### 2. Row Level Security (RLS)

The migration tables don't have RLS enabled by default. If you need RLS:

```sql
-- Enable RLS on tables (optional, depends on your security model)
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE signer_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- Then create policies as needed
```

### 3. Cron Jobs (Supabase pg_cron)

Supabase supports `pg_cron` for scheduled tasks. Enable it:

1. Go to: Database > Extensions
2. Enable `pg_cron` extension
3. Create cron jobs:

```sql
-- Enable pg_cron extension (do this first in Supabase Dashboard)
-- Then create scheduled jobs:

-- Run cleanup daily at 2 AM UTC
SELECT cron.schedule(
  'cleanup-expired-signers',
  '0 2 * * *',
  $$SELECT cleanup_expired_signers()$$
);

-- Run audit log cleanup weekly on Sunday at 3 AM UTC
SELECT cron.schedule(
  'cleanup-old-audit-logs',
  '0 3 * * 0',
  $$SELECT cleanup_old_audit_logs()$$
);

-- Run OAuth state cleanup every hour
SELECT cron.schedule(
  'cleanup-oauth-states',
  '0 * * * *',
  $$SELECT cleanup_expired_oauth_states()$$
);

-- Refresh materialized view daily at 1 AM UTC
SELECT cron.schedule(
  'refresh-wallet-stats',
  '0 1 * * *',
  $$SELECT refresh_user_wallet_stats()$$
);
```

### 4. View Existing Cron Jobs

```sql
-- List all scheduled jobs
SELECT * FROM cron.job;

-- Delete a job if needed
SELECT cron.unschedule('job-name-here');
```

---

## 🚀 **Quick Start Commands**

### If using Supabase Dashboard (Easiest):
1. Copy contents of `infrastructure/migrations/20250213_production_hardening.sql`
2. Paste into SQL Editor
3. Click "Run"
4. Done! ✅

### If using command line:
```bash
cd Lucid-L2

# Run the automated setup script
./setup-security-hardening.sh

# Verify the migration
psql "$SUPABASE_URL" -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('user_wallets', 'session_signers');"
```

---

## 📊 **Monitoring Your Supabase Database**

### Dashboard Metrics
- Go to: Database > Performance
- Monitor query performance
- Check slow queries
- View connection pool usage

### Custom Monitoring with Views

```sql
-- Check system health
SELECT * FROM system_health_summary;

-- Check for issues
SELECT * FROM recent_failed_transactions;

-- Check OAuth connection health
SELECT * FROM oauth_connection_health WHERE status != 'active';
```

---

## 🔐 **Security Best Practices for Supabase**

### 1. Service Key Security
```bash
# Your service key should be in .env, NOT in code
SUPABASE_SERVICE_KEY=eyJ...  # This is sensitive!

# Never commit this to git
echo "*.env" >> .gitignore
```

### 2. Connection String Security
```bash
# Use environment variables
SUPABASE_URL="postgresql://postgres:[PASSWORD]@..."

# DO NOT hardcode connection strings in your code
```

### 3. Enable Database Webhooks (Optional)
For real-time monitoring, enable webhooks:
- Go to: Database > Webhooks
- Create webhook for table changes
- Use for alerting on critical events

---

## ❓ **Troubleshooting**

### "Permission denied for table..."
**Solution:** Make sure you're using the service role key, not the anon key.

```bash
# In offchain/.env
SUPABASE_SERVICE_KEY=eyJhbGc...  # Service role (starts with eyJ...)
# NOT the anon key
```

### "Connection refused" or "Connection timeout"
**Solution:** Check your connection string and firewall rules

```bash
# Test connection
psql "$SUPABASE_URL" -c "SELECT NOW();"
```

### "Function already exists"
**Solution:** Run the migration again - it uses `CREATE OR REPLACE FUNCTION` so it's safe to re-run.

### "Extension not available"
**Solution:** Some extensions need to be enabled in Supabase Dashboard first
- Go to: Database > Extensions
- Enable required extensions (pg_cron, etc.)

---

## 📞 **Need Help?**

1. Check Supabase logs: Dashboard > Logs
2. View migration status: `SELECT * FROM pg_stat_activity;`
3. Check for errors: Review the migration output
4. Test connection: `psql "$SUPABASE_URL" -c "SELECT version();"`

---

## ✅ **Post-Migration Checklist**

- [ ] Migration ran successfully (no errors)
- [ ] All indexes created (verify in Dashboard > Indexes)
- [ ] Materialized view created (`user_wallet_stats`)
- [ ] Monitoring views accessible
- [ ] Cleanup functions exist
- [ ] pg_cron jobs scheduled (optional but recommended)
- [ ] Health check endpoint works: `curl http://localhost:3000/health/database`

---

**Note:** The migration is idempotent - safe to run multiple times. All operations use `IF NOT EXISTS` or `CREATE OR REPLACE`.
