# @lucid/sdk Speakeasy-First Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship `@lucid/sdk` (auto-generated via Speakeasy) + `@lucid/react` (handwritten hooks) + `@lucid/ai` (Vercel AI re-export) by updating `openapi.yaml` with ~30 missing public endpoints, renaming the Speakeasy output, and creating two thin wrapper packages.

**Architecture:** `openapi.yaml` is the source of truth. Speakeasy regenerates the full TypeScript SDK from it. We rename the output from `raijin-labs-lucid-ai` to `@lucid/sdk` with class name `LucidSDK`. Custom code lives only in `src/ai.ts` (existing Vercel AI provider), `src/hooks/registration.ts` (custom hooks), and a new `src/lucid.ts` (typed factory). `@lucid/react` is a separate handwritten package (~200 lines). `@lucid/ai` is a 5-line re-export package.

**Tech Stack:** OpenAPI 3.0.3, Speakeasy CLI, TypeScript 5.8, React 18+, Vercel AI SDK 6.x, tshy, Zod v4-mini

**Design Doc:** `docs/plans/2026-03-02-sdk-speakeasy-design.md`

---

## Task 1: Add security scheme and new tags to openapi.yaml

**Files:**
- Modify: `openapi.yaml:15-41` (servers/tags section)

**Step 1: Add Bearer auth security scheme**

After the `servers:` block (line 17) and before `x-speakeasy-mcp:` (line 19), insert:

```yaml
security:
  - BearerAuth: []
  - {}
```

This makes auth optional globally (endpoints work with or without a token).

**Step 2: Add new tags**

After `- name: Shares` (line 41), add:

```yaml
  - name: Escrow
  - name: Disputes
  - name: Paymaster
  - name: Identity
  - name: TBA
  - name: Modules
  - name: zkML
```

**Step 3: Update scope mapping**

In the `x-speakeasy-mcp.scope-mapping` section (line 26), expand the write pattern:

Change the third mapping from:
```yaml
    - pattern: "^(create|update|trigger|submit|commit|retry|run|calculate|init|process|plan|accomplish|execute|validate)"
```
To:
```yaml
    - pattern: "^(create|update|trigger|submit|commit|retry|run|calculate|init|process|plan|accomplish|execute|validate|release|dispute|open|resolve|appeal|sponsor|estimate|link|unlink|install|uninstall|configure|prove|register|generate)"
```

**Step 4: Add securitySchemes to components**

In the `components:` section (line 2269), after the `responses:` block (around line 2300), before `schemas:`, add:

```yaml
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      description: Lucid API key (lk_live_... or lk_test_...)
```

**Step 5: Validate YAML syntax**

```bash
cd Lucid-L2 && python3 -c "import yaml; yaml.safe_load(open('openapi.yaml')); print('YAML OK')"
```

Expected: `YAML OK`

**Step 6: Commit**

```bash
git add openapi.yaml
git commit -m "chore(openapi): add bearer auth, v2 tags, extended scope mapping"
```

---

## Task 2: Add v2 component schemas to openapi.yaml

**Files:**
- Modify: `openapi.yaml` — append after last line of `components/schemas` (after line ~3280)

**Step 1: Add all v2 schemas**

Append the following YAML at the end of `components/schemas`:

```yaml
    # =========================================================================
    # v2 Escrow
    # =========================================================================
    EscrowStatus:
      type: string
      enum: [Created, Released, Refunded, Disputed]

    CreateEscrowRequest:
      type: object
      required: [chainId, beneficiary, token, amount, duration]
      properties:
        chainId: { type: string, description: "Chain identifier (e.g. 'base', 'ethereum-sepolia')" }
        beneficiary: { type: string, description: "Beneficiary address" }
        token: { type: string, description: "ERC-20 token address" }
        amount: { type: string, description: "Amount in token base units" }
        duration: { type: integer, description: "Escrow duration in seconds" }
        expectedReceiptHash: { type: string, description: "Optional expected receipt hash for auto-release" }

    ReleaseEscrowRequest:
      type: object
      required: [chainId, escrowId, receiptHash, signature, signerPubkey]
      properties:
        chainId: { type: string }
        escrowId: { type: string }
        receiptHash: { type: string }
        signature: { type: string }
        signerPubkey: { type: string }

    DisputeEscrowRequest:
      type: object
      required: [chainId, escrowId, reason]
      properties:
        chainId: { type: string }
        escrowId: { type: string }
        reason: { type: string }

    EscrowInfo:
      type: object
      properties:
        escrowId: { type: string }
        depositor: { type: string }
        beneficiary: { type: string }
        token: { type: string }
        amount: { type: string }
        createdAt: { type: string }
        expiresAt: { type: string }
        expectedReceiptHash: { type: string }
        status: { $ref: '#/components/schemas/EscrowStatus' }

    GetEscrowResponse:
      type: object
      required: [success]
      properties:
        success: { type: boolean }
        escrow: { $ref: '#/components/schemas/EscrowInfo' }

    # =========================================================================
    # v2 Disputes
    # =========================================================================
    DisputeStatus:
      type: string
      enum: [Open, EvidencePhase, Resolved, Appealed]

    OpenDisputeRequest:
      type: object
      required: [chainId, escrowId, reason]
      properties:
        chainId: { type: string }
        escrowId: { type: string }
        reason: { type: string }

    SubmitEvidenceRequest:
      type: object
      required: [chainId]
      properties:
        chainId: { type: string }
        receiptHash: { type: string }
        mmrRoot: { type: string }
        mmrProof: { type: string }
        description: { type: string }

    DisputeInfo:
      type: object
      properties:
        disputeId: { type: string }
        escrowId: { type: string }
        status: { $ref: '#/components/schemas/DisputeStatus' }
        reason: { type: string }
        createdAt: { type: string }
        resolvedAt: { type: string }
        resolution: { type: string }

    GetDisputeResponse:
      type: object
      required: [success]
      properties:
        success: { type: boolean }
        dispute: { $ref: '#/components/schemas/DisputeInfo' }

    # =========================================================================
    # v2 Paymaster
    # =========================================================================
    SponsorUserOpRequest:
      type: object
      required: [chainId, userOp]
      properties:
        chainId: { type: string }
        userOp:
          type: object
          description: ERC-4337 UserOperation struct

    EstimateGasRequest:
      type: object
      required: [chainId, userOp]
      properties:
        chainId: { type: string }
        userOp:
          type: object
          description: ERC-4337 UserOperation struct

    PaymasterRateResponse:
      type: object
      required: [success]
      properties:
        success: { type: boolean }
        exchangeRate: { type: number, description: "LUCID per ETH rate" }
        chainId: { type: string }

    # =========================================================================
    # v2 Identity
    # =========================================================================
    LinkIdentityRequest:
      type: object
      required: [primaryCaip10, linkedCaip10]
      properties:
        primaryCaip10: { type: string, description: "Primary CAIP-10 address" }
        linkedCaip10: { type: string, description: "Address to link" }
        proof: { type: string, description: "Optional ownership proof" }

    ResolveIdentityRequest:
      type: object
      required: [caip10]
      properties:
        caip10: { type: string }

    UnlinkIdentityRequest:
      type: object
      required: [primaryCaip10, linkedCaip10]
      properties:
        primaryCaip10: { type: string }
        linkedCaip10: { type: string }

    IdentityLink:
      type: object
      properties:
        linkId: { type: string }
        primaryCaip10: { type: string }
        linkedCaip10: { type: string }
        createdAt: { type: string }

    IdentityLinkResponse:
      type: object
      required: [success]
      properties:
        success: { type: boolean }
        link: { $ref: '#/components/schemas/IdentityLink' }

    IdentityChainsResponse:
      type: object
      required: [success]
      properties:
        success: { type: boolean }
        caip10: { type: string }
        chains:
          type: array
          items: { type: string }

    # =========================================================================
    # v2 TBA (Token Bound Accounts)
    # =========================================================================
    CreateTBARequest:
      type: object
      required: [chainId, tokenContract, tokenId]
      properties:
        chainId: { type: string }
        tokenContract: { type: string, description: "NFT contract address" }
        tokenId: { type: string, description: "NFT token ID" }

    TBAInfo:
      type: object
      properties:
        address: { type: string, description: "TBA contract address" }
        chainId: { type: string }
        tokenContract: { type: string }
        tokenId: { type: string }

    GetTBAResponse:
      type: object
      required: [success]
      properties:
        success: { type: boolean }
        tba: { $ref: '#/components/schemas/TBAInfo' }

    # =========================================================================
    # v2 ERC-7579 Modules
    # =========================================================================
    InstallModuleRequest:
      type: object
      required: [chainId, account, moduleType, moduleAddress]
      properties:
        chainId: { type: string }
        account: { type: string, description: "Smart account address" }
        moduleType: { type: string, description: "Module type (validator, executor)" }
        moduleAddress: { type: string, description: "Module contract address" }
        initData: { type: string, description: "Optional init calldata (hex)" }

    UninstallModuleRequest:
      type: object
      required: [chainId, account, moduleType, moduleAddress]
      properties:
        chainId: { type: string }
        account: { type: string }
        moduleType: { type: string }
        moduleAddress: { type: string }

    ConfigurePolicyRequest:
      type: object
      required: [chainId, account, policyHashes]
      properties:
        chainId: { type: string }
        account: { type: string }
        policyHashes:
          type: array
          items: { type: string }

    ConfigurePayoutRequest:
      type: object
      required: [chainId, account, recipients, basisPoints]
      properties:
        chainId: { type: string }
        account: { type: string }
        recipients:
          type: array
          items: { type: string }
        basisPoints:
          type: array
          items: { type: integer }
          description: "Must sum to 10000"

    ListModulesResponse:
      type: object
      required: [success]
      properties:
        success: { type: boolean }
        modules: { type: object, description: "Installed modules by type" }

    # =========================================================================
    # v2 zkML
    # =========================================================================
    GenerateZkMLProofRequest:
      type: object
      required: [modelId, inputHash, outputHash, policyHash]
      properties:
        modelId: { type: string }
        inputHash: { type: string }
        outputHash: { type: string }
        policyHash: { type: string }

    VerifyZkMLProofRequest:
      type: object
      required: [chainId, proof, receiptHash]
      properties:
        chainId: { type: string }
        proof: { type: object, description: "Groth16 proof (a, b, c points)" }
        receiptHash: { type: string }

    RegisterZkMLModelRequest:
      type: object
      required: [chainId, modelHash, verifyingKey]
      properties:
        chainId: { type: string }
        modelHash: { type: string }
        verifyingKey: { type: string, description: "Groth16 verifying key (hex)" }

    ZkMLProof:
      type: object
      properties:
        proof: { type: object }
        publicInputs:
          type: array
          items: { type: string }
        modelCircuitHash: { type: string }
        verified: { type: boolean }

    ZkMLVerifyResponse:
      type: object
      required: [success]
      properties:
        success: { type: boolean }
        valid: { type: boolean }
        stage:
          type: string
          enum: [offchain, onchain]
        error: { type: string }

    ListZkMLModelsResponse:
      type: object
      required: [success]
      properties:
        success: { type: boolean }
        models: { type: object }

    # =========================================================================
    # Passport PATCH sub-routes
    # =========================================================================
    UpdatePassportPricingRequest:
      type: object
      properties:
        price_per_request: { type: number }
        billing_model: { type: string }
        revenue_split:
          type: object
          properties:
            compute_bps: { type: integer }
            model_bps: { type: integer }
            protocol_bps: { type: integer }

    UpdatePassportEndpointsRequest:
      type: object
      properties:
        inference_url: { type: string, format: uri }
        health_url: { type: string, format: uri }
        api_base_url: { type: string, format: uri }

    # =========================================================================
    # Shared
    # =========================================================================
    SuccessResponse:
      type: object
      required: [success]
      properties:
        success: { type: boolean }
```

