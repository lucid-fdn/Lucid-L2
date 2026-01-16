from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset






T = TypeVar("T", bound="InferenceResult")



@_attrs_define
class InferenceResult:
    """ 
        Attributes:
            success (bool):
            run_id (str):
            tokens_in (int):
            tokens_out (int):
            ttft_ms (int):
            total_latency_ms (int):
            model_passport_id (str):
            compute_passport_id (str):
            runtime (str):
            request_id (str | Unset):
            trace_id (str | Unset):
            text (str | Unset):
            finish_reason (str | Unset):
            policy_hash (str | Unset):
            receipt_id (str | Unset):
            used_fallback (bool | Unset):
            fallback_reason (str | Unset):
            error (str | Unset):
            error_code (str | Unset):
     """

    success: bool
    run_id: str
    tokens_in: int
    tokens_out: int
    ttft_ms: int
    total_latency_ms: int
    model_passport_id: str
    compute_passport_id: str
    runtime: str
    request_id: str | Unset = UNSET
    trace_id: str | Unset = UNSET
    text: str | Unset = UNSET
    finish_reason: str | Unset = UNSET
    policy_hash: str | Unset = UNSET
    receipt_id: str | Unset = UNSET
    used_fallback: bool | Unset = UNSET
    fallback_reason: str | Unset = UNSET
    error: str | Unset = UNSET
    error_code: str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        success = self.success

        run_id = self.run_id

        tokens_in = self.tokens_in

        tokens_out = self.tokens_out

        ttft_ms = self.ttft_ms

        total_latency_ms = self.total_latency_ms

        model_passport_id = self.model_passport_id

        compute_passport_id = self.compute_passport_id

        runtime = self.runtime

        request_id = self.request_id

        trace_id = self.trace_id

        text = self.text

        finish_reason = self.finish_reason

        policy_hash = self.policy_hash

        receipt_id = self.receipt_id

        used_fallback = self.used_fallback

        fallback_reason = self.fallback_reason

        error = self.error

        error_code = self.error_code


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "success": success,
            "run_id": run_id,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "ttft_ms": ttft_ms,
            "total_latency_ms": total_latency_ms,
            "model_passport_id": model_passport_id,
            "compute_passport_id": compute_passport_id,
            "runtime": runtime,
        })
        if request_id is not UNSET:
            field_dict["request_id"] = request_id
        if trace_id is not UNSET:
            field_dict["trace_id"] = trace_id
        if text is not UNSET:
            field_dict["text"] = text
        if finish_reason is not UNSET:
            field_dict["finish_reason"] = finish_reason
        if policy_hash is not UNSET:
            field_dict["policy_hash"] = policy_hash
        if receipt_id is not UNSET:
            field_dict["receipt_id"] = receipt_id
        if used_fallback is not UNSET:
            field_dict["used_fallback"] = used_fallback
        if fallback_reason is not UNSET:
            field_dict["fallback_reason"] = fallback_reason
        if error is not UNSET:
            field_dict["error"] = error
        if error_code is not UNSET:
            field_dict["error_code"] = error_code

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        success = d.pop("success")

        run_id = d.pop("run_id")

        tokens_in = d.pop("tokens_in")

        tokens_out = d.pop("tokens_out")

        ttft_ms = d.pop("ttft_ms")

        total_latency_ms = d.pop("total_latency_ms")

        model_passport_id = d.pop("model_passport_id")

        compute_passport_id = d.pop("compute_passport_id")

        runtime = d.pop("runtime")

        request_id = d.pop("request_id", UNSET)

        trace_id = d.pop("trace_id", UNSET)

        text = d.pop("text", UNSET)

        finish_reason = d.pop("finish_reason", UNSET)

        policy_hash = d.pop("policy_hash", UNSET)

        receipt_id = d.pop("receipt_id", UNSET)

        used_fallback = d.pop("used_fallback", UNSET)

        fallback_reason = d.pop("fallback_reason", UNSET)

        error = d.pop("error", UNSET)

        error_code = d.pop("error_code", UNSET)

        inference_result = cls(
            success=success,
            run_id=run_id,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            ttft_ms=ttft_ms,
            total_latency_ms=total_latency_ms,
            model_passport_id=model_passport_id,
            compute_passport_id=compute_passport_id,
            runtime=runtime,
            request_id=request_id,
            trace_id=trace_id,
            text=text,
            finish_reason=finish_reason,
            policy_hash=policy_hash,
            receipt_id=receipt_id,
            used_fallback=used_fallback,
            fallback_reason=fallback_reason,
            error=error,
            error_code=error_code,
        )


        inference_result.additional_properties = d
        return inference_result

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
