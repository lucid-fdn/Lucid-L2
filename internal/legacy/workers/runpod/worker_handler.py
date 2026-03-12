"""
Lucid RunPod Serverless Worker Handler

This worker implements the runpod_serverless execution mode for Fluid Compute v0.2.
It handles inference requests, validates quotes, executes via vLLM, and signs receipts.

Trust Model:
- The endpoint is the trust boundary (your compute passport)
- Your container runs your code, signs receipts with your key
- Receipts attest to execution integrity, not hardware exclusivity

Environment Variables (required):
- WORKER_PRIVATE_KEY: ed25519 private key (hex) for signing receipts
- MODEL_ID: HuggingFace model ID to load
- CAPACITY_BUCKET: Capacity bucket name (from YAML config)
- GPU_RATE_PER_SEC: GPU rate per second in USD

Environment Variables (set by RunPod):
- RUNPOD_ENDPOINT_ID: Endpoint ID (trust boundary)
- RUNPOD_POD_ID: Ephemeral pod ID
- RUNPOD_GPU_TYPE: GPU type allocated

Optional:
- MODEL_REVISION: Model revision (commit SHA or tag) for auditability
- RUNTIME_HASH: Docker image digest (set at build time)
- OFFCHAIN_API_URL: URL for heartbeat/metrics reporting
"""

import os
import sys
import time
import json
import hashlib
import logging
from typing import Any, Dict, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('lucid-worker')

# Import RunPod SDK
try:
    import runpod
except ImportError:
    logger.error("runpod package not installed. Install with: pip install runpod")
    sys.exit(1)

# Import signing library
try:
    from nacl.signing import SigningKey
    from nacl.exceptions import BadSignatureError
except ImportError:
    logger.error("pynacl package not installed. Install with: pip install pynacl")
    sys.exit(1)

# Import vLLM (loaded lazily to allow cold start optimization)
vllm_engine = None
MODEL_LOADED = False


# =============================================================================
# CONFIGURATION
# =============================================================================

def get_config() -> Dict[str, Any]:
    """Load configuration from environment variables."""
    config = {
        # Required
        'worker_private_key': os.environ.get('WORKER_PRIVATE_KEY'),
        'model_id': os.environ.get('MODEL_ID', 'meta-llama/Llama-2-7b-chat-hf'),
        'capacity_bucket': os.environ.get('CAPACITY_BUCKET', 'unknown'),
        'gpu_rate_per_sec': float(os.environ.get('GPU_RATE_PER_SEC', '0.000231')),

        # Set by RunPod
        'endpoint_id': os.environ.get('RUNPOD_ENDPOINT_ID', 'unknown'),
        'pod_id': os.environ.get('RUNPOD_POD_ID', 'unknown'),
        'gpu_type': os.environ.get('RUNPOD_GPU_TYPE', 'unknown'),

        # Optional
        'model_revision': os.environ.get('MODEL_REVISION'),
        'runtime_hash': os.environ.get('RUNTIME_HASH', ''),
        'offchain_api_url': os.environ.get('OFFCHAIN_API_URL'),

        # vLLM settings
        'tensor_parallel_size': int(os.environ.get('TENSOR_PARALLEL_SIZE', '1')),
        'max_model_len': int(os.environ.get('MAX_MODEL_LEN', '4096')),
        'trust_remote_code': os.environ.get('TRUST_REMOTE_CODE', 'true').lower() == 'true',
    }

    if not config['worker_private_key']:
        raise ValueError("WORKER_PRIVATE_KEY environment variable is required")

    return config


CONFIG = None
SIGNING_KEY = None
OPERATOR_PUBKEY = None


def init_signing():
    """Initialize signing key from environment."""
    global CONFIG, SIGNING_KEY, OPERATOR_PUBKEY

    CONFIG = get_config()
    SIGNING_KEY = SigningKey(bytes.fromhex(CONFIG['worker_private_key']))
    OPERATOR_PUBKEY = SIGNING_KEY.verify_key.encode().hex()

    logger.info(f"Initialized signing with pubkey: {OPERATOR_PUBKEY[:16]}...")


# =============================================================================
# MODEL LOADING (Outside Handler - runs once on cold start)
# =============================================================================

def load_model():
    """Load the model into GPU memory. Called once on cold start."""
    global vllm_engine, MODEL_LOADED, CONFIG

    if MODEL_LOADED:
        return

    if CONFIG is None:
        init_signing()

    logger.info(f"Loading model: {CONFIG['model_id']}")
    start_time = time.time()

    try:
        from vllm import LLM

        vllm_engine = LLM(
            model=CONFIG['model_id'],
            revision=CONFIG['model_revision'],
            tensor_parallel_size=CONFIG['tensor_parallel_size'],
            max_model_len=CONFIG['max_model_len'],
            trust_remote_code=CONFIG['trust_remote_code'],
        )

        load_time = time.time() - start_time
        MODEL_LOADED = True
        logger.info(f"Model loaded successfully in {load_time:.2f}s")

    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise


