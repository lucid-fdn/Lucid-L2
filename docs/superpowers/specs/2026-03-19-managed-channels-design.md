# Managed Channels — Zero-Setup Messaging for Deployed Agents

**Date:** 2026-03-19
**Status:** Draft
**Goal:** Users deploy an agent and get messaging channels (Telegram, Discord, Slack) with zero token setup. Two options: Lucid shared bot (instant) or bring your own bot (full control).

---

## Problem

Today, connecting Telegram to a deployed agent requires:
1. Open Telegram → message @BotFather → /newbot → copy token
2. Paste token during `lucid launch`

This is friction. Most users just want to talk to their agent on Telegram.

## Design

### Two Options Per Channel (user chooses during launch)

```
Telegram setup:
  [1] Use Lucid Bot (zero setup — instant)
  [2] Bring your own bot (paste token from @BotFather)
  [3] Skip

  Choice [1]:
```

### Option 1: Lucid Shared Bot (zero setup)

Lucid runs ONE bot per platform: `@LucidAgentBot` (Telegram), `Lucid Agent` (Discord), `Lucid` (Slack).

```
User messages @LucidAgentBot?start=passport_abc123
  → Telegram webhook → Lucid Cloud
  → Lucid Cloud looks up passport_abc123 → finds agent URL
  → Proxies message to agent's /run endpoint
  → Response sent back through @LucidAgentBot
```

**User gets:** `t.me/LucidAgentBot?start=passport_abc123` — share this link, anyone can talk to the agent.

**How routing works:**
- Telegram deep link `?start=passport_abc123` sends `/start passport_abc123` as first message
- Lucid Cloud extracts passport ID from start parameter
- Maps passport → deployment URL from deployment store
- Proxies all subsequent messages in that chat to the agent

### Option 2: Bring Your Own Bot (existing, works today)

User creates their own bot, pastes token. Agent container runs the bot directly.

```
TELEGRAM_BOT_TOKEN=123:ABC → injected into container → OpenClaw handles it
```

Full control: custom bot name, avatar, commands, group permissions.

### CLI Flow

```bash
lucid launch --agent openclaw

Required configuration:
  ANTHROPIC_API_KEY: sk-ant-...

Telegram setup:
  [1] Use Lucid Bot (zero setup)
  [2] Bring your own bot
  [3] Skip
  Choice [1]: 1
  ✓ Telegram: t.me/LucidAgentBot?start=passport_abc123

Discord setup:
  [1] Use Lucid Bot (zero setup)
  [2] Bring your own bot
  [3] Skip
  Choice [3]: 3

✓ Deploying...
✓ Live at http://localhost:18789
✓ Telegram: t.me/LucidAgentBot?start=passport_abc123
```

Non-interactive:
```bash
# Lucid managed
lucid launch --agent openclaw --channel telegram:managed

# Own bot
lucid launch --agent openclaw --env TELEGRAM_BOT_TOKEN=123:ABC

# Skip
lucid launch --agent openclaw  # (no channel flags = skip)
```

---

## Architecture

### Lucid Cloud (platform-core)

```
Shared Bots (one per platform):
  @LucidAgentBot (Telegram) → webhook at cloud.lucid.foundation/webhooks/telegram
  Lucid Agent (Discord)     → webhook at cloud.lucid.foundation/webhooks/discord
  Lucid (Slack)             → webhook at cloud.lucid.foundation/webhooks/slack

Message Proxy:
  1. Receive message from platform
  2. Extract agent ID (Telegram: /start param, Discord: channel mapping, Slack: app home)
  3. Look up agent deployment URL from deployment store
  4. POST to agent's /run endpoint
  5. Send response back through shared bot
```

**New module in platform-core:**
```
modules/channel-proxy/
  telegram.ts     — Telegram Bot API webhook handler + routing
  discord.ts      — Discord interactions handler + routing
  slack.ts        — Slack events handler + routing
  router.ts       — passport_id → deployment URL lookup
  index.ts        — Register webhooks on startup
```

### Lucid Layer (this repo)

**Changes to CLI:** Add channel setup prompts to agent-setup.ts
**Changes to manifest:** New `channels` field declaring which platforms an agent supports

### Manifest Extension

```yaml
# manifest.yaml
channels:
  - platform: telegram
    managed: true         # Lucid can provide shared bot
    own_bot_env: TELEGRAM_BOT_TOKEN
  - platform: discord
    managed: true
    own_bot_env: DISCORD_BOT_TOKEN
  - platform: slack
    managed: true
    own_bot_env: SLACK_BOT_TOKEN
```

### Deployment Record

When managed channel is selected, store in deployment metadata:
```json
{
  "channels": {
    "telegram": {
      "mode": "managed",
      "link": "t.me/LucidAgentBot?start=passport_abc123"
    }
  }
}
```

---

## What Goes Where

| Component | Repo | Purpose |
|---|---|---|
| Channel setup prompts in CLI | Lucid Layer | Interactive [1]/[2]/[3] choice |
| `--channel telegram:managed` flag | Lucid Layer | Non-interactive channel config |
| Manifest `channels` field | lucid-agents | Declare supported platforms |
| @LucidAgentBot (Telegram) | Lucid Cloud | Shared bot + webhook |
| Channel proxy router | Lucid Cloud | passport → deployment URL → proxy |
| Discord/Slack shared bots | Lucid Cloud | Same pattern as Telegram |

## Implementation Order

### Phase 1: CLI Channel Prompts (Lucid Layer — ship now)
1. Add channel prompts to `agent-setup.ts` (reads manifest `channels` field)
2. Add `--channel` flag for non-interactive
3. If managed selected → store in deployment metadata + return link in CLI output
4. If own bot → existing env var injection (already works)

### Phase 2: Telegram Shared Bot (Lucid Cloud)
5. Create @LucidAgentBot on Telegram
6. Channel proxy module in platform-core
7. Webhook handler: extract passport from deep link, route to agent
8. Return `t.me/LucidAgentBot?start=<passport_id>` after deploy

### Phase 3: Discord + Slack Shared Bots (Lucid Cloud)
9. Same pattern for Discord (interactions endpoint)
10. Same pattern for Slack (events API)

---

## Test Plan

- [ ] `lucid launch --agent openclaw` → shows channel setup prompts
- [ ] Choice [1] (managed) → returns Telegram deep link
- [ ] Choice [2] (own bot) → prompts for token
- [ ] Choice [3] (skip) → no channel configured
- [ ] `--channel telegram:managed` → non-interactive managed
- [ ] `--env TELEGRAM_BOT_TOKEN=x` → non-interactive own bot
- [ ] Managed link accessible: `t.me/LucidAgentBot?start=passport_xxx`
- [ ] Message to shared bot → proxied to correct agent → response returned
- [ ] Multiple agents on same shared bot → messages routed correctly
