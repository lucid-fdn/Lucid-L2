from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..models.compute_heartbeat_status import ComputeHeartbeatStatus
from ..types import UNSET, Unset






T = TypeVar("T", bound="ComputeHeartbeat")



@_attrs_define
class ComputeHeartbeat:
    """ 
        Attributes:
            compute_passport_id (str):
            status (ComputeHeartbeatStatus):
            queue_depth (int | Unset):
            price_per_1k_tokens_estimate (float | Unset):
            p95_ms_estimate (float | Unset):
     """

    compute_passport_id: str
    status: ComputeHeartbeatStatus
    queue_depth: int | Unset = UNSET
    price_per_1k_tokens_estimate: float | Unset = UNSET
    p95_ms_estimate: float | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        compute_passport_id = self.compute_passport_id

        status = self.status.value

        queue_depth = self.queue_depth

        price_per_1k_tokens_estimate = self.price_per_1k_tokens_estimate

        p95_ms_estimate = self.p95_ms_estimate


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "compute_passport_id": compute_passport_id,
            "status": status,
        })
        if queue_depth is not UNSET:
            field_dict["queue_depth"] = queue_depth
        if price_per_1k_tokens_estimate is not UNSET:
            field_dict["price_per_1k_tokens_estimate"] = price_per_1k_tokens_estimate
        if p95_ms_estimate is not UNSET:
            field_dict["p95_ms_estimate"] = p95_ms_estimate

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        compute_passport_id = d.pop("compute_passport_id")

        status = ComputeHeartbeatStatus(d.pop("status"))




        queue_depth = d.pop("queue_depth", UNSET)

        price_per_1k_tokens_estimate = d.pop("price_per_1k_tokens_estimate", UNSET)

        p95_ms_estimate = d.pop("p95_ms_estimate", UNSET)

        compute_heartbeat = cls(
            compute_passport_id=compute_passport_id,
            status=status,
            queue_depth=queue_depth,
            price_per_1k_tokens_estimate=price_per_1k_tokens_estimate,
            p95_ms_estimate=p95_ms_estimate,
        )


        compute_heartbeat.additional_properties = d
        return compute_heartbeat

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
