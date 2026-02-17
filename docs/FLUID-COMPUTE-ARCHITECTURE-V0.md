# Fluid Compute Architecture v0

**Date:** 10 February 2026
**Version:** 0.2.0
**Status:** Implementation Ready

---

## 1. Executive Summary

Fluid Compute v0 implements a **serverless-first architecture** with three execution tracks to support development, production GPU deployments, and scale-to-zero serverless inference:

| Track | Worker | Execution Mode | Runtime Control | GPU Required | Cost Model |
|-------|--------|----------------|-----------------|--------------|------------|
| **Dev/Test** | `worker-sim-hf` | `managed_endpoint` | None (HF controls) | No | Per-request API |
| **Reserved GPU** | `worker-gpu-vllm` | `byo_runtime` | Full control | Yes | Hourly/reserved |
| **Serverless** | `worker-runpod` | `runpod_serverless` | Container control | Yes | Per-second |

### Key Insight: Endpoint = Compute Passport

In the RunPod Serverless model, **the endpoint is the trust boundary**:
- RunPod does not expose GPU identity or hardware attestation at the node level
- Your container runs your code, signs receipts, and emits heartbeats
- Nodes without your worker image cannot produce valid Lucid receipts
- The endpoint ID becomes the verifiable compute identity

This architecture maintains honest attestation while enabling cost-efficient scale-to-zero operation.

### Product Positioning

> **Lucid optimizes for cost-efficient, verifiable execution.**
> Low-latency workloads can opt into warm pools; burst workloads default to scale-to-zero.

We are not competing on raw latency with OpenAI/Anthropic APIs. We compete on:
- **Verifiability**: Every response has a cryptographic receipt
- **Cost efficiency**: Pay per-second, scale to zero
- **Transparency**: Full cost breakdown in every receipt

---

## 2. Core Types & Interfaces

### 2.1 Execution Modes

```typescript
/**
 * Execution modes define how inference is performed
 * and what attestation guarantees are available.
 */
enum ExecutionMode {
  /**
   * BYO Runtime: Full control over execution environment.
   * - Worker controls container/runtime on dedicated hardware
   * - runtime_hash = Docker image digest
   * - gpu_fingerprint = actual GPU hardware
   * - Full attestation chain
   */
  BYO_RUNTIME = "byo_runtime",

  /**
   * Managed Endpoint: Execution delegated to external service.
   * - Worker proxies to HF/other inference APIs
   * - runtime_hash = null (unavailable)
   * - gpu_fingerprint = null (unavailable)
   * - Limited attestation (execution not self-controlled)
   */
  MANAGED_ENDPOINT = "managed_endpoint",

  /**
   * RunPod Serverless: Container-controlled execution on ephemeral workers.
   * - Scale-to-zero capability (0→N workers)
   * - runtime_hash = Docker image digest (container you control)
   * - gpu_fingerprint = GPU type (e.g., "NVIDIA A10G") but not specific hardware
   * - endpoint_id = trust boundary / compute passport
   * - Per-second billing with no idle charges
   */
  RUNPOD_SERVERLESS = "runpod_serverless"
}
```

### 2.2 Worker Identity

```typescript
/**
 * Worker identity binds a physical/virtual compute node
 * to a cryptographic identity for receipt signing.
 */
interface WorkerIdentity {
  /** Unique identifier for this worker instance */
  worker_id: string;

  /** Passport ID for the compute provider */
  provider_passport_id: string;

  /** ed25519 public key for signing */
  operator_pubkey: string;

  /** Execution mode this worker operates in */
  execution_mode: ExecutionMode;

  /**
   * Runtime hash (Docker image digest).
   * MUST be null for managed_endpoint mode.
   * Available for byo_runtime and runpod_serverless.
   */
  runtime_hash: string | null;

  /**
   * GPU hardware fingerprint.
   * MUST be null for managed_endpoint mode.
   * For byo_runtime: specific hardware ID.
   * For runpod_serverless: GPU type (e.g., "NVIDIA A10G").
   */
  gpu_fingerprint: string | null;

  /**
   * RunPod endpoint ID (runpod_serverless mode only).
   * This is the trust boundary - your compute passport.
   */
  endpoint_id?: string;

  /**
   * Ephemeral pod ID (runpod_serverless mode only).
   * Changes on each worker spin-up.
   */
  pod_id?: string;

  /**
   * Capacity bucket name (runpod_serverless mode only).
   * Maps to YAML-defined endpoint configuration.
   */
  capacity_bucket?: string;
}
```

### 2.3 OfferQuote (Replay-Protected Pricing)

```typescript
/**
 * OfferQuote represents a time-limited, bound pricing commitment
 * from a compute provider for executing a specific model.
 */
interface OfferQuote {
  /** UUID nonce - prevents replay attacks */
  quote_id: string;

  /** Compute offer passport ID */
  offer_id: string;

  /** Model passport ID (or HF model ID) */
  model_id: string;

  /** Policy hash - binds quote to specific policy terms */
  policy_hash: string;

  /** Maximum input tokens for this quote */
  max_input_tokens: number;

  /** Maximum output tokens for this quote */
  max_output_tokens: number;

  /** Price for this execution */
  price: {
    amount: number;
    currency: 'lamports' | 'usd_cents' | 'credits';
    /** GPU rate per second in USD (runpod_serverless) */
    gpu_rate_per_sec?: number;
  };

  /** Capacity bucket for serverless execution */
  capacity_bucket?: string;

  /** Unix timestamp - quote expires after this time */
  expires_at: number;

  /** SHA256 hash of canonical quote body */
  quote_hash: string;

  /** ed25519 signature of quote_hash by worker */
  quote_signature: string;
}
```

### 2.4 Extended Receipt Body

