# Lucid Agent Runtime

Pre-built Docker image for deploying AI agents with zero code. Any OpenAI-compatible provider. Receipts automatic when connected to Lucid API.

## Quick Start

```bash
lucid launch --runtime base --model gpt-4o --prompt "You are a helpful assistant" --target docker
```

Or manually:

```bash
docker run -p 3100:3100 \
  -e LUCID_MODEL=gpt-4o \
  -e LUCID_PROMPT="You are a helpful assistant" \
  -e PROVIDER_URL=https://your-provider-url \
  -e PROVIDER_API_KEY=your-key \
  -e LUCID_API_URL=https://api.lucid.foundation \
  -e LUCID_PASSPORT_ID=your-passport-id \
  ghcr.io/lucid-fdn/agent-runtime:v1.0.0
```

## Two Independent Concerns

**Inference** (`PROVIDER_URL`) — where LLM calls go. Any OpenAI-compatible endpoint.
**Verification** (`LUCID_API_URL`) — where receipts/identity/reputation go. The Lucid API.

These are independent. You can use any provider AND still be part of the verified network.

### Inference providers (any OpenAI-compatible endpoint)

```bash
# Lucid Cloud (sign up at lucid.foundation)
PROVIDER_URL=<your-lucid-cloud-url>
PROVIDER_API_KEY=lk_...

# Ollama (local, free)
PROVIDER_URL=http://localhost:11434/v1

# LiteLLM (self-hosted proxy, 100+ providers)
PROVIDER_URL=http://localhost:4000

# vLLM (self-hosted GPU)
PROVIDER_URL=http://localhost:8000/v1

# OpenAI direct
PROVIDER_URL=https://api.openai.com/v1
PROVIDER_API_KEY=sk-...
```

### Verification (receipts + reputation)

```bash
# Connected to Lucid — receipts flow, reputation builds
LUCID_API_URL=https://api.lucid.foundation

# Not connected — inference works, no verification
# (just don't set LUCID_API_URL)
```

| Setup | Inference | Receipts | Reputation |
|-------|-----------|----------|------------|
| Provider + Lucid API | Yes | Yes | Yes |
| Provider only | Yes | No | No |
| Lucid API only | No (no provider) | N/A | N/A |

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (returns passport, model, TrustGate status) |
| `/run` | POST | Simple inference (`{ prompt, stream? }`) |
| `/v1/chat/completions` | POST | OpenAI-compatible chat API |
| `/.well-known/agent.json` | GET | A2A discovery (if `LUCID_A2A_ENABLED=true`) |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LUCID_MODEL` | Yes | `gpt-4o` | Model identifier |
| `LUCID_PROMPT` | Yes | Generic | System prompt |
| `PROVIDER_URL` | Yes | Lucid Cloud | Any OpenAI-compatible inference endpoint |
| `PROVIDER_API_KEY` | If needed | - | API key for inference provider |
| `LUCID_API_URL` | Recommended | - | Lucid API for receipts + verification |
| `LUCID_PASSPORT_ID` | Auto | - | Injected by deployer |
| `LUCID_TOOLS` | No | - | Comma-separated tool passport IDs |
| `LUCID_A2A_ENABLED` | No | `false` | Enable A2A protocol discovery |
| `PORT` | No | `3100` | Server port |

## What's Automatic

When `LUCID_API_URL` is set:
- Cryptographic receipt on every inference call
- Receipts feed into reputation oracle
- Identity attached to every receipt

Always:
- `X-Lucid-Passport-Id` header on every response
- Health check at `/health` (shows `receipts: true/false`)
- OpenAI-compatible API at `/v1/chat/completions`
- Structured error responses