**Step 2: Validate YAML syntax**

```bash
cd Lucid-L2 && python3 -c "import yaml; yaml.safe_load(open('openapi.yaml')); print('YAML OK')"
```

**Step 3: Commit**

```bash
git add openapi.yaml
git commit -m "chore(openapi): add v2 component schemas (escrow, disputes, paymaster, identity, TBA, modules, zkml)"
```

---

## Task 3: Add Escrow + Dispute paths to openapi.yaml

**Files:**
- Modify: `openapi.yaml` — insert new paths before line 2266 (`# Components`)

**Step 1: Add Escrow paths**

Before the `# Components` separator (line 2266), insert:

```yaml
  # ===========================================================================
  # v2 Escrow
  # ===========================================================================
  /v2/escrow/create:
    post:
      tags: [Escrow]
      operationId: lucid_create_escrow
      summary: Create a time-locked escrow
      x-speakeasy-mcp:
        name: lucid_create_escrow
        description: Create a time-locked escrow for agent-to-agent transactions.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateEscrowRequest'
      responses:
        '200':
          description: Escrow created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/escrow/release:
    post:
      tags: [Escrow]
      operationId: lucid_release_escrow
      summary: Release escrow with verified receipt
      x-speakeasy-mcp:
        name: lucid_release_escrow
        description: Release escrow funds to beneficiary after receipt verification.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ReleaseEscrowRequest'
      responses:
        '200':
          description: Escrow released
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/escrow/dispute:
    post:
      tags: [Escrow]
      operationId: lucid_dispute_escrow
      summary: Dispute an escrow
      x-speakeasy-mcp:
        name: lucid_dispute_escrow
        description: Dispute an active escrow, freezing funds for arbitration.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/DisputeEscrowRequest'
      responses:
        '200':
          description: Escrow disputed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/escrow/{chainId}/{escrowId}:
    get:
      tags: [Escrow]
      operationId: lucid_get_escrow
      summary: Get escrow details
      x-speakeasy-mcp:
        name: lucid_get_escrow
        description: Get details of a specific escrow by chain and ID.
      parameters:
        - name: chainId
          in: path
          required: true
          schema: { type: string }
        - name: escrowId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Escrow details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GetEscrowResponse'
        '404': { $ref: '#/components/responses/NotFound' }
        '500': { $ref: '#/components/responses/InternalServerError' }
```

**Step 2: Add Dispute paths**

Immediately after the Escrow paths:

```yaml
  # ===========================================================================
  # v2 Disputes
  # ===========================================================================
  /v2/disputes/open:
    post:
      tags: [Disputes]
      operationId: lucid_open_dispute
      summary: Open a dispute on an escrow
      x-speakeasy-mcp:
        name: lucid_open_dispute
        description: Open a dispute on an active escrow, starting the evidence phase.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/OpenDisputeRequest'
      responses:
        '200':
          description: Dispute opened
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/disputes/{disputeId}/evidence:
    post:
      tags: [Disputes]
      operationId: lucid_submit_evidence
      summary: Submit evidence for a dispute
      x-speakeasy-mcp:
        name: lucid_submit_evidence
        description: Submit evidence (receipt hash, MMR proof) for an open dispute.
      parameters:
        - name: disputeId
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SubmitEvidenceRequest'
      responses:
        '200':
          description: Evidence submitted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/disputes/{disputeId}/resolve:
    post:
      tags: [Disputes]
      operationId: lucid_resolve_dispute
      summary: Resolve a dispute
      x-speakeasy-mcp:
        name: lucid_resolve_dispute
        description: Trigger automated resolution of a dispute based on submitted evidence.
      parameters:
        - name: disputeId
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [chainId]
              properties:
                chainId: { type: string }
      responses:
        '200':
          description: Dispute resolved
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/disputes/{disputeId}/appeal:
    post:
      tags: [Disputes]
      operationId: lucid_appeal_dispute
      summary: Appeal a dispute decision
      x-speakeasy-mcp:
        name: lucid_appeal_dispute
        description: Appeal a dispute resolution (requires staking LUCID).
      parameters:
        - name: disputeId
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [chainId]
              properties:
                chainId: { type: string }
      responses:
        '200':
          description: Appeal submitted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/disputes/{chainId}/{disputeId}:
    get:
      tags: [Disputes]
      operationId: lucid_get_dispute
      summary: Get dispute details
      x-speakeasy-mcp:
        name: lucid_get_dispute
        description: Get details of a specific dispute.
      parameters:
        - name: chainId
          in: path
          required: true
          schema: { type: string }
        - name: disputeId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Dispute details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GetDisputeResponse'
        '404': { $ref: '#/components/responses/NotFound' }
        '500': { $ref: '#/components/responses/InternalServerError' }
```