```typescript
/**
 * Extended receipt body for Fluid Compute v0.
 * All fields from CDC + additional audit/error fields.
 */
interface ExtendedReceiptBody {
  // === Schema version ===
  schema_version: '1.0';

  // === Core identifiers ===
  run_id: string;
  timestamp: number;
  trace_id?: string;

  // === Model & Compute binding ===
  model_passport_id: string;
  compute_passport_id: string;

  /** Model revision (commit SHA or tag) for auditability */
  model_revision?: string;

  // === Policy binding ===
  policy_hash: string;

  // === Quote binding ===
  job_hash: string;
  quote_hash: string;

  // === Worker identity ===
  node_id: string;

  /**
   * Runtime hash (Docker image digest).
   * MUST be null for managed_endpoint mode.
   */
  runtime_hash: string | null;

  /**
   * GPU fingerprint (hardware identifier or type).
   * MUST be null for managed_endpoint mode.
   */
  gpu_fingerprint: string | null;

  // === RunPod Serverless fields ===
  /** Capacity bucket name (runpod_serverless mode) */
  capacity_bucket?: string;

  /** RunPod endpoint ID (runpod_serverless mode) */
  endpoint_id?: string;

  /** Billing details for cost transparency */
  billing?: {
    /** Total compute time in seconds */
    compute_seconds: number;
    /** GPU type used */
    gpu_type: string;
    /** Total cost in USD */
    cost_usd: number;
  };

  // === Output verification ===
  outputs_hash: string;
  output_ref: string;  // S3 or IPFS URI

  // === Execution metadata ===
  execution_mode: ExecutionMode;
  start_ts: number;
  end_ts: number;

  // === Metrics ===
  runtime: string;  // "vllm" | "tgi" | "hf-inference-api"
  metrics: {
    ttft_ms: number;
    p95_ms?: number;
    tokens_in: number;
    tokens_out: number;
    /** Time spent in queue before worker picked up job (runpod_serverless) */
    queue_time_ms?: number;
    /** Cold start time if worker was scaled from zero (runpod_serverless) */
    cold_start_ms?: number;
  };

  // === Audit trail ===
  input_ref?: string;  // Encrypted input blob URI for enterprise

  // === Structured errors ===
  error_code?: string;
  error_message?: string;

  // === Legacy optional fields ===
  image_hash?: string;
  model_hash?: string;
  attestation?: object;
}
```

### 2.5 Model Policy

```typescript
/**
 * Model lifecycle policy for enterprise/chain deployments.
 * Defines which models are allowed and how revisions are tracked.
 */
interface ModelPolicy {
  /** Model identifier (HF model ID or passport ID) */
  model_id: string;

  /** Policy mode */
  policy: 'allow' | 'deny' | 'pinned';

  /**
   * Pinned revision hash (required if policy = 'pinned').
   * For HF models: commit SHA or revision tag.
   */
  revision?: string;

  /**
   * Model weights hash (optional, for full reproducibility).
   * SHA256 of model safetensors/bin files.
   */
  weights_hash?: string;
}
```

**Policy modes:**
- `allow`: Any revision of this model is permitted
- `deny`: Model is explicitly blocked
- `pinned`: Only the specified revision is permitted (for regulated/enterprise use)

> **Why this matters**: Enterprises and chains need to ensure model consistency across executions. A "Llama-2-7b" today may differ from "Llama-2-7b" in 6 months due to HF revisions. Pinned policies + revision in receipts provide auditability.

---

## 3. RunPod Serverless Architecture

### 3.1 Endpoint as Compute Passport

In RunPod Serverless, the endpoint is the fundamental trust boundary:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RunPod Infrastructure                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │           Endpoint: lucid-a10g-us-west (YOUR CODE)              │   │
│   │           endpoint_id: abc123xyz                                 │   │
│   ├─────────────────────────────────────────────────────────────────┤   │
│   │                                                                  │   │
│   │   ┌──────────┐  ┌──────────┐  ┌──────────┐       ┌──────────┐  │   │
│   │   │ Worker 0 │  │ Worker 1 │  │ Worker 2 │  ...  │ Worker N │  │   │
│   │   │ pod_id:  │  │ pod_id:  │  │ pod_id:  │       │ pod_id:  │  │   │
│   │   │ p-xyz... │  │ p-abc... │  │ p-def... │       │ p-ghi... │  │   │
│   │   │          │  │          │  │          │       │          │  │   │
│   │   │ A10G GPU │  │ A10G GPU │  │ A10G GPU │       │ A10G GPU │  │   │
│   │   └────┬─────┘  └────┬─────┘  └────┬─────┘       └────┬─────┘  │   │
│   │        │             │             │                  │        │   │
│   │        └─────────────┴─────────────┴──────────────────┘        │   │
│   │                          │                                      │   │
│   │                          ▼                                      │   │
│   │              ┌─────────────────────────┐                        │   │
│   │              │  Your Container Image    │                        │   │
│   │              │  - Lucid Worker Code     │                        │   │
│   │              │  - Receipt Signing Key   │                        │   │
│   │              │  - vLLM Runtime          │                        │   │
│   │              └─────────────────────────┘                        │   │
│   │                          │                                      │   │
│   │                          ▼                                      │   │
│   │              ┌─────────────────────────┐                        │   │
│   │              │  TRUST BOUNDARY          │                        │   │
│   │              │  Only YOUR container     │                        │   │
│   │              │  can sign valid receipts │                        │   │
│   │              └─────────────────────────┘                        │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Trust Chain Explanation

1. **Container Control**: You build and push the Docker image containing your Lucid worker code
2. **Signing Key**: The ed25519 private key for signing receipts is baked into or injected into your container
3. **Endpoint Binding**: The endpoint ID is a stable identifier that maps to your container image
4. **Pod Ephemeral**: Individual pod IDs (workers) are ephemeral - they spin up/down based on demand
5. **Receipt Validation**: Receipts are signed by your key, verifiable against your operator_pubkey

**Why this works**: Nodes without your worker image cannot produce valid receipts because they don't have access to your signing key.

### 3.3 Heartbeat Model

For `runpod_serverless`, we use **endpoint-level health polling only**:

```typescript
interface EndpointHealth {
  endpoint_id: string;
  capacity_bucket: string;
  status: 'healthy' | 'degraded' | 'unavailable';
  active_workers: number;
  queue_depth: number;
  avg_queue_delay_ms: number;
  polled_at: number;
}
```

The offchain service polls RunPod's health API periodically. Individual workers do not emit heartbeats.

> **Why no worker heartbeats?** In serverless, workers are ephemeral and RunPod manages their lifecycle. Endpoint health is the authoritative signal. Worker-level heartbeats add complexity without increasing trust.
>
> Worker heartbeats are reserved for `byo_runtime` deployments (dedicated GPU, DePIN, bare-metal) where you control the hardware.

### 3.4 Trust Model: What We Do NOT Guarantee

For `runpod_serverless`, receipts attest to **execution integrity**, not hardware exclusivity:

