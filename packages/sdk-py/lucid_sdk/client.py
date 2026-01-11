"""
LucidLayer Client
=================

Main client for interacting with the LucidLayer API.
"""

import json
import time
from typing import Any, AsyncIterator, Dict, Iterator, List, Optional, Union

import httpx

from .types import (
    Passport,
    PassportType,
    PassportStatus,
    Policy,
    InferenceResult,
    StreamChunk,
    ChatCompletionRequest,
    ChatCompletionResponse,
    Receipt,
    ReceiptProof,
    ReceiptVerification,
    Epoch,
    Pagination,
    LucidError,
    ValidationError,
    NotFoundError,
    NoCompatibleComputeError,
    ComputeUnavailableError,
    TimeoutError as LucidTimeoutError,
)


class PassportModule:
    """Passport CRUD operations."""

    def __init__(self, client: "LucidClient"):
        self._client = client

    def create(
        self,
        type: PassportType,
        owner: str,
        metadata: Dict[str, Any],
        name: Optional[str] = None,
        description: Optional[str] = None,
        version: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> Passport:
        """Create a new passport."""
        data = {
            "type": type.value if isinstance(type, PassportType) else type,
            "owner": owner,
            "metadata": metadata,
        }
        if name:
            data["name"] = name
        if description:
            data["description"] = description
        if version:
            data["version"] = version
        if tags:
            data["tags"] = tags

        response = self._client._request("POST", "/v1/passports", json=data)
        return Passport(**response["passport"])

    def get(self, passport_id: str) -> Passport:
        """Get a passport by ID."""
        response = self._client._request("GET", f"/v1/passports/{passport_id}")
        return Passport(**response["passport"])

    def update(
        self,
        passport_id: str,
        metadata: Optional[Dict[str, Any]] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        version: Optional[str] = None,
        tags: Optional[List[str]] = None,
        status: Optional[PassportStatus] = None,
        owner_address: Optional[str] = None,
    ) -> Passport:
        """Update a passport."""
        data = {}
        if metadata is not None:
            data["metadata"] = metadata
        if name is not None:
            data["name"] = name
        if description is not None:
            data["description"] = description
        if version is not None:
            data["version"] = version
        if tags is not None:
            data["tags"] = tags
        if status is not None:
            data["status"] = status.value if isinstance(status, PassportStatus) else status

        headers = {}
        if owner_address:
            headers["X-Owner-Address"] = owner_address

        response = self._client._request(
            "PATCH", f"/v1/passports/{passport_id}", json=data, headers=headers
        )
        return Passport(**response["passport"])

    def delete(self, passport_id: str, owner_address: Optional[str] = None) -> bool:
        """Delete (revoke) a passport."""
        headers = {}
        if owner_address:
            headers["X-Owner-Address"] = owner_address

        response = self._client._request(
            "DELETE", f"/v1/passports/{passport_id}", headers=headers
        )
        return response.get("deleted", False)

    def list(
        self,
        type: Optional[Union[PassportType, List[PassportType]]] = None,
        owner: Optional[str] = None,
        status: Optional[Union[PassportStatus, List[PassportStatus]]] = None,
        tags: Optional[List[str]] = None,
        tag_match: Optional[str] = None,
        search: Optional[str] = None,
        page: Optional[int] = None,
        per_page: Optional[int] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List passports with filtering."""
        params = {}
        if type:
            if isinstance(type, list):
                params["type"] = ",".join(t.value if isinstance(t, PassportType) else t for t in type)
            else:
                params["type"] = type.value if isinstance(type, PassportType) else type
        if owner:
            params["owner"] = owner
        if status:
            if isinstance(status, list):
                params["status"] = ",".join(s.value if isinstance(s, PassportStatus) else s for s in status)
            else:
                params["status"] = status.value if isinstance(status, PassportStatus) else status
        if tags:
            params["tags"] = ",".join(tags)
        if tag_match:
            params["tag_match"] = tag_match
        if search:
            params["search"] = search
        if page:
            params["page"] = page
        if per_page:
            params["per_page"] = per_page
        if sort_by:
            params["sort_by"] = sort_by
        if sort_order:
            params["sort_order"] = sort_order

        response = self._client._request("GET", "/v1/passports", params=params)
        return {
            "items": [Passport(**p) for p in response["passports"]],
            "pagination": Pagination(**response["pagination"]),
        }

    def sync(self, passport_id: str) -> Dict[str, str]:
        """Sync a passport to the blockchain."""
        response = self._client._request("POST", f"/v1/passports/{passport_id}/sync")
        return {"pda": response["on_chain_pda"], "tx": response["on_chain_tx"]}


class SearchModule:
    """Search and discovery operations."""

    def __init__(self, client: "LucidClient"):
        self._client = client

    def models(
        self,
        runtime: Optional[str] = None,
        format: Optional[str] = None,
        max_vram: Optional[int] = None,
        owner: Optional[str] = None,
        tags: Optional[List[str]] = None,
        search: Optional[str] = None,
        page: Optional[int] = None,
        per_page: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Search model passports."""
        params = {}
        if runtime:
            params["runtime"] = runtime
        if format:
            params["format"] = format
        if max_vram:
            params["max_vram"] = max_vram
        if owner:
            params["owner"] = owner
        if tags:
            params["tags"] = ",".join(tags)
        if search:
            params["search"] = search
        if page:
            params["page"] = page
        if per_page:
            params["per_page"] = per_page

        response = self._client._request("GET", "/v1/models", params=params)
        return {
            "items": [Passport(**p) for p in response["models"]],
            "pagination": Pagination(**response["pagination"]),
        }

    def compute(
        self,
        regions: Optional[List[str]] = None,
        runtimes: Optional[List[str]] = None,
        provider_type: Optional[str] = None,
        min_vram: Optional[int] = None,
        gpu: Optional[str] = None,
        owner: Optional[str] = None,
        tags: Optional[List[str]] = None,
        search: Optional[str] = None,
        page: Optional[int] = None,
        per_page: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Search compute passports."""
        params = {}
        if regions:
            params["regions"] = ",".join(regions)
        if runtimes:
            params["runtimes"] = ",".join(runtimes)
        if provider_type:
            params["provider_type"] = provider_type
        if min_vram:
            params["min_vram"] = min_vram
        if gpu:
            params["gpu"] = gpu
        if owner:
            params["owner"] = owner
        if tags:
            params["tags"] = ",".join(tags)
        if search:
            params["search"] = search
        if page:
            params["page"] = page
        if per_page:
            params["per_page"] = per_page

        response = self._client._request("GET", "/v1/compute", params=params)
        return {
            "items": [Passport(**p) for p in response["compute"]],
            "pagination": Pagination(**response["pagination"]),
        }


class MatchModule:
    """Compute matching operations."""

    def __init__(self, client: "LucidClient"):
        self._client = client

    def compute_for_model(
        self,
        model_id: str,
        policy: Optional[Policy] = None,
        compute_catalog: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """Find compatible compute for a model."""
        data = {
            "model_meta": {"passport_id": model_id},
            "policy": policy.model_dump() if policy else {"version": "1.0"},
            "require_live_healthy": True,
        }
        if compute_catalog:
            data["compute_catalog"] = compute_catalog

        response = self._client._request("POST", "/v1/match", json=data)
        return {
            "success": response.get("success", False),
            "match": response.get("match"),
            "explain": response.get("explain"),
            "error": response.get("error"),
        }

    def best(
        self,
        model_id: str,
        policy: Optional[Policy] = None,
        compute_catalog: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """Alias for compute_for_model."""
        return self.compute_for_model(model_id, policy, compute_catalog)

    def explain(
        self,
        policy: Policy,
        compute_meta: Dict[str, Any],
        model_meta: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Explain policy evaluation against compute."""
        data = {
            "policy": policy.model_dump(),
            "compute_meta": compute_meta,
        }
        if model_meta:
            data["model_meta"] = model_meta

        response = self._client._request("POST", "/v1/match/explain", json=data)
        return {
            "allowed": response["allowed"],
            "reasons": response["reasons"],
            "policy_hash": response["policy_hash"],
        }


class RunModule:
    """Inference execution operations."""

    def __init__(self, client: "LucidClient"):
        self._client = client

    def inference(
        self,
        model_passport_id: Optional[str] = None,
        model: Optional[str] = None,
        prompt: Optional[str] = None,
        messages: Optional[List[Dict[str, str]]] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        top_k: Optional[int] = None,
        stop: Optional[List[str]] = None,
        policy: Optional[Policy] = None,
        compute_passport_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> InferenceResult:
        """Execute inference (non-streaming)."""
        # Normalize model field
        if model and not model_passport_id:
            model_passport_id = model[9:] if model.startswith("passport:") else model

        data = {"stream": False}
        if model_passport_id:
            data["model_passport_id"] = model_passport_id
        if prompt:
            data["prompt"] = prompt
        if messages:
            data["messages"] = messages
        if max_tokens:
            data["max_tokens"] = max_tokens
        if temperature is not None:
            data["temperature"] = temperature
        if top_p is not None:
            data["top_p"] = top_p
        if top_k is not None:
            data["top_k"] = top_k
        if stop:
            data["stop"] = stop
        if policy:
            data["policy"] = policy.model_dump()
        if compute_passport_id:
            data["compute_passport_id"] = compute_passport_id
        if trace_id:
            data["trace_id"] = trace_id
        if request_id:
            data["request_id"] = request_id

        response = self._client._request("POST", "/v1/run/inference", json=data)
        return InferenceResult(**response)

    def inference_stream(
        self,
        model_passport_id: Optional[str] = None,
        model: Optional[str] = None,
        prompt: Optional[str] = None,
        messages: Optional[List[Dict[str, str]]] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        policy: Optional[Policy] = None,
    ) -> Iterator[StreamChunk]:
        """Execute inference with streaming response."""
        # Normalize model field
        if model and not model_passport_id:
            model_passport_id = model[9:] if model.startswith("passport:") else model

        data = {"stream": True}
        if model_passport_id:
            data["model_passport_id"] = model_passport_id
        if prompt:
            data["prompt"] = prompt
        if messages:
            data["messages"] = messages
        if max_tokens:
            data["max_tokens"] = max_tokens
        if temperature is not None:
            data["temperature"] = temperature
        if policy:
            data["policy"] = policy.model_dump()

        for chunk in self._client._request_stream("/v1/run/inference", data):
            yield StreamChunk(**chunk)

    def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        """OpenAI-compatible chat completion (non-streaming)."""
        data = request.model_dump()
        data["stream"] = False

        response = self._client._request("POST", "/v1/chat/completions", json=data)
        return ChatCompletionResponse(**response)

    def complete(
        self,
        model_id: str,
        prompt: str,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> str:
        """Simple completion helper."""
        result = self.inference(
            model_passport_id=model_id,
            prompt=prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return result.text or ""

    def chat(
        self,
        model_id: str,
        messages: List[Dict[str, str]],
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> str:
        """Simple chat helper."""
        from .types import ChatMessage
        request = ChatCompletionRequest(
            model=f"passport:{model_id}",
            messages=[ChatMessage(**m) for m in messages],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        response = self.chat_completion(request)
        return response.choices[0].message.content if response.choices else ""


class ReceiptModule:
    """Receipt management operations."""

    def __init__(self, client: "LucidClient"):
        self._client = client

    def get(self, run_id: str) -> Receipt:
        """Get a receipt by run ID."""
        response = self._client._request("GET", f"/v1/receipts/{run_id}")
        return Receipt(**response["receipt"])

    def verify(self, run_id: str) -> ReceiptVerification:
        """Verify a receipt's hash and signature."""
        response = self._client._request("GET", f"/v1/receipts/{run_id}/verify")
        return ReceiptVerification(**response)

    def get_proof(self, run_id: str) -> ReceiptProof:
        """Get Merkle inclusion proof for a receipt."""
        response = self._client._request("GET", f"/v1/receipts/{run_id}/proof")
        return ReceiptProof(**response["proof"])

    def wait_for_anchor(
        self,
        run_id: str,
        timeout_ms: int = 300000,
        poll_interval_ms: int = 5000,
    ) -> Receipt:
        """Wait for a receipt to be anchored on-chain."""
        start_time = time.time() * 1000

        while (time.time() * 1000) - start_time < timeout_ms:
            receipt = self.get(run_id)
            if receipt.anchor and receipt.anchor.tx:
                return receipt
            time.sleep(poll_interval_ms / 1000)

        raise LucidTimeoutError(f"waiting for receipt {run_id} to be anchored")

    def get_current_epoch(self, project_id: Optional[str] = None) -> Epoch:
        """Get the current active epoch."""
        params = {}
        if project_id:
            params["project_id"] = project_id
        response = self._client._request("GET", "/v1/epochs/current", params=params)
        return Epoch(**response["epoch"])

    def get_epoch(self, epoch_id: str) -> Epoch:
        """Get an epoch by ID."""
        response = self._client._request("GET", f"/v1/epochs/{epoch_id}")
        return Epoch(**response["epoch"])

    def commit_epoch_root(
        self,
        project_id: Optional[str] = None,
        epoch_id: Optional[str] = None,
        force: bool = False,
    ) -> Dict[str, Any]:
        """Commit epoch root to blockchain."""
        data = {}
        if project_id:
            data["project_id"] = project_id
        if epoch_id:
            data["epoch_id"] = epoch_id
        if force:
            data["force"] = force

        response = self._client._request("POST", "/v1/receipts/commit-root", json=data)
        return response


class LucidClient:
    """
    LucidLayer SDK Client.

    Example:
        >>> client = LucidClient(base_url="https://api.lucidlayer.io")
        >>> result = client.run.inference(
        ...     model_passport_id="model-id",
        ...     prompt="Hello, world!"
        ... )
    """

    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        timeout: float = 30.0,
        retries: int = 3,
        retry_delay: float = 1.0,
        debug: bool = False,
        headers: Optional[Dict[str, str]] = None,
    ):
        """
        Initialize the LucidLayer client.

        Args:
            base_url: Base URL for the API (e.g., "https://api.lucidlayer.io")
            api_key: Optional API key for authentication
            timeout: Request timeout in seconds
            retries: Number of retries for failed requests
            retry_delay: Delay between retries in seconds
            debug: Enable debug logging
            headers: Additional headers to include in requests
        """
        if not base_url:
            raise ValidationError("base_url is required")

        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._retries = retries
        self._retry_delay = retry_delay
        self._debug = debug
        self._extra_headers = headers or {}

        # Initialize modules
        self.passports = PassportModule(self)
        self.search = SearchModule(self)
        self.match = MatchModule(self)
        self.run = RunModule(self)
        self.receipts = ReceiptModule(self)

    def _build_headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        """Build request headers."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            **self._extra_headers,
        }
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        if extra:
            headers.update(extra)
        return headers

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Make an HTTP request to the API."""
        url = f"{self._base_url}{path}"
        request_headers = self._build_headers(headers)

        last_error = None

        for attempt in range(self._retries):
            try:
                if self._debug:
                    print(f"[LucidSDK] Request [{attempt + 1}/{self._retries}]: {method} {url}")

                with httpx.Client(timeout=self._timeout) as client:
                    response = client.request(
                        method=method,
                        url=url,
                        params=params,
                        json=json,
                        headers=request_headers,
                    )

                if self._debug:
                    print(f"[LucidSDK] Response: {response.status_code}")

                if not response.is_success:
                    error_data = response.json() if response.content else {}
                    raise self._create_error(response.status_code, error_data)

                return response.json()

            except LucidError:
                raise
            except Exception as e:
                last_error = e
                if attempt < self._retries - 1:
                    time.sleep(self._retry_delay)

        raise LucidError(str(last_error), "REQUEST_FAILED")

    def _request_stream(
        self,
        path: str,
        data: Dict[str, Any],
    ) -> Iterator[Dict[str, Any]]:
        """Make a streaming request to the API."""
        url = f"{self._base_url}{path}"
        headers = self._build_headers()

        with httpx.Client(timeout=None) as client:
            with client.stream("POST", url, json=data, headers=headers) as response:
                if not response.is_success:
                    error_data = {}
                    try:
                        error_data = response.json()
                    except Exception:
                        pass
                    raise self._create_error(response.status_code, error_data)

                buffer = ""
                for chunk in response.iter_text():
                    buffer += chunk
                    lines = buffer.split("\n")
                    buffer = lines.pop()

                    for line in lines:
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                return
                            try:
                                yield json.loads(data_str)
                            except json.JSONDecodeError:
                                continue

    def _create_error(self, status: int, data: Dict[str, Any]) -> LucidError:
        """Create appropriate error based on status code."""
        message = data.get("error", data.get("message", "Unknown error"))
        code = data.get("error_code", data.get("code", "UNKNOWN_ERROR"))
        details = data.get("details")

        if status == 400:
            return ValidationError(message, details)
        elif status == 404:
            return NotFoundError("Resource", "unknown")
        elif status == 422:
            if "NO_COMPATIBLE_COMPUTE" in str(code) or "NO_COMPATIBLE_COMPUTE" in str(message):
                return NoCompatibleComputeError(data.get("explain"))
            return LucidError(message, code, status, details)
        elif status == 503:
            return ComputeUnavailableError(message)
        elif status == 504:
            return LucidTimeoutError("request")
        else:
            return LucidError(message, code, status, details)
