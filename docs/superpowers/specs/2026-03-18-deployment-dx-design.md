# Deployment DX — One-Click Launch for Layer + Cloud

**Date:** 2026-03-18
**Status:** Draft
**Goal:** Make `lucid launch` work with zero provider configuration. Layer users connect providers locally. Cloud users authenticate once and Lucid manages everything.

---

## Problem

Today, deploying an agent requires manual provider credentials:
- Get Railway API token from dashboard
- Set `RAILWAY_API_TOKEN` env var
- Set `RAILWAY_PROJECT_ID` env var
- Then run `lucid launch`

This is 4 steps before a single agent runs. Competitors (Vercel, Railway, Render) are one command after login. We must match that DX.

---

## Design

### Two Paths, One Command

```
lucid launch --image my-agent:latest
  → CLI auto-detects:
    1. Local provider credentials exist? → Layer (direct API call)
    2. Lucid Cloud account authenticated? → Cloud (managed, Railway behind the scenes)
    3. Neither? → "Run 'lucid login' or 'lucid provider add railway'"
```

User never thinks about which path. CLI figures it out.

### `lucid login` — Identity vs Cloud Entitlement

`lucid login` authenticates the user to their **Lucid account**. This is identity, not deployment:
- **All users** get: receipts, passports, identity, reputation, SDK access
- **Cloud-entitled users** additionally get: managed deployment, `*.lucid.run` domains, billing

Layer-only users can and should `lucid login` for receipts/identity even if they never use Cloud. Login does not imply Cloud.

### Lucid Layer (Open Source — Self-Hosted)

**User manages their own provider accounts.** Credentials stored locally in `~/.lucid/credentials.json`. Never sent to Lucid servers.

**CLI commands:**
```bash
lucid login                          # Browser OAuth → Lucid account (for receipts/identity)
lucid login --token lk_...          # CI/headless
lucid provider add railway           # Browser OAuth (Railway supports it)
lucid provider add akash             # Prompts "Enter your Akash API key:"
lucid provider add phala             # Prompts "Enter your Phala API key:"
lucid provider add ionet             # Prompts "Enter your io.net API key:"
lucid provider add nosana            # Prompts "Enter your Nosana API key:"
lucid provider list                  # Shows connected providers
lucid provider remove railway        # Removes stored credential
```

**Credential storage:** `~/.lucid/credentials.json` (chmod 600)

```json
{
  "lucid": {
    "api_url": "https://api.lucid.foundation",
    "token": "lk_...",
    "expires_at": "2026-04-18T00:00:00Z"
  },
  "providers": {
    "railway": { "token": "rl_...", "method": "oauth", "connected_at": "2026-03-18T..." },
    "akash": { "key": "ak_...", "method": "manual", "connected_at": "2026-03-18T..." }
  }
}
```

**Auth methods per provider:**

| Provider | Method | Flow |
|---|---|---|
| Railway | OAuth | Browser opens → Railway OAuth → callback to localhost → token saved |
| Akash | API key | CLI prompts → user pastes key from Akash Console dashboard |
| Phala | API key | CLI prompts → user pastes key from Phala Cloud dashboard |
| io.net | API key | CLI prompts → user pastes key from io.net dashboard |
| Nosana | API key | CLI prompts → user pastes key from Nosana dashboard |

**Launch flow (Layer path):**
```
lucid launch --target railway --image my-agent:latest
  1. Load ~/.lucid/credentials.json
  2. Find providers.railway.token
  3. Call RailwayDeployer.deploy() with user's token
  4. Return deployment URL
```

### Lucid Cloud (Managed — Proprietary)

**User authenticates with Lucid once. Lucid deploys on their behalf using fleet provider accounts.** User never sees Railway/Akash/Phala.

**Provider routing (internal, user never sees):**

| User request | Lucid Cloud routes to | Why |
|---|---|---|
| `lucid launch --image x` | Railway | Default, fastest, cheapest for CPU |
| `lucid launch --image x --gpu` | Akash | Cheapest decentralized GPU |
| `lucid launch --image x --tee` | Phala | Confidential compute (TEE) |

**V1 providers:** Railway (default) + Akash (GPU). Add Phala/io.net/Nosana when users request.

**Cloud API (in lucid-plateform-core):**

```
POST /v1/cloud/deploy
  Headers: Authorization: Bearer lk_...
  Body: {
    image: "ghcr.io/myorg/my-agent:latest",
    name: "my-agent",
    gpu?: boolean,
    tee?: boolean,
    env_vars?: Record<string, string>,
    // For base runtime:
    model?: "gpt-4o",
    prompt?: "You are...",
    tools?: ["web-search"]
  }
  Response: {
    success: true,
    passport_id: "passport_abc123",
    deployment_id: "deploy_xyz",
    url: "https://passport-abc123.lucid.run",
    provider: "lucid-cloud"
  }

GET /v1/cloud/deployments
  → List user's agents

GET /v1/cloud/deployments/:id
  → Status, URL, health, logs URL

GET /v1/cloud/deployments/:id/logs
  → Stream logs from underlying provider

DELETE /v1/cloud/deployments/:id
  → Terminate agent

PATCH /v1/cloud/deployments/:id/scale
  → Scale replicas (if provider supports)
```

