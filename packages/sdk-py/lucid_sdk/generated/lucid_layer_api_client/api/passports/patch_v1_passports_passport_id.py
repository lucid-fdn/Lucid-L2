from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote

import httpx

from ...client import AuthenticatedClient, Client
from ...types import Response, UNSET
from ... import errors

from ...models.error_response import ErrorResponse
from ...models.get_passport_response import GetPassportResponse
from ...models.update_passport_request import UpdatePassportRequest
from ...types import UNSET, Unset
from typing import cast



def _get_kwargs(
    passport_id: str,
    *,
    body: UpdatePassportRequest,
    x_owner_address: str | Unset = UNSET,

) -> dict[str, Any]:
    headers: dict[str, Any] = {}
    if not isinstance(x_owner_address, Unset):
        headers["X-Owner-Address"] = x_owner_address



    

    

    _kwargs: dict[str, Any] = {
        "method": "patch",
        "url": "/v1/passports/{passport_id}".format(passport_id=quote(str(passport_id), safe=""),),
    }

    _kwargs["json"] = body.to_dict()


    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs



def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ErrorResponse | GetPassportResponse | None:
    if response.status_code == 200:
        response_200 = GetPassportResponse.from_dict(response.json())



        return response_200

    if response.status_code == 400:
        response_400 = ErrorResponse.from_dict(response.json())



        return response_400

    if response.status_code == 403:
        response_403 = ErrorResponse.from_dict(response.json())



        return response_403

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


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[ErrorResponse | GetPassportResponse]:
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
    body: UpdatePassportRequest,
    x_owner_address: str | Unset = UNSET,

) -> Response[ErrorResponse | GetPassportResponse]:
    """ Update a passport

    Args:
        passport_id (str):
        x_owner_address (str | Unset):
        body (UpdatePassportRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorResponse | GetPassportResponse]
     """


    kwargs = _get_kwargs(
        passport_id=passport_id,
body=body,
x_owner_address=x_owner_address,

    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)

def sync(
    passport_id: str,
    *,
    client: AuthenticatedClient | Client,
    body: UpdatePassportRequest,
    x_owner_address: str | Unset = UNSET,

) -> ErrorResponse | GetPassportResponse | None:
    """ Update a passport

    Args:
        passport_id (str):
        x_owner_address (str | Unset):
        body (UpdatePassportRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorResponse | GetPassportResponse
     """


    return sync_detailed(
        passport_id=passport_id,
client=client,
body=body,
x_owner_address=x_owner_address,

    ).parsed

async def asyncio_detailed(
    passport_id: str,
    *,
    client: AuthenticatedClient | Client,
    body: UpdatePassportRequest,
    x_owner_address: str | Unset = UNSET,

) -> Response[ErrorResponse | GetPassportResponse]:
    """ Update a passport

    Args:
        passport_id (str):
        x_owner_address (str | Unset):
        body (UpdatePassportRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorResponse | GetPassportResponse]
     """


    kwargs = _get_kwargs(
        passport_id=passport_id,
body=body,
x_owner_address=x_owner_address,

    )

    response = await client.get_async_httpx_client().request(
        **kwargs
    )

    return _build_response(client=client, response=response)

async def asyncio(
    passport_id: str,
    *,
    client: AuthenticatedClient | Client,
    body: UpdatePassportRequest,
    x_owner_address: str | Unset = UNSET,

) -> ErrorResponse | GetPassportResponse | None:
    """ Update a passport

    Args:
        passport_id (str):
        x_owner_address (str | Unset):
        body (UpdatePassportRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorResponse | GetPassportResponse
     """


    return (await asyncio_detailed(
        passport_id=passport_id,
client=client,
body=body,
x_owner_address=x_owner_address,

    )).parsed
