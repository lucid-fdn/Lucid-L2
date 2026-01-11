#!/usr/bin/env python3
"""
LucidLayer SDK - Search and Match Example

This example demonstrates how to search for models and compute,
then match them using policy-based routing.
"""

import os
from lucid_sdk import LucidClient


def main():
    # Initialize the client
    client = LucidClient(
        base_url=os.getenv("LUCID_BASE_URL", "http://localhost:3000"),
        api_key=os.getenv("LUCID_API_KEY"),
    )

    print("🔍 LucidLayer Search & Match Demo\n")

    try:
        # 1. Search for models
        print("📦 Searching for vLLM-compatible models...")
        models = client.search.models(
            runtime="vllm",
            max_vram=24,
            per_page=5,
        )

        if not models:
            print("   No models found. Try creating some passports first.")
        else:
            print(f"   Found {len(models)} models:")
            for model in models:
                name = model.metadata.get("name", model.passport_id) if model.metadata else model.passport_id
                runtime = model.metadata.get("runtime_recommended", "unknown") if model.metadata else "unknown"
                params = model.metadata.get("parameters_b", "?") if model.metadata else "?"
                print(f"   - {name}")
                print(f"     Runtime: {runtime}")
                print(f"     Parameters: {params}B")

        # 2. Search for compute providers
        print("\n💻 Searching for compute in US regions...")
        compute = client.search.compute(
            regions=["us-east-1", "us-west-2"],
            runtimes=["vllm"],
            min_vram_gb=40,
            per_page=5,
        )

        if not compute:
            print("   No compute found. Try creating some compute passports first.")
        else:
            print(f"   Found {len(compute)} compute providers:")
            for c in compute:
                if c.metadata:
                    name = c.metadata.get("name", c.passport_id)
                    hardware = c.metadata.get("hardware", {})
                    gpu = hardware.get("gpu", "unknown")
                    vram = hardware.get("vram_gb", "?")
                    regions = c.metadata.get("regions", [])
                    print(f"   - {name}")
                    print(f"     GPU: {gpu}")
                    print(f"     VRAM: {vram}GB")
                    print(f"     Regions: {', '.join(regions)}")

        # 3. Match model to compute with policy
        if models:
            model_id = models[0].passport_id
            print(f"\n🎯 Matching compute for model: {model_id}")

            matches = client.match.compute_for_model(
                model_id=model_id,
                policy={
                    "regions": ["us-east-1"],
                    "max_cost_per_token": 0.0001,
                    "preferred_runtimes": ["vllm"],
                    "min_availability": 99.0,
                },
            )

            if not matches:
                print("   No matching compute found for this policy.")
            else:
                print(f"   Found {len(matches)} matching compute providers:")
                for match in matches:
                    name = match.compute.metadata.get("name", match.compute.passport_id) if match.compute.metadata else match.compute.passport_id
                    print(f"   - {name}")
                    print(f"     Score: {match.score * 100:.1f}%")
                    print(f"     Region: {match.selected_region or 'any'}")
                    print(f"     Runtime: {match.selected_runtime or 'default'}")

            # 4. Get detailed match explanation
            print("\n📊 Getting match explanation...")
            explanation = client.match.explain(
                model_id=model_id,
                policy={
                    "regions": ["us-east-1"],
                    "max_cost_per_token": 0.0001,
                },
            )

            print("   Matching criteria:")
            if explanation.criteria:
                for key, value in explanation.criteria.items():
                    print(f"   - {key}: {value}")
            print(f"   Total candidates: {explanation.total_candidates or 0}")
            print(f"   Passed filter: {explanation.passed_filter or 0}")

        # 5. Search with full-text
        print('\n🔤 Full-text search for "code generation"...')
        code_models = client.search.models(
            search="code generation",
            per_page=3,
        )

        if not code_models:
            print('   No models found matching "code generation".')
        else:
            print(f"   Found {len(code_models)} models:")
            for model in code_models:
                if model.metadata:
                    name = model.metadata.get("name", "unnamed")
                    desc = model.metadata.get("description", "")[:50]
                    print(f"   - {name}: {desc}...")

    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    main()
