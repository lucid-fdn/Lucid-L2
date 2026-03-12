# OAuth Connection Issue - Complete Analysis

**Date:** December 12, 2025  
**User ID:** `did:privy:cmi2zxrhi01gal70cm2n2xke5`  
**Provider:** Twitter (twitter-v2)

---

## 🔍 Issue Summary

The OAuth connection for Twitter **EXISTS in Nango** but is **NOT accessible** via the API because it's **missing from the `user_oauth_connections` metadata table**.

---

## 📊 Database Verification Results

### ✅ Nango Connection (EXISTS)

```
Connection ID: did:privy:cmi2zxrhi01gal70cm2n2xke5-twitter
Provider: twitter-v2
Environment: 1 (prod)
Created: Dec 10, 2025 10:02:04 GMT
Updated: Dec 11, 2025 16:18:07 GMT
Has Credentials: Yes
Deleted: false
```

**Status:** OAuth credentials are stored and valid in Nango.

### ❌ User OAuth Connections (MISSING)

No records found in `user_oauth_connections` table for this user.

**Status:** This is why the API returns "no connection found".

### ⚠️ OAuth States

Found 9 expired state tokens, including the most recent:
- Last attempt: Dec 11, 2025 16:17:44 GMT
- All states have expired (5-minute TTL)

---

## 🎯 Frontend Developer Analysis - Verdict

### What They Got RIGHT ✅

1. **OAuth connection IS working** - Confirmed, Nango successfully stored it
2. **Compound ID format** - Confirmed, Nango uses `{userId}-{provider}` format
3. **Connection exists in database** - Confirmed

### What They Got WRONG ❌

1. **Query pattern is NOT the issue** - Our backend correctly queries by `privy_user_id` (without suffix)
2. **The fix suggestion is WRONG** - Adding wildcard queries would not solve the problem
3. **Root cause misidentified** - The issue is NOT in how we query, but in the callback handler

---

## 🐛 Root Cause Analysis

### The Real Problem

The `handleOAuthCallback()` function in `nangoService.ts` is failing to insert records into `user_oauth_connections`.

**Evidence:**
1. Connection exists in Nango (OAuth succeeded)
2. Multiple state tokens were created (OAuth flow initiated)
3. No corresponding records in user_oauth_connections (callback failed)

### Why the Callback is Failing

Looking at the code in `offchain/src/services/nangoService.ts`:

```typescript
async handleOAuthCallback(code: string, state: string) {
  // 1. Verify state token
  const { data: stateData, error: stateError } = await this.supabase
    .from('oauth_states')
    .select('*')
    .eq('state', state)
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (stateError || !stateData) {
    throw new Error('Invalid or expired state token');  // ← LIKELY FAILING HERE
  }
  
  // 2. Wait for Nango to process
  await new Promise(resolve => setTimeout(resolve, 2000));  // ← MIGHT BE TOO SHORT
  
  // 3. Get connection from Nango
  const connection = await this.nango.getConnection(
    stateData.provider,  // ← Should be 'twitter-v2', not 'twitter'
    connectionId
  );
  
  // 4. Store in our database
  const { error: insertError } = await this.supabase
    .from('user_oauth_connections')
    .upsert({...});
  
  if (insertError) {
    console.error('Error storing connection:', insertError);  // ← SILENT ERROR!
  }
}
```

### Probable Failures (in order of likelihood)

1. **Provider ID mismatch** - State stores `provider: 'twitter'` but Nango uses `twitter-v2`
2. **State token expired** - 5 minute TTL might expire during OAuth flow
3. **Insufficient wait time** - 2 seconds may not be enough for Nango processing
4. **Silent errors** - Insert errors are logged but not thrown

---

## 🔧 Immediate Fix (For Current User)

Run this SQL in Supabase to manually register the existing connection:

```sql
INSERT INTO user_oauth_connections (
  privy_user_id,
  user_id,
  provider,
  nango_connection_id,
  nango_integration_id,
  scopes,
  created_at
) VALUES (
  'did:privy:cmi2zxrhi01gal70cm2n2xke5',
  'did:privy:cmi2zxrhi01gal70cm2n2xke5',
  'twitter',
  'did:privy:cmi2zxrhi01gal70cm2n2xke5-twitter',
  'twitter-v2',
  ARRAY['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  NOW()
)
ON CONFLICT (privy_user_id, provider) 
DO UPDATE SET
  nango_connection_id = EXCLUDED.nango_connection_id,
  revoked_at = NULL;
```

