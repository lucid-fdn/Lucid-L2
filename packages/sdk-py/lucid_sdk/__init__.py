"""
LucidLayer Python SDK
=====================

Python SDK for LucidLayer - Decentralized AI Compute Orchestration.

Example:
    >>> from lucid_sdk import LucidClient
    >>> client = LucidClient(base_url="https://api.lucidlayer.io")
    >>> result = client.run.inference(
    ...     model_passport_id="model-id",
    ...     prompt="Hello, world!"
    ... )
    >>> print(result.text)
"""

from .client import LucidClient
from .types import (
    Passport,
    PassportType,
    PassportStatus,
    ModelMeta,
    ComputeMeta,
    Policy,
    InferenceRequest,
    InferenceResult,
    StreamChunk,
    ChatMessage,
    ChatCompletionRequest,
    ChatCompletionResponse,
    Receipt,
    ReceiptProof,
    ReceiptVerification,
    Epoch,
    LucidError,
    ValidationError,
    NotFoundError,
    NoCompatibleComputeError,
    ComputeUnavailableError,
    TimeoutError as LucidTimeoutError,
)

__version__ = "1.0.0"
__all__ = [
    "LucidClient",
    "Passport",
    "PassportType",
    "PassportStatus",
    "ModelMeta",
    "ComputeMeta",
    "Policy",
    "InferenceRequest",
    "InferenceResult",
    "StreamChunk",
    "ChatMessage",
    "ChatCompletionRequest",
    "ChatCompletionResponse",
    "Receipt",
    "ReceiptProof",
    "ReceiptVerification",
    "Epoch",
    "LucidError",
    "ValidationError",
    "NotFoundError",
    "NoCompatibleComputeError",
    "ComputeUnavailableError",
    "LucidTimeoutError",
]