| Guarantee | runpod_serverless | byo_runtime |
|-----------|-------------------|-------------|
| Signed receipt | ✅ Yes | ✅ Yes |
| Container integrity (runtime_hash) | ✅ Yes | ✅ Yes |
| GPU type verification | ✅ Yes (type only) | ✅ Yes (serial) |
| Per-GPU serial number | ❌ No | ✅ Yes |
| Secure enclave / TEE | ❌ No | Optional |
| Hardware attestation | ❌ No | Optional |

**Key statement**: Receipts prove that YOUR code ran on the declared GPU type and produced the signed output. They do not prove which specific physical GPU executed the work.

For workloads requiring hardware-level attestation, use `byo_runtime` with TEE-enabled instances.

---

## 4. Worker Architectures

### 4.1 Worker Simulator (managed_endpoint)

```
┌─────────────────────────────────────────────────────┐
│                 worker-sim-hf                        │
├─────────────────────────────────────────────────────┤
│                                                      │
│  POST /quote ──▶ Generate fake quote (no real GPU)  │
│                                                      │
│  POST /jobs  ──▶ Proxy to HF Inference API ────────▶│──▶ HuggingFace
│                         │                           │    Inference
│                         ▼                           │    API
│              Create receipt with:                   │
│              - execution_mode: "managed_endpoint"   │
│              - runtime_hash: null                   │
│              - gpu_fingerprint: null                │
│                         │                           │
│                         ▼                           │
│              Emit to offchain service               │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Use cases**: Development, E2E testing, demos

### 4.2 Reserved GPU Worker (byo_runtime)

```
┌────────────────────────────────────────────────────────────────┐
│                    worker-gpu-vllm                              │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  POST /quote ──▶ Real quote based on GPU capacity/pricing      │
│                                                                 │
│  POST /jobs  ──▶ Validate quote (signature, expiration, bind)  │
│                         │                                      │
│                         ▼                                      │
│              Load model (cache hit or pull from HF)            │
│                         │                                      │
│                         ▼                                      │
│              Execute via vLLM/TGI                              │
│              ┌──────────────────────┐                          │
│              │  vLLM OpenAI API     │                          │
│              │  localhost:8000      │                          │
│              │  GPU: A100 40GB      │                          │
│              └──────────────────────┘                          │
│                         │                                      │
│                         ▼                                      │
│              Create receipt with:                              │
│              - execution_mode: "byo_runtime"                   │
│              - runtime_hash: sha256:<docker_digest>            │
│              - gpu_fingerprint: "NVIDIA-A100-40GB-SN:xxxxx"    │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Use cases**: Dedicated GPU deployments, maximum attestation, reserved capacity

### 4.3 RunPod Serverless Worker (runpod_serverless)

```
┌────────────────────────────────────────────────────────────────────────┐
│                    worker-runpod (Python Handler)                       │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  OUTSIDE HANDLER (runs once on cold start)                        │ │
│  │  - Load model into GPU memory                                     │ │
│  │  - Initialize vLLM engine                                         │ │
│  │  - Load signing key from env/secrets                              │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  def handler(job):                                                │ │
│  │      # 1. Parse job input                                         │ │
│  │      quote = job["input"]["quote"]                                │ │
│  │      messages = job["input"]["messages"]                          │ │
│  │                                                                   │ │
│  │      # 2. Validate quote                                          │ │
│  │      validate_quote(quote)                                        │ │
│  │                                                                   │ │
│  │      # 3. Execute inference                                       │ │
│  │      start_ts = time.time()                                       │ │
│  │      output = vllm_engine.generate(messages)                      │ │
│  │      end_ts = time.time()                                         │ │
│  │                                                                   │ │
│  │      # 4. Build receipt                                           │ │
│  │      receipt = build_receipt(                                     │ │
│  │          execution_mode="runpod_serverless",                      │ │
│  │          endpoint_id=os.environ["RUNPOD_ENDPOINT_ID"],            │ │
│  │          pod_id=os.environ["RUNPOD_POD_ID"],                      │ │
│  │          capacity_bucket=os.environ["CAPACITY_BUCKET"],           │ │
│  │          billing=calculate_billing(end_ts - start_ts),            │ │
│  │      )                                                            │ │
│  │                                                                   │ │
│  │      # 5. Sign receipt                                            │ │
│  │      receipt["signature"] = sign_receipt(receipt)                 │ │
│  │                                                                   │ │
│  │      # 6. Return output + receipt                                 │ │
│  │      return {"output": output, "receipt": receipt}                │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  runpod.serverless.start({"handler": handler})                         │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

**Use cases**: Production serverless, scale-to-zero, cost-efficient inference

---

## 5. Infrastructure Management

### 5.1 Capacity Buckets (YAML Configuration)

Capacity buckets define endpoint configurations in a declarative format:

```yaml
# capacity-buckets.yaml
version: "1.0"
defaults:
  scaler_type: QUEUE_DELAY
  scaler_value: 4  # seconds
  idle_timeout: 300  # 5 minutes

buckets:
  - name: a10g-us-west
    display_name: "A10G US West (Scale-to-Zero)"
    gpu_types:
      - "NVIDIA A10G"
    regions:
      - "US-OR-1"
      - "US-CA-1"
    workers_min: 0  # Scale to zero when idle
    workers_max: 20
    gpu_count: 1
    container_image: "lucid/worker-runpod:v0.2.0"
    env:
      MODEL_ID: "meta-llama/Llama-2-7b-chat-hf"
      CAPACITY_BUCKET: "a10g-us-west"
    pricing:
      gpu_rate_per_sec: 0.000231  # $0.83/hr

  - name: a100-us-east
    display_name: "A100 US East (Warm Pool)"
    gpu_types:
      - "NVIDIA A100 80GB"
      - "NVIDIA A100-SXM4-80GB"
    regions:
      - "US-NJ-1"
      - "US-VA-1"
    workers_min: 2  # Keep 2 workers warm (Active Workers)
    workers_max: 50
    gpu_count: 1
    container_image: "lucid/worker-runpod:v0.2.0"
    env:
      MODEL_ID: "meta-llama/Llama-2-70b-chat-hf"
      CAPACITY_BUCKET: "a100-us-east"
    pricing:
      gpu_rate_per_sec: 0.000556  # $2.00/hr

  - name: h100-global
    display_name: "H100 Global (High Performance)"
    gpu_types:
      - "NVIDIA H100 80GB HBM3"
    regions:
      - "US-TX-1"
      - "EU-SE-1"
    workers_min: 0
    workers_max: 100
    gpu_count: 1
    container_image: "lucid/worker-runpod:v0.2.0"
    env:
      MODEL_ID: "meta-llama/Llama-3-70b-instruct"
      CAPACITY_BUCKET: "h100-global"
    pricing:
      gpu_rate_per_sec: 0.001389  # $5.00/hr
