# Lucid Agent Runtime

Pre-built Docker image for deploying AI agents with zero code. TrustGate hardwired, receipts automatic.

## Quick Start

```bash
lucid launch --runtime base --model gpt-4o --prompt "You are a helpful assistant" --target docker
```

Or manually:

```bash
docker run -p 3100:3100 \
  -e LUCID_MODEL=gpt-4o \
  -e LUCID_PROMPT="You are a helpful assistant" \
  -e TRUSTGATE_URL=https://trustgate.lucid.foundation \
  -e LUCID_PASSPORT_ID=your-passport-id \
  ghcr.io/lucid-fdn/agent-runtime:v1.0.0
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/run` | POST | Simple inference (`{ prompt, stream? }`) |
| `/v1/chat/completions` | POST | OpenAI-compatible chat |
| `/.well-known/agent.json` | GET | A2A discovery (if enabled) |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LUCID_MODEL` | Yes | `gpt-4o` | Model to use |
| `LUCID_PROMPT` | Yes | Generic | System prompt |
| `TRUSTGATE_URL` | Yes | - | TrustGate endpoint (hardwired) |
| `LUCID_PASSPORT_ID` | Auto | - | Injected by deployer |
| `LUCID_API_URL` | Auto | - | Lucid API for receipts |
| `LUCID_TOOLS` | No | - | Comma-separated tool IDs |
| `PORT` | No | `3100` | Server port |

## What's Automatic

- Receipts created on every inference call
- X-Lucid-Passport-Id header on every response
- TrustGate routing (non-optional by default)
- Health reporting
