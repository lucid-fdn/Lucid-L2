from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..models.passport_status import PassportStatus
from ..types import UNSET, Unset
from typing import cast

if TYPE_CHECKING:
  from ..models.update_passport_request_metadata import UpdatePassportRequestMetadata





T = TypeVar("T", bound="UpdatePassportRequest")



@_attrs_define
class UpdatePassportRequest:
    """ 
        Attributes:
            metadata (UpdatePassportRequestMetadata | Unset):
            name (str | Unset):
            description (str | Unset):
            version (str | Unset):
            tags (list[str] | Unset):
            status (PassportStatus | Unset):
     """

    metadata: UpdatePassportRequestMetadata | Unset = UNSET
    name: str | Unset = UNSET
    description: str | Unset = UNSET
    version: str | Unset = UNSET
    tags: list[str] | Unset = UNSET
    status: PassportStatus | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.update_passport_request_metadata import UpdatePassportRequestMetadata
        metadata: dict[str, Any] | Unset = UNSET
        if not isinstance(self.metadata, Unset):
            metadata = self.metadata.to_dict()

        name = self.name

        description = self.description

        version = self.version

        tags: list[str] | Unset = UNSET
        if not isinstance(self.tags, Unset):
            tags = self.tags



        status: str | Unset = UNSET
        if not isinstance(self.status, Unset):
            status = self.status.value



        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
        })
        if metadata is not UNSET:
            field_dict["metadata"] = metadata
        if name is not UNSET:
            field_dict["name"] = name
        if description is not UNSET:
            field_dict["description"] = description
        if version is not UNSET:
            field_dict["version"] = version
        if tags is not UNSET:
            field_dict["tags"] = tags
        if status is not UNSET:
            field_dict["status"] = status

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.update_passport_request_metadata import UpdatePassportRequestMetadata
        d = dict(src_dict)
        _metadata = d.pop("metadata", UNSET)
        metadata: UpdatePassportRequestMetadata | Unset
        if isinstance(_metadata,  Unset):
            metadata = UNSET
        else:
            metadata = UpdatePassportRequestMetadata.from_dict(_metadata)




        name = d.pop("name", UNSET)

        description = d.pop("description", UNSET)

        version = d.pop("version", UNSET)

        tags = cast(list[str], d.pop("tags", UNSET))


        _status = d.pop("status", UNSET)
        status: PassportStatus | Unset
        if isinstance(_status,  Unset):
            status = UNSET
        else:
            status = PassportStatus(_status)




        update_passport_request = cls(
            metadata=metadata,
            name=name,
            description=description,
            version=version,
            tags=tags,
            status=status,
        )


        update_passport_request.additional_properties = d
        return update_passport_request

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