```

### 5.2 Endpoint Manager Service

Python service to synchronize YAML config with RunPod API:

```python
# endpoint_manager.py
import os
import yaml
import requests
from typing import Dict, List

RUNPOD_API_URL = "https://api.runpod.io/graphql"
RUNPOD_API_KEY = os.environ["RUNPOD_API_KEY"]

class EndpointManager:
    def __init__(self, config_path: str = "capacity-buckets.yaml"):
        with open(config_path) as f:
            self.config = yaml.safe_load(f)
        self.defaults = self.config.get("defaults", {})

    def sync_from_config(self) -> Dict[str, str]:
        """Sync all capacity buckets to RunPod endpoints.

        Returns:
            Dict mapping bucket name to endpoint ID
        """
        results = {}
        for bucket in self.config["buckets"]:
            endpoint_id = self.upsert_endpoint(bucket)
            results[bucket["name"]] = endpoint_id
        return results

    def upsert_endpoint(self, bucket: dict) -> str:
        """Create or update a RunPod endpoint for a capacity bucket."""
        # Check if endpoint already exists
        existing = self._get_endpoint_by_name(bucket["name"])

        payload = {
            "name": bucket["name"],
            "templateId": self._get_or_create_template(bucket),
            "gpuIds": self._resolve_gpu_ids(bucket["gpu_types"]),
            "workersMin": bucket.get("workers_min", self.defaults.get("workers_min", 0)),
            "workersMax": bucket.get("workers_max", self.defaults.get("workers_max", 10)),
            "idleTimeout": bucket.get("idle_timeout", self.defaults.get("idle_timeout", 300)),
            "scalerType": bucket.get("scaler_type", self.defaults.get("scaler_type", "QUEUE_DELAY")),
            "scalerValue": bucket.get("scaler_value", self.defaults.get("scaler_value", 4)),
            "locations": bucket.get("regions", []),
        }

        if existing:
            return self._update_endpoint(existing["id"], payload)
        else:
            return self._create_endpoint(payload)

    def _create_endpoint(self, payload: dict) -> str:
        """Create a new RunPod endpoint via REST API."""
        mutation = """
        mutation CreateEndpoint($input: EndpointInput!) {
            saveEndpoint(input: $input) {
                id
                name
            }
        }
        """
        response = requests.post(
            RUNPOD_API_URL,
            headers={"Authorization": f"Bearer {RUNPOD_API_KEY}"},
            json={"query": mutation, "variables": {"input": payload}}
        )
        response.raise_for_status()
        data = response.json()
        return data["data"]["saveEndpoint"]["id"]

    def _update_endpoint(self, endpoint_id: str, payload: dict) -> str:
        """Update an existing RunPod endpoint."""
        payload["id"] = endpoint_id
        return self._create_endpoint(payload)  # saveEndpoint handles upsert

    def _get_endpoint_by_name(self, name: str) -> dict | None:
        """Look up endpoint by name."""
        query = """
        query GetEndpoints {
            myself {
                endpoints {
                    id
                    name
                }
            }
        }
        """
        response = requests.post(
            RUNPOD_API_URL,
            headers={"Authorization": f"Bearer {RUNPOD_API_KEY}"},
            json={"query": query}
        )
        response.raise_for_status()
        endpoints = response.json()["data"]["myself"]["endpoints"]
        return next((e for e in endpoints if e["name"] == name), None)

    def _get_or_create_template(self, bucket: dict) -> str:
        """Get or create a template for the container image."""
        # Implementation depends on RunPod template API
        # Returns template ID for the container image
        pass

    def _resolve_gpu_ids(self, gpu_types: List[str]) -> List[str]:
        """Map GPU type names to RunPod GPU IDs."""
        GPU_ID_MAP = {
            "NVIDIA A10G": "NVIDIA A10G",
            "NVIDIA A100 80GB": "NVIDIA A100 80GB PCIe",
            "NVIDIA A100-SXM4-80GB": "NVIDIA A100-SXM4-80GB",
            "NVIDIA H100 80GB HBM3": "NVIDIA H100 80GB HBM3",
        }
        return [GPU_ID_MAP.get(g, g) for g in gpu_types]


if __name__ == "__main__":
    manager = EndpointManager()
    results = manager.sync_from_config()
    print("Synced endpoints:")
    for bucket, endpoint_id in results.items():
        print(f"  {bucket}: {endpoint_id}")
```

### 5.3 CI/CD Integration (GitHub Actions)

```yaml
# .github/workflows/deploy-endpoints.yml
name: Deploy RunPod Endpoints

on:
  push:
    paths:
      - 'infrastructure/capacity-buckets.yaml'
      - 'workers/runpod/**'
    branches:
      - main
  workflow_dispatch:

jobs:
  build-worker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and push worker image
        uses: docker/build-push-action@v5
        with:
          context: ./workers/runpod
          push: true
          tags: lucid/worker-runpod:${{ github.sha }},lucid/worker-runpod:latest

  sync-endpoints:
    needs: build-worker
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install pyyaml requests

      - name: Update container image in config
        run: |
          sed -i "s|container_image:.*|container_image: lucid/worker-runpod:${{ github.sha }}|g" \
            infrastructure/capacity-buckets.yaml

      - name: Sync endpoints
        env:
          RUNPOD_API_KEY: ${{ secrets.RUNPOD_API_KEY }}
        run: python infrastructure/endpoint_manager.py
