from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote

import httpx

from ...client import AuthenticatedClient, Client
from ...types import Response, UNSET
from ... import errors

from ...models.error_response import ErrorResponse
from ...models.get_v1_receipts_receipt_id_proof_response_200 import GetV1ReceiptsReceiptIdProofResponse200
from typing import cast



def _get_kwargs(
    receipt_id: str,

) -> dict[str, Any]:
    

    

    

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/v1/receipts/{receipt_id}/proof".format(receipt_id=quote(str(receipt_id), safe=""),),
    }


    return _kwargs



def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ErrorResponse | GetV1ReceiptsReceiptIdProofResponse200 | None:
    if response.status_code == 200:
        response_200 = GetV1ReceiptsReceiptIdProofResponse200.from_dict(response.json())



        return response_200

    if response.status_code == 404:
        response_404 = ErrorResponse.from_dict(response.json())



        return response_404

    if response.status_code == 500:
        response_500 = ErrorResponse.from_dict(response.json())



        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[ErrorResponse | GetV1ReceiptsReceiptIdProofResponse200]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    receipt_id: str,
    *,
    client: AuthenticatedClient | Client,

) -> Response[ErrorResponse | GetV1ReceiptsReceiptIdProofResponse200]:
    """ Get inclusion proof for receipt

    Args:
        receipt_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorResponse | GetV1ReceiptsReceiptIdProofResponse200]
     """


    kwargs = _get_kwargs(
        receipt_id=receipt_id,

    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)

def sync(
    receipt_id: str,
    *,
    client: AuthenticatedClient | Client,

) -> ErrorResponse | GetV1ReceiptsReceiptIdProofResponse200 | None:
    """ Get inclusion proof for receipt

    Args:
        receipt_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorResponse | GetV1ReceiptsReceiptIdProofResponse200
     """


    return sync_detailed(
        receipt_id=receipt_id,
client=client,

    ).parsed

async def asyncio_detailed(
    receipt_id: str,
    *,
    client: AuthenticatedClient | Client,

) -> Response[ErrorResponse | GetV1ReceiptsReceiptIdProofResponse200]:
    """ Get inclusion proof for receipt

    Args:
        receipt_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorResponse | GetV1ReceiptsReceiptIdProofResponse200]
     """


    kwargs = _get_kwargs(
        receipt_id=receipt_id,

    )

    response = await client.get_async_httpx_client().request(
        **kwargs
    )

    return _build_response(client=client, response=response)

async def asyncio(
    receipt_id: str,
    *,
    client: AuthenticatedClient | Client,

) -> ErrorResponse | GetV1ReceiptsReceiptIdProofResponse200 | None:
    """ Get inclusion proof for receipt

    Args:
        receipt_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorResponse | GetV1ReceiptsReceiptIdProofResponse200
     """


    return (await asyncio_detailed(
        receipt_id=receipt_id,
client=client,

    )).parsed
