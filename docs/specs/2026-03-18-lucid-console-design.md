# Lucid Console — Bundled Operator Dashboard for L2 Docker

**Date**: 2026-03-18
**Status**: Approved
**Author**: Claude + DaishizenSensei

## Summary

Add a bundled Next.js operator dashboard ("Lucid Console") to the L2 Docker deployment. Ships as a third service in docker-compose alongside postgres and api. Gives operators immediate visual access to passports, deployments, memory, receipts, epochs, anchoring, and system health without needing to understand the REST API.

## Motivation

L2 currently ships as a backend-only Docker (Express on port 3001). Operators must read API docs, use curl, or build their own UI to understand what's running. This creates a comprehension gap that slows adoption.

Industry standard for self-hosted infra products (Supabase, Grafana, Temporal, Dagster) is to ship a default control surface. API for integration, UI for discovery/debugging/ops.

The console is **not** a clone of the Lucid platform-core SaaS. It is a local-first, single-instance, operator-focused tool for running and understanding the L2 protocol.

## Architecture

```
Lucid-L2/
├── console/                    # NEW — Next.js operator dashboard
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx      # Root: dark mode, Geist font, sidebar
│   │   │   ├── page.tsx        # Dashboard (health + stats)
│   │   │   ├── passports/      # Passport CRUD
│   │   │   ├── models/         # Model listing + availability
│   │   │   ├── deployments/    # Agent deployment status + events
│   │   │   ├── memory/         # Memory explorer (6 types + recall)
│   │   │   ├── receipts/       # Epoch list + receipt detail
│   │   │   ├── anchoring/      # DePIN storage status
│   │   │   └── config/         # Provider status + feature flags
│   │   ├── lib/
│   │   │   └── api.ts          # Fetch wrapper for L2 API
│   │   ├── components/
│   │   │   ├── ui/             # shadcn/ui primitives
│   │   │   ├── nav/            # Sidebar navigation
│   │   │   └── shared/         # StatusDot, DataTable, JsonViewer, etc.
│   │   └── config/
│   │       └── nav.ts          # Navigation definition
│   └── .env.example            # LUCID_API_URL=http://localhost:3001
│
├── docker-compose.yml          # MODIFIED — add console service
├── Dockerfile                  # UNCHANGED — API
└── offchain/                   # UNCHANGED — API source
```

### Communication

Console → L2 API uses **Next.js API route proxy** pattern to solve Docker networking:

- Browser makes requests to the console itself: `GET /api/proxy/health`
- Console's Next.js Route Handler forwards to L2: `GET http://api:3001/health`
- The server-side env var `LUCID_API_URL` (not `NEXT_PUBLIC_`) resolves Docker-internal hostname `api:3001`
- For local dev (no Docker), `LUCID_API_URL` defaults to `http://localhost:3001`

This avoids the split-brain problem where `NEXT_PUBLIC_*` vars get baked into client JS at build time and the browser cannot resolve Docker-internal hostnames.

The proxy is a single catch-all Route Handler (`app/api/proxy/[...path]/route.ts`, ~30 lines) that forwards requests to `LUCID_API_URL`. All client-side fetches go through `/api/proxy/...`.

All L2 responses use the `{ success, error }` envelope — **except `/health`** which returns `{ status, timestamp, uptime, ... }` directly. The client-side fetch wrapper handles both shapes.

### Authentication

**v1: No auth (local operator mode).** Console runs on localhost alongside L2. No login screen.

L2's core read-only routes (passports, epochs, receipts, anchors, memory, models, health) **do not currently use Privy JWT auth** — auth middleware is only applied selectively on OAuth, wallet, revenue, deploy, and payment-write routes. The console only consumes unauthenticated endpoints, so **no L2 auth changes are needed for v1**.

CORS already allows `localhost:3000` via existing `CORS_ALLOWED_ORIGINS` env var.

## Modules (v1 Scope)

8 pages. All read-heavy. Only Passports has write operations.

### Dashboard (`/`)

**Endpoints**: `GET /health`, `GET /v1/passports/stats`

Note: `/health` returns `{ status, timestamp, uptime, version, dependencies }` directly (no `{ success }` wrapper). The `/v1/passports/stats` endpoint returns aggregated counts by type and status.

System overview:
- Status card: healthy/degraded/down with color indicator
- Dependency health: DB, Redis, Nango — each with status + latency
- Uptime + version
- Passport count summary by type (model/compute/tool/agent/dataset)
- Auto-refresh every 10s
- Empty state: "L2 is running. Create your first passport to get started."

### Passports (`/passports`)

