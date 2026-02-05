# Worker Sim HF - HuggingFace Inference API Worker

A Fluid Compute v0 worker that operates in `managed_endpoint` mode, using the HuggingFace Inference API for LLM inference.

## Overview

This worker is designed for **development, testing, and scenarios without dedicated GPU hardware**. It proxies inference requests to HuggingFace's Inference API, providing:

- **Quote generation** with replay protection
- **Job execution** via HuggingFace API
- **Receipt creation** with execution metrics
- **Prometheus metrics** endpoint

### Execution Mode: `managed_endpoint`

Since inference is delegated to an external service (HuggingFace), this worker operates with limited attestation guarantees:

- `runtime_hash = null` - No Docker image digest (execution not self-controlled)
- `gpu_fingerprint = null` - No GPU hardware fingerprint (hardware not self-controlled)

For full attestation with `byo_runtime` mode, use `worker-gpu-vllm` instead.

## Quick Start

### 1. Set Environment Variables

```bash
export HF_API_KEY="hf_your_api_key_here"
export WORKER_PORT=3100
export WORKER_ID="worker-sim-hf-dev"
export PROVIDER_PASSPORT_ID="psp_my_provider"
```

### 2. Run the Worker

```bash
# From the offchain directory
cd /path/to/Lucid-L2/offchain
npx ts-node src/workers/worker-sim-hf/index.ts
```

### 3. Test the Worker

```bash
# Health check
curl http://localhost:3100/health

# Get worker identity
curl http://localhost:3100/identity

# Request a quote
curl -X POST http://localhost:3100/quote \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "meta-llama/Meta-Llama-3.1-8B-Instruct",
    "estimated_input_tokens": 100,
    "estimated_output_tokens": 200
  }'
```

## API Endpoints

### Health Check
```
GET /health
```

Returns worker health status, queue depth, and uptime.

### Worker Identity
```
GET /identity
```

Returns the full worker identity including supported models and capabilities.

### Prometheus Metrics
```
GET /metrics
```

Returns Prometheus-formatted metrics for monitoring.

### Request Quote
```
POST /quote
Content-Type: application/json

{
  "model_id": "meta-llama/Meta-Llama-3.1-8B-Instruct",
  "estimated_input_tokens": 1000,
  "estimated_output_tokens": 500,
  "policy_hash": "optional_policy_hash"
}
```

Returns a signed quote valid for 5 minutes.

### Submit Job
```
POST /jobs
Content-Type: application/json

{
  "job_id": "job_unique_id",
  "model_id": "meta-llama/Meta-Llama-3.1-8B-Instruct",
  "offer_id": "psp_provider_id",
  "quote": { /* quote from /quote endpoint */ },
  "input": {
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  },
  "options": {
    "max_tokens": 256,
    "temperature": 0.7
  },
  "job_hash": "sha256_hash_of_job"
}
```

Returns job submission confirmation with queue position.

### Get Job Result
```
GET /jobs/:job_id
```

Returns job status, output, metrics, and receipt ID.

### Cancel Job
```
DELETE /jobs/:job_id
```

Cancels a queued job (cannot cancel running/completed jobs).

## Supported Models

| Model | Input/Output Pricing (lamports) |
|-------|--------------------------------|
| meta-llama/Meta-Llama-3.1-8B-Instruct | 5/15 |
| meta-llama/Meta-Llama-3.1-70B-Instruct | 50/150 |
| mistralai/Mistral-7B-Instruct-v0.3 | 5/15 |
| mistralai/Mixtral-8x7B-Instruct-v0.1 | 20/60 |
| microsoft/Phi-3-mini-4k-instruct | 3/10 |
| Qwen/Qwen2.5-72B-Instruct | 50/150 |
| google/gemma-2-9b-it | 8/24 |

## Example: Full Job Workflow

