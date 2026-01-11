#!/usr/bin/env python3
"""
LucidLayer SDK - Basic Inference Example

This example demonstrates how to run a simple inference request
using the LucidLayer Python SDK.
"""

import os
from lucid_sdk import LucidClient


def main():
    # Initialize the client
    client = LucidClient(
        base_url=os.getenv("LUCID_BASE_URL", "http://localhost:3000"),
        api_key=os.getenv("LUCID_API_KEY"),
    )

    # Model passport ID - replace with your model passport
    model_passport_id = os.getenv("MODEL_PASSPORT_ID", "model_llama2_7b")

    print("🚀 Running inference...\n")

    try:
        # Simple inference request
        result = client.run.inference(
            model_passport_id=model_passport_id,
            prompt="Explain the concept of AI passports in one paragraph.",
            max_tokens=150,
            temperature=0.7,
        )

        print("📝 Response:")
        print(result.output)
        print("\n📊 Metrics:")
        print(f"  - Tokens in: {result.tokens_in}")
        print(f"  - Tokens out: {result.tokens_out}")
        print(f"  - Time to first token: {result.ttft_ms}ms")
        print(f"  - Receipt ID: {result.receipt_id}")

        # Optionally verify the receipt
        if result.receipt_id:
            print("\n🔍 Verifying receipt...")
            verification = client.receipts.verify(result.receipt_id)
            print(f"  - Valid: {verification.valid}")
            if verification.anchor_tx:
                print(f"  - Anchored in tx: {verification.anchor_tx}")

    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    main()
