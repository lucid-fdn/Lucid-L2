# Telegram Deployment Bot — Deploy & Talk to Agents via @LucidAgents

**Date:** 2026-03-19
**Status:** Draft
**Repo:** lucid-plateform-core (modules/telegram-bot/)
**Depends on:** Lucid Layer API (POST /v1/agents/launch, GET /v1/passports)
**Goal:** Non-dev users deploy and interact with agents from Telegram. Same capabilities as CLI, Telegram-native UX.

---

## Problem

The CLI is great for developers but non-technical users won't open a terminal. Telegram is where they already are. The bot should let anyone deploy an agent and talk to it — zero terminal, zero Docker, zero code.

## Two Goals

**Goal 1: Deploy agents from Telegram**
```
User: /launch openclaw
Bot: [shows setup wizard with inline buttons]
Bot: ✓ Your agent is alive. t.me/LucidAgents?start=passport_abc123
```

**Goal 2: Talk to deployed agents via Telegram**
```
User opens deep link → messages bot
Bot routes message → agent's /run endpoint → response back
```

---

## Architecture

```
Telegram → webhook → platform-core/modules/telegram-bot/
  ├── /start passport_xxx → bind chat_id to agent → proxy messages
  ├── /launch <slug>      → inline keyboard wizard → call Layer API
  ├── /status <passport>  → call Layer API → format response
  ├── /list               → call Layer API → show user's agents
  ├── /terminate <passport> → call Layer API → confirm + terminate
  ├── /help               → show commands
  └── regular message     → lookup binding → proxy to agent /run → reply
```

**Layer API calls (already exist):**
```
POST /v1/agents/launch          ← deploy agent
GET  /v1/passports?type=tool    ← list skills
GET  /v1/passports?owner=X      ← list user's agents
POST /v1/agents/:id/terminate   ← terminate
GET  /v1/agents/:id/status      ← status
```

---

## Telegram Launch Wizard

Same steps as CLI, but with inline keyboard buttons:

### Step 1: Agent Selection
```
User: /launch

Bot: ◈ Lucid · Internet of AI

     Choose an agent to deploy:

     [Base Runtime]  [Trading Analyst]
     [Code Reviewer] [OpenClaw]
```

### Step 2: Intelligence
```
Bot: How should your agent think?

     [Lucid Gateway (no key)] [Own API Key]
```

If own key → bot asks user to type it (text message, not button).

### Step 3: Channels
```
Bot: Where should people reach your agent?

     [✓ This chat] [Skip other channels]
```

Default: the current Telegram chat is automatically connected.

### Step 4: Skills (if applicable)
```
Bot: Select skills:

     [GitHub] [Notion] [Browser]
     [PDF]    [Voice]  [More...]
```

### Step 5: Confirm
```
Bot: Ready to bring your agent to life?

     Identity:     On-chain passport
     Wallet:       Auto-created
     Intelligence:  Lucid Gateway
     Channel:      This Telegram chat

     [Launch] [Cancel]
```

### Step 6: Result
```
Bot: ◈ Welcome to the Internet of AI.

     Your agent is alive.
     It can think, act, earn, and prove —
     autonomously, on-chain, 24/7.

     Just send a message to start talking.
```

After launch, all subsequent messages in this chat route to the agent.

---

## Data Model

### ChatBinding (Supabase table: `telegram_chat_bindings`)
```sql
CREATE TABLE telegram_chat_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL,
  agent_passport_id TEXT NOT NULL,
  deployment_url TEXT,
  status TEXT DEFAULT 'active', -- active | paused | terminated
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(telegram_chat_id)
);
```

### WizardState (Redis, TTL 30 min)
```json
{
  "chat_id": "123456",
  "step": "intelligence",
  "agent_slug": "openclaw",
  "env_vars": {},
  "channels": [],
  "skills": []
}
```

Wizard state is ephemeral — stored in Redis during the multi-step flow, deleted after launch or timeout.

---

## Module Structure (platform-core)

