from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from typing import cast

if TYPE_CHECKING:
  from ..models.chat_completion_response_choices_item import ChatCompletionResponseChoicesItem
  from ..models.chat_completion_response_usage import ChatCompletionResponseUsage





T = TypeVar("T", bound="ChatCompletionResponse")



@_attrs_define
class ChatCompletionResponse:
    """ 
        Attributes:
            id (str):
            object_ (str):
            created (int):
            model (str):
            choices (list[ChatCompletionResponseChoicesItem]):
            usage (ChatCompletionResponseUsage):
     """

    id: str
    object_: str
    created: int
    model: str
    choices: list[ChatCompletionResponseChoicesItem]
    usage: ChatCompletionResponseUsage
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.chat_completion_response_choices_item import ChatCompletionResponseChoicesItem
        from ..models.chat_completion_response_usage import ChatCompletionResponseUsage
        id = self.id

        object_ = self.object_

        created = self.created

        model = self.model

        choices = []
        for choices_item_data in self.choices:
            choices_item = choices_item_data.to_dict()
            choices.append(choices_item)



        usage = self.usage.to_dict()


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "id": id,
            "object": object_,
            "created": created,
            "model": model,
            "choices": choices,
            "usage": usage,
        })

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.chat_completion_response_choices_item import ChatCompletionResponseChoicesItem
        from ..models.chat_completion_response_usage import ChatCompletionResponseUsage
        d = dict(src_dict)
        id = d.pop("id")

        object_ = d.pop("object")

        created = d.pop("created")

        model = d.pop("model")

        choices = []
        _choices = d.pop("choices")
        for choices_item_data in (_choices):
            choices_item = ChatCompletionResponseChoicesItem.from_dict(choices_item_data)



            choices.append(choices_item)


        usage = ChatCompletionResponseUsage.from_dict(d.pop("usage"))




        chat_completion_response = cls(
            id=id,
            object_=object_,
            created=created,
            model=model,
            choices=choices,
            usage=usage,
        )


        chat_completion_response.additional_properties = d
        return chat_completion_response

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