```

---

## 6. Pricing & Cost Model

### 6.1 GPU Tier Pricing

| GPU Type | Hourly Rate | Per-Second Rate | VRAM | Use Case |
|----------|-------------|-----------------|------|----------|
| RTX 4090 | $0.44 | $0.000122 | 24GB | Dev/small models |
| A10G | $0.83 | $0.000231 | 24GB | Production/7B models |
| A100 40GB | $1.39 | $0.000386 | 40GB | Production/13-30B |
| A100 80GB | $2.00 | $0.000556 | 80GB | Production/70B |
| H100 80GB | $5.00 | $0.001389 | 80GB | High-performance/largest |

*Prices are approximate and subject to RunPod pricing changes*

### 6.2 Active vs Flex Workers

RunPod offers two worker pricing tiers:

- **Flex Workers** (`workers_min: 0`): Pure on-demand, scale-to-zero
  - No cost when idle
  - Cold start latency (~10-30s for model loading)

- **Active Workers** (`workers_min: N`): 20-30% discount on hourly rate
  - Pay for N workers continuously
  - No cold start for first N concurrent requests
  - Cost-effective for predictable baseline load

### 6.3 Quote Price Calculation

```typescript
function calculateQuotePrice(
  bucket: CapacityBucket,
  estimatedTokens: number,
  estimatedDurationSec: number
): Price {
  const gpuRate = bucket.pricing.gpu_rate_per_sec;

  // Add 20% buffer for variance
  const bufferedDuration = estimatedDurationSec * 1.2;

  // Calculate USD cost
  const costUsd = gpuRate * bufferedDuration;

  // Convert to preferred currency
  return {
    amount: Math.ceil(costUsd * 100), // USD cents
    currency: 'usd_cents',
    gpu_rate_per_sec: gpuRate,
  };
}
```

### 6.4 Cost Transparency in Receipts

Every receipt includes billing details for full cost transparency:

```typescript
{
  // ... other receipt fields ...
  billing: {
    compute_seconds: 12.45,
    gpu_type: "NVIDIA A10G",
    cost_usd: 0.00288,  // 12.45 * 0.000231
  },
  metrics: {
    queue_time_ms: 150,      // Time waiting for worker
    cold_start_ms: 0,        // 0 = warm worker, >0 = cold start
    ttft_ms: 45,
    tokens_in: 128,
    tokens_out: 512,
  }
}
```

---

## 7. Scaling Behavior

### 7.1 Auto-Scaling Strategies

| Strategy | Config | Behavior |
|----------|--------|----------|
| `QUEUE_DELAY` | `scaler_value: 4` | Scale up when queue delay exceeds 4 seconds |
| `REQUEST_COUNT` | `scaler_value: 10` | Scale up when queue has >10 pending requests |

### 7.2 Cold Start Mitigation

| Strategy | Config | Trade-off |
|----------|--------|-----------|
| Scale-to-zero | `workers_min: 0` | Lowest cost, 10-30s cold start |
| Warm pool | `workers_min: 2` | 20-30% discount, instant for first 2 requests |
| Preloaded models | Model in image | Larger image, faster cold start |
| Model streaming | Async model load | Smaller image, slightly longer cold start |

### 7.3 Scaling Scenarios

| Scenario | Queue Depth | Workers | Action |
|----------|-------------|---------|--------|
| Idle | 0 | 0 | No change (scale-to-zero) |
| First request | 1 | 0→1 | Cold start, then serve |
| Moderate load | 5 | 2 | Queue delay triggers scale-up |
| Burst | 50 | 2→20 | Rapid scale-up to max |
| Drain | 0 | 20→0 | Idle timeout, scale down |

---

## 8. Storage Strategy

### 8.1 v0 Default: S3 Only

For v0, outputs are stored in S3 only. IPFS publishing is **optional and behind a flag**.

```
┌─────────────────────────────────────┐
│   Outputs (S3)                       │
│   - Fast retrieval                   │
│   - outputs_hash in receipt          │
│   - Sufficient for MVP verification  │
└─────────────────────────────────────┘
```

```typescript
// Default output reference
output_ref = "s3://lucid-outputs/jobs/{job_id}/output.json"
```

### 8.2 IPFS Publishing (Optional, v0+)

IPFS is available for enterprise/chain use cases but **not enabled by default**:

```typescript
// Only when explicitly requested: publish_ipfs: true
if (options.publish_ipfs) {
  metadata.ipfs_cid = "Qm..."
  metadata.ipfs_url = "ipfs://Qm..."
}
```

> **Why not default?** IPFS adds latency (~500ms-2s) and failure modes. For v0, S3 + `outputs_hash` in the signed receipt provides sufficient verification. IPFS becomes valuable for public/chain-anchored proofs in v1.

---

## 9. Quote Validation Flow

```typescript
/**
 * Quote validation on job submission.
 * All bound fields MUST match the job request.
 */
function validateQuoteForJob(quote: OfferQuote, job: JobRequest): boolean {
  // 1. Verify quote signature
  if (!verifySignature(quote.quote_hash, quote.quote_signature, worker_pubkey)) {
    throw new Error('INVALID_QUOTE_SIGNATURE');
  }

  // 2. Verify quote not expired
  if (Date.now() > quote.expires_at * 1000) {
    throw new Error('QUOTE_EXPIRED');
  }

  // 3. Verify quote_hash matches canonical body
  const expectedHash = computeQuoteHash(quote);
  if (expectedHash !== quote.quote_hash) {
    throw new Error('QUOTE_HASH_MISMATCH');
  }

  // 4. Verify binding fields match job
  if (quote.model_id !== job.model_id) {
    throw new Error('MODEL_MISMATCH');
  }
  if (quote.offer_id !== job.offer_id) {
    throw new Error('OFFER_MISMATCH');
  }

  // 5. Verify token limits
  const estimatedTokens = estimateInputTokens(job.input);
  if (estimatedTokens > quote.max_input_tokens) {
    throw new Error('INPUT_EXCEEDS_QUOTE');
  }

  return true;
}
```

---

## 10. Hash Computation Standards

### 10.1 Canonical JSON (JCS)

All hashes are computed using JSON Canonicalization Scheme (RFC 8785):

```typescript
import { canonicalize } from 'json-canonicalize';
import { createHash } from 'crypto';

