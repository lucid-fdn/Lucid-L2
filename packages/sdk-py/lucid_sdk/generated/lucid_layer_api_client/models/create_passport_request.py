from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..models.passport_type import PassportType
from ..types import UNSET, Unset
from typing import cast

if TYPE_CHECKING:
  from ..models.create_passport_request_metadata import CreatePassportRequestMetadata





T = TypeVar("T", bound="CreatePassportRequest")



@_attrs_define
class CreatePassportRequest:
    """ 
        Attributes:
            type_ (PassportType):
            owner (str):
            metadata (CreatePassportRequestMetadata):
            name (str | Unset):
            description (str | Unset):
            version (str | Unset):
            tags (list[str] | Unset):
     """

    type_: PassportType
    owner: str
    metadata: CreatePassportRequestMetadata
    name: str | Unset = UNSET
    description: str | Unset = UNSET
    version: str | Unset = UNSET
    tags: list[str] | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.create_passport_request_metadata import CreatePassportRequestMetadata
        type_ = self.type_.value

        owner = self.owner

        metadata = self.metadata.to_dict()

        name = self.name

        description = self.description

        version = self.version

        tags: list[str] | Unset = UNSET
        if not isinstance(self.tags, Unset):
            tags = self.tags




        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "type": type_,
            "owner": owner,
            "metadata": metadata,
        })
        if name is not UNSET:
            field_dict["name"] = name
        if description is not UNSET:
            field_dict["description"] = description
        if version is not UNSET:
            field_dict["version"] = version
        if tags is not UNSET:
            field_dict["tags"] = tags

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.create_passport_request_metadata import CreatePassportRequestMetadata
        d = dict(src_dict)
        type_ = PassportType(d.pop("type"))




        owner = d.pop("owner")

        metadata = CreatePassportRequestMetadata.from_dict(d.pop("metadata"))




        name = d.pop("name", UNSET)

        description = d.pop("description", UNSET)

        version = d.pop("version", UNSET)

        tags = cast(list[str], d.pop("tags", UNSET))


        create_passport_request = cls(
            type_=type_,
            owner=owner,
            metadata=metadata,
            name=name,
            description=description,
            version=version,
            tags=tags,
        )


        create_passport_request.additional_properties = d
        return create_passport_request

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
