# Run Production Hardening Migration - Supabase Dashboard Method
**Easiest Method - No Connection Issues**

Since the psql connection failed (likely IP whitelist issue), use the Supabase Dashboard instead. This always works and takes just 2 minutes.

---

## 🎯 **Quick Steps (2 minutes)**

### **Step 1: Copy Migration File**

```bash
cd ~/Lucid/Lucid-L2
cat infrastructure/migrations/20250213_production_hardening.sql
```

Copy all the output (Ctrl+Shift+C)

### **Step 2: Open Supabase Dashboard**

1. Go to: https://supabase.com/dashboard/project/kwihlcnapmkaivijyiif
2. Click: **SQL Editor** (in left sidebar)
3. Click: **New Query**

### **Step 3: Paste and Run**

1. Paste the migration SQL into the editor
2. Click: **Run** button (bottom right)
3. Wait 5-10 seconds
4. You should see: **"Success. No rows returned"**

### **Step 4: Verify**

Still in Supabase Dashboard:

1. Click: **Database** → **Indexes**
2. Look for new indexes starting with `idx_`:
   - `idx_user_wallets_wallet_id`
   - `idx_session_signers_privy_id`
   - `idx_oauth_usage_success`
   - And 17+ more...

3. In SQL Editor, run:
```sql
-- Test the monitoring view
SELECT * FROM system_health_summary;
```

You should see a row with metrics about your system.

---

## ✅ **That's It!**

The migration is now complete. You can:

### **Test Health Checks:**
```bash
cd ~/Lucid/Lucid-L2/offchain
npm run dev

# In another terminal:
curl http://localhost:3000/health
curl http://localhost:3000/health/database
```

Expected: `{"status": "healthy", ...}`

### **View Monitoring in Dashboard:**

Go to SQL Editor and run:

```sql
-- System health summary
SELECT * FROM system_health_summary;

-- Recent failed transactions (if any)
SELECT * FROM recent_failed_transactions;

-- OAuth connection health
SELECT * FROM oauth_connection_health;

-- User statistics
SELECT * FROM user_wallet_stats LIMIT 10;
```

---

## 🔧 **Optional: Fix psql Connection (For Future)**

The psql connection failed likely because:

### Issue 1: IP Not Whitelisted

**Fix in Supabase Dashboard:**
1. Go to: Settings → Database
2. Scroll to: **Connection Pooling** section
3. Find: **Network Restrictions** or **IP Allow List**
4. Add your server IP: Get it with `curl ifconfig.me`
5. Add `0.0.0.0/0` for testing (remove in production!)

### Issue 2: Wrong Connection String

**Check your connection string in `offchain/.env`:**

```bash
# For direct connection (port 5432):
SUPABASE_URL=postgresql://postgres.kwihlcnapmkaivijyiif:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres

# For connection pooling (port 6543):
SUPABASE_URL=postgresql://postgres.kwihlcnapmkaivijyiif:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**Get the correct string from:**
Supabase Dashboard → Settings → Database → Connection string → URI

### Issue 3: Password Issues

Make sure to URL-encode special characters in password:
- `@` becomes `%40`
- `#` becomes `%23`
- `&` becomes `%26`

---

## 💡 **Recommendation**

**For now:** Just use the Supabase Dashboard SQL Editor method above. It's:
- ✅ Faster
- ✅ No connection issues
- ✅ No IP whitelisting needed
- ✅ Works from anywhere

**For later:** Fix the psql connection for automation (cron jobs, CI/CD).

---

## 🎯 **After Migration is Complete**

Once the migration runs successfully (via Dashboard), you can:

1. **Test the application:**
   ```bash
   cd offchain && npm run dev
   ```

2. **Set up pg_cron jobs** (in Supabase SQL Editor):
   ```sql
   -- Enable pg_cron extension first: Database > Extensions > pg_cron
   
   SELECT cron.schedule('cleanup-expired-signers', '0 2 * * *', 
     $$SELECT cleanup_expired_signers()$$);
   
   SELECT cron.schedule('cleanup-oauth-states', '0 * * * *', 
     $$SELECT cleanup_expired_oauth_states()$$);
   ```

3. **Move to Phase 2:** KMS integration (see `SECURITY-HARDENING-QUICK-START.md`)

---

**Bottom Line:** Use the Dashboard method - it's easier and always works!
