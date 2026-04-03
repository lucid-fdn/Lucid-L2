# Session: Production Readiness Audit & Fixes — 2026-04-03

## Summary

Comprehensive audit and fix session preparing the Lucid L2 infrastructure for public release. Fixed critical database connectivity issues, applied missing migrations, resolved Metaplex identity registration failures, and hardened all background consumers.

## Issues Found & Fixed

### 1. ReceiptConsumer polling wrong database (P0 — Critical)

**Problem:** The `ReceiptConsumer` polled the L2 Supabase (`kwihlcnapmkaivijyiif`) for the `receipt_events` table, but that table lives in the gateway Supabase (`kkpgnldwrcagpgwofgqx`). This caused:
- `42P01` (undefined_table) errors every 5 seconds
- A new PG connection opened on every failed poll (connection leak)
- Zero receipt bridging from TrustGate to on-chain anchoring

**Fix:**
- Refactored `receiptConsumer.ts` to create its own dedicated `pg.Pool` using `PLATFORM_CORE_DB_URL` (matching the `AgentMirrorConsumer` pattern)
- Added exponential backoff (10s → 20s → 40s → ... → 5min cap) on persistent errors
- Updated `startup.ts` to guard consumer startup on `PLATFORM_CORE_DB_URL` being set
- Fixed the receipt retention cron to also use the gateway pool
- Added `PLATFORM_CORE_DB_URL` to `.env`

**Files:** `receiptConsumer.ts`, `startup.ts`, `.env`

### 2. AgentMirrorConsumer missing table + no backoff (P0 — Critical)

**Problem:** The `agent_created_events` table didn't exist in the gateway database. The consumer spammed `42P01` errors every 10 seconds with no backoff.

**Fix:**
- Created `agent_created_events` table + index in gateway Supabase (from migration `020_agent_system.sql`)
- Added exponential backoff to `agentMirrorConsumer.ts` (same pattern as ReceiptConsumer)

**Files:** `agentMirrorConsumer.ts`
**DB:** Gateway Supabase — `agent_created_events` table created

### 3. L2 database missing core tables (P0 — Critical)

**Problem:** The L2 Supabase was missing all core tables (`receipts`, `epochs`, `mmr_state`, `passports`, `anchor_records`, `deployments`, `memory_entries`, etc.). The migrations in `docs/legacy-infra/migrations/` had never been applied. All services fell back to in-memory storage, losing data on restart.

**Fix:** Applied all 14 migrations in dependency order:

| Migration | Tables/Changes |
|-----------|---------------|
| `20260302_receipts_and_epochs.sql` | `receipts`, `epochs`, `epoch_receipts` |
| `20260304_agent_system.sql` | `passports` extensions, `validation_results` |
| `20260306_payment_events.sql` | `payment_events`, `payment_epochs` |
| `20260306_validation_reputation.sql` | `reputation_feedback`, `reputation_validations` |
| `20260307_epoch_anchored_outbox.sql` | `epoch_anchored_events` |
| `20260307_reputation_provider_tables.sql` | Reputation provider tables |
| `20260308_payment_system.sql` | `asset_pricing`, `asset_revenue`, `payout_splits`, etc. |
| `20260310_escrow_tracking.sql` | `escrow_records` |
| `20260312_admin_audit_and_profiles.sql` | `admin_audit_log` |
| `20260312_epoch_retry_count.sql` | `epochs.retry_count` column |
| `20260313_memory_map.sql` | `memory_entries`, `memory_provenance`, `memory_sessions`, etc. |
| `20260313_memory_map_v2.sql` | Memory schema v2 extensions |
| `20260313_mmr_persistence.sql` | `mmr_state`, `mmr_nodes` |
| `20260314_memory_map_v3.sql` | Memory v3 indexes |
| `20260315_anchor_registry.sql` | `anchor_records` |
| `20260316_deployment_control_plane.sql` | `deployments`, `deployment_events` |
| `20260316_multi_tenant.sql` | `tenant_id` columns + indexes on all tables |

**DB:** L2 Supabase — all tables created

### 4. L2 database IPv6 connection refused (P1)

**Problem:** The direct Supabase host (`db.kwihlcnapmkaivijyiif.supabase.co`) resolved to an IPv6 address that refused connections. The PG pool had stale connections that worked, but new connections (from MMR/Epoch services) failed.

