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
  from ..models.post_v1_route_body_compute_catalog_item import PostV1RouteBodyComputeCatalogItem
  from ..models.post_v1_route_body_model_meta import PostV1RouteBodyModelMeta





T = TypeVar("T", bound="PostV1RouteBody")



@_attrs_define
class PostV1RouteBody:
    """ 
        Attributes:
            model_meta (PostV1RouteBodyModelMeta | Unset):
            policy (Policy | Unset):
            compute_catalog (list[PostV1RouteBodyComputeCatalogItem] | Unset):
            request_id (str | Unset):
            require_live_healthy (bool | Unset):  Default: True.
     """

    model_meta: PostV1RouteBodyModelMeta | Unset = UNSET
    policy: Policy | Unset = UNSET
    compute_catalog: list[PostV1RouteBodyComputeCatalogItem] | Unset = UNSET
    request_id: str | Unset = UNSET
    require_live_healthy: bool | Unset = True
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.post_v1_route_body_model_meta import PostV1RouteBodyModelMeta
        from ..models.policy import Policy
        from ..models.post_v1_route_body_compute_catalog_item import PostV1RouteBodyComputeCatalogItem
        model_meta: dict[str, Any] | Unset = UNSET
        if not isinstance(self.model_meta, Unset):
            model_meta = self.model_meta.to_dict()

        policy: dict[str, Any] | Unset = UNSET
        if not isinstance(self.policy, Unset):
            policy = self.policy.to_dict()

        compute_catalog: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.compute_catalog, Unset):
            compute_catalog = []
            for compute_catalog_item_data in self.compute_catalog:
                compute_catalog_item = compute_catalog_item_data.to_dict()
                compute_catalog.append(compute_catalog_item)



        request_id = self.request_id

        require_live_healthy = self.require_live_healthy


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
        })
        if model_meta is not UNSET:
            field_dict["model_meta"] = model_meta
        if policy is not UNSET:
            field_dict["policy"] = policy
        if compute_catalog is not UNSET:
            field_dict["compute_catalog"] = compute_catalog
        if request_id is not UNSET:
            field_dict["request_id"] = request_id
        if require_live_healthy is not UNSET:
            field_dict["require_live_healthy"] = require_live_healthy

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.policy import Policy
        from ..models.post_v1_route_body_compute_catalog_item import PostV1RouteBodyComputeCatalogItem
        from ..models.post_v1_route_body_model_meta import PostV1RouteBodyModelMeta
        d = dict(src_dict)
        _model_meta = d.pop("model_meta", UNSET)
        model_meta: PostV1RouteBodyModelMeta | Unset
        if isinstance(_model_meta,  Unset):
            model_meta = UNSET
        else:
            model_meta = PostV1RouteBodyModelMeta.from_dict(_model_meta)




        _policy = d.pop("policy", UNSET)
        policy: Policy | Unset
        if isinstance(_policy,  Unset):
            policy = UNSET
        else:
            policy = Policy.from_dict(_policy)




        _compute_catalog = d.pop("compute_catalog", UNSET)
        compute_catalog: list[PostV1RouteBodyComputeCatalogItem] | Unset = UNSET
        if _compute_catalog is not UNSET:
            compute_catalog = []
            for compute_catalog_item_data in _compute_catalog:
                compute_catalog_item = PostV1RouteBodyComputeCatalogItem.from_dict(compute_catalog_item_data)



                compute_catalog.append(compute_catalog_item)


        request_id = d.pop("request_id", UNSET)

        require_live_healthy = d.pop("require_live_healthy", UNSET)

        post_v1_route_body = cls(
            model_meta=model_meta,
            policy=policy,
            compute_catalog=compute_catalog,
            request_id=request_id,
            require_live_healthy=require_live_healthy,
        )


        post_v1_route_body.additional_properties = d
        return post_v1_route_body

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
