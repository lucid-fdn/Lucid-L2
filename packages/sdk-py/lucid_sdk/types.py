"""
LucidLayer SDK Types
====================

Pydantic models and type definitions for the LucidLayer SDK.
"""

from enum import Enum
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


# =============================================================================
# ENUMS
# =============================================================================

class PassportType(str, Enum):
    """Type of passport."""
    MODEL = "model"
    COMPUTE = "compute"
    TOOL = "tool"
    DATASET = "dataset"
    AGENT = "agent"


class PassportStatus(str, Enum):
    """Status of a passport."""
    ACTIVE = "active"
    DEPRECATED = "deprecated"
    REVOKED = "revoked"


class EpochStatus(str, Enum):
    """Status of an epoch."""
    OPEN = "open"
    ANCHORING = "anchoring"
    ANCHORED = "anchored"
    FAILED = "failed"


# =============================================================================
# METADATA MODELS
# =============================================================================

class Requirements(BaseModel):
    """Model requirements."""
    min_vram_gb: Optional[int] = None
    max_context_length: Optional[int] = None
    recommended_batch_size: Optional[int] = None


class ModelMeta(BaseModel):
    """Metadata for a model passport."""
    name: str
    format: str  # e.g., 'safetensors', 'gguf'
    runtime_recommended: str  # e.g., 'vllm', 'tgi', 'tensorrt'
    hf_repo: Optional[str] = None
    model_type: Optional[str] = None
    architecture: Optional[str] = None
    license: Optional[str] = None
    requirements: Optional[Requirements] = None
    quantization: Optional[str] = None
    tensor_parallel_size: Optional[int] = None

    class Config:
        extra = "allow"


class Hardware(BaseModel):
    """Hardware specification."""
    gpu: str
    vram_gb: int
    cpu_cores: Optional[int] = None
    ram_gb: Optional[int] = None


class RuntimeConfig(BaseModel):
    """Runtime configuration."""
    name: str  # 'vllm', 'tgi', 'tensorrt', 'openai'
    version: Optional[str] = None
    max_batch_size: Optional[int] = None
    max_concurrent_requests: Optional[int] = None


class Endpoints(BaseModel):
    """Compute endpoints."""
    inference_url: str
    health_url: Optional[str] = None
    metrics_url: Optional[str] = None


class Pricing(BaseModel):
    """Compute pricing."""
    price_per_1k_tokens: Optional[float] = None
    currency: Optional[str] = None


class ComputeMeta(BaseModel):
    """Metadata for a compute passport."""
    name: str
    provider_type: str  # 'cloud', 'depin', 'onprem'
    regions: List[str]
    hardware: Hardware
    runtimes: List[RuntimeConfig]
    endpoints: Optional[Endpoints] = None
    pricing: Optional[Pricing] = None

    class Config:
        extra = "allow"


# =============================================================================
# PASSPORT MODELS
# =============================================================================

class OnChainInfo(BaseModel):
    """On-chain sync information."""
    pda: Optional[str] = None
    tx: Optional[str] = None
    synced_at: Optional[int] = None


class Passport(BaseModel):
    """A LucidLayer passport."""
    passport_id: str
    type: PassportType
    owner: str
    name: Optional[str] = None
    description: Optional[str] = None
    version: Optional[str] = None
    tags: Optional[List[str]] = None
    status: PassportStatus = PassportStatus.ACTIVE
    metadata: Dict[str, Any]
    metadata_hash: str
    created_at: int
    updated_at: int
    on_chain: Optional[OnChainInfo] = None


class CreatePassportRequest(BaseModel):
    """Request to create a passport."""
    type: PassportType
    owner: str
    metadata: Dict[str, Any]
    name: Optional[str] = None
    description: Optional[str] = None
    version: Optional[str] = None
    tags: Optional[List[str]] = None


class UpdatePassportRequest(BaseModel):
    """Request to update a passport."""
    metadata: Optional[Dict[str, Any]] = None
    name: Optional[str] = None
    description: Optional[str] = None
    version: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[PassportStatus] = None


class PassportFilters(BaseModel):
    """Filters for listing passports."""
    type: Optional[Union[PassportType, List[PassportType]]] = None
    owner: Optional[str] = None
    status: Optional[Union[PassportStatus, List[PassportStatus]]] = None
    tags: Optional[List[str]] = None
    tag_match: Optional[str] = None  # 'all' or 'any'
    search: Optional[str] = None
    page: Optional[int] = None
    per_page: Optional[int] = None
    sort_by: Optional[str] = None
    sort_order: Optional[str] = None


