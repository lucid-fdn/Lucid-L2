from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset
from typing import cast

if TYPE_CHECKING:
  from ..models.receipt_anchor import ReceiptAnchor





T = TypeVar("T", bound="Receipt")



@_attrs_define
class Receipt:
    """ 
        Attributes:
            run_id (str):
            model_passport_id (str):
            compute_passport_id (str):
            policy_hash (str):
            runtime (str):
            tokens_in (int):
            tokens_out (int):
            ttft_ms (int):
            timestamp (int):
            receipt_hash (str):
            signature (str):
            total_latency_ms (int | Unset):
            merkle_leaf_index (int | Unset):
            anchor (ReceiptAnchor | Unset):
     """

    run_id: str
    model_passport_id: str
    compute_passport_id: str
    policy_hash: str
    runtime: str
    tokens_in: int
    tokens_out: int
    ttft_ms: int
    timestamp: int
    receipt_hash: str
    signature: str
    total_latency_ms: int | Unset = UNSET
    merkle_leaf_index: int | Unset = UNSET
    anchor: ReceiptAnchor | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.receipt_anchor import ReceiptAnchor
        run_id = self.run_id

        model_passport_id = self.model_passport_id

        compute_passport_id = self.compute_passport_id

        policy_hash = self.policy_hash

        runtime = self.runtime

        tokens_in = self.tokens_in

        tokens_out = self.tokens_out

        ttft_ms = self.ttft_ms

        timestamp = self.timestamp

        receipt_hash = self.receipt_hash

        signature = self.signature

        total_latency_ms = self.total_latency_ms

        merkle_leaf_index = self.merkle_leaf_index

        anchor: dict[str, Any] | Unset = UNSET
        if not isinstance(self.anchor, Unset):
            anchor = self.anchor.to_dict()


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "run_id": run_id,
            "model_passport_id": model_passport_id,
            "compute_passport_id": compute_passport_id,
            "policy_hash": policy_hash,
            "runtime": runtime,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "ttft_ms": ttft_ms,
            "timestamp": timestamp,
            "receipt_hash": receipt_hash,
            "signature": signature,
        })
        if total_latency_ms is not UNSET:
            field_dict["total_latency_ms"] = total_latency_ms
        if merkle_leaf_index is not UNSET:
            field_dict["merkle_leaf_index"] = merkle_leaf_index
        if anchor is not UNSET:
            field_dict["anchor"] = anchor

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.receipt_anchor import ReceiptAnchor
        d = dict(src_dict)
        run_id = d.pop("run_id")

        model_passport_id = d.pop("model_passport_id")

        compute_passport_id = d.pop("compute_passport_id")

        policy_hash = d.pop("policy_hash")

        runtime = d.pop("runtime")

        tokens_in = d.pop("tokens_in")

        tokens_out = d.pop("tokens_out")

        ttft_ms = d.pop("ttft_ms")

        timestamp = d.pop("timestamp")

        receipt_hash = d.pop("receipt_hash")

        signature = d.pop("signature")

        total_latency_ms = d.pop("total_latency_ms", UNSET)

        merkle_leaf_index = d.pop("merkle_leaf_index", UNSET)

        _anchor = d.pop("anchor", UNSET)
        anchor: ReceiptAnchor | Unset
        if isinstance(_anchor,  Unset):
            anchor = UNSET
        else:
            anchor = ReceiptAnchor.from_dict(_anchor)




        receipt = cls(
            run_id=run_id,
            model_passport_id=model_passport_id,
            compute_passport_id=compute_passport_id,
            policy_hash=policy_hash,
            runtime=runtime,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            ttft_ms=ttft_ms,
            timestamp=timestamp,
            receipt_hash=receipt_hash,
            signature=signature,
            total_latency_ms=total_latency_ms,
            merkle_leaf_index=merkle_leaf_index,
            anchor=anchor,
        )


        receipt.additional_properties = d
        return receipt

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