**Fix:** Switched `.env` from direct host to Supabase pooler:
```
POSTGRES_HOST=aws-1-eu-north-1.pooler.supabase.com
POSTGRES_PORT=6543
POSTGRES_USER=postgres.kwihlcnapmkaivijyiif
```

### 5. TrustGate/MCPGate/Oracle/Control-Plane missing DATABASE_URL (P0)

**Problem:** All 4 gateway services logged `[db] DATABASE_URL not set — DB features disabled`. The PM2 ecosystem config only passed `NODE_OPTIONS` — it never loaded the `.env` file.

**Fix:** Rewrote `ecosystem.config.cjs` to parse `.env` at load time and inject all vars into PM2's `env` object:
```javascript
const envVars = {};
for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) { ... }
env: { ...envVars, NODE_OPTIONS: '--dns-result-order=ipv4first' }
```

**Files:** `ecosystem.config.cjs` (platform-core)

### 6. Metaplex identity registration "Invalid Core Asset" (P0)

**Problem:** All agent passport identity projections to `mpl-agent-registry` failed with:
```
Program log: Checking PDA derivation for asset
Program log: Invalid Core Asset
custom program error: 0x4
```

**Root cause:** `@metaplex-foundation/mpl-agent-registry` v0.2.1 had a PDA derivation bug when validating Core assets.

**Fix:** Updated `mpl-agent-registry` from `0.2.1` → `0.2.4`. Retried all 3 failed passports with NFT mints via `POST /v1/passports/:id/projections/retry` — all succeeded.

**Files:** `packages/engine/package.json` (dependency bump)

## Final State

### Services (all healthy, zero errors)

| Service | Port | Status |
|---------|------|--------|
| lucid-offchain | 3001 | Healthy (DB 35ms, Redis 10ms) |
| trustgate | 4010 | Healthy (DB connected) |
| mcpgate | 4020 | Healthy |
| oracle | 4040 | Healthy |
| control-plane | 4030 | Healthy |
| telegram-bot | — | Healthy (13d uptime, 0 restarts) |

### Tests

- **109 suites, 1644 tests passed, 6 skipped, 0 failures**

### Solana Programs (6/6 deployed on devnet)

| Program | ID |
|---------|-----|
| thought_epoch | `8QXiFjguJT4PLVzH6BYNMHXZ3eLRaoF8cwx23EBc44Q6` |
| lucid_passports | `38yaXUezrbLyLDnAQ5jqFXPiFurr8qhw19gYnE6H9VsW` |
| gas_utils | `EzuUhxtNAz1eRfAPypm6eAepe8fRQBrBPSo4Qcp1w3hm` |
| lucid_agent_wallet | `AJGpTWXbhvdYMxSah6GAKzykvfkYo2ViQpWGMbimQsph` |
| lucid_zkml_verifier | `69cJRFGWijD1FdapQ2vz7VP6x2jcXRQyBws9VzzPpqAN` |
| lucid_reputation | `4FWEH1XQb7p1pU9r8Ap8xomDYVxdSdwk6fFT8XD63G3A` |

### Metaplex Identity

- **12/12 Solana-owner passports synced** with mpl-agent-registry
- 8 EVM-owner test passports correctly skipped (incompatible with Solana NFTs)

### Remaining non-blocking warnings

- `[sentry] No SENTRY_DSN` — error tracking not configured
- Redis password warning — cosmetic
- OpenAPI validator warnings in `openapi.yaml` — schema issue for blue-green deploy endpoint
- `ERR_ERL_KEY_GEN_IPV6` — express-rate-limit cosmetic warning

## Files Changed

### Lucid-L2

| File | Change |
|------|--------|
| `offchain/packages/engine/src/shared/jobs/receiptConsumer.ts` | Dedicated gateway pool + backoff |
| `offchain/packages/engine/src/shared/jobs/agentMirrorConsumer.ts` | Backoff on persistent errors |
| `offchain/packages/gateway-lite/src/startup.ts` | Guard consumers on PLATFORM_CORE_DB_URL, fix retention cron |
| `offchain/packages/engine/package.json` | mpl-agent-registry 0.2.1 → 0.2.4 |
| `offchain/package-lock.json` | Lock file update |

### lucid-plateform-core

| File | Change |
|------|--------|
| `ecosystem.config.cjs` | Auto-load .env into PM2 env injection |