# =============================================================================
# SEARCH MODELS
# =============================================================================

class ModelSearchFilters(BaseModel):
    """Filters for searching models."""
    runtime: Optional[str] = None
    format: Optional[str] = None
    max_vram: Optional[int] = None
    owner: Optional[str] = None
    tags: Optional[List[str]] = None
    search: Optional[str] = None
    page: Optional[int] = None
    per_page: Optional[int] = None


class ComputeSearchFilters(BaseModel):
    """Filters for searching compute providers."""
    regions: Optional[List[str]] = None
    runtimes: Optional[List[str]] = None
    provider_type: Optional[str] = None
    min_vram: Optional[int] = None
    gpu: Optional[str] = None
    owner: Optional[str] = None
    tags: Optional[List[str]] = None
    search: Optional[str] = None
    page: Optional[int] = None
    per_page: Optional[int] = None


# =============================================================================
# POLICY MODELS
# =============================================================================

class PolicyConstraints(BaseModel):
    """Policy constraints."""
    allowed_regions: Optional[List[str]] = None
    denied_regions: Optional[List[str]] = None
    allowed_providers: Optional[List[str]] = None
    denied_providers: Optional[List[str]] = None
    min_vram_gb: Optional[int] = None
    max_vram_gb: Optional[int] = None
    allowed_runtimes: Optional[List[str]] = None
    allowed_gpus: Optional[List[str]] = None
    denied_gpus: Optional[List[str]] = None


class PolicyPreferences(BaseModel):
    """Policy preferences."""
    preferred_regions: Optional[List[str]] = None
    preferred_providers: Optional[List[str]] = None
    preferred_runtimes: Optional[List[str]] = None
    prefer_low_latency: Optional[bool] = None
    prefer_low_cost: Optional[bool] = None


class PolicyFallback(BaseModel):
    """Policy fallback settings."""
    enabled: Optional[bool] = None
    max_attempts: Optional[int] = None


class Policy(BaseModel):
    """A matching policy."""
    version: str = "1.0"
    constraints: Optional[PolicyConstraints] = None
    preferences: Optional[PolicyPreferences] = None
    fallback: Optional[PolicyFallback] = None


# =============================================================================
# EXECUTION MODELS
# =============================================================================

class ChatMessage(BaseModel):
    """A chat message."""
    role: str  # 'system', 'user', 'assistant', 'function'
    content: str
    name: Optional[str] = None
    function_call: Optional[Dict[str, str]] = None


class InferenceRequest(BaseModel):
    """Request for inference execution."""
    model_passport_id: Optional[str] = None
    model: Optional[str] = None
    prompt: Optional[str] = None
    messages: Optional[List[ChatMessage]] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    top_k: Optional[int] = None
    stop: Optional[List[str]] = None
    stream: Optional[bool] = None
    policy: Optional[Policy] = None
    compute_passport_id: Optional[str] = None
    trace_id: Optional[str] = None
    request_id: Optional[str] = None


class InferenceResult(BaseModel):
    """Result of inference execution."""
    success: bool
    run_id: str
    request_id: Optional[str] = None
    trace_id: Optional[str] = None
    text: Optional[str] = None
    finish_reason: Optional[str] = None
    tokens_in: int
    tokens_out: int
    ttft_ms: int
    total_latency_ms: int
    model_passport_id: str
    compute_passport_id: str
    runtime: str
    policy_hash: Optional[str] = None
    receipt_id: Optional[str] = None
    used_fallback: Optional[bool] = None
    fallback_reason: Optional[str] = None
    error: Optional[str] = None
    error_code: Optional[str] = None


class StreamChunk(BaseModel):
    """A streaming response chunk."""
    run_id: str
    text: Optional[str] = None
    is_first: Optional[bool] = None
    is_last: Optional[bool] = None
    finish_reason: Optional[str] = None
    done: Optional[bool] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    ttft_ms: Optional[int] = None
    total_latency_ms: Optional[int] = None
    receipt_id: Optional[str] = None
    error: Optional[str] = None


class ChatCompletionRequest(BaseModel):
    """OpenAI-compatible chat completion request."""
    model: str
    messages: List[ChatMessage]
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    stop: Optional[Union[str, List[str]]] = None
    stream: Optional[bool] = None
    policy: Optional[Policy] = None
    trace_id: Optional[str] = None


