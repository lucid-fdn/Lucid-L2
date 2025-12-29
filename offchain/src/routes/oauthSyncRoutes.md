# OAuth Sync Route (Option A)

## Why this exists

When using Nango’s hosted OAuth flow:
- User goes to `https://{NANGO_PUBLIC_URL}/oauth/connect/{integrationId}`
- Provider redirects to `https://{NANGO_PUBLIC_URL}/oauth/callback`

So **offchain never receives the OAuth callback**.

That means we need a separate step to populate our own `user_oauth_connections` metadata table.

## New endpoint

### POST `/api/oauth/:provider/sync`

- **Auth:** Privy JWT (same as other protected `/api/oauth/*` routes)
- **Purpose:** After the frontend sees the OAuth connection succeeded, call this endpoint to:
  1. `nango.getConnection(integrationId, connectionId)`
  2. upsert into `user_oauth_connections`

### Response

```json
{
  "success": true,
  "provider": "twitter",
  "privyUserId": "did:privy:...",
  "timestamp": "2025-12-15T...Z"
}
```

### Example curl

```bash
curl -X POST "https://api.lucid.foundation/api/oauth/twitter/sync" \
  -H "Authorization: Bearer <PRIVY_JWT>" \
  -H "Content-Type: application/json"
```

### Expected behavior

- If the user already connected in Nango, it returns 200 and the row appears in `user_oauth_connections`.
- If Nango does not have the connection yet, it returns 404.

## Frontend integration

After the user finishes the Nango flow (your UI sees success):
1. call `/api/oauth/twitter/sync`
2. then call `/api/oauth/connections` to refresh UI.
