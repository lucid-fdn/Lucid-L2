from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, BinaryIO, TextIO, TYPE_CHECKING, Generator

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

from ..types import UNSET, Unset
from typing import cast

if TYPE_CHECKING:
  from ..models.payout_from_receipt_request_config import PayoutFromReceiptRequestConfig





T = TypeVar("T", bound="PayoutFromReceiptRequest")



@_attrs_define
class PayoutFromReceiptRequest:
    """ 
        Attributes:
            run_id (str):
            tokens_in (int):
            tokens_out (int):
            price_per_1k_tokens_lamports (int | str):
            compute_wallet (str):
            model_wallet (str | Unset):
            orchestrator_wallet (str | Unset):
            config (PayoutFromReceiptRequestConfig | Unset):
     """

    run_id: str
    tokens_in: int
    tokens_out: int
    price_per_1k_tokens_lamports: int | str
    compute_wallet: str
    model_wallet: str | Unset = UNSET
    orchestrator_wallet: str | Unset = UNSET
    config: PayoutFromReceiptRequestConfig | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)





    def to_dict(self) -> dict[str, Any]:
        from ..models.payout_from_receipt_request_config import PayoutFromReceiptRequestConfig
        run_id = self.run_id

        tokens_in = self.tokens_in

        tokens_out = self.tokens_out

        price_per_1k_tokens_lamports: int | str
        price_per_1k_tokens_lamports = self.price_per_1k_tokens_lamports

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
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "price_per_1k_tokens_lamports": price_per_1k_tokens_lamports,
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
        from ..models.payout_from_receipt_request_config import PayoutFromReceiptRequestConfig
        d = dict(src_dict)
        run_id = d.pop("run_id")

        tokens_in = d.pop("tokens_in")

        tokens_out = d.pop("tokens_out")

        def _parse_price_per_1k_tokens_lamports(data: object) -> int | str:
            return cast(int | str, data)

        price_per_1k_tokens_lamports = _parse_price_per_1k_tokens_lamports(d.pop("price_per_1k_tokens_lamports"))


        compute_wallet = d.pop("compute_wallet")

        model_wallet = d.pop("model_wallet", UNSET)

        orchestrator_wallet = d.pop("orchestrator_wallet", UNSET)

        _config = d.pop("config", UNSET)
        config: PayoutFromReceiptRequestConfig | Unset
        if isinstance(_config,  Unset):
            config = UNSET
        else:
            config = PayoutFromReceiptRequestConfig.from_dict(_config)




        payout_from_receipt_request = cls(
            run_id=run_id,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            price_per_1k_tokens_lamports=price_per_1k_tokens_lamports,
            compute_wallet=compute_wallet,
            model_wallet=model_wallet,
            orchestrator_wallet=orchestrator_wallet,
            config=config,
        )


        payout_from_receipt_request.additional_properties = d
        return payout_from_receipt_request

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
