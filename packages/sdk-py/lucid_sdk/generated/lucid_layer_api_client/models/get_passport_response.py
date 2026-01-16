from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from typing import cast

if TYPE_CHECKING:
  from ..models.passport import Passport





T = TypeVar("T", bound="GetPassportResponse")



@_attrs_define
class GetPassportResponse:
    """ 
        Attributes:
            success (bool):
            passport (Passport):
     """

    success: bool
    passport: Passport
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.passport import Passport
        success = self.success

        passport = self.passport.to_dict()


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "success": success,
            "passport": passport,
        })

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.passport import Passport
        d = dict(src_dict)
        success = d.pop("success")

        passport = Passport.from_dict(d.pop("passport"))




        get_passport_response = cls(
            success=success,
            passport=passport,
        )


        get_passport_response.additional_properties = d
        return get_passport_response

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