class ChatCompletionChoice(BaseModel):
    """A chat completion choice."""
    index: int
    message: ChatMessage
    finish_reason: Optional[str] = None


class Usage(BaseModel):
    """Token usage information."""
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class LucidExtensions(BaseModel):
    """LucidLayer extensions to OpenAI response."""
    run_id: str
    model_passport_id: str
    compute_passport_id: str
    runtime: str
    policy_hash: Optional[str] = None
    receipt_id: Optional[str] = None
    ttft_ms: int
    total_latency_ms: int
    used_fallback: Optional[bool] = None


class ChatCompletionResponse(BaseModel):
    """OpenAI-compatible chat completion response."""
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[ChatCompletionChoice]
    usage: Usage
    lucid: Optional[LucidExtensions] = None


# =============================================================================
# RECEIPT MODELS
# =============================================================================

class ReceiptAnchor(BaseModel):
    """Receipt anchor information."""
    chain: str
    tx: str
    root: str
    epoch_id: str


class Receipt(BaseModel):
    """An execution receipt."""
    run_id: str
    model_passport_id: str
    compute_passport_id: str
    policy_hash: str
    runtime: str
    tokens_in: int
    tokens_out: int
    ttft_ms: int
    total_latency_ms: Optional[int] = None
    timestamp: int
    receipt_hash: str
    signature: str
    merkle_leaf_index: Optional[int] = None
    anchor: Optional[ReceiptAnchor] = None


class ReceiptProof(BaseModel):
    """Merkle proof for a receipt."""
    run_id: str
    receipt_hash: str
    leaf_index: int
    proof: List[str]
    root: str


class ReceiptVerification(BaseModel):
    """Receipt verification result."""
    valid: bool
    hash_valid: bool
    signature_valid: bool
    inclusion_valid: bool
    expected_hash: Optional[str] = None
    computed_hash: Optional[str] = None
    merkle_root: Optional[str] = None


# =============================================================================
# EPOCH MODELS
# =============================================================================

class Epoch(BaseModel):
    """An epoch for receipt anchoring."""
    epoch_id: str
    project_id: Optional[str] = None
    mmr_root: str
    leaf_count: int
    created_at: int
    finalized_at: Optional[int] = None
    status: EpochStatus
    chain_tx: Optional[str] = None
    error: Optional[str] = None
    start_leaf_index: Optional[int] = None
    end_leaf_index: Optional[int] = None


class EpochFilters(BaseModel):
    """Filters for listing epochs."""
    project_id: Optional[str] = None
    status: Optional[EpochStatus] = None
    page: Optional[int] = None
    per_page: Optional[int] = None


# =============================================================================
# PAGINATION
# =============================================================================

class Pagination(BaseModel):
    """Pagination information."""
    total: int
    page: int
    per_page: int
    total_pages: int


class PaginatedResponse(BaseModel):
    """Generic paginated response."""
    items: List[Any]
    pagination: Pagination


# =============================================================================
# ERRORS
# =============================================================================

class LucidError(Exception):
    """Base exception for LucidLayer SDK."""
    
    def __init__(
        self,
        message: str,
        code: str = "UNKNOWN_ERROR",
        status: Optional[int] = None,
        details: Optional[Any] = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status
        self.details = details


class ValidationError(LucidError):
    """Validation error."""
    
    def __init__(self, message: str, details: Optional[Any] = None):
        super().__init__(message, "VALIDATION_ERROR", 400, details)


class NotFoundError(LucidError):
    """Resource not found error."""
    
    def __init__(self, resource: str, id: str):
        super().__init__(f"{resource} not found: {id}", "NOT_FOUND", 404)


class NoCompatibleComputeError(LucidError):
    """No compatible compute found."""
    
    def __init__(self, explain: Optional[Any] = None):
        super().__init__(
            "No compatible compute found for model",
            "NO_COMPATIBLE_COMPUTE",
            422,
            explain,
        )


class ComputeUnavailableError(LucidError):
    """Compute endpoint unavailable."""
    
    def __init__(self, message: Optional[str] = None):
        super().__init__(
            message or "Compute endpoint unavailable",
            "COMPUTE_UNAVAILABLE",
            503,
        )


class TimeoutError(LucidError):
    """Operation timed out."""
    
    def __init__(self, operation: str):
        super().__init__(f"Operation timed out: {operation}", "TIMEOUT", 504)
