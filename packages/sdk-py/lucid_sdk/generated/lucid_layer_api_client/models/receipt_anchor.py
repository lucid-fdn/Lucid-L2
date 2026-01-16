from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset






T = TypeVar("T", bound="ReceiptAnchor")



@_attrs_define
class ReceiptAnchor:
    """ 
        Attributes:
            chain (str | Unset):
            tx (str | Unset):
            root (str | Unset):
            epoch_id (str | Unset):
     """

    chain: str | Unset = UNSET
    tx: str | Unset = UNSET
    root: str | Unset = UNSET
    epoch_id: str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        chain = self.chain

        tx = self.tx

        root = self.root

        epoch_id = self.epoch_id


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
        })
        if chain is not UNSET:
            field_dict["chain"] = chain
        if tx is not UNSET:
            field_dict["tx"] = tx
        if root is not UNSET:
            field_dict["root"] = root
        if epoch_id is not UNSET:
            field_dict["epoch_id"] = epoch_id

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        chain = d.pop("chain", UNSET)

        tx = d.pop("tx", UNSET)

        root = d.pop("root", UNSET)

        epoch_id = d.pop("epoch_id", UNSET)

        receipt_anchor = cls(
            chain=chain,
            tx=tx,
            root=root,
            epoch_id=epoch_id,
        )


        receipt_anchor.additional_properties = d
        return receipt_anchor

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
