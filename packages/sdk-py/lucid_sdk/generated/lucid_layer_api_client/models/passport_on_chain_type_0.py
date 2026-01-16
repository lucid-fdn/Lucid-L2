from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset
from typing import cast






T = TypeVar("T", bound="PassportOnChainType0")



@_attrs_define
class PassportOnChainType0:
    """ 
        Attributes:
            pda (None | str | Unset):
            tx (None | str | Unset):
            synced_at (int | None | Unset):
     """

    pda: None | str | Unset = UNSET
    tx: None | str | Unset = UNSET
    synced_at: int | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        pda: None | str | Unset
        if isinstance(self.pda, Unset):
            pda = UNSET
        else:
            pda = self.pda

        tx: None | str | Unset
        if isinstance(self.tx, Unset):
            tx = UNSET
        else:
            tx = self.tx

        synced_at: int | None | Unset
        if isinstance(self.synced_at, Unset):
            synced_at = UNSET
        else:
            synced_at = self.synced_at


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
        })
        if pda is not UNSET:
            field_dict["pda"] = pda
        if tx is not UNSET:
            field_dict["tx"] = tx
        if synced_at is not UNSET:
            field_dict["synced_at"] = synced_at

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        def _parse_pda(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        pda = _parse_pda(d.pop("pda", UNSET))


        def _parse_tx(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        tx = _parse_tx(d.pop("tx", UNSET))


        def _parse_synced_at(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        synced_at = _parse_synced_at(d.pop("synced_at", UNSET))


        passport_on_chain_type_0 = cls(
            pda=pda,
            tx=tx,
            synced_at=synced_at,
        )


        passport_on_chain_type_0.additional_properties = d
        return passport_on_chain_type_0

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
