# LucidLayer Python SDK

Official Python SDK for the LucidLayer AI compute orchestration platform.

## Installation

```bash
pip install lucidlayer-sdk
```

Or with poetry:

```bash
poetry add lucidlayer-sdk
```

## Quick Start

```python
from lucid_sdk import LucidClient

# Initialize the client
client = LucidClient(
    base_url="https://api.lucidlayer.io",
    api_key="your-api-key"
)

# Simple inference
result = client.run.inference(
    model_passport_id="model_abc123",
    prompt="Explain quantum computing"
)

print(result.output)
print(f"Tokens used: {result.tokens_in} in, {result.tokens_out} out")
```

## Features

- **Passport Management** - Create, read, update, and list AI passports
- **Search & Discovery** - Find models and compute by capabilities
- **Policy-Based Matching** - Match models to optimal compute
- **Inference Execution** - Run inference with automatic orchestration
- **Streaming Support** - Real-time token streaming
- **Receipt Verification** - Cryptographic proof of execution
- **OpenAI Compatibility** - Drop-in replacement for OpenAI client

## Usage Examples

### Creating Passports

```python
from lucid_sdk import LucidClient
from lucid_sdk.types import PassportType

client = LucidClient(base_url="http://localhost:3000")

# Create a model passport
passport = client.passports.create(
    type=PassportType.MODEL,
    metadata={
        "name": "My Custom Model",
        "description": "A fine-tuned language model",
        "model_id": "my-org/my-model",
        "runtime_recommended": "vllm",
        "format": "safetensors",
        "parameters_b": 7.0,
        "requirements": {
            "min_vram_gb": 16
        }
    },
    owner="wallet_address_here"
)

print(f"Created passport: {passport.passport_id}")
```

### Searching Models

```python
# Search for models by criteria
models = client.search.models(
    runtime="vllm",
    max_vram=24,
    tags=["llm", "chat"]
)

for model in models:
    print(f"{model.name} - {model.passport_id}")
```

### Searching Compute

```python
# Find compute providers
compute = client.search.compute(
    regions=["us-east-1", "eu-west-1"],
    runtimes=["vllm", "tgi"],
    min_vram_gb=48
)

for provider in compute:
    print(f"{provider.name} - {provider.regions}")
```

### Policy-Based Matching

```python
# Match model to optimal compute
matches = client.match.compute_for_model(
    model_id="model_abc123",
    policy={
        "regions": ["us-east-1"],
        "max_cost_per_token": 0.0001,
        "preferred_runtimes": ["vllm"]
    }
)

if matches:
    best = matches[0]
    print(f"Best match: {best.compute.name} (score: {best.score})")
```

### Running Inference

```python
# Simple inference
result = client.run.inference(
    model_passport_id="model_abc123",
    prompt="What is the meaning of life?",
    max_tokens=100,
    temperature=0.7
)

print(result.output)
print(f"Receipt ID: {result.receipt_id}")
```

### Streaming Inference

```python
# Stream tokens as they're generated
for chunk in client.run.inference_stream(
    model_passport_id="model_abc123",
    prompt="Write a story about a robot",
    max_tokens=500
):
    if chunk.output:
        print(chunk.output, end="", flush=True)
    if chunk.done:
        print(f"\n\nTokens: {chunk.tokens_out}")
```

### OpenAI-Compatible Chat

```python
# Use the OpenAI-compatible interface
response = client.run.chat(
    model="passport:model_abc123",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)
```

### Streaming Chat

```python
# Stream chat completions
for chunk in client.run.chat_completion_stream(
    model="passport:model_abc123",
    messages=[
        {"role": "user", "content": "Count to 10"}
    ]
):
    if chunk.choices and chunk.choices[0].delta.get("content"):
        print(chunk.choices[0].delta["content"], end="", flush=True)
```

### Receipt Verification

```python
# Get a receipt
receipt = client.receipts.get(run_id="run_xyz789")

print(f"Model: {receipt.model_passport_id}")
print(f"Compute: {receipt.compute_passport_id}")
print(f"Tokens: {receipt.tokens_in} in, {receipt.tokens_out} out")

# Verify the receipt
verification = client.receipts.verify(run_id="run_xyz789")

if verification.valid:
    print("✓ Receipt verified!")
    print(f"Anchored in tx: {verification.anchor_tx}")
else:
    print(f"✗ Verification failed: {verification.reason}")

# Wait for anchor (if not yet anchored)
receipt = client.receipts.wait_for_anchor(
    run_id="run_xyz789",
    timeout_seconds=300
)
```

### Epoch Management

```python
# Get current epoch
epoch = client.receipts.get_current_epoch()
print(f"Current epoch: {epoch.epoch_id}")
print(f"Receipts: {epoch.leaf_count}")

# List epochs
epochs = client.receipts.list_epochs(status="anchored")
for e in epochs:
    print(f"{e.epoch_id}: {e.leaf_count} receipts, tx: {e.chain_tx}")
```