**Step 3: Validate YAML syntax**

```bash
cd Lucid-L2 && python3 -c "import yaml; yaml.safe_load(open('openapi.yaml')); print('YAML OK')"
```

**Step 4: Commit**

```bash
git add openapi.yaml
git commit -m "chore(openapi): add v2 escrow + dispute endpoints"
```

---

## Task 4: Add Paymaster + Identity + TBA paths to openapi.yaml

**Files:**
- Modify: `openapi.yaml` — insert after Dispute paths (before Components section)

**Step 1: Add Paymaster paths**

```yaml
  # ===========================================================================
  # v2 Paymaster (ERC-4337 gas abstraction)
  # ===========================================================================
  /v2/paymaster/sponsor:
    post:
      tags: [Paymaster]
      operationId: lucid_sponsor_user_op
      summary: Sponsor a UserOp with $LUCID
      x-speakeasy-mcp:
        name: lucid_sponsor_user_op
        description: Sponsor an ERC-4337 UserOperation, paying gas in $LUCID.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SponsorUserOpRequest'
      responses:
        '200':
          description: UserOp sponsored
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/paymaster/rate/{chainId}:
    get:
      tags: [Paymaster]
      operationId: lucid_get_paymaster_rate
      summary: Get LUCID/ETH exchange rate
      x-speakeasy-mcp:
        name: lucid_get_paymaster_rate
        description: Get the current LUCID per ETH exchange rate for gas sponsoring.
      parameters:
        - name: chainId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Exchange rate
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PaymasterRateResponse'
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/paymaster/estimate:
    post:
      tags: [Paymaster]
      operationId: lucid_estimate_gas_lucid
      summary: Estimate gas cost in $LUCID
      x-speakeasy-mcp:
        name: lucid_estimate_gas_lucid
        description: Estimate how much $LUCID a UserOperation will cost.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/EstimateGasRequest'
      responses:
        '200':
          description: Gas estimate
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }
```

**Step 2: Add Identity paths**

```yaml
  # ===========================================================================
  # v2 Identity (cross-chain)
  # ===========================================================================
  /v2/identity/link:
    post:
      tags: [Identity]
      operationId: lucid_link_identity
      summary: Link addresses cross-chain
      x-speakeasy-mcp:
        name: lucid_link_identity
        description: Link a new address to an existing cross-chain identity.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LinkIdentityRequest'
      responses:
        '200':
          description: Identity linked
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/IdentityLinkResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/identity/resolve:
    post:
      tags: [Identity]
      operationId: lucid_resolve_identity
      summary: Resolve cross-chain identity
      x-speakeasy-mcp:
        name: lucid_resolve_identity
        description: Resolve a CAIP-10 address to its cross-chain identity graph.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ResolveIdentityRequest'
      responses:
        '200':
          description: Identity resolved
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }
    get:
      tags: [Identity]
      operationId: lucid_get_identity
      summary: Resolve identity (GET)
      x-speakeasy-mcp:
        name: lucid_get_identity
        description: Resolve a CAIP-10 address via query parameter.
      parameters:
        - name: caip10
          in: query
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Identity resolved
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/identity/chains:
    get:
      tags: [Identity]
      operationId: lucid_get_identity_chains
      summary: Get linked chains for identity
      x-speakeasy-mcp:
        name: lucid_get_identity_chains
        description: Get all chains linked to a CAIP-10 address.
      parameters:
        - name: caip10
          in: query
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Linked chains
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/IdentityChainsResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/identity/unlink:
    post:
      tags: [Identity]
      operationId: lucid_unlink_identity
      summary: Unlink a cross-chain address
      x-speakeasy-mcp:
        name: lucid_unlink_identity
        description: Remove a linked address from a cross-chain identity.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UnlinkIdentityRequest'
      responses:
        '200':
          description: Identity unlinked
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '404': { $ref: '#/components/responses/NotFound' }
        '500': { $ref: '#/components/responses/InternalServerError' }
```

**Step 3: Add TBA paths**

```yaml
  # ===========================================================================
  # v2 TBA (Token Bound Accounts)
  # ===========================================================================
  /v2/tba/create:
    post:
      tags: [TBA]
      operationId: lucid_create_tba
      summary: Create TBA for passport NFT
      x-speakeasy-mcp:
        name: lucid_create_tba
        description: Create an ERC-6551 Token Bound Account for a passport NFT.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateTBARequest'
      responses:
        '200':
          description: TBA created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GetTBAResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/tba/{chainId}/{tokenId}:
    get:
      tags: [TBA]
      operationId: lucid_get_tba
      summary: Get TBA address
      x-speakeasy-mcp:
        name: lucid_get_tba
        description: Get the Token Bound Account address for a token.
      parameters:
        - name: chainId
          in: path
          required: true
          schema: { type: string }
        - name: tokenId
          in: path
          required: true
          schema: { type: string }
        - name: tokenContract
          in: query
          required: true
          schema: { type: string }
      responses:
        '200':
          description: TBA info
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GetTBAResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }
```

**Step 4: Validate + Commit**

```bash
cd Lucid-L2 && python3 -c "import yaml; yaml.safe_load(open('openapi.yaml')); print('YAML OK')"
git add openapi.yaml
git commit -m "chore(openapi): add v2 paymaster, identity, TBA endpoints"
```

---

## Task 5: Add Modules + zkML paths + Passport PATCH to openapi.yaml

**Files:**
- Modify: `openapi.yaml` — insert paths before Components section

**Step 1: Add Module paths**

```yaml
  # ===========================================================================
  # v2 ERC-7579 Modules
  # ===========================================================================
  /v2/modules/install:
    post:
      tags: [Modules]
      operationId: lucid_install_module
      summary: Install module on smart account
      x-speakeasy-mcp:
        name: lucid_install_module
        description: Install an ERC-7579 module on a smart account.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/InstallModuleRequest'
      responses:
        '200':
          description: Module installed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/modules/uninstall:
    post:
      tags: [Modules]
      operationId: lucid_uninstall_module
      summary: Uninstall module from smart account
      x-speakeasy-mcp:
        name: lucid_uninstall_module
        description: Uninstall an ERC-7579 module from a smart account.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UninstallModuleRequest'
      responses:
        '200':
          description: Module uninstalled
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/modules/policy/configure:
    post:
      tags: [Modules]
      operationId: lucid_configure_policy_module
      summary: Configure policy module
      x-speakeasy-mcp:
        name: lucid_configure_policy_module
        description: Set allowed policy hashes on the LucidPolicyModule.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ConfigurePolicyRequest'
      responses:
        '200':
          description: Policy configured
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/modules/payout/configure:
    post:
      tags: [Modules]
      operationId: lucid_configure_payout_module
      summary: Configure payout module
      x-speakeasy-mcp:
        name: lucid_configure_payout_module
        description: Set revenue split on the LucidPayoutModule.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ConfigurePayoutRequest'
      responses:
        '200':
          description: Payout configured
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/modules/{chainId}/{account}:
    get:
      tags: [Modules]
      operationId: lucid_list_modules
      summary: List installed modules
      x-speakeasy-mcp:
        name: lucid_list_modules
        description: List ERC-7579 modules installed on a smart account.
      parameters:
        - name: chainId
          in: path
          required: true
          schema: { type: string }
        - name: account
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Installed modules
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ListModulesResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }
```

