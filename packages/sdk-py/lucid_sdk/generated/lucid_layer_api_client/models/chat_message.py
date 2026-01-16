from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..models.chat_message_role import ChatMessageRole
from ..types import UNSET, Unset
from typing import cast

if TYPE_CHECKING:
  from ..models.chat_message_function_call import ChatMessageFunctionCall





T = TypeVar("T", bound="ChatMessage")



@_attrs_define
class ChatMessage:
    """ 
        Attributes:
            role (ChatMessageRole):
            content (str):
            name (str | Unset):
            function_call (ChatMessageFunctionCall | Unset):
     """

    role: ChatMessageRole
    content: str
    name: str | Unset = UNSET
    function_call: ChatMessageFunctionCall | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.chat_message_function_call import ChatMessageFunctionCall
        role = self.role.value

        content = self.content

        name = self.name

        function_call: dict[str, Any] | Unset = UNSET
        if not isinstance(self.function_call, Unset):
            function_call = self.function_call.to_dict()


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "role": role,
            "content": content,
        })
        if name is not UNSET:
            field_dict["name"] = name
        if function_call is not UNSET:
            field_dict["function_call"] = function_call

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.chat_message_function_call import ChatMessageFunctionCall
        d = dict(src_dict)
        role = ChatMessageRole(d.pop("role"))




        content = d.pop("content")

        name = d.pop("name", UNSET)

        _function_call = d.pop("function_call", UNSET)
        function_call: ChatMessageFunctionCall | Unset
        if isinstance(_function_call,  Unset):
            function_call = UNSET
        else:
            function_call = ChatMessageFunctionCall.from_dict(_function_call)




        chat_message = cls(
            role=role,
            content=content,
            name=name,
            function_call=function_call,
        )


        chat_message.additional_properties = d
        return chat_message

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
