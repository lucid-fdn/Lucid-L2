from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset






T = TypeVar("T", bound="PostV1ReceiptsCommitRootBody")



@_attrs_define
class PostV1ReceiptsCommitRootBody:
    """ 
        Attributes:
            project_id (str | Unset):
            epoch_id (str | Unset):
            force (bool | Unset):
     """

    project_id: str | Unset = UNSET
    epoch_id: str | Unset = UNSET
    force: bool | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        project_id = self.project_id

        epoch_id = self.epoch_id

        force = self.force


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
        })
        if project_id is not UNSET:
            field_dict["project_id"] = project_id
        if epoch_id is not UNSET:
            field_dict["epoch_id"] = epoch_id
        if force is not UNSET:
            field_dict["force"] = force

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        project_id = d.pop("project_id", UNSET)

        epoch_id = d.pop("epoch_id", UNSET)

        force = d.pop("force", UNSET)

        post_v1_receipts_commit_root_body = cls(
            project_id=project_id,
            epoch_id=epoch_id,
            force=force,
        )


        post_v1_receipts_commit_root_body.additional_properties = d
        return post_v1_receipts_commit_root_body

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