**Step 2: Add zkML paths**

```yaml
  # ===========================================================================
  # v2 zkML
  # ===========================================================================
  /v2/zkml/prove:
    post:
      tags: [zkML]
      operationId: lucid_generate_zkml_proof
      summary: Generate zkML proof
      x-speakeasy-mcp:
        name: lucid_generate_zkml_proof
        description: Generate a zkML proof for model inference verification.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenerateZkMLProofRequest'
      responses:
        '200':
          description: Proof generated
          content:
            application/json:
              schema:
                type: object
                required: [success]
                properties:
                  success: { type: boolean }
                  proof: { $ref: '#/components/schemas/ZkMLProof' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/zkml/verify:
    post:
      tags: [zkML]
      operationId: lucid_verify_zkml_proof
      summary: Verify zkML proof
      x-speakeasy-mcp:
        name: lucid_verify_zkml_proof
        description: Verify a zkML proof (offchain first, then onchain if valid).
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/VerifyZkMLProofRequest'
      responses:
        '200':
          description: Verification result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ZkMLVerifyResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/zkml/register-model:
    post:
      tags: [zkML]
      operationId: lucid_register_zkml_model
      summary: Register model circuit
      x-speakeasy-mcp:
        name: lucid_register_zkml_model
        description: Register a model's Groth16 verifying key for onchain proof verification.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RegisterZkMLModelRequest'
      responses:
        '200':
          description: Model registered
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessResponse'
        '400': { $ref: '#/components/responses/BadRequest' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v2/zkml/models/{chainId}:
    get:
      tags: [zkML]
      operationId: lucid_list_zkml_models
      summary: List registered model circuits
      x-speakeasy-mcp:
        name: lucid_list_zkml_models
        description: List all registered zkML model circuits on a chain.
      parameters:
        - name: chainId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Model circuits
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ListZkMLModelsResponse'
        '500': { $ref: '#/components/responses/InternalServerError' }
```

**Step 3: Add Passport PATCH sub-routes**

Add under the existing `/v1/passports/{passport_id}` path block:

```yaml
  /v1/passports/{passport_id}/pricing:
    patch:
      tags: [Passports]
      operationId: lucid_update_passport_pricing
      summary: Update passport pricing
      x-speakeasy-mcp:
        name: lucid_update_passport_pricing
        description: Update pricing fields on a passport.
      parameters:
        - name: passport_id
          in: path
          required: true
          schema: { type: string }
        - name: X-Owner-Address
          in: header
          required: false
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdatePassportPricingRequest'
      responses:
        '200':
          description: Updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GetPassportResponse'
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '500': { $ref: '#/components/responses/InternalServerError' }

  /v1/passports/{passport_id}/endpoints:
    patch:
      tags: [Passports]
      operationId: lucid_update_passport_endpoints
      summary: Update passport endpoint URLs
      x-speakeasy-mcp:
        name: lucid_update_passport_endpoints
        description: Update endpoint URLs on a passport.
      parameters:
        - name: passport_id
          in: path
          required: true
          schema: { type: string }
        - name: X-Owner-Address
          in: header
          required: false
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdatePassportEndpointsRequest'
      responses:
        '200':
          description: Updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GetPassportResponse'
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '500': { $ref: '#/components/responses/InternalServerError' }
```

**Step 4: Validate + Commit**

```bash
cd Lucid-L2 && python3 -c "import yaml; yaml.safe_load(open('openapi.yaml')); print('YAML OK')"
git add openapi.yaml
git commit -m "chore(openapi): add v2 modules, zkml, passport PATCH endpoints"
```

---

## Task 6: Validate complete openapi.yaml

**Files:**
- Read: `openapi.yaml`

**Step 1: Validate YAML structure**

```bash
cd Lucid-L2 && python3 -c "
import yaml
with open('openapi.yaml') as f:
    spec = yaml.safe_load(f)
paths = list(spec.get('paths', {}).keys())
schemas = list(spec.get('components', {}).get('schemas', {}).keys())
print(f'Paths: {len(paths)}')
print(f'Schemas: {len(schemas)}')
print(f'New v2 paths: {len([p for p in paths if p.startswith(\"/v2/\")])}')
print('OK')
"
```

Expected output:
```
Paths: ~77  (47 existing + ~30 new)
Schemas: ~93 (58 existing + ~35 new)
New v2 paths: ~26
OK
```

**Step 2: Check for $ref errors**

```bash
cd Lucid-L2 && python3 -c "
import yaml, re
with open('openapi.yaml') as f:
    content = f.read()
    spec = yaml.safe_load(content)
refs = re.findall(r\"\\$ref: '#/components/schemas/(\w+)'\", content)
schemas = set(spec.get('components', {}).get('schemas', {}).keys())
missing = set(refs) - schemas
if missing:
    print(f'MISSING SCHEMAS: {missing}')
else:
    print('All schema refs valid')
"
```

Expected: `All schema refs valid`

**Step 3: Install Speakeasy CLI (if not installed)**

```bash
which speakeasy || npm install -g @speakeasy-api/speakeasy
```

**Step 4: Run Speakeasy validate**

```bash
cd Lucid-L2/sdk/raijin-labs-lucid-ai-typescript && speakeasy validate -s ../../openapi.yaml
```

Expected: validation passes (or only warnings, no errors). Fix any errors before proceeding.

**Step 5: Commit any fixes**

```bash
git add openapi.yaml
git commit -m "fix(openapi): resolve validation issues"
```

---

## Task 7: Update Speakeasy config (rename to @lucid/sdk)

**Files:**
- Modify: `sdk/raijin-labs-lucid-ai-typescript/.speakeasy/gen.yaml`

**Step 1: Update gen.yaml**

Make these changes in `gen.yaml`:

Line 6 — change SDK class name:
```yaml
  sdkClassName: LucidSDK
```
(was: `RaijinLabsLucidAi`)

Line 45 — change base error name:
```yaml
  baseErrorName: LucidError
```
(was: `RaijinLabsLucidAiError`)

Line 48 — change default error name:
```yaml
  defaultErrorName: LucidDefaultError
```
(was: `RaijinLabsLucidAiDefaultError`)

Line 53 — change env var prefix:
```yaml
  envVarPrefix: LUCID
```
(was: `RAIJINLABSLUCIDAI`)

Line 81 — change package name:
```yaml
  packageName: '@lucid/sdk'
```
(was: `raijin-labs-lucid-ai`)

**Step 2: Commit**

```bash
git add sdk/raijin-labs-lucid-ai-typescript/.speakeasy/gen.yaml
git commit -m "chore(sdk): rename to @lucid/sdk with LucidSDK class name"
```

---

## Task 8: Add overlay entries for new endpoints

**Files:**
- Modify: `sdk/raijin-labs-lucid-ai-typescript/.speakeasy/speakeasy-modifications-overlay.yaml`

**Step 1: Add method name overrides for all new endpoints**

Append to the `actions:` array in the overlay file:

