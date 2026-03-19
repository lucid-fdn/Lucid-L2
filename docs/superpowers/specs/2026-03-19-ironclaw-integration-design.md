# IronClaw Integration — Production Readiness Plan

**Date:** 2026-03-19
**Status:** Planned
**Depends on:** OpenClaw launch flow (done)
**Goal:** Make IronClaw deployable from Telegram with the same UX as OpenClaw.

---

## What IronClaw Is

Rust-based personal AI assistant (OpenClaw-inspired, focused on privacy/security). Single binary, multi-threaded async (Tokio). Supports multiple LLM backends (Anthropic, OpenAI, NEAR AI, Ollama).

**Repo:** https://github.com/nearai/ironclaw

## What's Different From OpenClaw

| Concern | OpenClaw | IronClaw |
|---------|----------|----------|
| Language | TypeScript/Node.js | Rust |
| Docker image | Published on GHCR | Must build from source |
| HTTP endpoint | Custom `/run` | `POST /webhook` on :8080 (HMAC auth) |
| Database | None (SQLite embedded) | PostgreSQL 15+ with pgvector |
| Message format | `{ message: "..." }` → `{ reply: "..." }` | `{ content: "..." }` → `{ response: "..." }` |
| Auth | None / bearer token | HMAC-SHA256 (`X-Hub-Signature-256` header) |
| Min env vars | `ANTHROPIC_API_KEY` | `DATABASE_URL`, `LLM_BACKEND`, `HTTP_WEBHOOK_SECRET` |

## 5 Tasks to Production

### Task 1: Build and publish IronClaw Docker image to GHCR

```bash
git clone https://github.com/nearai/ironclaw
cd ironclaw
docker build --platform linux/amd64 -t ghcr.io/lucid-fdn/lucid-agents/ironclaw:latest .
docker push ghcr.io/lucid-fdn/lucid-agents/ironclaw:latest
```

Set up GitHub Action in lucid-agents repo for weekly rebuilds (same as OpenClaw).

**Estimated effort:** 30 min

### Task 2: Railway Postgres addon provisioning in the deployer

Each IronClaw instance needs a Postgres database. The RailwayDeployer needs to:

1. Create a Postgres addon service in the project
2. Wait for it to be ready
3. Get the `DATABASE_URL` from the addon
4. Pass it as env var to the IronClaw service

Railway GraphQL:
```graphql
mutation {
  serviceCreate(input: {
    name: "ironclaw-db-{passport_id}"
    projectId: "2aed69a0..."
    source: { image: "ghcr.io/library/postgres:15" }
  }) { id }
}
```

Or use Railway's Postgres plugin (simpler):
```graphql
mutation {
  pluginCreate(input: {
    projectId: "2aed69a0..."
    name: "POSTGRES"
  }) { id }
}
```

**Alternative:** Use a shared Postgres instance with per-agent schemas/databases. Cheaper but less isolated.

**Estimated effort:** 2-3 hours

### Task 3: Adapt bot message routing for IronClaw's webhook format

Current bot routes messages via:
```
POST {deployment_url}/run  →  { message: text }
```

IronClaw expects:
```
POST {deployment_url}/webhook  →  { content: text, user_id: tg_user_id }
Header: X-Hub-Signature-256: sha256={hmac}
```

Need to:
1. Store the agent type (openclaw vs ironclaw) in the chat binding or passport
2. In `router.ts`, choose the correct request format based on agent type
3. Generate and store an `HTTP_WEBHOOK_SECRET` per IronClaw deployment
4. Sign requests with HMAC-SHA256

**Estimated effort:** 1-2 hours

### Task 4: Update passport metadata with IronClaw-specific config

The IronClaw catalog passport needs:
- Docker image: `ghcr.io/lucid-fdn/lucid-agents/ironclaw:latest`
- Required env vars: `DATABASE_URL`, `HTTP_WEBHOOK_SECRET`, `LLM_BACKEND`
- Webhook path: `/webhook` (not `/run`)
- Port: 8080 (not 3100)

The wizard should collect:
- LLM provider choice (Anthropic/OpenAI/NEAR AI) → sets `LLM_BACKEND` + API key
- Everything else is auto-configured

**Estimated effort:** 30 min

### Task 5: Update wizard to collect agent-specific env vars

Right now the wizard collects the same env vars for all agents. IronClaw needs different ones:

```
IronClaw Intelligence step:
  [Anthropic (Claude)]  → ANTHROPIC_API_KEY
  [OpenAI (GPT)]        → OPENAI_API_KEY
  [NEAR AI]             → NEARAI_API_KEY
  [Lucid Gateway]       → auto-configured
```

The passport metadata should declare `required_env` and `optional_env` (like the manifest.yaml does), and the wizard should read them dynamically instead of hardcoding.

**Estimated effort:** 1-2 hours

---

## Total Estimated Effort

~5-8 hours of development. Can be done in one session.

## Priority Order

1. Build + push Docker image (unblocks everything)
2. Postgres provisioning (biggest infrastructure change)
3. Webhook format adaptation (enables message routing)
4. Update passport + wizard (UX polish)

## Dependencies

- Docker installed locally (for image build)
- GHCR push access (`docker login ghcr.io`)
- Railway project with Postgres plugin support