**Fleet architecture:**

```
Lucid Cloud (platform-core)
  ├── Deployment Gateway (modules/deployment-gateway/)
  │   ├── router.ts          — GPU? → Akash. Default? → Railway.
  │   ├── vault.ts           — Fleet credentials (encrypted, env-based)
  │   ├── domains.ts         — *.lucid.run subdomain per agent
  │   └── proxy.ts           — Delegates to Layer deployers
  │
  ├── Billing (modules/billing/)
  │   ├── metering.ts        — Track uptime + compute per deployment
  │   └── stripe.ts          — User pays Lucid via Stripe
  │
  └── Fleet Accounts (ops, not code)
      ├── Railway: Team plan, one project per user namespace
      └── Akash: One wallet, funded with USDC
```

**Isolation model:**
- Railway: one service per agent, all under Lucid's team project
- Akash: one deployment (dseq) per agent, all under Lucid's wallet
- User env vars isolated per service/deployment
- Logs isolated per service/deployment
- Networking isolated (each agent gets its own URL)

**Billing:**
- Lucid meters uptime per deployment (minutes)
- User pays Lucid (Stripe subscription or usage-based)
- Lucid pays Railway/Akash from fleet accounts
- Margin = Lucid Cloud revenue

**Cloud value beyond provider abstraction** (what makes it worth paying for):
- Managed `*.lucid.run` domains (instant, no DNS config)
- Unified logs across all agents (single dashboard)
- Receipts always on (auto-configured, no user setup)
- Smart provider routing (GPU→Akash, default→Railway, future: cost/latency optimization)
- Deployment history + one-click rollback
- Policy/security defaults (rate limits, auth)
- Reputation-aware routing (future: higher-reputation agents get priority)
- One-click scale/terminate across providers
- Billing abstraction (one invoice, not 6 provider bills)

**Risk to avoid:** Cloud must not become "just a hidden wrapper around Railway." The operational value listed above is what justifies the managed tier.

**Credential storage roadmap:**
- v1: `~/.lucid/credentials.json` (chmod 600, file-based)
- v2: OS keychain (macOS Keychain, Windows Credential Manager, Linux libsecret)

### CLI Unified Flow

**Explicit mode override:** `--mode layer|cloud` always wins. Auto-detect only when `--mode` is omitted.

**Explicit `--target` is never silently redirected.** If user says `--target railway` and has no local Railway credential, fail clearly — don't send to Cloud.

```typescript
// Launch resolution logic (deterministic, no magic)
async function resolveLaunchPath(opts) {
  const creds = loadCredentials();

  // 1. Explicit --mode always wins
  if (opts.mode === 'layer') {
    if (!opts.target) return { path: 'error', message: '--mode layer requires --target' };
    if (!creds.providers?.[opts.target]) {
      return { path: 'error', message: `${opts.target} not connected. Run: lucid provider add ${opts.target}` };
    }
    return { path: 'layer', provider: opts.target, token: creds.providers[opts.target] };
  }
  if (opts.mode === 'cloud') {
    if (!creds.lucid?.token) return { path: 'error', message: 'Not logged in. Run: lucid login' };
    return { path: 'cloud', token: creds.lucid.token };
  }

  // 2. Explicit --target with local credential → Layer (never redirect to Cloud)
  if (opts.target && creds.providers?.[opts.target]) {
    return { path: 'layer', provider: opts.target, token: creds.providers[opts.target] };
  }

  // 3. Explicit --target WITHOUT local credential → fail clearly
  if (opts.target && !creds.providers?.[opts.target]) {
    return { path: 'error', message: `${opts.target} not connected locally. Run: lucid provider add ${opts.target}\nOr omit --target to use Lucid Cloud.` };
  }

  // 4. No --target, Cloud auth exists → Cloud
  if (creds.lucid?.token) {
    return { path: 'cloud', token: creds.lucid.token };
  }

  // 5. No --target, no Cloud auth, one local provider → Layer with that provider
  const localProviders = Object.keys(creds.providers || {});
  if (localProviders.length === 1) {
    return { path: 'layer', provider: localProviders[0], token: creds.providers![localProviders[0]] };
  }

  // 6. Nothing → guide user
  return { path: 'error', message: 'Not authenticated.\n  lucid login                    # Managed deployment (recommended)\n  lucid provider add railway     # Self-hosted with your own account' };
}
```

**Normalized launch result (identical for both paths):**