```
modules/telegram-bot/
  index.ts              — register webhook, init bot
  webhook.ts            — POST handler, parse updates
  commands/
    launch.ts           — /launch wizard (inline keyboards + callbacks)
    status.ts           — /status <passport>
    list.ts             — /list user's agents
    terminate.ts        — /terminate <passport>
    help.ts             — /help
  router.ts             — message → agent routing (chat_id → passport → proxy)
  bindings.ts           — CRUD for telegram_chat_bindings
  wizard.ts             — multi-step wizard state machine (Redis)
  layer-client.ts       — HTTP client for Lucid Layer API calls
  keyboards.ts          — reusable inline keyboard builders
```

---

## Layer Client

Thin HTTP client that calls the Lucid Layer API:

```typescript
class LayerClient {
  constructor(private apiUrl: string, private apiKey: string) {}

  async launch(opts: { mode: string; image?: string; model?: string; ... }): Promise<LaunchResult>
  async status(passportId: string): Promise<DeploymentStatus>
  async list(owner: string): Promise<Passport[]>
  async terminate(passportId: string): Promise<void>
  async getSkills(provider: string): Promise<ToolPassport[]>
  async getCatalog(): Promise<CatalogAgent[]>
}
```

---

## User Identity

How does the bot know which Lucid account a Telegram user belongs to?

**Option A: Telegram user ID as owner** — simple, no login needed. Bot generates a wallet address from Telegram user ID. No Lucid account required.

**Option B: Lucid login via deep link** — user clicks `t.me/LucidAgents?start=login_<token>`, bot binds Telegram user to Lucid account. Full identity.

**V1: Option A.** Generate a deterministic wallet address from Telegram user ID. No friction. Users can link to a Lucid account later.

---

## Migration from LucidMerged

The existing LucidMerged webhook handler (`api/webhooks/telegram/hosted/route.ts`) has:
- `/start <token>` handling with connect token consumption
- Chat binding via `upsertHostedTelegramChannel`
- Inbound event insertion + worker trigger
- Webhook secret verification

This logic migrates to `modules/telegram-bot/` in platform-core. The LucidMerged route becomes a thin proxy or is deprecated.

---

## Implementation Phases

### Phase 1: Basic bot + message routing
1. Create `modules/telegram-bot/` in platform-core
2. Webhook handler with secret verification
3. `/start passport_xxx` → create chat binding
4. Regular messages → lookup binding → proxy to agent `/run` → reply
5. `/help` command

### Phase 2: Launch wizard
6. `/launch` → show catalog with inline buttons
7. `/launch <slug>` → start wizard
8. Multi-step wizard with Redis state
9. Call Layer API `POST /v1/agents/launch`
10. Auto-bind launched agent to current chat

### Phase 3: Management commands
11. `/status <passport>` → deployment status
12. `/list` → user's agents
13. `/terminate <passport>` → confirm + terminate

### Phase 4: Enrichment
14. Skills selection via inline buttons
15. Lucid account linking (Option B)
16. Rich responses with agent cards

---

## Env Vars (platform-core)

```
TELEGRAM_BOT_TOKEN=<@LucidAgents bot token>
TELEGRAM_WEBHOOK_SECRET=<random secret>
TELEGRAM_WEBHOOK_URL=https://cloud.lucid.foundation/webhooks/telegram
LUCID_LAYER_API_URL=https://api.lucid.foundation
LUCID_LAYER_API_KEY=<admin key for Layer API>
REDIS_URL=<for wizard state>
```

---

## Test Plan

- [ ] `/start passport_xxx` → binds chat to agent, confirms
- [ ] Message in bound chat → proxied to agent /run → response returned
- [ ] `/launch` → shows agent catalog buttons
- [ ] Tap agent → wizard starts with intelligence step
- [ ] Complete wizard → agent deployed → chat bound
- [ ] Send message → agent responds
- [ ] `/status passport_xxx` → shows deployment info
- [ ] `/list` → shows user's agents
- [ ] `/terminate passport_xxx` → confirms and terminates
- [ ] `/help` → shows all commands
- [ ] Webhook secret mismatch → silently rejected
- [ ] Unknown chat (no binding) → helpful message
