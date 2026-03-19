# Skills Selection + Telegram Deployment Bot

**Date:** 2026-03-19
**Status:** Draft
**Goal:** (1) Let users select and configure skills during agent launch, auto-installed at startup. (2) Deploy agents via Telegram with same UX as CLI.

---

## Feature 1: Skills Selection at Launch

### Problem

OpenClaw has 60+ skills via ClawHub but our launch flow doesn't let users pick any. After deployment, installing skills requires `docker exec` — bad DX.

### Design

#### Manifest Extension

```yaml
# manifest.yaml
skills:
  bundled:                          # Always installed
    - web-search
    - memory
  optional:                         # User chooses during setup
    - slug: firecrawl
      display_name: "Web Scraping"
      description: "Crawl and scrape websites"
      env: FIRECRAWL_API_KEY
      env_description: "Firecrawl API key (firecrawl.dev)"
    - slug: github
      display_name: "GitHub Integration"
      description: "Read/write repos, issues, PRs"
      env: GITHUB_TOKEN
      env_description: "GitHub personal access token"
    - slug: browser
      display_name: "Browser Automation"
      description: "Navigate, click, extract from web pages"
    - slug: pdf
      display_name: "PDF Processing"
      description: "Read, extract, and analyze PDF files"
```

#### CLI Flow (inside clack wizard)

After Step 3 Capabilities, add Step 3b Skills:

```
  Step 3b · Skills

  Select skills to install:

    ☑ web-search (included)
    ☑ memory (included)
    ☐ firecrawl — Web Scraping (needs API key)
    ☐ github — GitHub Integration (needs token)
    ☐ browser — Browser Automation
    ☐ pdf — PDF Processing

  Search ClawHub: _____________

  → Searching "trading"...
    ☐ trading-signals — Real-time trading signals
    ☐ portfolio-tracker — Portfolio management
```

If a selected skill requires an env var, prompt for it immediately:
```
  firecrawl selected — requires FIRECRAWL_API_KEY:
  FIRECRAWL_API_KEY (firecrawl.dev): fk_...
```

#### ClawHub Search

The CLI fetches available skills from ClawHub API (if available) or a static catalog. Users can search by name/keyword:

```typescript
// Fetch from ClawHub or fallback catalog
const skills = await fetch('https://clawhub.com/api/v1/skills?q=trading').then(r => r.json());
```

If ClawHub API is unavailable, show only manifest-declared skills (no search).

#### Entrypoint Installation

The entrypoint.sh installs selected skills at container startup:

```bash
# Skills installation (from LUCID_SKILLS env var)
if [ -n "$LUCID_SKILLS" ]; then
  IFS=',' read -ra SKILLS <<< "$LUCID_SKILLS"
  for skill in "${SKILLS[@]}"; do
    echo "[Lucid] Installing skill: $skill"
    clawhub install "$skill" 2>/dev/null || echo "[Lucid] Skill $skill not found in ClawHub"
  done
fi
```

Selected skills passed as `LUCID_SKILLS=firecrawl,github,browser` env var.

#### Post-Launch Skill Management

```bash
lucid agent skills add passport_abc123 firecrawl
lucid agent skills remove passport_abc123 github
lucid agent skills list passport_abc123
```

These exec into the running container. Future: API-based without exec.

---

## Feature 2: Telegram Deployment Bot

### Problem

CLI requires a terminal. Many users (especially non-devs) don't use terminals. Telegram is where they already are.

### Design

#### Same Bot, Two Modes

`@LucidAgents` bot handles both:
- **Commands** — deploy, status, list, terminate (Lucid Cloud routes)
- **Conversations** — messages routed to bound agent

No conflict because commands start with `/` or recognized keywords.

#### Command Flow

```
User: /launch openclaw
Bot:  ◈ Lucid · Internet of AI

      Launching: OpenClaw
      An autonomous citizen of the Internet of AI.

      Step 1 · Intelligence
      How should your agent think?

      [Lucid Gateway]  [Bring Your Own Key]

User: taps [Lucid Gateway]

Bot:  Step 2 · Channels
      Where should people reach your agent?

      [✓ Telegram]  [Discord]  [Slack]

User: taps [✓ Telegram]

Bot:  Ready to bring your agent to life?

      Identity:     On-chain passport
      Wallet:       Auto-created
      Intelligence: Lucid Inference Gateway
      Channels:     Telegram + WebChat

      [Launch]  [Cancel]

User: taps [Launch]

Bot:  ◈ Welcome to the Internet of AI.

      Your agent is alive.
      It can think, act, earn, and prove —
      autonomously, on-chain, 24/7.

      Telegram: t.me/LucidAgents?start=passport_abc123
      Passport: passport_abc123

      /status passport_abc123
      /logs passport_abc123
```

