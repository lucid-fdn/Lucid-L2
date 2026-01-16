from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset






T = TypeVar("T", bound="ErrorResponse")



@_attrs_define
class ErrorResponse:
    """ 
        Attributes:
            success (bool | Unset):
            error (str | Unset):
            message (str | Unset):
            error_code (str | Unset):
            details (Any | Unset):
     """

    success: bool | Unset = UNSET
    error: str | Unset = UNSET
    message: str | Unset = UNSET
    error_code: str | Unset = UNSET
    details: Any | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        success = self.success

        error = self.error

        message = self.message

        error_code = self.error_code

        details = self.details


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
        })
        if success is not UNSET:
            field_dict["success"] = success
        if error is not UNSET:
            field_dict["error"] = error
        if message is not UNSET:
            field_dict["message"] = message
        if error_code is not UNSET:
            field_dict["error_code"] = error_code
        if details is not UNSET:
            field_dict["details"] = details

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        success = d.pop("success", UNSET)

        error = d.pop("error", UNSET)

        message = d.pop("message", UNSET)

        error_code = d.pop("error_code", UNSET)

        details = d.pop("details", UNSET)

        error_response = cls(
            success=success,
            error=error,
            message=message,
            error_code=error_code,
            details=details,
        )


        error_response.additional_properties = d
        return error_response

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
