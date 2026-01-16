from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..models.epoch_status import EpochStatus
from ..types import UNSET, Unset






T = TypeVar("T", bound="Epoch")



@_attrs_define
class Epoch:
    """ 
        Attributes:
            epoch_id (str):
            mmr_root (str):
            leaf_count (int):
            created_at (int):
            status (EpochStatus):
            project_id (str | Unset):
            finalized_at (int | Unset):
            chain_tx (str | Unset):
            error (str | Unset):
            start_leaf_index (int | Unset):
            end_leaf_index (int | Unset):
     """

    epoch_id: str
    mmr_root: str
    leaf_count: int
    created_at: int
    status: EpochStatus
    project_id: str | Unset = UNSET
    finalized_at: int | Unset = UNSET
    chain_tx: str | Unset = UNSET
    error: str | Unset = UNSET
    start_leaf_index: int | Unset = UNSET
    end_leaf_index: int | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        epoch_id = self.epoch_id

        mmr_root = self.mmr_root

        leaf_count = self.leaf_count

        created_at = self.created_at

        status = self.status.value

        project_id = self.project_id

        finalized_at = self.finalized_at

        chain_tx = self.chain_tx

        error = self.error

        start_leaf_index = self.start_leaf_index

        end_leaf_index = self.end_leaf_index


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "epoch_id": epoch_id,
            "mmr_root": mmr_root,
            "leaf_count": leaf_count,
            "created_at": created_at,
            "status": status,
        })
        if project_id is not UNSET:
            field_dict["project_id"] = project_id
        if finalized_at is not UNSET:
            field_dict["finalized_at"] = finalized_at
        if chain_tx is not UNSET:
            field_dict["chain_tx"] = chain_tx
        if error is not UNSET:
            field_dict["error"] = error
        if start_leaf_index is not UNSET:
            field_dict["start_leaf_index"] = start_leaf_index
        if end_leaf_index is not UNSET:
            field_dict["end_leaf_index"] = end_leaf_index

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        epoch_id = d.pop("epoch_id")

        mmr_root = d.pop("mmr_root")

        leaf_count = d.pop("leaf_count")

        created_at = d.pop("created_at")

        status = EpochStatus(d.pop("status"))




        project_id = d.pop("project_id", UNSET)

        finalized_at = d.pop("finalized_at", UNSET)

        chain_tx = d.pop("chain_tx", UNSET)

        error = d.pop("error", UNSET)

        start_leaf_index = d.pop("start_leaf_index", UNSET)

        end_leaf_index = d.pop("end_leaf_index", UNSET)

        epoch = cls(
            epoch_id=epoch_id,
            mmr_root=mmr_root,
            leaf_count=leaf_count,
            created_at=created_at,
            status=status,
            project_id=project_id,
            finalized_at=finalized_at,
            chain_tx=chain_tx,
            error=error,
            start_leaf_index=start_leaf_index,
            end_leaf_index=end_leaf_index,
        )


        epoch.additional_properties = d
        return epoch

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