```yaml
  # v2 Escrow
  - target: $["paths"]["/v2/escrow/create"]["post"]
    update:
      x-speakeasy-name-override: create
    x-speakeasy-metadata:
      after: sdk.escrow.create()
      before: sdk.Escrow.lucid_create_escrow()
      type: method-name
  - target: $["paths"]["/v2/escrow/release"]["post"]
    update:
      x-speakeasy-name-override: release
    x-speakeasy-metadata:
      after: sdk.escrow.release()
      before: sdk.Escrow.lucid_release_escrow()
      type: method-name
  - target: $["paths"]["/v2/escrow/dispute"]["post"]
    update:
      x-speakeasy-name-override: dispute
    x-speakeasy-metadata:
      after: sdk.escrow.dispute()
      before: sdk.Escrow.lucid_dispute_escrow()
      type: method-name
  - target: $["paths"]["/v2/escrow/{chainId}/{escrowId}"]["get"]
    update:
      x-speakeasy-name-override: get
    x-speakeasy-metadata:
      after: sdk.escrow.get()
      before: sdk.Escrow.lucid_get_escrow()
      type: method-name

  # v2 Disputes
  - target: $["paths"]["/v2/disputes/open"]["post"]
    update:
      x-speakeasy-name-override: open
    x-speakeasy-metadata:
      after: sdk.disputes.open()
      before: sdk.Disputes.lucid_open_dispute()
      type: method-name
  - target: $["paths"]["/v2/disputes/{disputeId}/evidence"]["post"]
    update:
      x-speakeasy-name-override: submitEvidence
    x-speakeasy-metadata:
      after: sdk.disputes.submitEvidence()
      before: sdk.Disputes.lucid_submit_evidence()
      type: method-name
  - target: $["paths"]["/v2/disputes/{disputeId}/resolve"]["post"]
    update:
      x-speakeasy-name-override: resolve
    x-speakeasy-metadata:
      after: sdk.disputes.resolve()
      before: sdk.Disputes.lucid_resolve_dispute()
      type: method-name
  - target: $["paths"]["/v2/disputes/{disputeId}/appeal"]["post"]
    update:
      x-speakeasy-name-override: appeal
    x-speakeasy-metadata:
      after: sdk.disputes.appeal()
      before: sdk.Disputes.lucid_appeal_dispute()
      type: method-name
  - target: $["paths"]["/v2/disputes/{chainId}/{disputeId}"]["get"]
    update:
      x-speakeasy-name-override: get
    x-speakeasy-metadata:
      after: sdk.disputes.get()
      before: sdk.Disputes.lucid_get_dispute()
      type: method-name

  # v2 Paymaster
  - target: $["paths"]["/v2/paymaster/sponsor"]["post"]
    update:
      x-speakeasy-name-override: sponsor
    x-speakeasy-metadata:
      after: sdk.paymaster.sponsor()
      before: sdk.Paymaster.lucid_sponsor_user_op()
      type: method-name
  - target: $["paths"]["/v2/paymaster/rate/{chainId}"]["get"]
    update:
      x-speakeasy-name-override: getRate
    x-speakeasy-metadata:
      after: sdk.paymaster.getRate()
      before: sdk.Paymaster.lucid_get_paymaster_rate()
      type: method-name
  - target: $["paths"]["/v2/paymaster/estimate"]["post"]
    update:
      x-speakeasy-name-override: estimate
    x-speakeasy-metadata:
      after: sdk.paymaster.estimate()
      before: sdk.Paymaster.lucid_estimate_gas_lucid()
      type: method-name

  # v2 Identity
  - target: $["paths"]["/v2/identity/link"]["post"]
    update:
      x-speakeasy-name-override: link
    x-speakeasy-metadata:
      after: sdk.identity.link()
      before: sdk.Identity.lucid_link_identity()
      type: method-name
  - target: $["paths"]["/v2/identity/resolve"]["post"]
    update:
      x-speakeasy-name-override: resolve
    x-speakeasy-metadata:
      after: sdk.identity.resolve()
      before: sdk.Identity.lucid_resolve_identity()
      type: method-name
  - target: $["paths"]["/v2/identity/resolve"]["get"]
    update:
      x-speakeasy-name-override: get
    x-speakeasy-metadata:
      after: sdk.identity.get()
      before: sdk.Identity.lucid_get_identity()
      type: method-name
  - target: $["paths"]["/v2/identity/chains"]["get"]
    update:
      x-speakeasy-name-override: getChains
    x-speakeasy-metadata:
      after: sdk.identity.getChains()
      before: sdk.Identity.lucid_get_identity_chains()
      type: method-name
  - target: $["paths"]["/v2/identity/unlink"]["post"]
    update:
      x-speakeasy-name-override: unlink
    x-speakeasy-metadata:
      after: sdk.identity.unlink()
      before: sdk.Identity.lucid_unlink_identity()
      type: method-name

  # v2 TBA
  - target: $["paths"]["/v2/tba/create"]["post"]
    update:
      x-speakeasy-name-override: create
    x-speakeasy-metadata:
      after: sdk.tba.create()
      before: sdk.Tba.lucid_create_tba()
      type: method-name
  - target: $["paths"]["/v2/tba/{chainId}/{tokenId}"]["get"]
    update:
      x-speakeasy-name-override: get
    x-speakeasy-metadata:
      after: sdk.tba.get()
      before: sdk.Tba.lucid_get_tba()
      type: method-name

  # v2 Modules
  - target: $["paths"]["/v2/modules/install"]["post"]
    update:
      x-speakeasy-name-override: install
    x-speakeasy-metadata:
      after: sdk.modules.install()
      before: sdk.Modules.lucid_install_module()
      type: method-name
  - target: $["paths"]["/v2/modules/uninstall"]["post"]
    update:
      x-speakeasy-name-override: uninstall
    x-speakeasy-metadata:
      after: sdk.modules.uninstall()
      before: sdk.Modules.lucid_uninstall_module()
      type: method-name
  - target: $["paths"]["/v2/modules/policy/configure"]["post"]
    update:
      x-speakeasy-name-override: configurePolicy
    x-speakeasy-metadata:
      after: sdk.modules.configurePolicy()
      before: sdk.Modules.lucid_configure_policy_module()
      type: method-name
  - target: $["paths"]["/v2/modules/payout/configure"]["post"]
    update:
      x-speakeasy-name-override: configurePayout
    x-speakeasy-metadata:
      after: sdk.modules.configurePayout()
      before: sdk.Modules.lucid_configure_payout_module()
      type: method-name
  - target: $["paths"]["/v2/modules/{chainId}/{account}"]["get"]
    update:
      x-speakeasy-name-override: list
    x-speakeasy-metadata:
      after: sdk.modules.list()
      before: sdk.Modules.lucid_list_modules()
      type: method-name

  # v2 zkML
  - target: $["paths"]["/v2/zkml/prove"]["post"]
    update:
      x-speakeasy-name-override: prove
    x-speakeasy-metadata:
      after: sdk.zkml.prove()
      before: sdk.Zkml.lucid_generate_zkml_proof()
      type: method-name
  - target: $["paths"]["/v2/zkml/verify"]["post"]
    update:
      x-speakeasy-name-override: verify
    x-speakeasy-metadata:
      after: sdk.zkml.verify()
      before: sdk.Zkml.lucid_verify_zkml_proof()
      type: method-name
  - target: $["paths"]["/v2/zkml/register-model"]["post"]
    update:
      x-speakeasy-name-override: registerModel
    x-speakeasy-metadata:
      after: sdk.zkml.registerModel()
      before: sdk.Zkml.lucid_register_zkml_model()
      type: method-name
  - target: $["paths"]["/v2/zkml/models/{chainId}"]["get"]
    update:
      x-speakeasy-name-override: listModels
    x-speakeasy-metadata:
      after: sdk.zkml.listModels()
      before: sdk.Zkml.lucid_list_zkml_models()
      type: method-name

  # Passport PATCH sub-routes
  - target: $["paths"]["/v1/passports/{passport_id}/pricing"]["patch"]
    update:
      x-speakeasy-name-override: updatePricing
    x-speakeasy-metadata:
      after: sdk.passports.updatePricing()
      before: sdk.Passports.lucid_update_passport_pricing()
      type: method-name
  - target: $["paths"]["/v1/passports/{passport_id}/endpoints"]["patch"]
    update:
      x-speakeasy-name-override: updateEndpoints
    x-speakeasy-metadata:
      after: sdk.passports.updateEndpoints()
      before: sdk.Passports.lucid_update_passport_endpoints()
      type: method-name
```

