#!/usr/bin/env python3
"""
LucidLayer SDK - Create Passport Example

This example demonstrates how to create model and compute passports
using the LucidLayer Python SDK.
"""

import os
from lucid_sdk import LucidClient
from lucid_sdk.types import PassportType


def main():
    # Initialize the client
    client = LucidClient(
        base_url=os.getenv("LUCID_BASE_URL", "http://localhost:3000"),
        api_key=os.getenv("LUCID_API_KEY"),
    )

    owner_wallet = os.getenv("OWNER_WALLET", "demo_wallet_address")

    print("🎫 Creating Passports\n")

    try:
        # 1. Create a Model Passport
        print("📦 Creating model passport...")
        model_passport = client.passports.create(
            type=PassportType.MODEL,
            owner=owner_wallet,
            metadata={
                "name": "My Custom LLM",
                "description": "A fine-tuned language model for code generation",
                "model_id": "my-org/my-custom-llm",
                "runtime_recommended": "vllm",
                "format": "safetensors",
                "parameters_b": 7.0,
                "context_window": 4096,
                "capabilities": ["text-generation", "code-generation"],
                "license": "Apache-2.0",
                "tags": ["llm", "code", "fine-tuned"],
                "requirements": {
                    "min_vram_gb": 16,
                },
            },
        )

        print(f"✅ Model passport created: {model_passport.passport_id}")
        print(f"   Name: {model_passport.metadata.get('name')}")
        print(f"   Type: {model_passport.type}")

        # 2. Create a Compute Passport
        print("\n💻 Creating compute passport...")
        compute_passport = client.passports.create(
            type=PassportType.COMPUTE,
            owner=owner_wallet,
            metadata={
                "name": "GPU Cloud Provider A",
                "description": "High-performance GPU compute for AI inference",
                "endpoint": "https://api.provider-a.example.com/v1",
                "provider_type": "cloud",
                "regions": ["us-east-1", "eu-west-1"],
                "hardware": {
                    "gpu": "A100",
                    "vram_gb": 80,
                    "gpu_count": 8,
                },
                "runtimes": [
                    {"name": "vllm", "version": "0.4.0"},
                    {"name": "tgi", "version": "2.0"},
                ],
                "pricing": {
                    "unit": "token",
                    "cost_per_input_token": 0.00001,
                    "cost_per_output_token": 0.00003,
                    "currency": "USD",
                },
                "availability": {
                    "uptime_sla": 99.9,
                    "avg_latency_ms": 50,
                },
                "max_batch_size": 64,
                "max_concurrent": 100,
            },
        )

        print(f"✅ Compute passport created: {compute_passport.passport_id}")
        print(f"   Name: {compute_passport.metadata.get('name')}")
        regions = compute_passport.metadata.get("regions", [])
        print(f"   Regions: {', '.join(regions)}")

        # 3. List all passports
        print("\n📋 Listing all passports...")
        all_passports = client.passports.list(owner=owner_wallet)
        print(f"   Found {len(all_passports.passports)} passports")

        for p in all_passports.passports:
            name = p.metadata.get("name", "unnamed") if p.metadata else "unnamed"
            print(f"   - {p.passport_id} ({p.type}): {name}")

        # 4. Update a passport
        print("\n✏️ Updating model passport...")
        updated_metadata = model_passport.metadata.copy() if model_passport.metadata else {}
        updated_metadata["tags"] = ["llm", "code", "fine-tuned", "production-ready"]
        updated_metadata["description"] = "A production-ready fine-tuned language model for code generation"

        updated_passport = client.passports.update(
            model_passport.passport_id,
            metadata=updated_metadata,
        )
        tags = updated_passport.metadata.get("tags", []) if updated_passport.metadata else []
        print(f"✅ Updated tags: {', '.join(tags)}")

    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    main()