```typescript
import { v4 as uuid } from 'uuid';

const WORKER_URL = 'http://localhost:3100';

// 1. Get a quote
const quoteResponse = await fetch(`${WORKER_URL}/quote`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model_id: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    estimated_input_tokens: 100,
    estimated_output_tokens: 200,
  }),
});
const { quote } = await quoteResponse.json();

// 2. Create job request
const job_id = `job_${uuid().replace(/-/g, '')}`;
const input = {
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is 2+2?' },
  ],
};

// 3. Compute job hash (simplified - use receiptService.computeJobHash in production)
const job_hash = 'computed_job_hash_here';

// 4. Submit job
const submitResponse = await fetch(`${WORKER_URL}/jobs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    job_id,
    model_id: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    offer_id: quote.offer_id,
    quote,
    input,
    job_hash,
  }),
});
const submitResult = await submitResponse.json();
console.log('Job submitted:', submitResult);

// 5. Poll for result
let result;
do {
  await new Promise(r => setTimeout(r, 1000));
  const resultResponse = await fetch(`${WORKER_URL}/jobs/${job_id}`);
  result = await resultResponse.json();
} while (result.status === 'queued' || result.status === 'running');

console.log('Job completed:', result);
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    worker-sim-hf                              │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ QuoteService │  │ JobExecutor │  │ HuggingFaceClient   │  │
│  │             │  │             │  │                     │  │
│  │ - Create    │  │ - Queue     │  │ - generate()        │  │
│  │ - Validate  │  │ - Execute   │  │ - chatCompletion()  │  │
│  │ - Sign      │  │ - Receipt   │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                          │                    │              │
│                          ▼                    ▼              │
│                   ┌──────────────────────────────────┐       │
│                   │   HuggingFace Inference API      │       │
│                   └──────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

## Monitoring

### Prometheus Metrics

- `worker_requests_total` - Total HTTP requests
- `worker_quotes_issued_total` - Quotes generated
- `worker_jobs_submitted_total` - Jobs submitted
- `worker_jobs_completed_total` - Jobs completed successfully
- `worker_jobs_failed_total` - Jobs failed
- `worker_tokens_in_total` - Total input tokens processed
- `worker_tokens_out_total` - Total output tokens generated
- `worker_uptime_seconds` - Worker uptime
- `worker_queue_depth` - Current queue depth

### Grafana Dashboard

See `docs/grafana/worker-dashboard.json` for a pre-built Grafana dashboard.

## Error Handling

The worker returns structured error codes:

| Code | Description |
|------|-------------|
| `QUOTE_EXPIRED` | Quote has expired (5 min lifetime) |
| `INVALID_QUOTE_SIGNATURE` | Quote signature verification failed |
| `QUOTE_HASH_MISMATCH` | Quote hash doesn't match body |
| `MODEL_NOT_FOUND` | Model not available on HuggingFace |
| `INFERENCE_TIMEOUT` | HuggingFace API timeout |
| `INFERENCE_ERROR` | Generic inference error |
| `GPU_UNAVAILABLE` | HuggingFace rate limited |

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `HF_API_KEY` | (required) | HuggingFace API key |
| `WORKER_PORT` | `3100` | HTTP server port |
| `WORKER_ID` | auto-generated | Unique worker identifier |
| `PROVIDER_PASSPORT_ID` | `psp_hf_default` | Provider passport ID |
| `ORCHESTRATOR_URL` | `http://localhost:3000` | Orchestrator URL |

## Comparison: managed_endpoint vs byo_runtime

| Feature | managed_endpoint (this) | byo_runtime |
|---------|------------------------|-------------|
| GPU Required | No | Yes |
| runtime_hash | null | Docker digest |
| gpu_fingerprint | null | Hardware ID |
| Attestation | Limited | Full |
| Latency | Higher (~2-10s) | Lower (~100-500ms) |
| Cost | Per-token | Infrastructure |
| Use Case | Dev/Testing | Production |

## License

MIT
