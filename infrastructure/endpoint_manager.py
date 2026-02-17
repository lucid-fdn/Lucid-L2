#!/usr/bin/env python3
"""
Lucid RunPod Endpoint Manager

Manages RunPod serverless endpoints based on capacity bucket YAML configuration.
Provides sync, list, and status commands for endpoint lifecycle management.

Usage:
    python endpoint_manager.py sync     # Sync all buckets to RunPod
    python endpoint_manager.py list     # List current endpoints
    python endpoint_manager.py status   # Check endpoint health
    python endpoint_manager.py delete <name>  # Delete an endpoint

Environment:
    RUNPOD_API_KEY: RunPod API key (required)

Configuration:
    capacity-buckets.yaml in the same directory
"""

import os
import sys
import json
import argparse
import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from pathlib import Path

import yaml
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('endpoint-manager')

# RunPod API configuration
RUNPOD_API_URL = "https://api.runpod.io/graphql"
RUNPOD_REST_URL = "https://api.runpod.io/v2"


@dataclass
class CapacityBucket:
    """Represents a capacity bucket configuration."""
    name: str
    display_name: str
    description: str
    gpu_types: List[str]
    regions: List[str]
    workers_min: int
    workers_max: int
    gpu_count: int
    container_image: str
    env: Dict[str, str]
    pricing: Dict[str, float]
    scaler_type: str = "QUEUE_DELAY"
    scaler_value: int = 4
    idle_timeout: int = 300


