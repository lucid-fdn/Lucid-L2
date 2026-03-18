# Lucid Agent Runtime

Pre-built Docker image for deploying AI agents with zero code. TrustGate default, receipts automatic, any OpenAI-compatible provider supported.

## Quick Start

```bash
lucid launch --runtime base --model gpt-4o --prompt "You are a helpful assistant" --target docker
```

Or manually:

```bash
# With TrustGate (recommended — full Lucid stack: receipts, reputation, traffic data)
docker run -p 3100:3100 \
  -e LUCID_MODEL=gpt-4o \
  -e LUCID_PROMPT="You are a helpful assistant" \
  -e TRUSTGATE_URL=https://trustgate.lucid.foundation \
  -e TRUSTGATE_API_KEY=your-key \
  -e LUCID_PASSPORT_ID=your-passport-id \
  ghcr.io/lucid-fdn/agent-runtime:v1.0.0
```

## Inference Provider

The runtime routes ALL LLM calls through an OpenAI-compatible endpoint. **TrustGate is the default** — it's Lucid Cloud's managed inference gateway that enables receipts, reputation, and traffic intelligence.

### With TrustGate (full Lucid stack)

```bash
TRUSTGATE_URL=https://trustgate.lucid.foundation
TRUSTGATE_API_KEY=lk_...
```

What you get: cryptographic receipts on every call, reputation scoring, traffic data for Oracle, cost tracking. This is the recommended path.

### Without TrustGate (inference only)

For self-hosted users, local development, or evaluation — any OpenAI-compatible endpoint works:

```bash
# Ollama (local, free)
TRUSTGATE_URL=http://localhost:11434/v1
LUCID_MODEL=qwen2.5:7b

# LiteLLM (self-hosted proxy for 100+ providers)
TRUSTGATE_URL=http://localhost:4000
LUCID_MODEL=gpt-4o

# vLLM (self-hosted GPU inference)
TRUSTGATE_URL=http://localhost:8000/v1
LUCID_MODEL=meta-llama/Llama-3.1-8B-Instruct

# OpenAI direct
TRUSTGATE_URL=https://api.openai.com/v1
TRUSTGATE_API_KEY=sk-...
LUCID_MODEL=gpt-4o
```

**What you lose without TrustGate:** No receipts, no reputation building, no traffic data. The agent runs but is not part of the verified network. Verification mode is effectively `minimal`.

### Decision matrix

| Provider | Receipts | Reputation | Cost | Use case |
|----------|----------|------------|------|----------|
| **TrustGate** (Lucid Cloud) | Yes | Yes | Managed pricing | Production agents |
| **LiteLLM** (self-hosted) | No | No | Your API keys | Self-hosted, multi-provider |
| **Ollama** (local) | No | No | Free | Development, testing |
| **vLLM** (self-hosted GPU) | No | No | Your hardware | On-prem inference |
| **OpenAI/Anthropic direct** | No | No | Provider pricing | Simple setups |

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
| `TRUSTGATE_URL` | Recommended | - | Inference endpoint (any OpenAI-compatible URL) |
| `TRUSTGATE_API_KEY` | If needed | - | API key for inference provider |
| `LUCID_PASSPORT_ID` | Auto | - | Injected by deployer |
| `LUCID_API_URL` | Auto | - | Lucid API for receipts |
| `LUCID_TOOLS` | No | - | Comma-separated tool passport IDs |
| `MCPGATE_URL` | No | - | MCPGate endpoint for tool calls |
| `LUCID_A2A_ENABLED` | No | `false` | Enable A2A protocol discovery |
| `PORT` | No | `3100` | Server port |

## What's Automatic

When TrustGate is configured:
- Cryptographic receipt created on every inference call
- Receipts feed into reputation oracle
- Traffic data captured for routing intelligence
- Cost tracking per agent

Always:
- `X-Lucid-Passport-Id` header on every response
- Health check at `/health`
- OpenAI-compatible API at `/v1/chat/completions`
- Structured error responses
