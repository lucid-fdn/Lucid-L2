from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from typing import cast

if TYPE_CHECKING:
  from ..models.passport import Passport





T = TypeVar("T", bound="GetV1PassportsPendingSyncResponse200")



@_attrs_define
class GetV1PassportsPendingSyncResponse200:
    """ 
        Attributes:
            success (bool):
            count (int):
            passports (list[Passport]):
     """

    success: bool
    count: int
    passports: list[Passport]
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.passport import Passport
        success = self.success

        count = self.count

        passports = []
        for passports_item_data in self.passports:
            passports_item = passports_item_data.to_dict()
            passports.append(passports_item)




        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "success": success,
            "count": count,
            "passports": passports,
        })

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.passport import Passport
        d = dict(src_dict)
        success = d.pop("success")

        count = d.pop("count")

        passports = []
        _passports = d.pop("passports")
        for passports_item_data in (_passports):
            passports_item = Passport.from_dict(passports_item_data)



            passports.append(passports_item)


        get_v1_passports_pending_sync_response_200 = cls(
            success=success,
            count=count,
            passports=passports,
        )


        get_v1_passports_pending_sync_response_200.additional_properties = d
        return get_v1_passports_pending_sync_response_200

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