**Step 2: Validate overlay YAML**

```bash
cd Lucid-L2/sdk/raijin-labs-lucid-ai-typescript && python3 -c "import yaml; yaml.safe_load(open('.speakeasy/speakeasy-modifications-overlay.yaml')); print('OK')"
```

**Step 3: Commit**

```bash
git add sdk/raijin-labs-lucid-ai-typescript/.speakeasy/speakeasy-modifications-overlay.yaml
git commit -m "chore(sdk): add overlay entries for v2 endpoints"
```

---

## Task 9: Regenerate SDK and verify build

**Files:**
- Regenerated: `sdk/raijin-labs-lucid-ai-typescript/src/` (entire generated codebase)
- Preserved: `sdk/raijin-labs-lucid-ai-typescript/src/ai.ts` (custom)
- Preserved: `sdk/raijin-labs-lucid-ai-typescript/src/hooks/registration.ts` (custom)

**Step 1: Back up custom files**

```bash
cd Lucid-L2/sdk/raijin-labs-lucid-ai-typescript
cp src/ai.ts src/ai.ts.bak
cp src/hooks/registration.ts src/hooks/registration.ts.bak
```

**Step 2: Run Speakeasy generation**

```bash
cd Lucid-L2/sdk/raijin-labs-lucid-ai-typescript && speakeasy run
```

Expected: Generation completes successfully. New resource classes appear for escrow, disputes, paymaster, identity, tba, modules, zkml.

**Step 3: Verify custom files preserved**

```bash
diff src/ai.ts src/ai.ts.bak && echo "ai.ts preserved OK"
diff src/hooks/registration.ts src/hooks/registration.ts.bak && echo "registration.ts preserved OK"
rm src/ai.ts.bak src/hooks/registration.ts.bak
```

**Step 4: Verify new resource classes exist**

```bash
ls src/sdk/escrow.ts src/sdk/disputes.ts src/sdk/paymaster.ts src/sdk/identity.ts src/sdk/tba.ts src/sdk/modules.ts src/sdk/zkml.ts
```

Expected: All 7 files exist.

**Step 5: Verify SDK class name**

```bash
grep "class LucidSDK" src/sdk/sdk.ts
```

Expected: `export class LucidSDK extends ClientSDK {`

**Step 6: Install dependencies and build**

```bash
cd Lucid-L2/sdk/raijin-labs-lucid-ai-typescript && npm install && npm run build
```

Expected: Build succeeds with no errors.

**Step 7: Verify package name in build output**

```bash
grep '"name"' package.json
```

Expected: `"name": "@lucid/sdk"`

**Step 8: Commit**

```bash
cd Lucid-L2
git add sdk/raijin-labs-lucid-ai-typescript/
git commit -m "feat(sdk): regenerate as @lucid/sdk with v2 endpoints"
```

---

## Task 10: Add default chain hook + typed factory

**Files:**
- Modify: `sdk/raijin-labs-lucid-ai-typescript/src/hooks/registration.ts`
- Create: `sdk/raijin-labs-lucid-ai-typescript/src/lucid.ts`

**Step 1: Implement default chain hook in registration.ts**

Replace the contents of `src/hooks/registration.ts` with:

```typescript
import { Hooks, SDKInitHook, BeforeRequestHook, BeforeRequestContext } from "./types.js";
import { SDKOptions } from "../lib/config.js";

/**
 * Injects a default `chainId` into JSON request bodies for v2 endpoints.
 * The chain value is read from the SDK options at init time.
 */
class DefaultChainHook implements SDKInitHook, BeforeRequestHook {
  private chain: string | undefined;

  sdkInit(opts: SDKOptions): SDKOptions {
    // Read chain from extra options (passed via createLucidSDK)
    this.chain = (opts as Record<string, unknown>)["chain"] as string | undefined;
    return opts;
  }

  async beforeRequest(
    _hookCtx: BeforeRequestContext,
    request: Request,
  ): Promise<Request> {
    if (!this.chain) return request;

    // Only inject for POST/PATCH with JSON body on v2 endpoints
    const method = request.method.toUpperCase();
    if ((method !== "POST" && method !== "PATCH") || !request.url.includes("/v2/")) {
      return request;
    }

    try {
      const body = await request.clone().text();
      if (!body) return request;
      const json = JSON.parse(body);

      // Don't override if chainId already set
      if (!json.chainId) {
        json.chainId = this.chain;
        return new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(json),
          signal: request.signal,
        });
      }
    } catch {
      // Not JSON or parse error — pass through
    }

    return request;
  }
}

export function initHooks(hooks: Hooks) {
  const chainHook = new DefaultChainHook();
  hooks.registerSDKInitHook(chainHook);
  hooks.registerBeforeRequestHook(chainHook);
}
```

**Step 2: Wire initHooks into SDKHooks constructor**

Check if `initHooks` is already called in the generated `src/hooks/hooks.ts`. If NOT (the `presetHooks` array is empty), add the import and call:

In `src/hooks/hooks.ts`, after the existing imports add:
```typescript
import { initHooks } from "./registration.js";
```

And in the constructor, after `const presetHooks: Array<Hook> = [];`, add:
```typescript
    initHooks(this);
```

**Important:** This file IS regenerated by Speakeasy. The change will be overwritten on next `speakeasy run`. Document this: after each regeneration, re-add the two lines above. Alternatively, check if Speakeasy has a config option to auto-import registration hooks (check Speakeasy docs for `sdkHooksAutoInit` or similar).

**Step 3: Create typed factory in src/lucid.ts**

Create `sdk/raijin-labs-lucid-ai-typescript/src/lucid.ts`:

```typescript
/**
 * Typed factory for LucidSDK with default chain support.
 *
 * This file is NOT generated by Speakeasy — it is safe to edit.
 *
 * @example
 * ```typescript
 * import { createLucidSDK } from '@lucid/sdk/lucid';
 *
 * const sdk = createLucidSDK({
 *   apiKey: 'lk_live_...',
 *   chain: 'base',
 * });
 *
 * // Chain auto-injected into v2 calls
 * await sdk.escrow.create({ beneficiary: '0x...', token: '0x...', amount: '100', duration: 3600 });
 *
 * // Override per call
 * await sdk.escrow.create({ chainId: 'ethereum-sepolia', beneficiary: '0x...', token: '0x...', amount: '100', duration: 3600 });
 * ```
 */

import { LucidSDK } from "./sdk/sdk.js";
import type { SDKOptions } from "./lib/config.js";

export interface LucidSDKOptions {
  /** Lucid API key (lk_live_... or lk_test_...). Falls back to LUCID_API_KEY env var. */
  apiKey?: string;
  /** Default chain for v2 endpoints. Can be overridden per call. */
  chain?: string;
  /** Override the server URL. */
  serverURL?: string;
  /** Timeout in milliseconds. */
  timeoutMs?: number;
}

/**
 * Create a LucidSDK instance with typed options.
 */
export function createLucidSDK(options: LucidSDKOptions = {}): LucidSDK {
  const sdkOptions: SDKOptions & Record<string, unknown> = {
    serverURL: options.serverURL,
    timeoutMs: options.timeoutMs,
    chain: options.chain,
  };

  // API key: set as bearer auth if security is hoisted, otherwise via header
  if (options.apiKey) {
    (sdkOptions as Record<string, unknown>)["bearer"] = options.apiKey;
  }

  return new LucidSDK(sdkOptions);
}

export { LucidSDK };
```

