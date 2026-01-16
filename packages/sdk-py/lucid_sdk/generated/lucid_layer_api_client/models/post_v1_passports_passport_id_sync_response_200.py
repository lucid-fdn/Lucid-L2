from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset
from typing import cast






T = TypeVar("T", bound="PostV1PassportsPassportIdSyncResponse200")



@_attrs_define
class PostV1PassportsPassportIdSyncResponse200:
    """ 
        Attributes:
            success (bool):
            on_chain_pda (None | str | Unset):
            on_chain_tx (None | str | Unset):
     """

    success: bool
    on_chain_pda: None | str | Unset = UNSET
    on_chain_tx: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        success = self.success

        on_chain_pda: None | str | Unset
        if isinstance(self.on_chain_pda, Unset):
            on_chain_pda = UNSET
        else:
            on_chain_pda = self.on_chain_pda

        on_chain_tx: None | str | Unset
        if isinstance(self.on_chain_tx, Unset):
            on_chain_tx = UNSET
        else:
            on_chain_tx = self.on_chain_tx


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "success": success,
        })
        if on_chain_pda is not UNSET:
            field_dict["on_chain_pda"] = on_chain_pda
        if on_chain_tx is not UNSET:
            field_dict["on_chain_tx"] = on_chain_tx

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        success = d.pop("success")

        def _parse_on_chain_pda(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        on_chain_pda = _parse_on_chain_pda(d.pop("on_chain_pda", UNSET))


        def _parse_on_chain_tx(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        on_chain_tx = _parse_on_chain_tx(d.pop("on_chain_tx", UNSET))


        post_v1_passports_passport_id_sync_response_200 = cls(
            success=success,
            on_chain_pda=on_chain_pda,
            on_chain_tx=on_chain_tx,
        )


        post_v1_passports_passport_id_sync_response_200.additional_properties = d
        return post_v1_passports_passport_id_sync_response_200

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