## Configuration

### Client Options

```python
from lucid_sdk import LucidClient

client = LucidClient(
    base_url="https://api.lucidlayer.io",
    api_key="your-api-key",
    timeout=30.0,  # Request timeout in seconds
    max_retries=3,  # Number of retries for failed requests
    retry_delay=1.0  # Delay between retries
)
```

### Environment Variables

You can also configure the client using environment variables:

```bash
export LUCID_BASE_URL="https://api.lucidlayer.io"
export LUCID_API_KEY="your-api-key"
```

```python
import os
from lucid_sdk import LucidClient

client = LucidClient(
    base_url=os.getenv("LUCID_BASE_URL", "http://localhost:3000"),
    api_key=os.getenv("LUCID_API_KEY")
)
```

## Error Handling

```python
from lucid_sdk import LucidClient
from lucid_sdk.types import LucidError

client = LucidClient(base_url="http://localhost:3000")

try:
    result = client.run.inference(
        model_passport_id="invalid_id",
        prompt="Hello"
    )
except LucidError as e:
    print(f"Error code: {e.code}")
    print(f"Message: {e.message}")
    if e.details:
        print(f"Details: {e.details}")
```

### Error Codes

| Code | Description |
|------|-------------|
| `PASSPORT_NOT_FOUND` | Requested passport does not exist |
| `NO_COMPATIBLE_COMPUTE` | No compute matches policy |
| `COMPUTE_UNAVAILABLE` | Selected compute is offline |
| `COMPUTE_TIMEOUT` | Inference timed out |
| `VALIDATION_ERROR` | Invalid request parameters |
| `UNAUTHORIZED` | Invalid or missing API key |
| `RATE_LIMITED` | Too many requests |

## Type Definitions

The SDK includes full Pydantic models for type safety:

```python
from lucid_sdk.types import (
    Passport,
    PassportType,
    ModelMeta,
    ComputeMeta,
    Policy,
    InferenceResult,
    Receipt,
    Epoch,
    MatchResult,
    ChatCompletionRequest,
    ChatCompletionResponse
)
```

## API Reference

### LucidClient

The main client class that provides access to all SDK modules.

#### Properties

- `passports` - PassportModule for passport CRUD operations
- `search` - SearchModule for discovery and filtering
- `match` - MatchModule for policy-based matching
- `run` - RunModule for inference execution
- `receipts` - ReceiptModule for receipt and epoch management

### PassportModule

| Method | Description |
|--------|-------------|
| `create(type, metadata, owner, license, permissions)` | Create a new passport |
| `get(passport_id)` | Get passport by ID |
| `update(passport_id, metadata, license, permissions)` | Update a passport |
| `delete(passport_id)` | Delete a passport |
| `list(filters)` | List passports with filtering |
| `sync_to_chain(passport_id)` | Sync passport to blockchain |

### SearchModule

| Method | Description |
|--------|-------------|
| `models(runtime, format, max_vram, tags, search, page, per_page)` | Search model passports |
| `compute(regions, runtimes, provider_type, min_vram_gb, gpu, page, per_page)` | Search compute passports |
| `tools(tags, search, page, per_page)` | Search tool passports |
| `datasets(tags, search, page, per_page)` | Search dataset passports |
| `agents(tags, search, page, per_page)` | Search agent passports |

### MatchModule

| Method | Description |
|--------|-------------|
| `compute_for_model(model_id, policy)` | Find matching compute for model |
| `best(model_id, policy)` | Get best single match |
| `explain(model_id, policy)` | Get detailed match explanation |
| `route(model_id, policy)` | Get compute routing decision |

### RunModule

| Method | Description |
|--------|-------------|
| `inference(model_passport_id, prompt, ...)` | Run inference |
| `inference_stream(model_passport_id, prompt, ...)` | Stream inference |
| `chat_completion(request)` | OpenAI-compatible chat |
| `chat_completion_stream(request)` | Stream chat completion |
| `complete(model, prompt, ...)` | Simple completion |
| `chat(model, messages, ...)` | Simple chat |

### ReceiptModule

| Method | Description |
|--------|-------------|
| `get(run_id)` | Get receipt by run ID |
| `verify(run_id)` | Verify receipt integrity |
| `get_proof(run_id)` | Get Merkle proof |
| `wait_for_anchor(run_id, timeout_seconds)` | Wait for chain anchor |
| `get_epoch(epoch_id)` | Get epoch by ID |
| `get_current_epoch()` | Get current open epoch |
| `list_epochs(project_id, status, page, per_page)` | List epochs |

## Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

Apache 2.0 - See [LICENSE](LICENSE) for details.
