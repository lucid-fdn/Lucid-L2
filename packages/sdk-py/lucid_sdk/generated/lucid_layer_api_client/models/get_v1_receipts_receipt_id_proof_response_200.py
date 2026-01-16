from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from typing import cast

if TYPE_CHECKING:
  from ..models.receipt_proof import ReceiptProof





T = TypeVar("T", bound="GetV1ReceiptsReceiptIdProofResponse200")



@_attrs_define
class GetV1ReceiptsReceiptIdProofResponse200:
    """ 
        Attributes:
            success (bool):
            proof (ReceiptProof):
     """

    success: bool
    proof: ReceiptProof
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.receipt_proof import ReceiptProof
        success = self.success

        proof = self.proof.to_dict()


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "success": success,
            "proof": proof,
        })

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.receipt_proof import ReceiptProof
        d = dict(src_dict)
        success = d.pop("success")

        proof = ReceiptProof.from_dict(d.pop("proof"))




        get_v1_receipts_receipt_id_proof_response_200 = cls(
            success=success,
            proof=proof,
        )


        get_v1_receipts_receipt_id_proof_response_200.additional_properties = d
        return get_v1_receipts_receipt_id_proof_response_200

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
