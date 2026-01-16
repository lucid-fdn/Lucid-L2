from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset
from typing import cast

if TYPE_CHECKING:
  from ..models.get_v1_compute_nodes_compute_passport_id_health_response_200_state import GetV1ComputeNodesComputePassportIdHealthResponse200State





T = TypeVar("T", bound="GetV1ComputeNodesComputePassportIdHealthResponse200")



@_attrs_define
class GetV1ComputeNodesComputePassportIdHealthResponse200:
    """ 
        Attributes:
            success (bool | Unset):
            state (GetV1ComputeNodesComputePassportIdHealthResponse200State | Unset):
     """

    success: bool | Unset = UNSET
    state: GetV1ComputeNodesComputePassportIdHealthResponse200State | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.get_v1_compute_nodes_compute_passport_id_health_response_200_state import GetV1ComputeNodesComputePassportIdHealthResponse200State
        success = self.success

        state: dict[str, Any] | Unset = UNSET
        if not isinstance(self.state, Unset):
            state = self.state.to_dict()


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
        })
        if success is not UNSET:
            field_dict["success"] = success
        if state is not UNSET:
            field_dict["state"] = state

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.get_v1_compute_nodes_compute_passport_id_health_response_200_state import GetV1ComputeNodesComputePassportIdHealthResponse200State
        d = dict(src_dict)
        success = d.pop("success", UNSET)

        _state = d.pop("state", UNSET)
        state: GetV1ComputeNodesComputePassportIdHealthResponse200State | Unset
        if isinstance(_state,  Unset):
            state = UNSET
        else:
            state = GetV1ComputeNodesComputePassportIdHealthResponse200State.from_dict(_state)




        get_v1_compute_nodes_compute_passport_id_health_response_200 = cls(
            success=success,
            state=state,
        )


        get_v1_compute_nodes_compute_passport_id_health_response_200.additional_properties = d
        return get_v1_compute_nodes_compute_passport_id_health_response_200

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
