from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset







T = TypeVar("T", bound="ListPassportsResponsePagination")



@_attrs_define
class ListPassportsResponsePagination:
    """ 
        Attributes:
            total (int):
            page (int):
            per_page (int):
            total_pages (int):
     """

    total: int
    page: int
    per_page: int
    total_pages: int
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        total = self.total

        page = self.page

        per_page = self.per_page

        total_pages = self.total_pages


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        })

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        total = d.pop("total")

        page = d.pop("page")

        per_page = d.pop("per_page")

        total_pages = d.pop("total_pages")

        list_passports_response_pagination = cls(
            total=total,
            page=page,
            per_page=per_page,
            total_pages=total_pages,
        )


        list_passports_response_pagination.additional_properties = d
        return list_passports_response_pagination

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
