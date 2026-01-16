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





T = TypeVar("T", bound="InferenceRequest")



@_attrs_define
class InferenceRequest:
    """ 
        Attributes:
            model_passport_id (str | Unset):
            model (str | Unset):
            prompt (str | Unset):
            messages (list[ChatMessage] | Unset):
            max_tokens (int | Unset):
            temperature (float | Unset):
            top_p (float | Unset):
            top_k (int | Unset):
            stop (list[str] | Unset):
            stream (bool | Unset):
            policy (Policy | Unset):
            compute_passport_id (str | Unset):
            trace_id (str | Unset):
            request_id (str | Unset):
     """

    model_passport_id: str | Unset = UNSET
    model: str | Unset = UNSET
    prompt: str | Unset = UNSET
    messages: list[ChatMessage] | Unset = UNSET
    max_tokens: int | Unset = UNSET
    temperature: float | Unset = UNSET
    top_p: float | Unset = UNSET
    top_k: int | Unset = UNSET
    stop: list[str] | Unset = UNSET
    stream: bool | Unset = UNSET
    policy: Policy | Unset = UNSET
    compute_passport_id: str | Unset = UNSET
    trace_id: str | Unset = UNSET
    request_id: str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.chat_message import ChatMessage
        from ..models.policy import Policy
        model_passport_id = self.model_passport_id

        model = self.model

        prompt = self.prompt

        messages: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.messages, Unset):
            messages = []
            for messages_item_data in self.messages:
                messages_item = messages_item_data.to_dict()
                messages.append(messages_item)



        max_tokens = self.max_tokens

        temperature = self.temperature

        top_p = self.top_p

        top_k = self.top_k

        stop: list[str] | Unset = UNSET
        if not isinstance(self.stop, Unset):
            stop = self.stop



        stream = self.stream

        policy: dict[str, Any] | Unset = UNSET
        if not isinstance(self.policy, Unset):
            policy = self.policy.to_dict()

        compute_passport_id = self.compute_passport_id

        trace_id = self.trace_id

        request_id = self.request_id


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
        })
        if model_passport_id is not UNSET:
            field_dict["model_passport_id"] = model_passport_id
        if model is not UNSET:
            field_dict["model"] = model
        if prompt is not UNSET:
            field_dict["prompt"] = prompt
        if messages is not UNSET:
            field_dict["messages"] = messages
        if max_tokens is not UNSET:
            field_dict["max_tokens"] = max_tokens
        if temperature is not UNSET:
            field_dict["temperature"] = temperature
        if top_p is not UNSET:
            field_dict["top_p"] = top_p
        if top_k is not UNSET:
            field_dict["top_k"] = top_k
        if stop is not UNSET:
            field_dict["stop"] = stop
        if stream is not UNSET:
            field_dict["stream"] = stream
        if policy is not UNSET:
            field_dict["policy"] = policy
        if compute_passport_id is not UNSET:
            field_dict["compute_passport_id"] = compute_passport_id
        if trace_id is not UNSET:
            field_dict["trace_id"] = trace_id
        if request_id is not UNSET:
            field_dict["request_id"] = request_id

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.chat_message import ChatMessage
        from ..models.policy import Policy
        d = dict(src_dict)
        model_passport_id = d.pop("model_passport_id", UNSET)

        model = d.pop("model", UNSET)

        prompt = d.pop("prompt", UNSET)

        _messages = d.pop("messages", UNSET)
        messages: list[ChatMessage] | Unset = UNSET
        if _messages is not UNSET:
            messages = []
            for messages_item_data in _messages:
                messages_item = ChatMessage.from_dict(messages_item_data)



                messages.append(messages_item)


        max_tokens = d.pop("max_tokens", UNSET)

        temperature = d.pop("temperature", UNSET)

        top_p = d.pop("top_p", UNSET)

        top_k = d.pop("top_k", UNSET)

        stop = cast(list[str], d.pop("stop", UNSET))


        stream = d.pop("stream", UNSET)

        _policy = d.pop("policy", UNSET)
        policy: Policy | Unset
        if isinstance(_policy,  Unset):
            policy = UNSET
        else:
            policy = Policy.from_dict(_policy)




        compute_passport_id = d.pop("compute_passport_id", UNSET)

        trace_id = d.pop("trace_id", UNSET)

        request_id = d.pop("request_id", UNSET)

        inference_request = cls(
            model_passport_id=model_passport_id,
            model=model,
            prompt=prompt,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            stop=stop,
            stream=stream,
            policy=policy,
            compute_passport_id=compute_passport_id,
            trace_id=trace_id,
            request_id=request_id,
        )


        inference_request.additional_properties = d
        return inference_request

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
