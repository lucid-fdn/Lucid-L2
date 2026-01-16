from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset
from typing import cast

if TYPE_CHECKING:
  from ..models.payout_calculate_request_config import PayoutCalculateRequestConfig





T = TypeVar("T", bound="PayoutCalculateRequest")



@_attrs_define
class PayoutCalculateRequest:
    """ 
        Attributes:
            run_id (str):
            total_amount_lamports (int | str):
            compute_wallet (str):
            model_wallet (str | Unset):
            orchestrator_wallet (str | Unset):
            config (PayoutCalculateRequestConfig | Unset):
     """

    run_id: str
    total_amount_lamports: int | str
    compute_wallet: str
    model_wallet: str | Unset = UNSET
    orchestrator_wallet: str | Unset = UNSET
    config: PayoutCalculateRequestConfig | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.payout_calculate_request_config import PayoutCalculateRequestConfig
        run_id = self.run_id

        total_amount_lamports: int | str
        total_amount_lamports = self.total_amount_lamports

        compute_wallet = self.compute_wallet

        model_wallet = self.model_wallet

        orchestrator_wallet = self.orchestrator_wallet

        config: dict[str, Any] | Unset = UNSET
        if not isinstance(self.config, Unset):
            config = self.config.to_dict()


        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({
            "run_id": run_id,
            "total_amount_lamports": total_amount_lamports,
            "compute_wallet": compute_wallet,
        })
        if model_wallet is not UNSET:
            field_dict["model_wallet"] = model_wallet
        if orchestrator_wallet is not UNSET:
            field_dict["orchestrator_wallet"] = orchestrator_wallet
        if config is not UNSET:
            field_dict["config"] = config

        return field_dict



    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.payout_calculate_request_config import PayoutCalculateRequestConfig
        d = dict(src_dict)
        run_id = d.pop("run_id")

        def _parse_total_amount_lamports(data: object) -> int | str:
            return cast(int | str, data)

        total_amount_lamports = _parse_total_amount_lamports(d.pop("total_amount_lamports"))


        compute_wallet = d.pop("compute_wallet")

        model_wallet = d.pop("model_wallet", UNSET)

        orchestrator_wallet = d.pop("orchestrator_wallet", UNSET)

        _config = d.pop("config", UNSET)
        config: PayoutCalculateRequestConfig | Unset
        if isinstance(_config,  Unset):
            config = UNSET
        else:
            config = PayoutCalculateRequestConfig.from_dict(_config)




        payout_calculate_request = cls(
            run_id=run_id,
            total_amount_lamports=total_amount_lamports,
            compute_wallet=compute_wallet,
            model_wallet=model_wallet,
            orchestrator_wallet=orchestrator_wallet,
            config=config,
        )


        payout_calculate_request.additional_properties = d
        return payout_calculate_request

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
