from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote

import httpx

from ...client import AuthenticatedClient, Client
from ...types import Response, UNSET
from ... import errors

from ...models.error_response import ErrorResponse
from ...types import UNSET, Unset
from typing import cast



def _get_kwargs(
    *,
    regions: str | Unset = UNSET,
    runtimes: str | Unset = UNSET,
    provider_type: str | Unset = UNSET,
    min_vram: int | Unset = UNSET,
    gpu: str | Unset = UNSET,
    owner: str | Unset = UNSET,
    tags: str | Unset = UNSET,
    search: str | Unset = UNSET,
    page: int | Unset = UNSET,
    per_page: int | Unset = UNSET,

) -> dict[str, Any]:
    

    

    params: dict[str, Any] = {}

    params["regions"] = regions

    params["runtimes"] = runtimes

    params["provider_type"] = provider_type

    params["min_vram"] = min_vram

    params["gpu"] = gpu

    params["owner"] = owner

    params["tags"] = tags

    params["search"] = search

    params["page"] = page

    params["per_page"] = per_page


    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}


    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/v1/compute",
        "params": params,
    }


    return _kwargs



def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Any | ErrorResponse | None:
    if response.status_code == 200:
        response_200 = cast(Any, None)
        return response_200

    if response.status_code == 500:
        response_500 = ErrorResponse.from_dict(response.json())



        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[Any | ErrorResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient | Client,
    regions: str | Unset = UNSET,
    runtimes: str | Unset = UNSET,
    provider_type: str | Unset = UNSET,
    min_vram: int | Unset = UNSET,
    gpu: str | Unset = UNSET,
    owner: str | Unset = UNSET,
    tags: str | Unset = UNSET,
    search: str | Unset = UNSET,
    page: int | Unset = UNSET,
    per_page: int | Unset = UNSET,

) -> Response[Any | ErrorResponse]:
    """ Search compute passports

    Args:
        regions (str | Unset):
        runtimes (str | Unset):
        provider_type (str | Unset):
        min_vram (int | Unset):
        gpu (str | Unset):
        owner (str | Unset):
        tags (str | Unset):
        search (str | Unset):
        page (int | Unset):
        per_page (int | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | ErrorResponse]
     """


    kwargs = _get_kwargs(
        regions=regions,
runtimes=runtimes,
provider_type=provider_type,
min_vram=min_vram,
gpu=gpu,
owner=owner,
tags=tags,
search=search,
page=page,
per_page=per_page,

    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)

def sync(
    *,
    client: AuthenticatedClient | Client,
    regions: str | Unset = UNSET,
    runtimes: str | Unset = UNSET,
    provider_type: str | Unset = UNSET,
    min_vram: int | Unset = UNSET,
    gpu: str | Unset = UNSET,
    owner: str | Unset = UNSET,
    tags: str | Unset = UNSET,
    search: str | Unset = UNSET,
    page: int | Unset = UNSET,
    per_page: int | Unset = UNSET,

) -> Any | ErrorResponse | None:
    """ Search compute passports

    Args:
        regions (str | Unset):
        runtimes (str | Unset):
        provider_type (str | Unset):
        min_vram (int | Unset):
        gpu (str | Unset):
        owner (str | Unset):
        tags (str | Unset):
        search (str | Unset):
        page (int | Unset):
        per_page (int | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | ErrorResponse
     """


    return sync_detailed(
        client=client,
regions=regions,
runtimes=runtimes,
provider_type=provider_type,
min_vram=min_vram,
gpu=gpu,
owner=owner,
tags=tags,
search=search,
page=page,
per_page=per_page,

    ).parsed

async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    regions: str | Unset = UNSET,
    runtimes: str | Unset = UNSET,
    provider_type: str | Unset = UNSET,
    min_vram: int | Unset = UNSET,
    gpu: str | Unset = UNSET,
    owner: str | Unset = UNSET,
    tags: str | Unset = UNSET,
    search: str | Unset = UNSET,
    page: int | Unset = UNSET,
    per_page: int | Unset = UNSET,

) -> Response[Any | ErrorResponse]:
    """ Search compute passports

    Args:
        regions (str | Unset):
        runtimes (str | Unset):
        provider_type (str | Unset):
        min_vram (int | Unset):
        gpu (str | Unset):
        owner (str | Unset):
        tags (str | Unset):
        search (str | Unset):
        page (int | Unset):
        per_page (int | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | ErrorResponse]
     """


    kwargs = _get_kwargs(
        regions=regions,
runtimes=runtimes,
provider_type=provider_type,
min_vram=min_vram,
gpu=gpu,
owner=owner,
tags=tags,
search=search,
page=page,
per_page=per_page,

    )

    response = await client.get_async_httpx_client().request(
        **kwargs
    )

    return _build_response(client=client, response=response)

async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    regions: str | Unset = UNSET,
    runtimes: str | Unset = UNSET,
    provider_type: str | Unset = UNSET,
    min_vram: int | Unset = UNSET,
    gpu: str | Unset = UNSET,
    owner: str | Unset = UNSET,
    tags: str | Unset = UNSET,
    search: str | Unset = UNSET,
    page: int | Unset = UNSET,
    per_page: int | Unset = UNSET,

) -> Any | ErrorResponse | None:
    """ Search compute passports

    Args:
        regions (str | Unset):
        runtimes (str | Unset):
        provider_type (str | Unset):
        min_vram (int | Unset):
        gpu (str | Unset):
        owner (str | Unset):
        tags (str | Unset):
        search (str | Unset):
        page (int | Unset):
        per_page (int | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | ErrorResponse
     """


    return (await asyncio_detailed(
        client=client,
regions=regions,
runtimes=runtimes,
provider_type=provider_type,
min_vram=min_vram,
gpu=gpu,
owner=owner,
tags=tags,
search=search,
page=page,
per_page=per_page,

    )).parsed
