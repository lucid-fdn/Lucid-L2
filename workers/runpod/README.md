# Lucid RunPod Serverless Worker

RunPod serverless worker implementation for Fluid Compute v0.2.

## Overview

This worker implements the `runpod_serverless` execution mode, providing:

- **Scale-to-zero**: No cost when idle
- **Per-second billing**: Pay only for compute time
- **Signed receipts**: Cryptographic proof of execution
- **Cost transparency**: Billing details in every receipt

### Trust Model

The **endpoint is the trust boundary** (your compute passport):

- Your container runs your code
- Your ed25519 key signs all receipts
- Nodes without your worker image cannot produce valid receipts
- Receipts attest to execution integrity, not hardware exclusivity

## Quick Start

### 1. Build the Docker image

```bash
docker build -t lucid/worker-runpod:latest .
```

### 2. Create a RunPod endpoint

Use the [RunPod Console](https://runpod.io/console/serverless) or the endpoint manager:

```bash
cd ../../infrastructure
python endpoint_manager.py
```

### 3. Configure environment variables

Required:
- `WORKER_PRIVATE_KEY`: ed25519 private key (64-char hex)
- `MODEL_ID`: HuggingFace model ID
- `CAPACITY_BUCKET`: Bucket name from config

Set by RunPod:
- `RUNPOD_ENDPOINT_ID`: Endpoint ID
- `RUNPOD_POD_ID`: Pod instance ID
- `RUNPOD_GPU_TYPE`: Allocated GPU type

Optional:
- `MODEL_REVISION`: Model version for auditability
- `GPU_RATE_PER_SEC`: Pricing rate (default: 0.000231)
- `PRELOAD_MODEL`: Set to `true` to load model on startup

## Job Input Format

```json
{
  "input": {
    "quote": {
      "quote_id": "uuid",
      "offer_id": "compute_offer_id",
      "model_id": "meta-llama/Llama-2-7b-chat-hf",
      "policy_hash": "...",
      "max_input_tokens": 1000,
      "max_output_tokens": 500,
      "price": {"amount": 100, "currency": "usd_cents"},
      "expires_at": 1234567890,
      "quote_hash": "...",
      "quote_signature": "..."
    },
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "max_tokens": 512,
    "temperature": 0.7,
    "submitted_at": 1234567890
  }
}
```

## Response Format

### Success

```json
{
  "output": {
    "text": "Hello! How can I help you?",
    "model": "meta-llama/Llama-2-7b-chat-hf",
    "usage": {
      "prompt_tokens": 10,
      "completion_tokens": 15
    }
  },
  "receipt": {
    "schema_version": "1.0",
    "run_id": "job_123",
    "execution_mode": "runpod_serverless",
    "endpoint_id": "abc123",
    "capacity_bucket": "a10g-us-west",
    "billing": {
      "compute_seconds": 2.5,
      "gpu_type": "NVIDIA A10G",
      "cost_usd": 0.000578
    },
    "metrics": {
      "tokens_in": 10,
      "tokens_out": 15,
      "queue_time_ms": 150,
      "cold_start_ms": 0
    },
    "signature": "...",
    "operator_pubkey": "..."
  }
}
```

### Error

```json
{
  "error": {
    "code": "OOM",
    "message": "CUDA out of memory..."
  },
  "receipt": {
    "error_code": "OOM",
    "error_message": "...",
    "billing": {
      "compute_seconds": 1.2,
      "cost_usd": 0.000277
    }
  }
}
```

## Error Codes (v0.2 Simplified)

| Code | Description | Billable |
|------|-------------|----------|
| `INVALID_QUOTE` | Quote expired, invalid signature, or hash mismatch | No |
| `TIMEOUT` | Execution or queue timeout | Partial |
| `OOM` | GPU out of memory | Yes |
| `INFERENCE_ERROR` | All other execution errors | Yes |

## Local Development

### Run locally (without RunPod)

```bash
# Set environment variables
export WORKER_PRIVATE_KEY="your_64_char_hex_key"
export MODEL_ID="meta-llama/Llama-2-7b-chat-hf"
export CAPACITY_BUCKET="local-dev"

# Run the worker
python worker_handler.py
```

### Test with mock job

```python
from worker_handler import handler

result = handler({
    "id": "test_job_001",
    "input": {
        "quote": {
            "quote_id": "test_quote",
            "offer_id": "test_offer",
            "model_id": "meta-llama/Llama-2-7b-chat-hf",
            "policy_hash": "a" * 64,
            "max_input_tokens": 1000,
            "max_output_tokens": 500,
            "price": {"amount": 100, "currency": "usd_cents"},
            "expires_at": int(time.time()) + 300,
            "quote_hash": "...",  # Compute this
            "quote_signature": "..."
        },
        "prompt": "Hello, world!",
        "max_tokens": 50
    }
})
print(result)
```

## Deployment

### GitHub Actions CI/CD

See `/.github/workflows/deploy-endpoints.yml` for automated deployment.

### Manual deployment

1. Build and push image:
   ```bash
   docker build -t your-registry/lucid-worker:v0.2.0 .
   docker push your-registry/lucid-worker:v0.2.0
   ```

2. Update RunPod endpoint to use new image

3. Monitor endpoint health in RunPod console

## Architecture Reference

See `/docs/FLUID-COMPUTE-ARCHITECTURE-V0.md` for full architecture details.