**Step 4: Add export to tshy config in package.json**

In `sdk/raijin-labs-lucid-ai-typescript/package.json`, add to the `tshy.exports` object:

```json
"./lucid": "./src/lucid.ts"
```

**Step 5: Build and verify**

```bash
cd Lucid-L2/sdk/raijin-labs-lucid-ai-typescript && npm run build
```

Expected: Build succeeds.

**Step 6: Commit**

```bash
git add sdk/raijin-labs-lucid-ai-typescript/src/hooks/registration.ts
git add sdk/raijin-labs-lucid-ai-typescript/src/hooks/hooks.ts
git add sdk/raijin-labs-lucid-ai-typescript/src/lucid.ts
git add sdk/raijin-labs-lucid-ai-typescript/package.json
git commit -m "feat(sdk): add default chain hook + createLucidSDK factory"
```

---

## Task 11: Create @lucid/react package

**Files:**
- Create: `sdk/lucid-react/package.json`
- Create: `sdk/lucid-react/tsconfig.json`
- Create: `sdk/lucid-react/src/index.ts`
- Create: `sdk/lucid-react/src/context.tsx`
- Create: `sdk/lucid-react/src/hooks/useChat.ts`
- Create: `sdk/lucid-react/src/hooks/usePassport.ts`
- Create: `sdk/lucid-react/src/hooks/useEscrow.ts`

**Step 1: Create package.json**

Create `sdk/lucid-react/package.json`:

```json
{
  "name": "@lucid/react",
  "version": "0.1.0",
  "description": "React hooks for the Lucid SDK",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "peerDependencies": {
    "@lucid/sdk": "*",
    "react": ">=18"
  },
  "devDependencies": {
    "@lucid/sdk": "file:../raijin-labs-lucid-ai-typescript",
    "@types/react": "^19.0.0",
    "react": "^19.0.0",
    "typescript": "~5.8.3"
  },
  "files": ["dist"],
  "license": "MIT"
}
```

**Step 2: Create tsconfig.json**

Create `sdk/lucid-react/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022", "DOM"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create context.tsx**

Create `sdk/lucid-react/src/context.tsx`:

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { LucidSDK } from '@lucid/sdk/sdk/sdk';

interface LucidContextValue {
  sdk: LucidSDK;
  chain?: string;
}

const LucidContext = createContext<LucidContextValue | null>(null);

export interface LucidProviderProps {
  /** Lucid API key */
  apiKey: string;
  /** Default chain for v2 endpoints */
  chain?: string;
  /** Override server URL */
  serverURL?: string;
  children: ReactNode;
}

export function LucidProvider({ apiKey, chain, serverURL, children }: LucidProviderProps) {
  const value = useMemo<LucidContextValue>(() => {
    const sdk = new LucidSDK({
      serverURL,
    } as Record<string, unknown>);
    return { sdk, chain };
  }, [apiKey, chain, serverURL]);

  return <LucidContext.Provider value={value}>{children}</LucidContext.Provider>;
}

export function useLucid() {
  const ctx = useContext(LucidContext);
  if (!ctx) {
    throw new Error('useLucid must be used within a <LucidProvider>');
  }
  return ctx;
}
```

**Step 4: Create useChat hook**

Create `sdk/lucid-react/src/hooks/useChat.ts`:

```typescript
import { useState, useCallback } from 'react';
import { useLucid } from '../context.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface UseChatOptions {
  model?: string;
  initialMessages?: ChatMessage[];
}

export function useChat(options: UseChatOptions = {}) {
  const { sdk } = useLucid();
  const [messages, setMessages] = useState<ChatMessage[]>(options.initialMessages ?? []);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!input.trim() || isStreaming) return;

      const userMessage: ChatMessage = { role: 'user', content: input };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput('');
      setIsStreaming(true);
      setError(null);

      try {
        const result = await sdk.run.chatCompletions({
          model: options.model ?? 'deepseek-v3',
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        if (result.ok) {
          const choice = result.value.choices?.[0];
          if (choice?.message) {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: choice.message.content ?? '' },
            ]);
          }
        } else {
          setError(new Error('Chat completion failed'));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsStreaming(false);
      }
    },
    [input, messages, isStreaming, sdk, options.model],
  );

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isStreaming,
    error,
    setMessages,
    setInput,
  };
}
```

**Step 5: Create usePassport hook**

Create `sdk/lucid-react/src/hooks/usePassport.ts`:

```typescript
import { useState, useEffect } from 'react';
import { useLucid } from '../context.js';

export interface UsePassportOptions {
  enabled?: boolean;
}

export function usePassport(passportId: string | undefined, options: UsePassportOptions = {}) {
  const { sdk } = useLucid();
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!passportId || !enabled) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    sdk.passports
      .get({ passportId })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setData(result.value);
        } else {
          setError(new Error('Failed to fetch passport'));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sdk, passportId, enabled]);

  return { data, error, isLoading };
}
```

**Step 6: Create useEscrow hook**

Create `sdk/lucid-react/src/hooks/useEscrow.ts`:

```typescript
import { useState, useEffect, useRef } from 'react';
import { useLucid } from '../context.js';

export interface UseEscrowOptions {
  refetchInterval?: number;
  enabled?: boolean;
}

export function useEscrow(
  escrowId: string | undefined,
  options: UseEscrowOptions = {},
) {
  const { sdk, chain } = useLucid();
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const enabled = options.enabled ?? true;
  const chainId = chain ?? 'base';

  useEffect(() => {
    if (!escrowId || !enabled) return;

    const fetchEscrow = async () => {
      try {
        const result = await sdk.escrow.get({ chainId, escrowId });
        if (result.ok) {
          setData(result.value);
          setError(null);
        } else {
          setError(new Error('Failed to fetch escrow'));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    setIsLoading(true);
    fetchEscrow().finally(() => setIsLoading(false));

    if (options.refetchInterval) {
      intervalRef.current = setInterval(fetchEscrow, options.refetchInterval);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sdk, escrowId, chainId, enabled, options.refetchInterval]);

  return { data, error, isLoading };
}
```

**Step 7: Create index.ts**

Create `sdk/lucid-react/src/index.ts`:

```typescript
export { LucidProvider, useLucid } from './context.js';
export type { LucidProviderProps } from './context.js';

export { useChat } from './hooks/useChat.js';
export type { ChatMessage, UseChatOptions } from './hooks/useChat.js';

export { usePassport } from './hooks/usePassport.js';
export type { UsePassportOptions } from './hooks/usePassport.js';

export { useEscrow } from './hooks/useEscrow.js';
export type { UseEscrowOptions } from './hooks/useEscrow.js';
```

**Step 8: Install deps and build**

```bash
cd Lucid-L2/sdk/lucid-react && npm install && npm run build
```

Expected: Build succeeds.

**Step 9: Commit**

```bash
cd Lucid-L2
git add sdk/lucid-react/
git commit -m "feat: add @lucid/react package (LucidProvider, useChat, usePassport, useEscrow)"
```

---

## Task 12: Create @lucid/ai package

**Files:**
- Create: `sdk/lucid-ai/package.json`
- Create: `sdk/lucid-ai/tsconfig.json`
- Create: `sdk/lucid-ai/src/index.ts`

**Step 1: Create package.json**

Create `sdk/lucid-ai/package.json`:

```json
{
  "name": "@lucid/ai",
  "version": "0.1.0",
  "description": "Vercel AI SDK provider for Lucid",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "peerDependencies": {
    "@lucid/sdk": "*",
    "ai": ">=4"
  },
  "devDependencies": {
    "@lucid/sdk": "file:../raijin-labs-lucid-ai-typescript",
    "ai": "^6.0.100",
    "typescript": "~5.8.3"
  },
  "files": ["dist"],
  "license": "MIT"
}
```

**Step 2: Create tsconfig.json**

Create `sdk/lucid-ai/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create index.ts**

Create `sdk/lucid-ai/src/index.ts`:

```typescript
/**
 * Vercel AI SDK provider for Lucid.
 *
 * Re-exports from @lucid/sdk/ai for convenience.
 *
 * @example
 * ```typescript
 * import { createLucidProvider } from '@lucid/ai';
 * import { streamText } from 'ai';
 *
 * const lucid = createLucidProvider({ apiKey: 'lk_live_...' });
 *
 * const result = streamText({
 *   model: lucid('deepseek-v3'),
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 * ```
 */

export { createLucidProvider, lucid } from '@lucid/sdk/ai';
export type { LucidProviderSettings } from '@lucid/sdk/ai';
```

**Step 4: Build**

```bash
cd Lucid-L2/sdk/lucid-ai && npm install && npm run build
```

Expected: Build succeeds.

**Step 5: Commit**

```bash
cd Lucid-L2
git add sdk/lucid-ai/
git commit -m "feat: add @lucid/ai package (Vercel AI SDK provider re-export)"
```

---

## Task 13: Final verification

**Step 1: Verify SDK build**

```bash
cd Lucid-L2/sdk/raijin-labs-lucid-ai-typescript && npm run build
```

Expected: Clean build.

**Step 2: Verify @lucid/react build**

```bash
cd Lucid-L2/sdk/lucid-react && npm run build
```

Expected: Clean build.

**Step 3: Verify @lucid/ai build**

```bash
cd Lucid-L2/sdk/lucid-ai && npm run build
```

Expected: Clean build.

**Step 4: Verify existing offchain tests still pass**

```bash
cd Lucid-L2/offchain && npm test
```

Expected: All tests pass (467+).

**Step 5: Spot-check SDK exports**

```bash
cd Lucid-L2/sdk/raijin-labs-lucid-ai-typescript && node -e "
const sdk = require('./dist/commonjs/index.js');
console.log('LucidSDK:', typeof sdk.LucidSDK);
console.log('Has escrow:', typeof sdk.LucidSDK.prototype !== 'undefined');
"
```

Expected:
```
LucidSDK: function
Has escrow: true
```

**Step 6: Spot-check new resource classes**

```bash
cd Lucid-L2/sdk/raijin-labs-lucid-ai-typescript && node -e "
const { LucidSDK } = require('./dist/commonjs/index.js');
const sdk = new LucidSDK();
const resources = ['escrow','disputes','paymaster','identity','tba','modules','zkml','passports','receipts','run'];
for (const r of resources) {
  console.log(r + ':', typeof sdk[r] !== 'undefined' ? 'OK' : 'MISSING');
}
"
```

Expected: All OK.

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Security scheme + tags | openapi.yaml |
| 2 | v2 schemas (~35) | openapi.yaml |
| 3 | Escrow + Dispute paths (9) | openapi.yaml |
| 4 | Paymaster + Identity + TBA paths (10) | openapi.yaml |
| 5 | Modules + zkML + Passport PATCH (11) | openapi.yaml |
| 6 | Validate openapi.yaml | - (validation only) |
| 7 | Speakeasy config rename | gen.yaml |
| 8 | Overlay for new endpoints | overlay.yaml |
| 9 | Regenerate SDK | sdk/* (all generated) |
| 10 | Default chain hook + factory | registration.ts, lucid.ts, hooks.ts, package.json |
| 11 | @lucid/react package | 7 new files |
| 12 | @lucid/ai package | 3 new files |
| 13 | Final verification | - (tests only) |

## SDK Method Reference (Post-Generation)

```typescript
import { createLucidSDK } from '@lucid/sdk/lucid';

const sdk = createLucidSDK({ apiKey: 'lk_live_...', chain: 'base' });

// v1 — existing
sdk.passports.create({ ... })
sdk.passports.list()
sdk.passports.get({ passportId: '...' })
sdk.passports.update({ passportId: '...', ... })
sdk.passports.updatePricing({ passportId: '...', ... })     // NEW
sdk.passports.updateEndpoints({ passportId: '...', ... })   // NEW
sdk.run.chatCompletions({ model: '...', messages: [...] })
sdk.receipts.create({ ... })
sdk.receipts.verify({ receiptId: '...' })
sdk.receipts.getProof({ receiptId: '...' })

// v2 — new
sdk.escrow.create({ beneficiary: '0x...', token: '0x...', amount: '100', duration: 3600 })
sdk.escrow.release({ escrowId: '...', receiptHash: '...', signature: '...', signerPubkey: '...' })
sdk.escrow.dispute({ escrowId: '...', reason: '...' })
sdk.escrow.get({ chainId: 'base', escrowId: '...' })

sdk.disputes.open({ escrowId: '...', reason: '...' })
sdk.disputes.submitEvidence({ disputeId: '...', receiptHash: '...', mmrRoot: '...', mmrProof: '...' })
sdk.disputes.resolve({ disputeId: '...' })
sdk.disputes.appeal({ disputeId: '...' })
sdk.disputes.get({ chainId: 'base', disputeId: '...' })

sdk.paymaster.sponsor({ userOp: { ... } })
sdk.paymaster.getRate({ chainId: 'base' })
sdk.paymaster.estimate({ userOp: { ... } })

sdk.identity.link({ primaryCaip10: '...', linkedCaip10: '...' })
sdk.identity.resolve({ caip10: '...' })
sdk.identity.getChains({ caip10: '...' })
sdk.identity.unlink({ primaryCaip10: '...', linkedCaip10: '...' })

sdk.tba.create({ tokenContract: '0x...', tokenId: '1' })
sdk.tba.get({ chainId: 'base', tokenId: '1', tokenContract: '0x...' })

sdk.modules.install({ account: '0x...', moduleType: 'executor', moduleAddress: '0x...' })
sdk.modules.uninstall({ account: '0x...', moduleType: 'executor', moduleAddress: '0x...' })
sdk.modules.configurePolicy({ account: '0x...', policyHashes: ['0x...'] })
sdk.modules.configurePayout({ account: '0x...', recipients: ['0x...'], basisPoints: [10000] })
sdk.modules.list({ chainId: 'base', account: '0x...' })

sdk.zkml.prove({ modelId: '...', inputHash: '...', outputHash: '...', policyHash: '...' })
sdk.zkml.verify({ proof: { ... }, receiptHash: '...' })
sdk.zkml.registerModel({ modelHash: '...', verifyingKey: '...' })
sdk.zkml.listModels({ chainId: 'base' })
```

## Known Limitations

1. **hooks.ts regeneration**: The `initHooks()` wiring in `src/hooks/hooks.ts` is overwritten by `speakeasy run`. After each regeneration, re-add the import and call. Consider filing a Speakeasy feature request for auto-init hook support.

2. **Bearer auth**: If the `security` section in openapi.yaml causes unexpected auth behavior (e.g., Speakeasy requiring auth on all endpoints), adjust to use `security: []` (empty, no global auth) and add auth per-endpoint instead.

3. **Streaming in useChat**: The initial `useChat` hook uses non-streaming chat completions. SSE streaming support depends on the regenerated SDK's stream API surface and should be added as a follow-up.

4. **@lucid/react types**: The `data` types in hooks are `unknown`. After regeneration, update to use the actual generated response types (e.g., `GetPassportResponse`, `GetEscrowResponse`).