function canonicalSha256Hex(obj: object): string {
  const canonical = canonicalize(obj);
  return createHash('sha256').update(canonical).digest('hex');
}
```

### 10.2 Quote Hash Preimage

```typescript
function computeQuoteHash(quote: OfferQuote): string {
  const preimage = {
    quote_id: quote.quote_id,
    offer_id: quote.offer_id,
    model_id: quote.model_id,
    policy_hash: quote.policy_hash,
    max_input_tokens: quote.max_input_tokens,
    max_output_tokens: quote.max_output_tokens,
    price: quote.price,
    capacity_bucket: quote.capacity_bucket,  // NEW in v0.2
    expires_at: quote.expires_at,
  };
  return canonicalSha256Hex(preimage);
}
```

### 10.3 Job Hash Preimage

```typescript
function computeJobHash(job: JobRequest): string {
  const preimage = {
    job_id: job.job_id,
    model_id: job.model_id,
    quote_hash: job.quote.quote_hash,
    input_hash: canonicalSha256Hex(job.input),
  };
  return canonicalSha256Hex(preimage);
}
```

### 10.4 Outputs Hash Preimage

```typescript
function computeOutputsHash(output: any): string {
  return canonicalSha256Hex(output);
}
```

---

## 11. Error Handling

### 11.1 Structured Error Codes (v0 MVP)

| Code | Description | Receipted? | Billable? |
|------|-------------|------------|-----------|
| `INVALID_QUOTE` | Quote expired, invalid signature, or hash mismatch | No | No |
| `TIMEOUT` | Execution or queue timeout | Yes | Partial |
| `OOM` | GPU out of memory | Yes | Yes |
| `INFERENCE_ERROR` | All other execution errors | Yes | Yes |

> **v0 simplification**: We collapse detailed error codes into four categories. Finer-grained error taxonomy (MODEL_LOAD_FAILED, OUTPUT_STORAGE_FAILED, WORKER_CRASHED, etc.) is deferred to v1 based on operational learnings.

### 11.2 Error Receipts

Failed executions still produce receipts for audit trail:

```typescript
{
  execution_mode: "runpod_serverless",
  endpoint_id: "abc123xyz",
  capacity_bucket: "a10g-us-west",
  error_code: "OOM",
  error_message: "CUDA out of memory. Tried to allocate 4.00 GiB...",
  outputs_hash: "",  // Empty - no output
  output_ref: "",    // Empty - no output
  billing: {
    compute_seconds: 3.2,  // Time before failure
    gpu_type: "NVIDIA A10G",
    cost_usd: 0.00074,
  },
  // ... other fields populated
}
```

---

## 12. Monitoring & Observability

### 12.1 Endpoint Health Endpoint

The offchain service polls RunPod for endpoint health:

```typescript
// GET /api/endpoints/:endpoint_id/health
interface EndpointHealthResponse {
  endpoint_id: string;
  capacity_bucket: string;
  status: 'healthy' | 'degraded' | 'unavailable';
  workers: {
    active: number;
    idle: number;
    starting: number;
    max: number;
  };
  queue: {
    depth: number;
    avg_delay_ms: number;
  };
  last_request_at: number;
  last_heartbeat_at: number;
}
```

### 12.2 Prometheus Metrics

```prometheus
# Worker metrics (exposed by each worker)
lucid_inference_duration_seconds{bucket="a10g-us-west",model="llama-2-7b"}
lucid_tokens_processed_total{bucket="a10g-us-west",direction="in|out"}
lucid_receipts_signed_total{bucket="a10g-us-west",status="success|error"}

# Endpoint metrics (aggregated by offchain service)
lucid_endpoint_workers{bucket="a10g-us-west",state="active|idle|starting"}
lucid_endpoint_queue_depth{bucket="a10g-us-west"}
lucid_endpoint_queue_delay_ms{bucket="a10g-us-west"}
lucid_cold_starts_total{bucket="a10g-us-west"}
```

### 12.3 Endpoint Health Polling

```python
# Offchain service polls RunPod health API
async def poll_endpoint_health(endpoint_id: str) -> EndpointHealth:
    """Poll RunPod for endpoint health status."""
    response = await runpod_client.get(f"/endpoints/{endpoint_id}/health")
    return EndpointHealth(
        endpoint_id=endpoint_id,
        status=response["status"],
        active_workers=response["workersRunning"],
        queue_depth=response["jobsInQueue"],
        avg_queue_delay_ms=response.get("avgQueueDelayMs", 0),
        polled_at=int(time.time()),
    )
```

> **Note**: Worker-level heartbeats are only used for `byo_runtime` deployments. For `runpod_serverless`, endpoint health polling is sufficient.

---

## 13. RunPod Worker Implementation

### 13.1 Complete Python Handler

```python
# worker_handler.py
import os
import time
import json
import hashlib
from typing import Any, Dict

import torch
import runpod
from vllm import LLM, SamplingParams
from nacl.signing import SigningKey

# === OUTSIDE HANDLER (runs once on cold start) ===

# Load model into GPU memory
MODEL_ID = os.environ.get("MODEL_ID", "meta-llama/Llama-2-7b-chat-hf")
print(f"Loading model: {MODEL_ID}")
llm = LLM(model=MODEL_ID, trust_remote_code=True)
print("Model loaded successfully")

# Load signing key
SIGNING_KEY = SigningKey(bytes.fromhex(os.environ["WORKER_PRIVATE_KEY"]))
OPERATOR_PUBKEY = SIGNING_KEY.verify_key.encode().hex()

# Environment
ENDPOINT_ID = os.environ.get("RUNPOD_ENDPOINT_ID", "unknown")
POD_ID = os.environ.get("RUNPOD_POD_ID", "unknown")
CAPACITY_BUCKET = os.environ.get("CAPACITY_BUCKET", "unknown")
GPU_TYPE = os.environ.get("RUNPOD_GPU_TYPE", "unknown")
GPU_RATE_PER_SEC = float(os.environ.get("GPU_RATE_PER_SEC", "0.000231"))
MODEL_REVISION = os.environ.get("MODEL_REVISION")  # Optional: commit SHA or tag


def canonical_sha256(obj: Any) -> str:
    """Compute SHA256 hash of canonicalized JSON."""
    # Simple canonicalization: sort keys, no whitespace
    canonical = json.dumps(obj, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode()).hexdigest()


def sign_receipt(receipt: Dict) -> str:
    """Sign receipt with ed25519 key."""
    receipt_hash = canonical_sha256(receipt)
    signature = SIGNING_KEY.sign(bytes.fromhex(receipt_hash))
    return signature.signature.hex()


