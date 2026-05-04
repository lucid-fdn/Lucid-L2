# 2026-05-04 - BYO Railway Launch and L2 Health

## Summary

The public L2 gateway now supports wallet-optional BYO Railway launches through the admin API without requiring an owner wallet at deployment time. Deploy-only passports are created as claimable and defer on-chain owner sync until claim/ownership transfer.

## Runtime Changes

- Admin authentication accepts one canonical key plus app-side aliases:
  - `ADMIN_API_KEY`
  - `LUCID_L2_ADMIN_KEY`
  - `LUCID_L2_API_KEY`
  - `L2_ADMIN_API_KEY`
  - `L2_GATEWAY_ADMIN_API_KEY`
  - `CONTROL_PLANE_ADMIN_KEY`
  - `LUCID_API_KEY` as a legacy fallback
- BYO launch passport creation passes `syncOnChain: false` so deployment does not emit false Solana signature errors before a user wallet claims ownership.
- The shared Postgres pool now prefers connection strings in this order:
  - `POSTGRES_URL`
  - `DATABASE_URL`
  - `PLATFORM_CORE_DB_URL`
  - discrete `POSTGRES_HOST`/`POSTGRES_PORT`/`POSTGRES_DB`/`POSTGRES_USER`/password fields
- Receipt consumer uses SSL settings and a longer connection timeout for the platform-core pooler.
- Gateway rate-limit keys use `express-rate-limit`'s IPv6-safe `ipKeyGenerator`.

## Operator Notes

- For Supabase deployments, prefer the pooler URL over the direct database host. The direct host can resolve to IPv6 and fail from hosts without IPv6 egress.
- If Redis is bound locally with no `requirepass`, use `REDIS_URL=redis://localhost:6379`. Do not include a password in that case, or Redis/ioredis will warn on each connection.
- `/health` is expected to return `200` only when database, Redis, and Nango checks are healthy.

## Live Verification

Verified against `https://api.lucid.foundation`:

- `GET /health` returned `200` with `database`, `redis`, and `nango` healthy.
- `POST /v1/agents/launch` with target `railway` returned `200`.
- Railway deployment was created and returned a deployment URL.
- Gateway logged deployment state as `running`.
- `POST /v1/agents/:passportId/terminate` returned `200` and terminated the Railway service.

The live smoke deployment was intentionally terminated after verification.
