from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset






T = TypeVar("T", bound="ReceiptVerification")



@_attrs_define
class ReceiptVerification:
    """ 
        Attributes:
            success (bool | Unset):
            valid (bool | Unset):
            hash_valid (bool | Unset):
            signature_valid (bool | Unset):
            inclusion_valid (bool | Unset):
            expected_hash (str | Unset):
            computed_hash (str | Unset):
            merkle_root (str | Unset):
     """

    success: bool | Unset = UNSET
    valid: bool | Unset = UNSET
    hash_valid: bool | Unset = UNSET
    signature_valid: bool | Unset = UNSET
    inclusion_valid: bool | Unset = UNSET
    expected_hash: str | Unset = UNSET
    computed_hash: str | Unset = UNSET
    merkle_root: str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        success = self.success

        valid = self.valid

        hash_valid = self.hash_valid

        signature_valid = self.signature_valid

        inclusion_valid = self.inclusion_valid

        expected_hash = self.expected_hash

        computed_hash = self.computed_hash

        merkle_root = self.merkle_root


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
        })
        if success is not UNSET:
            field_dict["success"] = success
        if valid is not UNSET:
            field_dict["valid"] = valid
        if hash_valid is not UNSET:
            field_dict["hash_valid"] = hash_valid
        if signature_valid is not UNSET:
            field_dict["signature_valid"] = signature_valid
        if inclusion_valid is not UNSET:
            field_dict["inclusion_valid"] = inclusion_valid
        if expected_hash is not UNSET:
            field_dict["expected_hash"] = expected_hash
        if computed_hash is not UNSET:
            field_dict["computed_hash"] = computed_hash
        if merkle_root is not UNSET:
            field_dict["merkle_root"] = merkle_root

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        success = d.pop("success", UNSET)

        valid = d.pop("valid", UNSET)

        hash_valid = d.pop("hash_valid", UNSET)

        signature_valid = d.pop("signature_valid", UNSET)

        inclusion_valid = d.pop("inclusion_valid", UNSET)

        expected_hash = d.pop("expected_hash", UNSET)

        computed_hash = d.pop("computed_hash", UNSET)

        merkle_root = d.pop("merkle_root", UNSET)

        receipt_verification = cls(
            success=success,
            valid=valid,
            hash_valid=hash_valid,
            signature_valid=signature_valid,
            inclusion_valid=inclusion_valid,
            expected_hash=expected_hash,
            computed_hash=computed_hash,
            merkle_root=merkle_root,
        )


        receipt_verification.additional_properties = d
        return receipt_verification

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