# =============================================================================
# CRYPTOGRAPHIC UTILITIES
# =============================================================================

def canonical_sha256(obj: Any) -> str:
    """Compute SHA256 hash of canonicalized JSON (sorted keys, no whitespace)."""
    canonical = json.dumps(obj, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode()).hexdigest()


def sign_receipt(receipt: Dict) -> str:
    """Sign receipt hash with ed25519 key."""
    # Remove signature fields before hashing
    receipt_body = {k: v for k, v in receipt.items()
                    if k not in ('signature', 'operator_pubkey', 'receipt_hash')}
    receipt_hash = canonical_sha256(receipt_body)
    signature = SIGNING_KEY.sign(bytes.fromhex(receipt_hash))
    return signature.signature.hex()


# =============================================================================
# QUOTE VALIDATION
# =============================================================================

def validate_quote(quote: Dict) -> bool:
    """
    Validate quote signature and expiration.

    Raises:
        ValueError: If quote is invalid with error code
    """
    # 1. Check expiration
    if time.time() > quote.get('expires_at', 0):
        raise ValueError("INVALID_QUOTE")  # Using v0.2 simplified error code

    # 2. Verify quote hash matches preimage
    preimage = {
        'quote_id': quote.get('quote_id'),
        'offer_id': quote.get('offer_id'),
        'model_id': quote.get('model_id'),
        'policy_hash': quote.get('policy_hash'),
        'max_input_tokens': quote.get('max_input_tokens'),
        'max_output_tokens': quote.get('max_output_tokens'),
        'price': quote.get('price'),
        'capacity_bucket': quote.get('capacity_bucket'),
        'expires_at': quote.get('expires_at'),
    }
    expected_hash = canonical_sha256(preimage)

    if expected_hash != quote.get('quote_hash'):
        logger.warning(f"Quote hash mismatch: expected {expected_hash}, got {quote.get('quote_hash')}")
        raise ValueError("INVALID_QUOTE")

    # 3. Signature verification (simplified - in production, verify against known pubkeys)
    # TODO: Implement full signature verification against orchestrator pubkey registry

    return True


# =============================================================================
# INFERENCE EXECUTION
# =============================================================================

def execute_inference(
    prompt: str,
    max_tokens: int,
    temperature: float = 0.7,
) -> Dict[str, Any]:
    """
    Execute inference using vLLM engine.

    Returns:
        Dict with output text and token counts
    """
    from vllm import SamplingParams

    sampling_params = SamplingParams(
        max_tokens=max_tokens,
        temperature=temperature,
    )

    outputs = vllm_engine.generate([prompt], sampling_params)
    output_text = outputs[0].outputs[0].text

    # Get token counts from vLLM
    tokens_in = len(outputs[0].prompt_token_ids)
    tokens_out = len(outputs[0].outputs[0].token_ids)

    return {
        'text': output_text,
        'tokens_in': tokens_in,
        'tokens_out': tokens_out,
    }


def messages_to_prompt(messages: list) -> str:
    """Convert chat messages to a prompt string."""
    # Simple conversion - production would use model-specific templates
    prompt_parts = []
    for msg in messages:
        role = msg.get('role', 'user')
        content = msg.get('content', '')
        prompt_parts.append(f"{role}: {content}")
    return "\n".join(prompt_parts)


# =============================================================================
# RECEIPT BUILDING
# =============================================================================

