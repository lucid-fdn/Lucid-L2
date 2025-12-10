# Twitter OAuth Callback URL Fix

## Problem

Twitter OAuth is failing with the error:
> "Une erreur s'est produite. Vous n'avez pas pu autoriser l'accès à l'application. Revenez en arrière et réessayez de vous connecter."
> (An error has occurred. You could not authorize access to the application. Go back and try logging in again.)

This happens because Nango is generating OAuth URLs with `redirectmeto.com` as a proxy:
```
https://twitter.com/i/oauth2/authorize?...&redirect_uri=https://redirectmeto.com/https://api.lucid.foundation/api/oauth/callback
```

Twitter does not allow this URL because `redirectmeto.com` is not registered as an authorized callback URL in the Twitter Developer Portal.

## Root Cause

Nango uses `redirectmeto.com` as a fallback redirect proxy when it doesn't know its own public URL. This happens when:

1. The `NANGO_SERVER_URL` environment variable is not set or not being read by the Nango container
2. The callback URL was not stored in Nango's database for the integration
3. The integration was created before the environment variables were properly configured

## Solution Overview

Three things need to be fixed:

1. **Update Nango's database** - Set the correct callback URL in Nango's environment variables table
2. **Restart Nango container** - Ensure it picks up the new configuration
3. **Register in Twitter Developer Portal** - Add the callback URL to your Twitter app

## Step-by-Step Fix

### Step 1: Run the Fix Script

```bash
cd /home/admin/Lucid/Lucid-L2/infrastructure/scripts
node fix-nango-twitter-callback.js
```

This script will:
- Check the current twitter-v2 integration configuration
- Update the `NANGO_SERVER_URL` and `NANGO_CALLBACK_URL` in Nango's database
- Display the next steps

### Step 2: Restart Nango Container

```bash
cd /home/admin/Lucid/Lucid-L2/infrastructure
docker-compose restart nango
```

Wait for Nango to restart, then verify the environment:

```bash
docker exec lucid-nango printenv | grep -E 'NANGO_(SERVER|CALLBACK)_URL'
```

Expected output:
```
NANGO_SERVER_URL=https://api.lucid.foundation/nango
NANGO_CALLBACK_URL=https://api.lucid.foundation/nango/oauth/callback
```

### Step 3: Register Callback URL in Twitter Developer Portal

1. Go to: https://developer.twitter.com/en/portal/projects
2. Select your project/app
3. Click on "User authentication settings" → "Edit"
4. Under "App Info" → "Callback URI / Redirect URL", add:

```
https://api.lucid.foundation/nango/oauth/callback
```

5. Ensure these settings are configured:
   - **Type of App**: Web App, Automated App or Bot
   - **App permissions**: Read and write (for tweet.read, tweet.write, users.read, offline.access)
   - **Website URL**: `https://lucid.foundation` (or your actual domain)

6. Click "Save"

### Step 4: Test the OAuth Flow

Try connecting to Twitter again through your application. The redirect URL should now be:
```
https://api.lucid.foundation/nango/oauth/callback
```

NOT:
```
https://redirectmeto.com/https://api.lucid.foundation/api/oauth/callback
```

## Alternative: Manual Database Update

If the script doesn't work, you can manually update the Nango database. Connect to Supabase and run:

```sql
-- Check current configuration
SELECT * FROM nango._nango_environment_variables 
WHERE name IN ('NANGO_SERVER_URL', 'NANGO_CALLBACK_URL')
AND environment_id = 1;

-- Insert/Update the variables
INSERT INTO nango._nango_environment_variables (name, value, environment_id, created_at, updated_at)
VALUES 
  ('NANGO_SERVER_URL', 'https://api.lucid.foundation/nango', 1, NOW(), NOW()),
  ('NANGO_CALLBACK_URL', 'https://api.lucid.foundation/nango/oauth/callback', 1, NOW(), NOW())
ON CONFLICT (name, environment_id) 
DO UPDATE SET 
  value = EXCLUDED.value,
  updated_at = NOW();
```

## Alternative: Update via Nango Dashboard

1. Access Nango dashboard: http://localhost:3007 (or your deployed Nango URL)
2. Go to "Environment Settings"
3. Set the "Callback URL" to: `https://api.lucid.foundation/nango/oauth/callback`
4. Go to Integrations → twitter-v2
5. Verify the integration's callback URL is correct

## Configuration Reference

### infrastructure/.env

Ensure these are set correctly:

```env
# Server URL (the PUBLIC URL where Nango is accessible)
NANGO_SERVER_URL=https://api.lucid.foundation/nango

# Callback URL (for OAuth redirects)
NANGO_CALLBACK_URL=https://api.lucid.foundation/nango/oauth/callback
```

### docker-compose.yml

The Nango service should have these environment variables:

```yaml
nango:
  environment:
    NANGO_CALLBACK_URL: ${NANGO_CALLBACK_URL}
    NANGO_SERVER_URL: ${NANGO_SERVER_URL}
```

## Twitter App Information

- **Current Client ID from URL**: `SWtWcFMzbFNwa2h5UFVxQU5JUnE6MTpjaQ`
- **Required OAuth Scopes**: `offline.access`, `tweet.read`, `tweet.write`, `users.read`
- **OAuth Version**: OAuth 2.0 (via Nango's twitter-v2 integration)

## Troubleshooting

### Still getting redirectmeto.com in URL?

1. Check if Nango container received the environment variables:
   ```bash
   docker exec lucid-nango printenv | grep NANGO
   ```

2. Clear any cached OAuth states:
   ```bash
   curl -X POST https://api.lucid.foundation/api/oauth/admin/cleanup \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
   ```

3. Try initiating a fresh OAuth flow

### Twitter says "Something went wrong"

1. Verify the callback URL in Twitter Developer Portal matches EXACTLY:
   ```
   https://api.lucid.foundation/nango/oauth/callback
   ```
   
2. Ensure there are no trailing slashes or typos

3. Wait a few minutes after updating Twitter settings for changes to propagate

### Nango dashboard shows old callback?

The callback URL is stored per integration. Update it directly in the dashboard:
1. Go to Integrations → twitter-v2
2. Edit the integration
3. Save again to update the callback URL

## Success Indicators

When properly configured:

1. OAuth authorization URL should look like:
   ```
   https://twitter.com/i/oauth2/authorize?response_type=code&client_id=...&redirect_uri=https://api.lucid.foundation/nango/oauth/callback&scope=...
   ```

2. After Twitter authorization, user should be redirected to:
   ```
   https://api.lucid.foundation/nango/oauth/callback?code=...&state=...
   ```

3. Nango should exchange the code for tokens and store the connection

## References

- [Nango OAuth Documentation](https://docs.nango.dev/understand/concepts/oauth)
- [Twitter OAuth 2.0 Documentation](https://developer.twitter.com/en/docs/authentication/oauth-2-0)
- [Traefik Routing Configuration](./infrastructure/traefik/dynamic/nango.yml)
