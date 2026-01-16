from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote

import httpx

from ...client import AuthenticatedClient, Client
from ...types import Response, UNSET
from ... import errors

from ...models.compute_heartbeat import ComputeHeartbeat
from ...models.error_response import ErrorResponse
from ...models.post_v1_compute_nodes_heartbeat_response_200 import PostV1ComputeNodesHeartbeatResponse200
from typing import cast



def _get_kwargs(
    *,
    body: ComputeHeartbeat,

) -> dict[str, Any]:
    headers: dict[str, Any] = {}


    

    

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/v1/compute/nodes/heartbeat",
    }

    _kwargs["json"] = body.to_dict()


    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs



def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ErrorResponse | PostV1ComputeNodesHeartbeatResponse200 | None:
    if response.status_code == 200:
        response_200 = PostV1ComputeNodesHeartbeatResponse200.from_dict(response.json())



        return response_200

    if response.status_code == 400:
        response_400 = ErrorResponse.from_dict(response.json())



        return response_400

    if response.status_code == 500:
        response_500 = ErrorResponse.from_dict(response.json())



        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[ErrorResponse | PostV1ComputeNodesHeartbeatResponse200]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: ComputeHeartbeat,

) -> Response[ErrorResponse | PostV1ComputeNodesHeartbeatResponse200]:
    """ Submit compute node heartbeat

    Args:
        body (ComputeHeartbeat):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorResponse | PostV1ComputeNodesHeartbeatResponse200]
     """


    kwargs = _get_kwargs(
        body=body,

    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)

def sync(
    *,
    client: AuthenticatedClient | Client,
    body: ComputeHeartbeat,

) -> ErrorResponse | PostV1ComputeNodesHeartbeatResponse200 | None:
    """ Submit compute node heartbeat

    Args:
        body (ComputeHeartbeat):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorResponse | PostV1ComputeNodesHeartbeatResponse200
     """


    return sync_detailed(
        client=client,
body=body,

    ).parsed

async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: ComputeHeartbeat,

) -> Response[ErrorResponse | PostV1ComputeNodesHeartbeatResponse200]:
    """ Submit compute node heartbeat

    Args:
        body (ComputeHeartbeat):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorResponse | PostV1ComputeNodesHeartbeatResponse200]
     """


    kwargs = _get_kwargs(
        body=body,

    )

    response = await client.get_async_httpx_client().request(
        **kwargs
    )

    return _build_response(client=client, response=response)

async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    body: ComputeHeartbeat,

) -> ErrorResponse | PostV1ComputeNodesHeartbeatResponse200 | None:
    """ Submit compute node heartbeat

    Args:
        body (ComputeHeartbeat):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorResponse | PostV1ComputeNodesHeartbeatResponse200
     """


    return (await asyncio_detailed(
        client=client,
body=body,

    )).parsed
