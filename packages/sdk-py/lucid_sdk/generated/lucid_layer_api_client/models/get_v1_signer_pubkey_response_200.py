from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset






T = TypeVar("T", bound="GetV1SignerPubkeyResponse200")



@_attrs_define
class GetV1SignerPubkeyResponse200:
    """ 
        Attributes:
            success (bool):
            pubkey (str):
            signer_type (str | Unset):
     """

    success: bool
    pubkey: str
    signer_type: str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        success = self.success

        pubkey = self.pubkey

        signer_type = self.signer_type


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "success": success,
            "pubkey": pubkey,
        })
        if signer_type is not UNSET:
            field_dict["signer_type"] = signer_type

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        success = d.pop("success")

        pubkey = d.pop("pubkey")

        signer_type = d.pop("signer_type", UNSET)

        get_v1_signer_pubkey_response_200 = cls(
            success=success,
            pubkey=pubkey,
            signer_type=signer_type,
        )


        get_v1_signer_pubkey_response_200.additional_properties = d
        return get_v1_signer_pubkey_response_200

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
