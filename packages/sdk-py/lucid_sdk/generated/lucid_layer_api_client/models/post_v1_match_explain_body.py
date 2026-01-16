from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset
from typing import cast

if TYPE_CHECKING:
  from ..models.policy import Policy
  from ..models.post_v1_match_explain_body_compute_meta import PostV1MatchExplainBodyComputeMeta
  from ..models.post_v1_match_explain_body_model_meta import PostV1MatchExplainBodyModelMeta





T = TypeVar("T", bound="PostV1MatchExplainBody")



@_attrs_define
class PostV1MatchExplainBody:
    """ 
        Attributes:
            policy (Policy | Unset):
            compute_meta (PostV1MatchExplainBodyComputeMeta | Unset):
            model_meta (PostV1MatchExplainBodyModelMeta | Unset):
     """

    policy: Policy | Unset = UNSET
    compute_meta: PostV1MatchExplainBodyComputeMeta | Unset = UNSET
    model_meta: PostV1MatchExplainBodyModelMeta | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.post_v1_match_explain_body_model_meta import PostV1MatchExplainBodyModelMeta
        from ..models.policy import Policy
        from ..models.post_v1_match_explain_body_compute_meta import PostV1MatchExplainBodyComputeMeta
        policy: dict[str, Any] | Unset = UNSET
        if not isinstance(self.policy, Unset):
            policy = self.policy.to_dict()

        compute_meta: dict[str, Any] | Unset = UNSET
        if not isinstance(self.compute_meta, Unset):
            compute_meta = self.compute_meta.to_dict()

        model_meta: dict[str, Any] | Unset = UNSET
        if not isinstance(self.model_meta, Unset):
            model_meta = self.model_meta.to_dict()


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
        })
        if policy is not UNSET:
            field_dict["policy"] = policy
        if compute_meta is not UNSET:
            field_dict["compute_meta"] = compute_meta
        if model_meta is not UNSET:
            field_dict["model_meta"] = model_meta

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.policy import Policy
        from ..models.post_v1_match_explain_body_compute_meta import PostV1MatchExplainBodyComputeMeta
        from ..models.post_v1_match_explain_body_model_meta import PostV1MatchExplainBodyModelMeta
        d = dict(src_dict)
        _policy = d.pop("policy", UNSET)
        policy: Policy | Unset
        if isinstance(_policy,  Unset):
            policy = UNSET
        else:
            policy = Policy.from_dict(_policy)




        _compute_meta = d.pop("compute_meta", UNSET)
        compute_meta: PostV1MatchExplainBodyComputeMeta | Unset
        if isinstance(_compute_meta,  Unset):
            compute_meta = UNSET
        else:
            compute_meta = PostV1MatchExplainBodyComputeMeta.from_dict(_compute_meta)




        _model_meta = d.pop("model_meta", UNSET)
        model_meta: PostV1MatchExplainBodyModelMeta | Unset
        if isinstance(_model_meta,  Unset):
            model_meta = UNSET
        else:
            model_meta = PostV1MatchExplainBodyModelMeta.from_dict(_model_meta)




        post_v1_match_explain_body = cls(
            policy=policy,
            compute_meta=compute_meta,
            model_meta=model_meta,
        )


        post_v1_match_explain_body.additional_properties = d
        return post_v1_match_explain_body

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
