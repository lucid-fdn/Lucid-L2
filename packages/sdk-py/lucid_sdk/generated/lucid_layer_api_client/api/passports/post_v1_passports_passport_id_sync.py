from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote

import httpx

from ...client import AuthenticatedClient, Client
from ...types import Response, UNSET
from ... import errors

from ...models.error_response import ErrorResponse
from ...models.post_v1_passports_passport_id_sync_response_200 import PostV1PassportsPassportIdSyncResponse200
from typing import cast



def _get_kwargs(
    passport_id: str,

) -> dict[str, Any]:
    

    

    

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/v1/passports/{passport_id}/sync".format(passport_id=quote(str(passport_id), safe=""),),
    }


    return _kwargs



def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ErrorResponse | PostV1PassportsPassportIdSyncResponse200 | None:
    if response.status_code == 200:
        response_200 = PostV1PassportsPassportIdSyncResponse200.from_dict(response.json())



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


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[ErrorResponse | PostV1PassportsPassportIdSyncResponse200]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    passport_id: str,
    *,
    client: AuthenticatedClient | Client,

) -> Response[ErrorResponse | PostV1PassportsPassportIdSyncResponse200]:
    """ Trigger on-chain sync for a passport

    Args:
        passport_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorResponse | PostV1PassportsPassportIdSyncResponse200]
     """


    kwargs = _get_kwargs(
        passport_id=passport_id,

    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)

def sync(
    passport_id: str,
    *,
    client: AuthenticatedClient | Client,

) -> ErrorResponse | PostV1PassportsPassportIdSyncResponse200 | None:
    """ Trigger on-chain sync for a passport

    Args:
        passport_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorResponse | PostV1PassportsPassportIdSyncResponse200
     """


    return sync_detailed(
        passport_id=passport_id,
client=client,

    ).parsed

async def asyncio_detailed(
    passport_id: str,
    *,
    client: AuthenticatedClient | Client,

) -> Response[ErrorResponse | PostV1PassportsPassportIdSyncResponse200]:
    """ Trigger on-chain sync for a passport

    Args:
        passport_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorResponse | PostV1PassportsPassportIdSyncResponse200]
     """


    kwargs = _get_kwargs(
        passport_id=passport_id,

    )

    response = await client.get_async_httpx_client().request(
        **kwargs
    )

    return _build_response(client=client, response=response)

async def asyncio(
    passport_id: str,
    *,
    client: AuthenticatedClient | Client,

) -> ErrorResponse | PostV1PassportsPassportIdSyncResponse200 | None:
    """ Trigger on-chain sync for a passport

    Args:
        passport_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorResponse | PostV1PassportsPassportIdSyncResponse200
     """


    return (await asyncio_detailed(
        passport_id=passport_id,
client=client,

    )).parsed
