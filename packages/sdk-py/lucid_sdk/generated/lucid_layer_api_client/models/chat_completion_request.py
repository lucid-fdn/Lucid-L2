from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset
from typing import cast

if TYPE_CHECKING:
  from ..models.chat_message import ChatMessage
  from ..models.policy import Policy





T = TypeVar("T", bound="ChatCompletionRequest")



@_attrs_define
class ChatCompletionRequest:
    """ 
        Attributes:
            model (str):
            messages (list[ChatMessage]):
            max_tokens (int | Unset):
            temperature (float | Unset):
            top_p (float | Unset):
            stop (list[str] | str | Unset):
            stream (bool | Unset):
            policy (Policy | Unset):
            trace_id (str | Unset):
     """

    model: str
    messages: list[ChatMessage]
    max_tokens: int | Unset = UNSET
    temperature: float | Unset = UNSET
    top_p: float | Unset = UNSET
    stop: list[str] | str | Unset = UNSET
    stream: bool | Unset = UNSET
    policy: Policy | Unset = UNSET
    trace_id: str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.chat_message import ChatMessage
        from ..models.policy import Policy
        model = self.model

        messages = []
        for messages_item_data in self.messages:
            messages_item = messages_item_data.to_dict()
            messages.append(messages_item)



        max_tokens = self.max_tokens

        temperature = self.temperature

        top_p = self.top_p

        stop: list[str] | str | Unset
        if isinstance(self.stop, Unset):
            stop = UNSET
        elif isinstance(self.stop, list):
            stop = self.stop


        else:
            stop = self.stop

        stream = self.stream

        policy: dict[str, Any] | Unset = UNSET
        if not isinstance(self.policy, Unset):
            policy = self.policy.to_dict()

        trace_id = self.trace_id


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "model": model,
            "messages": messages,
        })
        if max_tokens is not UNSET:
            field_dict["max_tokens"] = max_tokens
        if temperature is not UNSET:
            field_dict["temperature"] = temperature
        if top_p is not UNSET:
            field_dict["top_p"] = top_p
        if stop is not UNSET:
            field_dict["stop"] = stop
        if stream is not UNSET:
            field_dict["stream"] = stream
        if policy is not UNSET:
            field_dict["policy"] = policy
        if trace_id is not UNSET:
            field_dict["trace_id"] = trace_id

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.chat_message import ChatMessage
        from ..models.policy import Policy
        d = dict(src_dict)
        model = d.pop("model")

        messages = []
        _messages = d.pop("messages")
        for messages_item_data in (_messages):
            messages_item = ChatMessage.from_dict(messages_item_data)



            messages.append(messages_item)


        max_tokens = d.pop("max_tokens", UNSET)

        temperature = d.pop("temperature", UNSET)

        top_p = d.pop("top_p", UNSET)

        def _parse_stop(data: object) -> list[str] | str | Unset:
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, list):
                    raise TypeError()
                stop_type_1 = cast(list[str], data)

                return stop_type_1
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(list[str] | str | Unset, data)

        stop = _parse_stop(d.pop("stop", UNSET))


        stream = d.pop("stream", UNSET)

        _policy = d.pop("policy", UNSET)
        policy: Policy | Unset
        if isinstance(_policy,  Unset):
            policy = UNSET
        else:
            policy = Policy.from_dict(_policy)




        trace_id = d.pop("trace_id", UNSET)

        chat_completion_request = cls(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            stop=stop,
            stream=stream,
            policy=policy,
            trace_id=trace_id,
        )


        chat_completion_request.additional_properties = d
        return chat_completion_request

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