def validate_quote(quote: Dict) -> bool:
    """Validate quote signature and expiration."""
    # 1. Check expiration
    if time.time() > quote["expires_at"]:
        raise ValueError("QUOTE_EXPIRED")

    # 2. Verify quote hash
    preimage = {
        "quote_id": quote["quote_id"],
        "offer_id": quote["offer_id"],
        "model_id": quote["model_id"],
        "policy_hash": quote["policy_hash"],
        "max_input_tokens": quote["max_input_tokens"],
        "max_output_tokens": quote["max_output_tokens"],
        "price": quote["price"],
        "capacity_bucket": quote.get("capacity_bucket"),
        "expires_at": quote["expires_at"],
    }
    expected_hash = canonical_sha256(preimage)
    if expected_hash != quote["quote_hash"]:
        raise ValueError("QUOTE_HASH_MISMATCH")

    # 3. Signature verification would go here
    # (simplified - in production, verify against known pubkeys)

    return True


def handler(job: Dict) -> Dict:
    """RunPod serverless handler for Lucid inference."""
    job_input = job["input"]
    job_id = job["id"]

    try:
        # 1. Parse and validate quote
        quote = job_input["quote"]
        validate_quote(quote)

        # 2. Extract inference parameters
        messages = job_input.get("messages", [])
        prompt = job_input.get("prompt", "")
        max_tokens = job_input.get("max_tokens", quote["max_output_tokens"])
        temperature = job_input.get("temperature", 0.7)

        # Convert messages to prompt if needed
        if messages and not prompt:
            prompt = "\n".join(
                f"{m['role']}: {m['content']}" for m in messages
            )

        # 3. Execute inference
        queue_time_ms = int((time.time() - job_input.get("submitted_at", time.time())) * 1000)
        start_ts = time.time()

        sampling_params = SamplingParams(
            max_tokens=max_tokens,
            temperature=temperature,
        )
        outputs = llm.generate([prompt], sampling_params)
        output_text = outputs[0].outputs[0].text

        end_ts = time.time()
        compute_seconds = end_ts - start_ts

        # 4. Calculate metrics
        tokens_in = len(prompt.split())  # Simplified tokenization
        tokens_out = len(output_text.split())

        # 5. Build output object
        output = {
            "text": output_text,
            "model": MODEL_ID,
            "usage": {
                "prompt_tokens": tokens_in,
                "completion_tokens": tokens_out,
            }
        }
        outputs_hash = canonical_sha256(output)

        # 6. Build receipt
        receipt = {
            "schema_version": "1.0",
            "run_id": job_id,
            "timestamp": int(time.time()),
            "model_passport_id": quote["model_id"],
            "model_revision": MODEL_REVISION,  # For auditability
            "compute_passport_id": quote["offer_id"],
            "policy_hash": quote["policy_hash"],
            "job_hash": canonical_sha256({
                "job_id": job_id,
                "model_id": quote["model_id"],
                "quote_hash": quote["quote_hash"],
                "input_hash": canonical_sha256(job_input),
            }),
            "quote_hash": quote["quote_hash"],
            "node_id": POD_ID,
            "runtime_hash": os.environ.get("RUNTIME_HASH", ""),
            "gpu_fingerprint": GPU_TYPE,
            "capacity_bucket": CAPACITY_BUCKET,
            "endpoint_id": ENDPOINT_ID,
            "billing": {
                "compute_seconds": round(compute_seconds, 3),
                "gpu_type": GPU_TYPE,
                "cost_usd": round(compute_seconds * GPU_RATE_PER_SEC, 6),
            },
            "outputs_hash": outputs_hash,
            "output_ref": f"inline:{job_id}",  # Output included in response
            "execution_mode": "runpod_serverless",
            "start_ts": int(start_ts),
            "end_ts": int(end_ts),
            "runtime": "vllm",
            "metrics": {
                "ttft_ms": int((end_ts - start_ts) * 1000),  # Simplified
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "queue_time_ms": queue_time_ms,
                "cold_start_ms": 0,  # Would track actual cold start
            },
        }

        # 7. Sign receipt
        receipt["signature"] = sign_receipt(receipt)
        receipt["operator_pubkey"] = OPERATOR_PUBKEY

        return {
            "output": output,
            "receipt": receipt,
        }

    except ValueError as e:
        # Quote validation error
        return {
            "error": {
                "code": "INVALID_QUOTE",
                "message": str(e),
            }
        }
    except torch.cuda.OutOfMemoryError as e:
        # OOM error
        return {
            "error": {
                "code": "OOM",
                "message": str(e),
            }
        }
    except Exception as e:
        # All other errors
        return {
            "error": {
                "code": "INFERENCE_ERROR",
                "message": str(e),
            }
        }


# Start the serverless worker
runpod.serverless.start({"handler": handler})
```

### 13.2 Dockerfile

```dockerfile
# Dockerfile for Lucid RunPod Worker
FROM runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy worker code
COPY worker_handler.py .

# Set runtime hash at build time
ARG RUNTIME_HASH
ENV RUNTIME_HASH=${RUNTIME_HASH}

# RunPod serverless entry point
CMD ["python", "worker_handler.py"]
```

---

## 14. V1 Migration Planning

### 14.1 EpochRecordV2 PDA Migration

**Current (v0):**
```rust
#[account]
pub struct EpochRecord {
    pub merkle_root: [u8; 32],
    pub authority: Pubkey,
    pub epoch_id: u64,
    pub leaf_count: u32,
    pub timestamp: i64,
    pub mmr_size: u64,
}
// Seeds: [b"epoch", authority.key()]
```

**Future (v1):**
```rust
#[account]
pub struct EpochRecordV2 {
    pub merkle_root: [u8; 32],
    pub authority: Pubkey,
    pub epoch_id: u64,
    pub leaf_count: u32,
    pub timestamp: i64,
    pub mmr_size: u64,
    pub schema_version: u8,
    pub metadata_hash: [u8; 32],  // Optional extensions
}
// Seeds: [b"epoch_v2", authority.key(), &epoch_id.to_le_bytes()]
```

**Migration Ticket:** `LUCID-V1-001: EpochRecordV2 PDA Migration`

### 14.2 Quote Binding Evolution

Future versions may add:
- ZK proof of execution
- Multi-worker attestation
- Cross-chain verification

---

## 15. Configuration Reference

### 15.1 Worker Simulator (worker-sim-hf)

```env
# Identity
WORKER_ID=worker-sim-hf-001
EXECUTION_MODE=managed_endpoint
PROVIDER_PASSPORT_ID=compute_passport_hf_sim

# HuggingFace
HF_API_KEY=hf_xxxxx

