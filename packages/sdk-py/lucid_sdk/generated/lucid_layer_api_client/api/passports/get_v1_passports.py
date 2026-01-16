from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote

import httpx

from ...client import AuthenticatedClient, Client
from ...types import Response, UNSET
from ... import errors

from ...models.error_response import ErrorResponse
from ...models.get_v1_passports_sort_by import GetV1PassportsSortBy
from ...models.get_v1_passports_sort_order import GetV1PassportsSortOrder
from ...models.get_v1_passports_tag_match import GetV1PassportsTagMatch
from ...models.list_passports_response import ListPassportsResponse
from ...models.passport_status import PassportStatus
from ...models.passport_type import PassportType
from ...types import UNSET, Unset
from typing import cast



def _get_kwargs(
    *,
    type_: list[PassportType] | PassportType | Unset = UNSET,
    owner: str | Unset = UNSET,
    status: list[PassportStatus] | PassportStatus | Unset = UNSET,
    tags: str | Unset = UNSET,
    tag_match: GetV1PassportsTagMatch | Unset = UNSET,
    search: str | Unset = UNSET,
    page: int | Unset = UNSET,
    per_page: int | Unset = UNSET,
    sort_by: GetV1PassportsSortBy | Unset = UNSET,
    sort_order: GetV1PassportsSortOrder | Unset = UNSET,

) -> dict[str, Any]:
    

    

    params: dict[str, Any] = {}

    json_type_: list[str] | str | Unset
    if isinstance(type_, Unset):
        json_type_ = UNSET
    elif isinstance(type_, PassportType):
        json_type_ = type_.value
    else:
        json_type_ = []
        for type_type_1_item_data in type_:
            type_type_1_item = type_type_1_item_data.value
            json_type_.append(type_type_1_item)



    params["type"] = json_type_

    params["owner"] = owner

    json_status: list[str] | str | Unset
    if isinstance(status, Unset):
        json_status = UNSET
    elif isinstance(status, PassportStatus):
        json_status = status.value
    else:
        json_status = []
        for status_type_1_item_data in status:
            status_type_1_item = status_type_1_item_data.value
            json_status.append(status_type_1_item)



    params["status"] = json_status

    params["tags"] = tags

    json_tag_match: str | Unset = UNSET
    if not isinstance(tag_match, Unset):
        json_tag_match = tag_match.value

    params["tag_match"] = json_tag_match

    params["search"] = search

    params["page"] = page

    params["per_page"] = per_page

    json_sort_by: str | Unset = UNSET
    if not isinstance(sort_by, Unset):
        json_sort_by = sort_by.value

    params["sort_by"] = json_sort_by

    json_sort_order: str | Unset = UNSET
    if not isinstance(sort_order, Unset):
        json_sort_order = sort_order.value

    params["sort_order"] = json_sort_order


    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}


    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/v1/passports",
        "params": params,
    }


    return _kwargs



def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ErrorResponse | ListPassportsResponse | None:
    if response.status_code == 200:
        response_200 = ListPassportsResponse.from_dict(response.json())



        return response_200

    if response.status_code == 500:
        response_500 = ErrorResponse.from_dict(response.json())



        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[ErrorResponse | ListPassportsResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient | Client,
    type_: list[PassportType] | PassportType | Unset = UNSET,
    owner: str | Unset = UNSET,
    status: list[PassportStatus] | PassportStatus | Unset = UNSET,
    tags: str | Unset = UNSET,
    tag_match: GetV1PassportsTagMatch | Unset = UNSET,
    search: str | Unset = UNSET,
    page: int | Unset = UNSET,
    per_page: int | Unset = UNSET,
    sort_by: GetV1PassportsSortBy | Unset = UNSET,
    sort_order: GetV1PassportsSortOrder | Unset = UNSET,

) -> Response[ErrorResponse | ListPassportsResponse]:
    """ List passports

    Args:
        type_ (list[PassportType] | PassportType | Unset):
        owner (str | Unset):
        status (list[PassportStatus] | PassportStatus | Unset):
        tags (str | Unset):
        tag_match (GetV1PassportsTagMatch | Unset):
        search (str | Unset):
        page (int | Unset):
        per_page (int | Unset):
        sort_by (GetV1PassportsSortBy | Unset):
        sort_order (GetV1PassportsSortOrder | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorResponse | ListPassportsResponse]
     """


    kwargs = _get_kwargs(
        type_=type_,
owner=owner,
status=status,
tags=tags,
tag_match=tag_match,
search=search,
page=page,
per_page=per_page,
sort_by=sort_by,
sort_order=sort_order,

    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)