**After running this SQL, the user's Twitter connection will be immediately accessible.**

---

## 🛠️ Long-Term Fixes Required

### Fix 1: Provider ID Mapping in Callback

**File:** `offchain/src/services/nangoService.ts`

**Problem:** The callback uses `stateData.provider` (e.g., 'twitter') but should map it to the Nango integration ID (e.g., 'twitter-v2').

**Solution:**
```typescript
async handleOAuthCallback(code: string, state: string) {
  // ... state validation ...
  
  const connectionId = `${stateData.privy_user_id}-${stateData.provider}`;
  
  // Map provider to Nango integration ID
  const nangoIntegrationId = PROVIDER_TO_NANGO_MAP[stateData.provider] || stateData.provider;
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const connection = await this.nango.getConnection(
    nangoIntegrationId,  // ← USE MAPPED ID
    connectionId
  );
  
  // ... rest of code ...
}
```

### Fix 2: Throw Errors Instead of Silent Logging

**Problem:** Insert errors are logged but not thrown, allowing the callback to "succeed" even when the database write fails.

**Solution:**
```typescript
const { error: insertError } = await this.supabase
  .from('user_oauth_connections')
  .upsert({...});

if (insertError) {
  console.error('Error storing connection:', insertError);
  throw new Error(`Failed to store connection: ${insertError.message}`);  // ← THROW ERROR
}
```

### Fix 3: Increase Wait Time and Add Retry Logic

**Problem:** 2 seconds might not be enough for Nango to process the OAuth callback.

**Solution:**
```typescript
// Wait longer for Nango to process
await new Promise(resolve => setTimeout(resolve, 5000));

// Retry logic for getConnection
let connection;
let retries = 3;
while (retries > 0) {
  try {
    connection = await this.nango.getConnection(nangoIntegrationId, connectionId);
    break;
  } catch (error) {
    retries--;
    if (retries === 0) throw error;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
```

### Fix 4: Extend State Token TTL

**Problem:** 5 minutes might be too short if users are slow to complete OAuth.

**Solution:**
```typescript
// In initiateOAuthFlow
const expiresAt = new Date(Date.now() + 10 * 60 * 1000);  // 10 minutes instead of 5
```

---

## 📋 Implementation Checklist

- [ ] Apply Fix 1: Provider ID mapping in callback handler
- [ ] Apply Fix 2: Throw errors instead of silent logging
- [ ] Apply Fix 3: Increase wait time and add retry logic
- [ ] Apply Fix 4: Extend state token TTL to 10 minutes
- [ ] Add comprehensive logging to callback handler
- [ ] Add unit tests for callback handler
- [ ] Test full OAuth flow end-to-end
- [ ] Document the provider mapping in NANGO-IMPLEMENTATION-COMPLETE.md

---

## 🧪 Testing Plan

After implementing fixes:

1. **Clear test data:**
   ```sql
   DELETE FROM user_oauth_connections WHERE privy_user_id LIKE 'did:privy:test%';
   DELETE FROM oauth_states WHERE privy_user_id LIKE 'did:privy:test%';
   ```

2. **Test OAuth flow:**
   - Initiate Twitter OAuth
   - Complete authorization
   - Verify connection appears in both Nango and user_oauth_connections
   - Verify API endpoint returns the connection

3. **Test edge cases:**
   - Expired state token
   - Invalid state token
   - Nango connection failure
   - Database insert failure

---

## 📝 Summary

**Frontend Developer Verdict:** PARTIALLY CORRECT

- ✅ Correctly identified that Nango uses compound IDs
- ✅ Correctly verified that the connection exists in Nango
- ❌ Incorrectly diagnosed the query pattern as the issue
- ❌ Proposed the wrong fix (wildcard queries)

**Actual Issue:** OAuth callback handler fails to store connection metadata due to provider ID mismatch and silent error handling.

**Immediate Action:** Run the manual SQL fix for the current user.

**Long-term Action:** Apply the 4 code fixes to prevent future occurrences.
