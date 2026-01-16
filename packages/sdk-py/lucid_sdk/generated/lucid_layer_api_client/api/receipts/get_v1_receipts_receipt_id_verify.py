from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote

import httpx

from ...client import AuthenticatedClient, Client
from ...types import Response, UNSET
from ... import errors

from ...models.error_response import ErrorResponse
from ...models.receipt_verification import ReceiptVerification
from typing import cast



def _get_kwargs(
    receipt_id: str,

) -> dict[str, Any]:
    

    

    

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/v1/receipts/{receipt_id}/verify".format(receipt_id=quote(str(receipt_id), safe=""),),
    }


    return _kwargs



def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ErrorResponse | ReceiptVerification | None:
    if response.status_code == 200:
        response_200 = ReceiptVerification.from_dict(response.json())



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


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[ErrorResponse | ReceiptVerification]:
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

) -> Response[ErrorResponse | ReceiptVerification]:
    """ Verify a receipt (hash + signature + inclusion)

    Args:
        receipt_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorResponse | ReceiptVerification]
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

) -> ErrorResponse | ReceiptVerification | None:
    """ Verify a receipt (hash + signature + inclusion)

    Args:
        receipt_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorResponse | ReceiptVerification
     """


    return sync_detailed(
        receipt_id=receipt_id,
client=client,

    ).parsed

async def asyncio_detailed(
    receipt_id: str,
    *,
    client: AuthenticatedClient | Client,

) -> Response[ErrorResponse | ReceiptVerification]:
    """ Verify a receipt (hash + signature + inclusion)

    Args:
        receipt_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorResponse | ReceiptVerification]
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

) -> ErrorResponse | ReceiptVerification | None:
    """ Verify a receipt (hash + signature + inclusion)

    Args:
        receipt_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorResponse | ReceiptVerification
     """


    return (await asyncio_detailed(
        receipt_id=receipt_id,
client=client,

    )).parsed
