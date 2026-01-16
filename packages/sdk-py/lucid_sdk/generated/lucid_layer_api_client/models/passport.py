from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..models.passport_status import PassportStatus
from ..models.passport_type import PassportType
from ..types import UNSET, Unset
from typing import cast

if TYPE_CHECKING:
  from ..models.passport_metadata import PassportMetadata
  from ..models.passport_on_chain_type_0 import PassportOnChainType0





T = TypeVar("T", bound="Passport")



@_attrs_define
class Passport:
    """ 
        Attributes:
            passport_id (str):
            type_ (PassportType):
            owner (str):
            status (PassportStatus):
            metadata (PassportMetadata):
            metadata_hash (str):
            created_at (int):
            updated_at (int):
            name (None | str | Unset):
            description (None | str | Unset):
            version (None | str | Unset):
            tags (list[str] | None | Unset):
            on_chain (None | PassportOnChainType0 | Unset):
     """

    passport_id: str
    type_: PassportType
    owner: str
    status: PassportStatus
    metadata: PassportMetadata
    metadata_hash: str
    created_at: int
    updated_at: int
    name: None | str | Unset = UNSET
    description: None | str | Unset = UNSET
    version: None | str | Unset = UNSET
    tags: list[str] | None | Unset = UNSET
    on_chain: None | PassportOnChainType0 | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.passport_metadata import PassportMetadata
        from ..models.passport_on_chain_type_0 import PassportOnChainType0
        passport_id = self.passport_id

        type_ = self.type_.value

        owner = self.owner

        status = self.status.value

        metadata = self.metadata.to_dict()

        metadata_hash = self.metadata_hash

        created_at = self.created_at

        updated_at = self.updated_at

        name: None | str | Unset
        if isinstance(self.name, Unset):
            name = UNSET
        else:
            name = self.name

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        version: None | str | Unset
        if isinstance(self.version, Unset):
            version = UNSET
        else:
            version = self.version

        tags: list[str] | None | Unset
        if isinstance(self.tags, Unset):
            tags = UNSET
        elif isinstance(self.tags, list):
            tags = self.tags


        else:
            tags = self.tags

        on_chain: dict[str, Any] | None | Unset
        if isinstance(self.on_chain, Unset):
            on_chain = UNSET
        elif isinstance(self.on_chain, PassportOnChainType0):
            on_chain = self.on_chain.to_dict()
        else:
            on_chain = self.on_chain


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "passport_id": passport_id,
            "type": type_,
            "owner": owner,
            "status": status,
            "metadata": metadata,
            "metadata_hash": metadata_hash,
            "created_at": created_at,
            "updated_at": updated_at,
        })
        if name is not UNSET:
            field_dict["name"] = name
        if description is not UNSET:
            field_dict["description"] = description
        if version is not UNSET:
            field_dict["version"] = version
        if tags is not UNSET:
            field_dict["tags"] = tags
        if on_chain is not UNSET:
            field_dict["on_chain"] = on_chain

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.passport_metadata import PassportMetadata
        from ..models.passport_on_chain_type_0 import PassportOnChainType0
        d = dict(src_dict)
        passport_id = d.pop("passport_id")

        type_ = PassportType(d.pop("type"))




        owner = d.pop("owner")

        status = PassportStatus(d.pop("status"))




        metadata = PassportMetadata.from_dict(d.pop("metadata"))




        metadata_hash = d.pop("metadata_hash")

        created_at = d.pop("created_at")

        updated_at = d.pop("updated_at")

        def _parse_name(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        name = _parse_name(d.pop("name", UNSET))


        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))


        def _parse_version(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        version = _parse_version(d.pop("version", UNSET))


        def _parse_tags(data: object) -> list[str] | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, list):
                    raise TypeError()
                tags_type_0 = cast(list[str], data)

                return tags_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(list[str] | None | Unset, data)

        tags = _parse_tags(d.pop("tags", UNSET))


        def _parse_on_chain(data: object) -> None | PassportOnChainType0 | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                on_chain_type_0 = PassportOnChainType0.from_dict(data)



                return on_chain_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | PassportOnChainType0 | Unset, data)

        on_chain = _parse_on_chain(d.pop("on_chain", UNSET))


        passport = cls(
            passport_id=passport_id,
            type_=type_,
            owner=owner,
            status=status,
            metadata=metadata,
            metadata_hash=metadata_hash,
            created_at=created_at,
            updated_at=updated_at,
            name=name,
            description=description,
            version=version,
            tags=tags,
            on_chain=on_chain,
        )


        passport.additional_properties = d
        return passport

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