class EndpointManager:
    """Manages RunPod serverless endpoints."""

    def __init__(self, config_path: str = "capacity-buckets.yaml"):
        self.api_key = os.environ.get("RUNPOD_API_KEY")
        if not self.api_key:
            raise ValueError("RUNPOD_API_KEY environment variable is required")

        self.config_path = Path(config_path)
        if not self.config_path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")

        with open(self.config_path) as f:
            self.config = yaml.safe_load(f)

        self.defaults = self.config.get("defaults", {})
        self.buckets = self._parse_buckets()

    def _parse_buckets(self) -> List[CapacityBucket]:
        """Parse bucket configurations from YAML."""
        buckets = []
        for bucket_config in self.config.get("buckets", []):
            # Merge defaults with bucket config
            merged = {**self.defaults, **bucket_config}

            # Build container image with registry and tag
            container_image = bucket_config.get("container_image", "lucid/worker-runpod")
            if self.defaults.get("container_registry"):
                container_image = f"{self.defaults['container_registry']}/{container_image.split('/')[-1]}"
            if self.defaults.get("container_tag"):
                container_image = f"{container_image}:{self.defaults['container_tag']}"

            bucket = CapacityBucket(
                name=bucket_config["name"],
                display_name=bucket_config.get("display_name", bucket_config["name"]),
                description=bucket_config.get("description", ""),
                gpu_types=bucket_config.get("gpu_types", []),
                regions=bucket_config.get("regions", []),
                workers_min=bucket_config.get("workers_min", 0),
                workers_max=bucket_config.get("workers_max", 10),
                gpu_count=bucket_config.get("gpu_count", 1),
                container_image=container_image,
                env=bucket_config.get("env", {}),
                pricing=bucket_config.get("pricing", {}),
                scaler_type=merged.get("scaler_type", "QUEUE_DELAY"),
                scaler_value=merged.get("scaler_value", 4),
                idle_timeout=merged.get("idle_timeout", 300),
            )
            buckets.append(bucket)

        return buckets

    def _graphql_request(self, query: str, variables: Dict = None) -> Dict:
        """Make a GraphQL request to RunPod API."""
        response = requests.post(
            RUNPOD_API_URL,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={"query": query, "variables": variables or {}},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        if "errors" in data:
            raise Exception(f"GraphQL errors: {data['errors']}")

        return data.get("data", {})

    def _rest_request(self, method: str, path: str, data: Dict = None) -> Dict:
        """Make a REST request to RunPod API."""
        url = f"{RUNPOD_REST_URL}{path}"
        response = requests.request(
            method,
            url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json=data,
            timeout=30,
        )
        response.raise_for_status()
        return response.json() if response.content else {}

    def list_endpoints(self) -> List[Dict]:
        """List all RunPod endpoints."""
        query = """
        query GetEndpoints {
            myself {
                serverlessDiscount
                endpoints {
                    id
                    name
                    templateId
                    workersMin
                    workersMax
                    idleTimeout
                    gpuIds
                    locations
                }
            }
        }
        """
        data = self._graphql_request(query)
        return data.get("myself", {}).get("endpoints", [])

    def get_endpoint_by_name(self, name: str) -> Optional[Dict]:
        """Get endpoint by name."""
        endpoints = self.list_endpoints()
        return next((e for e in endpoints if e["name"] == name), None)

    def get_endpoint_health(self, endpoint_id: str) -> Dict:
        """Get endpoint health status."""
        try:
            return self._rest_request("GET", f"/{endpoint_id}/health")
        except requests.exceptions.HTTPError as e:
            return {"error": str(e), "status": "unknown"}

    def create_endpoint(self, bucket: CapacityBucket) -> str:
        """Create a new RunPod endpoint for a capacity bucket."""
        # First, create or get a template for this configuration
        template_id = self._get_or_create_template(bucket)

        mutation = """
        mutation CreateEndpoint($input: EndpointInput!) {
            saveEndpoint(input: $input) {
                id
                name
            }
        }
        """

        variables = {
            "input": {
                "name": bucket.name,
                "templateId": template_id,
                "gpuIds": self._resolve_gpu_ids(bucket.gpu_types),
                "workersMin": bucket.workers_min,
                "workersMax": bucket.workers_max,
                "idleTimeout": bucket.idle_timeout,
                "scalerType": bucket.scaler_type,
                "scalerValue": bucket.scaler_value,
                "locations": bucket.regions if bucket.regions else None,
            }
        }

        data = self._graphql_request(mutation, variables)
        endpoint = data.get("saveEndpoint", {})
        return endpoint.get("id", "")

    def update_endpoint(self, endpoint_id: str, bucket: CapacityBucket) -> str:
        """Update an existing RunPod endpoint."""
        template_id = self._get_or_create_template(bucket)

        mutation = """
        mutation UpdateEndpoint($input: EndpointInput!) {
            saveEndpoint(input: $input) {
                id
                name
            }
        }
        """

        variables = {
            "input": {
                "id": endpoint_id,
                "name": bucket.name,
                "templateId": template_id,
                "gpuIds": self._resolve_gpu_ids(bucket.gpu_types),
                "workersMin": bucket.workers_min,
                "workersMax": bucket.workers_max,
                "idleTimeout": bucket.idle_timeout,
                "scalerType": bucket.scaler_type,
                "scalerValue": bucket.scaler_value,
                "locations": bucket.regions if bucket.regions else None,
            }
        }

        data = self._graphql_request(mutation, variables)
        endpoint = data.get("saveEndpoint", {})
        return endpoint.get("id", "")

    def delete_endpoint(self, endpoint_id: str) -> bool:
        """Delete a RunPod endpoint."""
        mutation = """
        mutation DeleteEndpoint($id: String!) {
            deleteEndpoint(id: $id)
        }
        """
        data = self._graphql_request(mutation, {"id": endpoint_id})
        return data.get("deleteEndpoint", False)

    def _get_or_create_template(self, bucket: CapacityBucket) -> str:
        """Get or create a serverless template for the bucket."""
        # For now, we'll use a default template approach
        # In production, you'd want to manage templates separately
        #
        # RunPod templates define:
        # - Container image
        # - Environment variables
        # - GPU requirements
        # - Volume mounts

        # List existing templates
        query = """
        query GetTemplates {
            myself {
                serverlessTemplates {
                    id
                    name
                    imageName
                }
            }
        }
        """
        data = self._graphql_request(query)
        templates = data.get("myself", {}).get("serverlessTemplates", [])

        # Look for existing template with matching name
        template_name = f"lucid-{bucket.name}"
        existing = next((t for t in templates if t["name"] == template_name), None)

        if existing:
            return existing["id"]

        # Create new template
        logger.info(f"Creating template: {template_name}")

        mutation = """
        mutation CreateTemplate($input: ServerlessTemplateInput!) {
            saveServerlessTemplate(input: $input) {
                id
                name
            }
        }
        """

        # Build environment variables list
        env_vars = [
            {"key": k, "value": v}
            for k, v in bucket.env.items()
        ]
        # Add pricing info
        env_vars.append({
            "key": "GPU_RATE_PER_SEC",
            "value": str(bucket.pricing.get("gpu_rate_per_sec", 0.000231))
        })

        variables = {
            "input": {
                "name": template_name,
                "imageName": bucket.container_image,
                "env": env_vars,
                "isServerless": True,
            }
        }

        data = self._graphql_request(mutation, variables)
        template = data.get("saveServerlessTemplate", {})
        return template.get("id", "")

    def _resolve_gpu_ids(self, gpu_types: List[str]) -> List[str]:
        """Map GPU type names to RunPod GPU IDs."""
        # RunPod uses specific GPU ID strings
        # This mapping may need updates as RunPod adds/changes GPUs
        GPU_ID_MAP = {
            "NVIDIA GeForce RTX 4090": "NVIDIA GeForce RTX 4090",
            "NVIDIA A10G": "NVIDIA A10G",
            "NVIDIA A100 40GB PCIe": "NVIDIA A100 40GB PCIe",
            "NVIDIA A100-SXM4-40GB": "NVIDIA A100-SXM4-40GB",
            "NVIDIA A100 80GB PCIe": "NVIDIA A100 80GB PCIe",
            "NVIDIA A100-SXM4-80GB": "NVIDIA A100-SXM4-80GB",
            "NVIDIA H100 80GB HBM3": "NVIDIA H100 80GB HBM3",
            "NVIDIA H100 PCIe": "NVIDIA H100 PCIe",
        }
        return [GPU_ID_MAP.get(g, g) for g in gpu_types]

    def sync_from_config(self) -> Dict[str, str]:
        """
        Sync all capacity buckets to RunPod endpoints.

        Returns:
            Dict mapping bucket name to endpoint ID
        """
        results = {}

        for bucket in self.buckets:
            logger.info(f"Syncing bucket: {bucket.name}")

            existing = self.get_endpoint_by_name(bucket.name)

            try:
                if existing:
                    logger.info(f"  Updating existing endpoint: {existing['id']}")
                    endpoint_id = self.update_endpoint(existing["id"], bucket)
                else:
                    logger.info(f"  Creating new endpoint")
                    endpoint_id = self.create_endpoint(bucket)

                results[bucket.name] = endpoint_id
                logger.info(f"  Success: {endpoint_id}")

            except Exception as e:
                logger.error(f"  Failed: {e}")
                results[bucket.name] = f"ERROR: {e}"

        return results

    def get_all_status(self) -> List[Dict]:
        """Get status for all endpoints."""
        endpoints = self.list_endpoints()
        status_list = []

        for endpoint in endpoints:
            health = self.get_endpoint_health(endpoint["id"])
            status_list.append({
                "name": endpoint["name"],
                "id": endpoint["id"],
                "workers_min": endpoint.get("workersMin", 0),
                "workers_max": endpoint.get("workersMax", 0),
                "health": health,
            })

        return status_list


def main():
    parser = argparse.ArgumentParser(description="Lucid RunPod Endpoint Manager")
    parser.add_argument(
        "command",
        choices=["sync", "list", "status", "delete"],
        help="Command to execute"
    )
    parser.add_argument(
        "--config",
        default="capacity-buckets.yaml",
        help="Path to capacity buckets config file"
    )
    parser.add_argument(
        "--name",
        help="Endpoint name (for delete command)"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output in JSON format"
    )

    args = parser.parse_args()

    try:
        manager = EndpointManager(args.config)
    except ValueError as e:
        logger.error(str(e))
        sys.exit(1)
    except FileNotFoundError as e:
        logger.error(str(e))
        sys.exit(1)

    if args.command == "sync":
        results = manager.sync_from_config()
        if args.json:
            print(json.dumps(results, indent=2))
        else:
            print("\nSync Results:")
            print("-" * 60)
            for bucket, endpoint_id in results.items():
                status = "OK" if not endpoint_id.startswith("ERROR") else "FAILED"
                print(f"  {bucket}: {endpoint_id} [{status}]")

    elif args.command == "list":
        endpoints = manager.list_endpoints()
        if args.json:
            print(json.dumps(endpoints, indent=2))
        else:
            print("\nRunPod Endpoints:")
            print("-" * 60)
            for ep in endpoints:
                print(f"  {ep['name']}")
                print(f"    ID: {ep['id']}")
                print(f"    Workers: {ep.get('workersMin', 0)}-{ep.get('workersMax', 0)}")
                print(f"    GPUs: {', '.join(ep.get('gpuIds', []))}")
                print()

    elif args.command == "status":
        status_list = manager.get_all_status()
        if args.json:
            print(json.dumps(status_list, indent=2))
        else:
            print("\nEndpoint Status:")
            print("-" * 60)
            for s in status_list:
                health = s.get("health", {})
                workers = health.get("workers", {})
                print(f"  {s['name']}")
                print(f"    ID: {s['id']}")
                print(f"    Workers: {workers.get('running', '?')}/{s['workers_max']}")
                print(f"    Queue: {health.get('jobsInQueue', '?')}")
                print()

    elif args.command == "delete":
        if not args.name:
            logger.error("--name is required for delete command")
            sys.exit(1)

        endpoint = manager.get_endpoint_by_name(args.name)
        if not endpoint:
            logger.error(f"Endpoint not found: {args.name}")
            sys.exit(1)

        confirm = input(f"Delete endpoint '{args.name}' ({endpoint['id']})? [y/N] ")
        if confirm.lower() == 'y':
            success = manager.delete_endpoint(endpoint["id"])
            if success:
                print(f"Deleted endpoint: {args.name}")
            else:
                print(f"Failed to delete endpoint: {args.name}")
        else:
            print("Cancelled")


if __name__ == "__main__":
    main()