def build_receipt(
    job_id: str,
    quote: Dict,
    job_input: Dict,
    output: Dict,
    start_ts: float,
    end_ts: float,
    queue_time_ms: int,
    cold_start_ms: int = 0,
) -> Dict:
    """Build a signed receipt for the execution."""

    compute_seconds = end_ts - start_ts

    # Build output object for hashing
    output_obj = {
        'text': output['text'],
        'model': CONFIG['model_id'],
        'usage': {
            'prompt_tokens': output['tokens_in'],
            'completion_tokens': output['tokens_out'],
        }
    }
    outputs_hash = canonical_sha256(output_obj)

    # Build job hash
    job_hash = canonical_sha256({
        'job_id': job_id,
        'model_id': quote['model_id'],
        'quote_hash': quote['quote_hash'],
        'input_hash': canonical_sha256(job_input),
    })

    receipt = {
        'schema_version': '1.0',
        'run_id': job_id,
        'timestamp': int(time.time()),
        'model_passport_id': quote['model_id'],
        'model_revision': CONFIG['model_revision'],
        'compute_passport_id': quote['offer_id'],
        'policy_hash': quote['policy_hash'],
        'job_hash': job_hash,
        'quote_hash': quote['quote_hash'],
        'node_id': CONFIG['pod_id'],
        'runtime_hash': CONFIG['runtime_hash'] or None,
        'gpu_fingerprint': CONFIG['gpu_type'],
        'capacity_bucket': CONFIG['capacity_bucket'],
        'endpoint_id': CONFIG['endpoint_id'],
        'billing': {
            'compute_seconds': round(compute_seconds, 3),
            'gpu_type': CONFIG['gpu_type'],
            'cost_usd': round(compute_seconds * CONFIG['gpu_rate_per_sec'], 6),
        },
        'outputs_hash': outputs_hash,
        'output_ref': f"inline:{job_id}",
        'execution_mode': 'runpod_serverless',
        'start_ts': int(start_ts),
        'end_ts': int(end_ts),
        'runtime': 'vllm',
        'metrics': {
            'ttft_ms': int((end_ts - start_ts) * 1000),  # Simplified - would track actual TTFT
            'tokens_in': output['tokens_in'],
            'tokens_out': output['tokens_out'],
            'queue_time_ms': queue_time_ms,
            'cold_start_ms': cold_start_ms,
        },
    }

    # Sign the receipt
    receipt['signature'] = sign_receipt(receipt)
    receipt['operator_pubkey'] = OPERATOR_PUBKEY

    return receipt


def build_error_receipt(
    job_id: str,
    quote: Dict,
    job_input: Dict,
    error_code: str,
    error_message: str,
    start_ts: float,
    end_ts: float,
    queue_time_ms: int,
) -> Dict:
    """Build a signed error receipt."""

    compute_seconds = end_ts - start_ts

    # Build job hash
    job_hash = canonical_sha256({
        'job_id': job_id,
        'model_id': quote['model_id'],
        'quote_hash': quote['quote_hash'],
        'input_hash': canonical_sha256(job_input),
    })

    receipt = {
        'schema_version': '1.0',
        'run_id': job_id,
        'timestamp': int(time.time()),
        'model_passport_id': quote['model_id'],
        'model_revision': CONFIG['model_revision'],
        'compute_passport_id': quote['offer_id'],
        'policy_hash': quote['policy_hash'],
        'job_hash': job_hash,
        'quote_hash': quote['quote_hash'],
        'node_id': CONFIG['pod_id'],
        'runtime_hash': CONFIG['runtime_hash'] or None,
        'gpu_fingerprint': CONFIG['gpu_type'],
        'capacity_bucket': CONFIG['capacity_bucket'],
        'endpoint_id': CONFIG['endpoint_id'],
        'billing': {
            'compute_seconds': round(compute_seconds, 3),
            'gpu_type': CONFIG['gpu_type'],
            'cost_usd': round(compute_seconds * CONFIG['gpu_rate_per_sec'], 6),
        },
        'outputs_hash': '',  # Empty for errors
        'output_ref': '',    # Empty for errors
        'execution_mode': 'runpod_serverless',
        'start_ts': int(start_ts),
        'end_ts': int(end_ts),
        'runtime': 'vllm',
        'metrics': {
            'ttft_ms': 0,
            'tokens_in': 0,
            'tokens_out': 0,
            'queue_time_ms': queue_time_ms,
            'cold_start_ms': 0,
        },
        'error_code': error_code,
        'error_message': error_message,
    }

    # Sign the receipt
    receipt['signature'] = sign_receipt(receipt)
    receipt['operator_pubkey'] = OPERATOR_PUBKEY

    return receipt


# =============================================================================
# MAIN HANDLER
# =============================================================================