# Offchain
OFFCHAIN_API_URL=http://localhost:3001
OFFCHAIN_API_KEY=xxxxx

# Signing
WORKER_PRIVATE_KEY=ed25519_hex_private_key
```

### 15.2 Reserved GPU Worker (worker-gpu-vllm)

```env
# Identity
WORKER_ID=worker-gpu-lucid-001
EXECUTION_MODE=byo_runtime
PROVIDER_PASSPORT_ID=compute_passport_lucid_a100

# Runtime
RUNTIME_TYPE=vllm
RUNTIME_HASH=sha256:abc123...
VLLM_API_URL=http://localhost:8000

# GPU
GPU_FINGERPRINT=NVIDIA-A100-40GB

# HuggingFace (for model downloads)
HF_API_KEY=hf_xxxxx

# Storage - S3 (hot)
S3_BUCKET=lucid-outputs
S3_REGION=us-east-1
S3_ACCESS_KEY=xxxxx
S3_SECRET_KEY=xxxxx

# Storage - IPFS (cold/publish)
IPFS_API_URL=https://ipfs.infura.io:5001
IPFS_PROJECT_ID=xxxxx
IPFS_PROJECT_SECRET=xxxxx

# Cache
MODEL_CACHE_DIR=/data/models
MODEL_CACHE_MAX_SIZE_GB=500

# Prewarm models (comma-separated)
PREWARM_MODELS=meta-llama/Llama-2-7b-chat-hf,mistralai/Mistral-7B-v0.1

# Offchain
OFFCHAIN_API_URL=http://localhost:3001
OFFCHAIN_API_KEY=xxxxx

# Signing
WORKER_PRIVATE_KEY=ed25519_hex_private_key
```

### 15.3 RunPod Serverless Worker (worker-runpod)

```env
# Identity (set by RunPod)
RUNPOD_ENDPOINT_ID=abc123xyz
RUNPOD_POD_ID=pod-xxxxx

# Capacity Bucket (set in endpoint config)
CAPACITY_BUCKET=a10g-us-west

# Model
MODEL_ID=meta-llama/Llama-2-7b-chat-hf
MODEL_REVISION=main  # or commit SHA for pinned deployments

# Runtime (set at build time)
RUNTIME_HASH=sha256:def456...

# GPU (set by RunPod)
RUNPOD_GPU_TYPE=NVIDIA A10G

# Pricing (from capacity bucket config)
GPU_RATE_PER_SEC=0.000231

# Signing
WORKER_PRIVATE_KEY=ed25519_hex_private_key

# Offchain (optional - for heartbeats)
OFFCHAIN_API_URL=https://api.lucid.network
OFFCHAIN_API_KEY=xxxxx
```

---

## 16. API Reference

### 16.1 Worker API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/quote` | POST | Request a quote for model execution |
| `/jobs` | POST | Submit a job for execution |
| `/jobs/:id` | GET | Get job status and result |
| `/health` | GET | Health check (GPU status) |
| `/metrics` | GET | Prometheus metrics |

### 16.2 Quote Request/Response

```typescript
// POST /quote
interface QuoteRequest {
  offer_id: string;
  model_id: string;
  estimated_input_tokens?: number;
  estimated_output_tokens?: number;
  policy_hash?: string;
  capacity_bucket?: string;  // Preferred bucket
}

interface QuoteResponse {
  quote: OfferQuote;
  valid_until: string;  // ISO timestamp
}
```

### 16.3 Job Request/Response

```typescript
// POST /jobs
interface JobRequest {
  job_id: string;
  model_id: string;
  offer_id: string;
  quote: OfferQuote;
  input: {
    prompt?: string;
    messages?: Array<{ role: string; content: string }>;
  };
  options?: {
    max_tokens?: number;
    temperature?: number;
    publish_ipfs?: boolean;
  };
}

interface JobResponse {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  queue_position?: number;
  estimated_wait_ms?: number;
}

// GET /jobs/:id
interface JobStatusResponse {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: {
    output: any;
    output_ref: string;
    outputs_hash: string;
    metrics: {
      ttft_ms: number;
      tokens_in: number;
      tokens_out: number;
      total_latency_ms: number;
      queue_time_ms?: number;
      cold_start_ms?: number;
    };
    billing?: {
      compute_seconds: number;
      gpu_type: string;
      cost_usd: number;
    };
    ipfs_cid?: string;  // If publish_ipfs was requested
  };
  error?: {
    code: string;
    message: string;
  };
  receipt_id?: string;
}
```

---

## 17. Appendix: Schema Files

Created in Phase 1:
- `schemas/OfferQuote.schema.json`
- `schemas/JobRequest.schema.json`
- `schemas/JobResult.schema.json`
- `schemas/WorkerIdentity.schema.json`
- `schemas/ComputeOffer.schema.json`

Extended in Phase 1:
- `schemas/RunReceipt.schema.json` (13 new fields)
- `schemas/ComputeMeta.schema.json`

Added in v0.2:
- `schemas/CapacityBucket.schema.json`
- `schemas/EndpointHealth.schema.json`
- `schemas/EndpointHeartbeat.schema.json`

---

## 18. Migration Notes: v0.1 → v0.2

### Breaking Changes

1. **WorkerIdentity**: Added optional `endpoint_id`, `pod_id`, `capacity_bucket` fields
2. **OfferQuote.price**: Added optional `gpu_rate_per_sec` field
3. **OfferQuote**: Added optional `capacity_bucket` field
4. **ExtendedReceiptBody**: Added `capacity_bucket`, `endpoint_id`, `billing`, `model_revision` fields
5. **ExtendedReceiptBody.metrics**: Added `queue_time_ms`, `cold_start_ms` fields

### Non-Breaking Changes

1. **ExecutionMode enum**: Added `RUNPOD_SERVERLESS` value
2. **Error codes**: Simplified to 4 codes (`INVALID_QUOTE`, `TIMEOUT`, `OOM`, `INFERENCE_ERROR`)
3. **Model policy**: Added `ModelPolicy` interface for enterprise/chain use

### Migration Steps

1. Update TypeScript types to include new optional fields
2. Update receipt validation to accept new fields
3. Deploy new worker images with updated schema
4. Update quote generation to include `capacity_bucket` when applicable
5. Update monitoring dashboards for new metrics

---

*Document generated: 10 February 2026*
*Architecture Version: 0.2.0*