```typescript
interface LaunchOutput {
  passport_id: string;
  deployment_id: string;
  url: string;
  mode: 'layer' | 'cloud';
  provider: string;          // 'railway' | 'akash' | 'lucid-cloud'
  receipts: boolean;
  verification: 'full' | 'minimal';
}
```

**First-time user experience (Cloud — recommended path):**

```bash
$ npm install -g @lucid-fdn/cli
$ lucid launch --image my-agent:latest
  ✗ Not authenticated. Choose one:
    lucid login                    # Managed deployment (recommended)
    lucid provider add railway     # Self-hosted with your own account

$ lucid login
  Opening browser... https://lucid.foundation/auth/cli
  ✓ Authenticated as kevin@raijinlabs.io
  ✓ Token saved to ~/.lucid/credentials.json

$ lucid launch --image my-agent:latest
  ✓ Passport created: passport_abc123
  ✓ Deploying to Lucid Cloud...
  ✓ Live at https://passport-abc123.lucid.run
  ✓ Receipts: enabled
```

**Explicit mode override (for CI, debugging, predictability):**

```bash
lucid launch --image my-agent:latest --mode cloud       # Force Cloud path
lucid launch --image my-agent:latest --mode layer --target railway  # Force Layer
```

**First-time user experience (Layer — self-hosted):**

```bash
$ lucid provider add railway
  Opening browser... https://railway.app/authorize?client_id=lucid
  ✓ Railway connected
  ✓ Saved to ~/.lucid/credentials.json

$ lucid launch --target railway --image my-agent:latest
  ✓ Passport created: passport_abc123
  ✓ Deploying to Railway (your account)...
  ✓ Live at https://my-agent.up.railway.app
  ✓ Receipts: enabled
```

---

## What Goes Where

| Component | Repo | Path |
|---|---|---|
| `lucid login` (OAuth + token) | Lucid Layer | `src/cli/auth.ts` |
| `lucid provider add/list/remove` | Lucid Layer | `src/cli/providers.ts` |
| `~/.lucid/credentials.json` management | Lucid Layer | `src/cli/credentials.ts` |
| Auto-detect (local vs Cloud) | Lucid Layer | `src/cli/launch-resolver.ts` |
| Layer deployers | Lucid Layer | `engine/src/compute/providers/` (already built) |
| `POST /v1/cloud/deploy` | Lucid Cloud | `modules/deployment-gateway/` |
| Fleet credential vault | Lucid Cloud | `modules/deployment-gateway/vault.ts` |
| Provider routing (GPU→Akash) | Lucid Cloud | `modules/deployment-gateway/router.ts` |
| `*.lucid.run` domains | Lucid Cloud | `modules/deployment-gateway/domains.ts` |
| Usage metering | Lucid Cloud | `modules/billing/metering.ts` |
| Stripe billing | Lucid Cloud | `modules/billing/stripe.ts` |

## Implementation Order

### Phase 1: Foundation (Lucid Layer)
1. `credentials.ts` — read/write `~/.lucid/credentials.json`
2. `auth.ts` — `lucid login` (browser OAuth + `--token` fallback)
3. `launch-resolver.ts` — auto-detect Layer vs Cloud vs error

### Phase 2: Cloud API (Lucid Cloud)
4. `deployment-gateway/router.ts` — route to Railway (default) or Akash (GPU)
5. `deployment-gateway/proxy.ts` — delegate to Layer deployers with fleet credentials
6. `deployment-gateway/vault.ts` — encrypted fleet credentials from env vars
7. `POST /v1/cloud/deploy` route + `GET /deployments` + `DELETE`
8. `domains.ts` — `*.lucid.run` subdomain per agent (Railway custom domains API)

### Phase 3: Provider Management (Lucid Layer)
9. `providers.ts` — `lucid provider add` (OAuth for Railway, key prompt for others)
10. Wire local credentials into deployer calls

### Phase 4: Billing (Lucid Cloud)
11. `metering.ts` — uptime tracking per deployment
12. `stripe.ts` — usage-based billing

---

## Test Plan

- [ ] `lucid login` → opens browser → token saved to `~/.lucid/credentials.json`
- [ ] `lucid login --token lk_...` → token saved without browser
- [ ] `lucid provider add railway` → OAuth flow → token saved
- [ ] `lucid provider add akash` → prompts for key → saved
- [ ] `lucid provider list` → shows connected providers
- [ ] `lucid launch --image x` with no auth → clear error with instructions
- [ ] `lucid launch --image x` with Cloud auth → deploys via Cloud API
- [ ] `lucid launch --target railway --image x` with local Railway token → deploys directly
- [ ] `lucid launch --image x --gpu` via Cloud → routes to Akash
- [ ] Cloud deploy returns `*.lucid.run` URL
- [ ] Cloud deploy creates passport + enables receipts
- [ ] Terminate via `lucid terminate` works for both paths
- [ ] `LUCID_API_KEY` env var works in CI (no browser needed)