**Endpoints**: `GET /v1/passports`, `POST /v1/passports`, `GET /v1/passports/:id`

- Filterable table by type (model/compute/tool/agent/dataset) and status (active/deprecated/revoked)
- Badge per passport type
- Click row to view detail (full metadata as collapsible JSON)
- Create new passport dialog (type selector, name, metadata fields)

### Models (`/models`)

**Endpoints**: `GET /v1/models`, `GET /v1/models?available=true`

- Model listing table with availability status
- Filter: available / unavailable / all (tri-state)
- Shows compute status per model (format, runtime, whether healthy compute exists)

### Deployments (`/deployments`)

**Endpoints**: `GET /v1/passports?type=agent`, `GET /v1/agents/:passportId/events`

- Agent-only passport list with deployment status (pending/deploying/running/stopped/failed)
- Status dot: green (running), yellow (pending/deploying), red (failed/stopped)
- Click agent to see event timeline (created, succeeded, failed, terminated, health_changed)
- Event list is append-only audit log

### Memory (`/memory`)

**Endpoints**: `GET /v1/memory/health`, `POST /v1/memory/recall`, `POST /v1/memory/verify`

- Store health diagnostics card (store type, capabilities, status)
- Test recall form: enter query text, optional agent_passport_id, see ranked results with scores
- Hash chain verification: button per agent, shows integrity status
- Tabs for 6 memory types (episodic, semantic, procedural, entity, trust-weighted, temporal) — informational, showing type descriptions only (no per-type counts in v1 — no endpoint returns them)

### Receipts & Epochs (`/receipts`)

**Endpoints**: `GET /v1/epochs`, `GET /v1/receipts/:receipt_id`

Note: `GET /v1/receipts` (list endpoint) does not exist. Only `GET /v1/receipts/:receipt_id`. Design is epochs-first.

- Epoch list as primary view (newest first, server-side paginated via `page`/`per_page` params)
- Each epoch shows: finalization status, receipt count, on-chain anchor link, timestamp
- Receipt lookup by ID: search box where operator enters a receipt_id to view detail
- Individual receipt detail: tokens_in/out, model_passport_id, compute_passport_id, receipt_hash, policy_hash
- No epoch-to-receipt drill-down in v1 (no backing endpoint). Future: add `GET /v1/epochs/:id/receipts` to L2.

### Anchoring (`/anchoring`)

**Endpoints**: `GET /v1/anchors?agent_passport_id=X`, `GET /v1/anchors/:id/lineage`, `POST /v1/anchors/:id/verify`

Note: anchor list endpoint requires `agent_passport_id` query param.

- Agent selector at top (dropdown fetched from `GET /v1/passports?type=agent`)
- Anchor registry table: artifact type, CID, provider, storage tier, timestamp
- Lineage list: click anchor to see parent chain as a flat ordered list (tree visualization deferred to v2)
- Verify button per anchor (checks CID still exists on DePIN provider)

### Config (`/config`)

**Endpoints**: `GET /health`, `GET /v1/config/payment`