def handler(job: Dict) -> Dict:
    """
    RunPod serverless handler for Lucid inference.

    Expected job input:
    {
        "quote": { ... },           # OfferQuote object
        "messages": [...],          # Chat messages (optional)
        "prompt": "...",            # Raw prompt (optional)
        "max_tokens": 512,          # Optional, defaults from quote
        "temperature": 0.7,         # Optional
        "submitted_at": 1234567890  # Unix timestamp when job was submitted
    }

    Returns:
    {
        "output": { ... },          # Model output
        "receipt": { ... },         # Signed receipt
    }

    Or on error:
    {
        "error": {
            "code": "...",
            "message": "..."
        },
        "receipt": { ... }          # Error receipt (if execution started)
    }
    """
    job_input = job.get('input', {})
    job_id = job.get('id', f"job_{int(time.time() * 1000)}")

    # Track timing
    submitted_at = job_input.get('submitted_at', time.time())
    queue_time_ms = int((time.time() - submitted_at) * 1000)
    cold_start_ms = 0

    # Ensure model is loaded (tracks cold start)
    if not MODEL_LOADED:
        cold_start_start = time.time()
        load_model()
        cold_start_ms = int((time.time() - cold_start_start) * 1000)

    start_ts = time.time()

    try:
        # 1. Parse and validate quote
        quote = job_input.get('quote')
        if not quote:
            return {
                'error': {
                    'code': 'INVALID_QUOTE',
                    'message': 'Missing quote in job input',
                }
            }

        validate_quote(quote)

        # 2. Extract inference parameters
        messages = job_input.get('messages', [])
        prompt = job_input.get('prompt', '')
        max_tokens = job_input.get('max_tokens', quote.get('max_output_tokens', 512))
        temperature = job_input.get('temperature', 0.7)

        # Convert messages to prompt if needed
        if messages and not prompt:
            prompt = messages_to_prompt(messages)

        if not prompt:
            return {
                'error': {
                    'code': 'INFERENCE_ERROR',
                    'message': 'No prompt or messages provided',
                }
            }

        # 3. Execute inference
        output = execute_inference(prompt, max_tokens, temperature)
        end_ts = time.time()

        # 4. Build output object
        output_obj = {
            'text': output['text'],
            'model': CONFIG['model_id'],
            'usage': {
                'prompt_tokens': output['tokens_in'],
                'completion_tokens': output['tokens_out'],
            }
        }

        # 5. Build and sign receipt
        receipt = build_receipt(
            job_id=job_id,
            quote=quote,
            job_input=job_input,
            output=output,
            start_ts=start_ts,
            end_ts=end_ts,
            queue_time_ms=queue_time_ms,
            cold_start_ms=cold_start_ms,
        )

        logger.info(
            f"Job {job_id} completed: "
            f"tokens_in={output['tokens_in']}, tokens_out={output['tokens_out']}, "
            f"duration={end_ts - start_ts:.2f}s, cost=${receipt['billing']['cost_usd']:.6f}"
        )

        return {
            'output': output_obj,
            'receipt': receipt,
        }

    except ValueError as e:
        # Known error (quote validation, etc.)
        error_code = str(e)
        end_ts = time.time()

        logger.warning(f"Job {job_id} failed with {error_code}")

        # Build error receipt if we have a quote
        receipt = None
        if 'quote' in job_input:
            receipt = build_error_receipt(
                job_id=job_id,
                quote=job_input['quote'],
                job_input=job_input,
                error_code=error_code,
                error_message=str(e),
                start_ts=start_ts,
                end_ts=end_ts,
                queue_time_ms=queue_time_ms,
            )

        response = {
            'error': {
                'code': error_code,
                'message': str(e),
            }
        }
        if receipt:
            response['receipt'] = receipt
        return response

    except torch.cuda.OutOfMemoryError as e:
        # OOM error
        end_ts = time.time()

        logger.error(f"Job {job_id} OOM: {e}")

        receipt = None
        if 'quote' in job_input:
            receipt = build_error_receipt(
                job_id=job_id,
                quote=job_input['quote'],
                job_input=job_input,
                error_code='OOM',
                error_message=str(e),
                start_ts=start_ts,
                end_ts=end_ts,
                queue_time_ms=queue_time_ms,
            )

        response = {
            'error': {
                'code': 'OOM',
                'message': str(e),
            }
        }
        if receipt:
            response['receipt'] = receipt
        return response

    except Exception as e:
        # All other errors
        end_ts = time.time()

        logger.error(f"Job {job_id} error: {e}", exc_info=True)

        receipt = None
        if 'quote' in job_input:
            try:
                receipt = build_error_receipt(
                    job_id=job_id,
                    quote=job_input['quote'],
                    job_input=job_input,
                    error_code='INFERENCE_ERROR',
                    error_message=str(e),
                    start_ts=start_ts,
                    end_ts=end_ts,
                    queue_time_ms=queue_time_ms,
                )
            except Exception:
                pass  # Don't fail if receipt building fails

        response = {
            'error': {
                'code': 'INFERENCE_ERROR',
                'message': str(e),
            }
        }
        if receipt:
            response['receipt'] = receipt
        return response


# =============================================================================
# ENTRY POINT
# =============================================================================

# Import torch for OOM detection (lazy import to avoid slow startup)
try:
    import torch
except ImportError:
    # Create a dummy class for systems without torch
    class torch:
        class cuda:
            class OutOfMemoryError(Exception):
                pass


if __name__ == '__main__':
    # Initialize signing on startup
    init_signing()

    # Optionally preload model (set PRELOAD_MODEL=true to load on startup)
    if os.environ.get('PRELOAD_MODEL', 'false').lower() == 'true':
        load_model()

    # Start the serverless worker
    logger.info(f"Starting Lucid RunPod worker for {CONFIG['model_id']}")
    logger.info(f"Endpoint: {CONFIG['endpoint_id']}, Bucket: {CONFIG['capacity_bucket']}")

    runpod.serverless.start({'handler': handler})
