# Manual Cloud Supabase Migration Steps

Since the Supabase CLI is having password authentication issues, please follow these manual steps:

## Step 1: Run Migrations Manually (Do This First!)

Go to your Supabase Dashboard:
1. Open https://supabase.com/dashboard/project/kwihlcnapmkaivijyiif
2. Navigate to **SQL Editor** in the left sidebar
3. Run each migration file in order by copying and pasting the contents:

### Migration Order:
1. `migrations/001_oauth_credentials.sql`
2. `migrations/20250131_privy_wallets.sql`
3. `migrations/20250206_rewards_system.sql`  
4. `migrations/20250210_nango_integration.sql`

After running all migrations, verify tables were created:
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

## Step 2: Environment Files Have Been Updated

The following files have been updated to use cloud Supabase:
- ✅ `Lucid-L2/infrastructure/.env`
- ✅ `Lucid-L2/offchain/.env`

## Step 3: Docker Compose Updated

The `docker-compose.yml` has been updated to:
- ✅ Remove all local Supabase services
- ✅ Keep Nango and Redis running locally
- ✅ Configure Nango to connect to cloud Supabase

## Step 4: Test the Migration

After running the SQL migrations, test the connection:
```bash
cd Lucid-L2/offchain
npm test
```

## Troubleshooting

If you encounter issues:
1. **Password Issues**: The database password is `Tk5JbpMcX!qdEvE`
2. **Connection Issues**: Verify the project ref is `kwihlcnapmkaivijyiif`
3. **Migration Errors**: Check the Supabase logs in the dashboard

## Cloud Supabase Details

- **Project URL**: https://kwihlcnapmkaivijyiif.supabase.co
- **Project Ref**: kwihlcnapmkaivijyiif
- **Database Host**: db.kwihlcnapmkaivijyiif.supabase.co
- **Database Port**: 5432 (direct) or 6543 (pooler)
