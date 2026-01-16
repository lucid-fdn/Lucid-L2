from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from typing import cast






T = TypeVar("T", bound="ReceiptProof")



@_attrs_define
class ReceiptProof:
    """ 
        Attributes:
            run_id (str):
            receipt_hash (str):
            leaf_index (int):
            proof (list[str]):
            root (str):
     """

    run_id: str
    receipt_hash: str
    leaf_index: int
    proof: list[str]
    root: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        run_id = self.run_id

        receipt_hash = self.receipt_hash

        leaf_index = self.leaf_index

        proof = self.proof



        root = self.root


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "run_id": run_id,
            "receipt_hash": receipt_hash,
            "leaf_index": leaf_index,
            "proof": proof,
            "root": root,
        })

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        run_id = d.pop("run_id")

        receipt_hash = d.pop("receipt_hash")

        leaf_index = d.pop("leaf_index")

        proof = cast(list[str], d.pop("proof"))


        root = d.pop("root")

        receipt_proof = cls(
            run_id=run_id,
            receipt_hash=receipt_hash,
            leaf_index=leaf_index,
            proof=proof,
            root=root,
        )


        receipt_proof.additional_properties = d
        return receipt_proof

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
