from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote

import httpx

from ...client import AuthenticatedClient, Client
from ...types import Response, UNSET
from ... import errors

from ...models.error_response import ErrorResponse
from ...models.get_v1_compute_nodes_compute_passport_id_health_response_200 import GetV1ComputeNodesComputePassportIdHealthResponse200
from typing import cast



def _get_kwargs(
    compute_passport_id: str,

) -> dict[str, Any]:
    

    

    

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/v1/compute/nodes/{compute_passport_id}/health".format(compute_passport_id=quote(str(compute_passport_id), safe=""),),
    }


    return _kwargs



def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ErrorResponse | GetV1ComputeNodesComputePassportIdHealthResponse200 | None:
    if response.status_code == 200:
        response_200 = GetV1ComputeNodesComputePassportIdHealthResponse200.from_dict(response.json())



        return response_200

    if response.status_code == 500:
        response_500 = ErrorResponse.from_dict(response.json())



        return response_500

    if response.status_code == 503:
        response_503 = ErrorResponse.from_dict(response.json())



        return response_503

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[ErrorResponse | GetV1ComputeNodesComputePassportIdHealthResponse200]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    compute_passport_id: str,
    *,
    client: AuthenticatedClient | Client,

) -> Response[ErrorResponse | GetV1ComputeNodesComputePassportIdHealthResponse200]:
    """ Get compute node health

    Args:
        compute_passport_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorResponse | GetV1ComputeNodesComputePassportIdHealthResponse200]
     """


    kwargs = _get_kwargs(
        compute_passport_id=compute_passport_id,

    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)

def sync(
    compute_passport_id: str,
    *,
    client: AuthenticatedClient | Client,

) -> ErrorResponse | GetV1ComputeNodesComputePassportIdHealthResponse200 | None:
    """ Get compute node health

    Args:
        compute_passport_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorResponse | GetV1ComputeNodesComputePassportIdHealthResponse200
     """


    return sync_detailed(
        compute_passport_id=compute_passport_id,
client=client,

    ).parsed

async def asyncio_detailed(
    compute_passport_id: str,
    *,
    client: AuthenticatedClient | Client,

) -> Response[ErrorResponse | GetV1ComputeNodesComputePassportIdHealthResponse200]:
    """ Get compute node health

    Args:
        compute_passport_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorResponse | GetV1ComputeNodesComputePassportIdHealthResponse200]
     """


    kwargs = _get_kwargs(
        compute_passport_id=compute_passport_id,

    )

    response = await client.get_async_httpx_client().request(
        **kwargs
    )

    return _build_response(client=client, response=response)

async def asyncio(
    compute_passport_id: str,
    *,
    client: AuthenticatedClient | Client,

) -> ErrorResponse | GetV1ComputeNodesComputePassportIdHealthResponse200 | None:
    """ Get compute node health

    Args:
        compute_passport_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorResponse | GetV1ComputeNodesComputePassportIdHealthResponse200
     """


    return (await asyncio_detailed(
        compute_passport_id=compute_passport_id,
client=client,

    )).parsed