def sync(
    *,
    client: AuthenticatedClient | Client,
    type_: list[PassportType] | PassportType | Unset = UNSET,
    owner: str | Unset = UNSET,
    status: list[PassportStatus] | PassportStatus | Unset = UNSET,
    tags: str | Unset = UNSET,
    tag_match: GetV1PassportsTagMatch | Unset = UNSET,
    search: str | Unset = UNSET,
    page: int | Unset = UNSET,
    per_page: int | Unset = UNSET,
    sort_by: GetV1PassportsSortBy | Unset = UNSET,
    sort_order: GetV1PassportsSortOrder | Unset = UNSET,

) -> ErrorResponse | ListPassportsResponse | None:
    """ List passports

    Args:
        type_ (list[PassportType] | PassportType | Unset):
        owner (str | Unset):
        status (list[PassportStatus] | PassportStatus | Unset):
        tags (str | Unset):
        tag_match (GetV1PassportsTagMatch | Unset):
        search (str | Unset):
        page (int | Unset):
        per_page (int | Unset):
        sort_by (GetV1PassportsSortBy | Unset):
        sort_order (GetV1PassportsSortOrder | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorResponse | ListPassportsResponse
     """


    return sync_detailed(
        client=client,
type_=type_,
owner=owner,
status=status,
tags=tags,
tag_match=tag_match,
search=search,
page=page,
per_page=per_page,
sort_by=sort_by,
sort_order=sort_order,

    ).parsed

async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    type_: list[PassportType] | PassportType | Unset = UNSET,
    owner: str | Unset = UNSET,
    status: list[PassportStatus] | PassportStatus | Unset = UNSET,
    tags: str | Unset = UNSET,
    tag_match: GetV1PassportsTagMatch | Unset = UNSET,
    search: str | Unset = UNSET,
    page: int | Unset = UNSET,
    per_page: int | Unset = UNSET,
    sort_by: GetV1PassportsSortBy | Unset = UNSET,
    sort_order: GetV1PassportsSortOrder | Unset = UNSET,

) -> Response[ErrorResponse | ListPassportsResponse]:
    """ List passports

    Args:
        type_ (list[PassportType] | PassportType | Unset):
        owner (str | Unset):
        status (list[PassportStatus] | PassportStatus | Unset):
        tags (str | Unset):
        tag_match (GetV1PassportsTagMatch | Unset):
        search (str | Unset):
        page (int | Unset):
        per_page (int | Unset):
        sort_by (GetV1PassportsSortBy | Unset):
        sort_order (GetV1PassportsSortOrder | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorResponse | ListPassportsResponse]
     """


    kwargs = _get_kwargs(
        type_=type_,
owner=owner,
status=status,
tags=tags,
tag_match=tag_match,
search=search,
page=page,
per_page=per_page,
sort_by=sort_by,
sort_order=sort_order,

    )

    response = await client.get_async_httpx_client().request(
        **kwargs
    )

    return _build_response(client=client, response=response)

async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    type_: list[PassportType] | PassportType | Unset = UNSET,
    owner: str | Unset = UNSET,
    status: list[PassportStatus] | PassportStatus | Unset = UNSET,
    tags: str | Unset = UNSET,
    tag_match: GetV1PassportsTagMatch | Unset = UNSET,
    search: str | Unset = UNSET,
    page: int | Unset = UNSET,
    per_page: int | Unset = UNSET,
    sort_by: GetV1PassportsSortBy | Unset = UNSET,
    sort_order: GetV1PassportsSortOrder | Unset = UNSET,

) -> ErrorResponse | ListPassportsResponse | None:
    """ List passports

    Args:
        type_ (list[PassportType] | PassportType | Unset):
        owner (str | Unset):
        status (list[PassportStatus] | PassportStatus | Unset):
        tags (str | Unset):
        tag_match (GetV1PassportsTagMatch | Unset):
        search (str | Unset):
        page (int | Unset):
        per_page (int | Unset):
        sort_by (GetV1PassportsSortBy | Unset):
        sort_order (GetV1PassportsSortOrder | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorResponse | ListPassportsResponse
     """


    return (await asyncio_detailed(
        client=client,
type_=type_,
owner=owner,
status=status,
tags=tags,
tag_match=tag_match,
search=search,
page=page,
per_page=per_page,
sort_by=sort_by,
sort_order=sort_order,

    )).parsed