- Read-only view. No writes.
- Detected providers section: storage (Arweave/Lighthouse/mock), NFT (Token2022/MetaplexCore/EVM/mock), token launcher, memory store
- Payment config: x402 settings, revenue split ratios, facilitator type
- Feature flags: derived from health response (what's enabled/disabled)

## UI Kit

### Extracted from LucidMerged (copied standalone)

These components are copied into the console as standalone files. No import dependency back to LucidMerged.

- `SecondaryNav` → simplified as `Sidebar` (desktop sidebar + mobile Sheet drawer)
- `FormField`, `FormSection`, `FormActions`, `FormMessage` — form primitives (used for Passport create)
- shadcn/ui primitives: Card, Table, Badge, Button, Input, Select, Dialog, Tabs, Separator, Tooltip, Sheet, Skeleton, Label, Textarea, ScrollArea, DropdownMenu

### New Shared Components

| Component | Purpose |
|-----------|---------|
| `StatusDot` | Green/yellow/red circle for health states |
| `DataTable` | Client-side sortable/filterable table wrapping shadcn Table |
| `JsonViewer` | Collapsible JSON tree for passport metadata, receipt detail |
| `RefreshButton` | Manual refresh + auto-refresh toggle (10s/30s/off) |
| `EmptyState` | Icon + message placeholder ("No passports yet") |
| `ErrorBanner` | Connection error with retry button |
| `StatCard` | Number + label for dashboard counts |
| `TimeAgo` | Relative timestamps ("2m ago") |
| `CopyButton` | Click-to-copy for hashes, CIDs, passport IDs |

### Styling

- Dark mode default (operator tool aesthetic)
- Geist Sans for UI text, Geist Mono for hashes/IDs/code
- Zinc/neutral palette with single accent color
- Matches LucidMerged quality but is visually distinct (no Lucid SaaS branding)

## API Client

Two files:

### Server-side proxy (`app/api/proxy/[...path]/route.ts`)

Catch-all Route Handler that forwards requests to L2. Reads `LUCID_API_URL` (server-side only, no `NEXT_PUBLIC_` prefix) at runtime.

```typescript
// Resolved at runtime in Route Handlers (not baked at build time)
const API_URL = process.env.LUCID_API_URL || 'http://localhost:3001'

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const apiPath = '/' + path.join('/')
  const url = new URL(req.url)
  const res = await fetch(`${API_URL}${apiPath}${url.search}`)
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const apiPath = '/' + path.join('/')
  const body = await req.text()
  const res = await fetch(`${API_URL}${apiPath}`, { method: 'POST', body, headers: { 'content-type': 'application/json' } })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
}
```

### Client-side wrapper (`lib/api.ts`)

All client components call the local proxy, not L2 directly.

```typescript
export async function lucidApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  const json = await res.json()
  // /health returns { status, ... } directly (no success wrapper)
  if ('success' in json && !json.success) throw new Error(json.error || `API error: ${res.status}`)
  return json
}

export const lucidGet = <T>(path: string) => lucidApi<T>(path)
export const lucidPost = <T>(path: string, body: unknown) =>
  lucidApi<T>(path, { method: 'POST', body: JSON.stringify(body) })
```

## Docker Integration

### docker-compose.yml addition

```yaml
console:
  build:
    context: ./console
    dockerfile: Dockerfile
  restart: unless-stopped
  depends_on:
    - api
  ports:
    - "${CONSOLE_PORT:-3000}:3000"
  environment:
    - LUCID_API_URL=http://api:3001
```

### Console Dockerfile

Standard Next.js standalone output multi-stage build:
- Stage 1 (builder): `node:20-alpine`, `npm ci`, `npm run build`
- Stage 2 (runner): `node:20-alpine`, copy standalone output, non-root user, expose 3000

### Developer Experience

```bash
# Start everything
docker compose up

# Open browser
# http://localhost:3000  → Console dashboard
# http://localhost:3001  → API (existing)
# http://localhost:3001/api/docs  → Swagger UI (existing)
```

## L2 Changes Required

**Zero changes for v1.** The core read-only routes the console consumes (passports, models, epochs, receipts, anchors, memory, health, config/payment) do not use Privy JWT auth. Auth middleware is only applied to OAuth, wallet, revenue, deploy-write, and payment-write routes. CORS already allows `localhost:3000`.

The only L2 modification is adding the `console` service to `docker-compose.yml`.

### Pagination

L2 supports server-side offset pagination (`page`, `per_page` query params) on passports, epochs, and models. The console uses this directly — no client-side pagination over unpaginated fetches.

### Error Handling

All pages handle three states: loading (skeleton), data (normal render), error (connection failed / API error). When the API is unreachable, the dashboard shows a connection error banner with retry button. Individual page errors show inline with the `EmptyState` component variant for errors.

Root `loading.tsx` provides a Suspense boundary for navigation transitions. Root `error.tsx` provides an error boundary with retry.

## Tech Stack

| Concern | Choice | Reason |
|---------|--------|--------|
| Framework | Next.js 15 (App Router) | Matches LucidMerged, SSR not needed but good DX |
| Styling | Tailwind CSS 4 + shadcn/ui | Matches LucidMerged, operator-quality UI |
| Fonts | Geist Sans + Geist Mono | Standard for Vercel ecosystem tools |
| State | React state + fetch (no SWR/React Query) | Simple enough for v1, pages are mostly read-only |
| Build | Turbopack (dev), Next.js standalone (prod) | Fast dev, small Docker image |

## What This Is NOT

- Not a clone of platform-core (multi-tenant SaaS)
- Not a user-facing product UI
- Not authenticated in v1 (local operator mode)
- Not a replacement for the Swagger UI at `/api/docs`
- Not a monitoring/alerting system (use Grafana/Datadog for that)

## Future (Not v1)

- Auth via API key or Privy (if console exposed publicly)
- Compute node registry view (heartbeat status, hardware specs)
- Receipt creation form (for testing)
- Memory write forms (add episodic/semantic entries)
- WebSocket live updates (currently polling)
- Reputation explorer
- Payment/billing views
- Epoch-to-receipt drill-down (requires `GET /v1/epochs/:id/receipts` in L2)
- Anchoring lineage tree visualization (v1 uses flat list)
