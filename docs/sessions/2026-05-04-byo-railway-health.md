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
- Claimable launch passports now persist schema-valid `metadata.launch_ownership` and defer Metaplex execution delegation until the wallet claim path owns the asset. This prevents non-fatal `Asset owner must be the one to delegate execution` noise for wallet-optional deployments while keeping claimed/on-chain launches unchanged.
- The shared Postgres pool now prefers connection strings in this order:
  - `POSTGRES_URL`
  - `DATABASE_URL`
  - `PLATFORM_CORE_DB_URL`
  - discrete `POSTGRES_HOST`/`POSTGRES_PORT`/`POSTGRES_DB`/`POSTGRES_USER`/password fields
- Receipt consumer uses SSL settings and a longer connection timeout for the platform-core pooler.
- Gateway rate-limit keys use `express-rate-limit`'s IPv6-safe `ipKeyGenerator`.
- Dependency audit cleanup upgraded safe patch/minor chains for Axios/follow-redirects, Nango transitive Axios, and OpenTelemetry/protobufjs. Follow-up cleanup upgraded PM2 to `7.0.1`, Hyperliquid to `0.32.2`, adapted the Hyperliquid wallet wrapper to the new SDK contract, and removed local source imports from the transitive `uuid` package in favor of Node `crypto.randomUUID()`.
- Critical production audit is clear. Remaining high/moderate findings are upstream/no-safe-fix chains around Solana/Irys/Privy/passport dependencies:
  - `@solana/web3.js@1.98.4` has no patched 1.x release and is pulled by core Solana, Anchor, Metaplex, Privy, and QuantuLabs paths.
  - `@solana/spl-token`/`bigint-buffer` and `@irys/upload-solana` inherit the same no-fix Solana chain.
  - `@lucid-fdn/passport` and `rpc-websockets` still pull vulnerable `uuid` versions transitively; local code no longer imports `uuid` directly.
  - These should be resolved by explicit Solana SDK/passport/Irys migration work, not an automatic force audit fix.

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
- Final post-deploy smoke after schema rollout created `passport_c082b81b0a3c4a4b949b52a967a173d8`, deployed Railway service `365358a2-b447-43e3-814c-09abeee06c0f`, then terminated it successfully. Logs show on-chain sync deferred and no new delegation failure for that passport.
- Local regression gates passed after the claimable delegation and dependency updates:
- `npm run type-check`
- `npx jest packages/engine/src/__tests__/launch.test.ts packages/engine/src/identity/projections/__tests__/MetaplexIdentityRegistry.test.ts packages/gateway-lite/src/middleware/__tests__/adminAuth.test.ts --runInBand`
- `npx jest packages/engine/src/__tests__/agentDescriptor.test.ts packages/engine/src/__tests__/launch.test.ts packages/engine/src/identity/projections/__tests__/MetaplexIdentityRegistry.test.ts packages/gateway-lite/src/middleware/__tests__/adminAuth.test.ts src/__tests__/fluid-compute-e2e.test.ts --runInBand`
- `npm audit --omit=dev --audit-level=critical`

The live smoke deployment was intentionally terminated after verification.
