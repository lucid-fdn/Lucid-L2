from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset
from typing import cast

if TYPE_CHECKING:
  from ..models.policy_constraints import PolicyConstraints
  from ..models.policy_fallback import PolicyFallback
  from ..models.policy_preferences import PolicyPreferences





T = TypeVar("T", bound="Policy")



@_attrs_define
class Policy:
    """ 
        Attributes:
            version (str):
            constraints (PolicyConstraints | Unset):
            preferences (PolicyPreferences | Unset):
            fallback (PolicyFallback | Unset):
     """

    version: str
    constraints: PolicyConstraints | Unset = UNSET
    preferences: PolicyPreferences | Unset = UNSET
    fallback: PolicyFallback | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.policy_preferences import PolicyPreferences
        from ..models.policy_constraints import PolicyConstraints
        from ..models.policy_fallback import PolicyFallback
        version = self.version

        constraints: dict[str, Any] | Unset = UNSET
        if not isinstance(self.constraints, Unset):
            constraints = self.constraints.to_dict()

        preferences: dict[str, Any] | Unset = UNSET
        if not isinstance(self.preferences, Unset):
            preferences = self.preferences.to_dict()

        fallback: dict[str, Any] | Unset = UNSET
        if not isinstance(self.fallback, Unset):
            fallback = self.fallback.to_dict()


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "version": version,
        })
        if constraints is not UNSET:
            field_dict["constraints"] = constraints
        if preferences is not UNSET:
            field_dict["preferences"] = preferences
        if fallback is not UNSET:
            field_dict["fallback"] = fallback

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.policy_constraints import PolicyConstraints
        from ..models.policy_fallback import PolicyFallback
        from ..models.policy_preferences import PolicyPreferences
        d = dict(src_dict)
        version = d.pop("version")

        _constraints = d.pop("constraints", UNSET)
        constraints: PolicyConstraints | Unset
        if isinstance(_constraints,  Unset):
            constraints = UNSET
        else:
            constraints = PolicyConstraints.from_dict(_constraints)




        _preferences = d.pop("preferences", UNSET)
        preferences: PolicyPreferences | Unset
        if isinstance(_preferences,  Unset):
            preferences = UNSET
        else:
            preferences = PolicyPreferences.from_dict(_preferences)




        _fallback = d.pop("fallback", UNSET)
        fallback: PolicyFallback | Unset
        if isinstance(_fallback,  Unset):
            fallback = UNSET
        else:
            fallback = PolicyFallback.from_dict(_fallback)




        policy = cls(
            version=version,
            constraints=constraints,
            preferences=preferences,
            fallback=fallback,
        )


        policy.additional_properties = d
        return policy

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