#### Telegram UI Elements

- **Inline keyboard buttons** for choices (not text input)
- **Callback queries** for selection handling
- **Edit message** for step-by-step flow (same message updated)
- **Deep links** for sharing deployed agents

#### Bot Commands

```
/launch <agent>     — Deploy an agent from catalog
/launch             — Browse catalog, pick agent
/status <passport>  — Check deployment status
/list               — List your deployed agents
/terminate <passport> — Stop an agent
/help               — Show commands
```

#### Architecture

```
Telegram webhook → Lucid Cloud (platform-core)
  ├── /launch command → Launch Handler
  │   → Fetch catalog
  │   → Interactive inline keyboard wizard
  │   → Call launch API (same as CLI: POST /v1/agents/launch)
  │   → Return success with deep link
  │
  ├── /status, /list, /terminate → Management Handler
  │   → Call existing Lucid API
  │   → Format response
  │
  └── Regular message → Agent Router
      → Look up chat_id → passport binding
      → Proxy to agent's /run endpoint
      → Return response
```

Lives in Lucid Cloud (`platform-core/modules/telegram-bot/`):
```
modules/telegram-bot/
  bot.ts              — Telegram Bot API client (grammY or raw fetch)
  commands/
    launch.ts         — /launch wizard with inline keyboards
    status.ts         — /status handler
    list.ts           — /list handler
    terminate.ts      — /terminate handler
  router.ts           — message → agent routing (chat_id → passport)
  bindings.ts         — persistent chat_id ↔ passport_id mapping
  webhook.ts          — Express route for Telegram webhook
```

---

## What Goes Where

| Component | Repo | Notes |
|---|---|---|
| Skills manifest extension | lucid-agents | `skills` field in manifest.yaml |
| Skills selection in clack UI | Lucid Layer | New step in agent-launch-ui.ts |
| Skills installation in entrypoint | lucid-agents | entrypoint.sh reads LUCID_SKILLS env |
| `lucid agent skills` CLI commands | Lucid Layer | Post-launch management |
| ClawHub search integration | Lucid Layer | fetch from ClawHub API |
| Telegram bot (all commands) | Lucid Cloud | platform-core module |
| Agent message routing | Lucid Cloud | chat_id → passport binding |
| Webhook endpoint | Lucid Cloud | POST /webhooks/telegram |

## Implementation Order

### Phase 1: Skills at Launch (Lucid Layer + lucid-agents)
1. Extend manifest schema with `skills` field
2. Add skills step to clack UI (multiselect + env prompts)
3. Pass `LUCID_SKILLS` env var to container
4. Update OpenClaw entrypoint to install skills at startup
5. Update official manifests with skill options

### Phase 2: Telegram Bot (Lucid Cloud)
6. Create `@LucidAgents` Telegram bot (or rename existing)
7. Build bot module in platform-core
8. Implement /launch wizard with inline keyboards
9. Implement /status, /list, /terminate
10. Implement message → agent routing with persistent bindings
11. Register webhook at Lucid Cloud domain

---

## Test Plan

### Skills
- [ ] Manifest with `skills.bundled` → auto-installed at startup
- [ ] Manifest with `skills.optional` → shown in clack wizard
- [ ] Selected skill with env requirement → prompts for key
- [ ] `LUCID_SKILLS=firecrawl,github` → installed in container
- [ ] ClawHub search returns results (or graceful fallback)
- [ ] `lucid agent skills list` → shows installed skills

### Telegram Bot
- [ ] `/launch openclaw` → inline keyboard wizard
- [ ] Button taps → steps progress (edit message)
- [ ] Launch confirmed → agent deployed, deep link returned
- [ ] `/status passport_xxx` → shows deployment status
- [ ] `/list` → shows user's agents
- [ ] Regular message after `/start passport_xxx` → routed to agent
- [ ] Multiple agents on same bot → messages routed correctly
