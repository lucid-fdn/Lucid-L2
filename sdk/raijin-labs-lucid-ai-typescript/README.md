# raijin-labs-lucid-ai

Developer-friendly & type-safe Typescript SDK specifically catered to leverage *raijin-labs-lucid-ai* API.

[![Built by Speakeasy](https://img.shields.io/badge/Built_by-SPEAKEASY-374151?style=for-the-badge&labelColor=f3f4f6)](https://www.speakeasy.com/?utm_source=raijin-labs-lucid-ai&utm_campaign=typescript)
[![License: MIT](https://img.shields.io/badge/LICENSE_//_MIT-3b5bdb?style=for-the-badge&labelColor=eff6ff)](https://opensource.org/licenses/MIT)


<br /><br />
> [!IMPORTANT]
> This SDK is not yet ready for production use. To complete setup please follow the steps outlined in your [workspace](https://app.speakeasy.com/org/raijin-labs-gc4/lucid). Delete this section before > publishing to a package manager.

<!-- Start Summary [summary] -->
## Summary

LucidLayer API: LucidLayer Offchain API.

This OpenAPI spec is the source of truth for the actual backend routes.
It is used to generate SDK clients via Speakeasy.

Route groups:
- `/v1/*` — Passports, Match, Run, Receipts, Epochs, Payouts, Compute
- `/health/*` — System health and dependency checks
- `/api/agents/*` — AI Agent MMR, Planner, and Orchestrator
<!-- End Summary [summary] -->

<!-- Start Table of Contents [toc] -->
## Table of Contents
<!-- $toc-max-depth=2 -->
* [raijin-labs-lucid-ai](#raijin-labs-lucid-ai)
  * [SDK Installation](#sdk-installation)
  * [Vercel AI SDK Provider](#vercel-ai-sdk-provider)
  * [Requirements](#requirements)
  * [SDK Example Usage](#sdk-example-usage)
  * [Authentication](#authentication)
  * [Available Resources and Operations](#available-resources-and-operations)
  * [Standalone functions](#standalone-functions)
  * [Retries](#retries)
  * [Error Handling](#error-handling)
  * [Server Selection](#server-selection)
  * [Custom HTTP Client](#custom-http-client)
  * [Debugging](#debugging)
* [Development](#development)
  * [Maturity](#maturity)
  * [Contributions](#contributions)

<!-- End Table of Contents [toc] -->

<!-- Start SDK Installation [installation] -->
## SDK Installation

> [!TIP]
> To finish publishing your SDK to npm and others you must [run your first generation action](https://www.speakeasy.com/docs/github-setup#step-by-step-guide).


The SDK can be installed with either [npm](https://www.npmjs.com/), [pnpm](https://pnpm.io/), [bun](https://bun.sh/) or [yarn](https://classic.yarnpkg.com/en/) package managers.

### NPM

```bash
npm add <UNSET>
```

### PNPM

```bash
pnpm add <UNSET>
```

### Bun

```bash
bun add <UNSET>
```

### Yarn

```bash
yarn add <UNSET>
```

> [!NOTE]
> This package is published with CommonJS and ES Modules (ESM) support.
<!-- End SDK Installation [installation] -->

## Vercel AI SDK Provider

The SDK includes a built-in [Vercel AI SDK](https://sdk.vercel.ai/) provider for streaming chat completions and embeddings. Import from `raijin-labs-lucid-ai/ai`:

```typescript
import { createLucidProvider } from 'raijin-labs-lucid-ai/ai'
import { generateText, embed } from 'ai'

const lucid = createLucidProvider({
  apiKey: process.env.LUCID_API_KEY,
  baseURL: 'https://api.lucid.foundation', // optional, this is the default
})

// Chat / streaming inference
const { text } = await generateText({
  model: lucid.chatModel('gpt-4o'),
  prompt: 'Hello!',
})

// Embeddings
const { embedding } = await embed({
  model: lucid.textEmbeddingModel('text-embedding-3-small'),
  value: 'How to deploy Next.js',
})
```

### Filtering by model availability

Tri-state filter — `'true'` for available, `'false'` for unavailable, omit for all:

```typescript
import { RaijinLabsLucidAi } from 'raijin-labs-lucid-ai'

const sdk = new RaijinLabsLucidAi({
  serverURL: 'https://api.lucid.foundation',
})

// Only models that can serve inference right now
const { models } = await sdk.passports.searchModels({ available: 'true' })

// Only models missing compute (useful for debugging)
const { models: offline } = await sdk.passports.searchModels({ available: 'false' })

// All models regardless of availability
const { models: all } = await sdk.passports.searchModels({})
```

- `format=api` models (GPT-4o, Claude, etc.) are always available — routed through TrustGate
- `format=safetensors`/`gguf` models require a healthy compute node with compatible runtime and hardware
- Compute nodes register via `POST /v1/compute/nodes/heartbeat` with a 30s TTL

<!-- Start Requirements [requirements] -->
## Requirements

For supported JavaScript runtimes, please consult [RUNTIMES.md](RUNTIMES.md).
<!-- End Requirements [requirements] -->

<!-- Start SDK Example Usage [usage] -->
## SDK Example Usage

### Example

```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.passports.create({
    type: "dataset",
    owner: "<value>",
    metadata: {
      "key": "<value>",
      "key1": "<value>",
      "key2": "<value>",
    },
  });

  console.log(result);
}

run();

```
<!-- End SDK Example Usage [usage] -->

<!-- Start Authentication [security] -->
## Authentication

### Per-Client Security Schemes

This SDK supports the following security scheme globally:

| Name         | Type | Scheme      | Environment Variable |
| ------------ | ---- | ----------- | -------------------- |
| `bearerAuth` | http | HTTP Bearer | `LUCID_BEARER_AUTH`  |

To authenticate with the API the `bearerAuth` parameter must be set when initializing the SDK client instance. For example:
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK({
  bearerAuth: process.env["LUCID_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await lucidSDK.passports.create({
    type: "dataset",
    owner: "<value>",
    metadata: {
      "key": "<value>",
      "key1": "<value>",
      "key2": "<value>",
    },
  });

  console.log(result);
}

run();

```
<!-- End Authentication [security] -->

<!-- Start Available Resources and Operations [operations] -->
## Available Resources and Operations

<details open>
<summary>Available methods</summary>

### [Agents](docs/sdks/agents/README.md)

* [initAgent](docs/sdks/agents/README.md#initagent) - Initialize an AI agent
* [processAgentEpoch](docs/sdks/agents/README.md#processagentepoch) - Process an epoch for an agent
* [processAgentBatchEpochs](docs/sdks/agents/README.md#processagentbatchepochs) - Process multiple epochs in batch
* [generateAgentProof](docs/sdks/agents/README.md#generateagentproof) - Generate proof of contribution
* [getAgentStats](docs/sdks/agents/README.md#getagentstats) - Get agent statistics
* [getAgentHistory](docs/sdks/agents/README.md#getagenthistory) - Get agent MMR root history
* [getAgentRoot](docs/sdks/agents/README.md#getagentroot) - Get current MMR root for agent
* [verifyAgentMmr](docs/sdks/agents/README.md#verifyagentmmr) - Verify MMR integrity for agent
* [listAgents](docs/sdks/agents/README.md#listagents) - List all registered agents
* [planAgentWorkflow](docs/sdks/agents/README.md#planagentworkflow) - Plan a workflow from a goal
* [accomplishAgentGoal](docs/sdks/agents/README.md#accomplishagentgoal) - Plan and execute a workflow in one call
* [previewAgentWorkflow](docs/sdks/agents/README.md#previewagentworkflow) - Preview a workflow without executing
* [getAgentOrchestratorHistory](docs/sdks/agents/README.md#getagentorchestratorhistory) - Get agent execution history for a tenant
* [checkAgentOrchestratorHealth](docs/sdks/agents/README.md#checkagentorchestratorhealth) - Agent orchestrator health check
* [executeAgentFlowspec](docs/sdks/agents/README.md#executeagentflowspec) - Execute a FlowSpec
* [validateFlowspec](docs/sdks/agents/README.md#validateflowspec) - Validate a FlowSpec structure
* [getPlannerInfo](docs/sdks/agents/README.md#getplannerinfo) - Get planner service info
* [checkExecutorHealth](docs/sdks/agents/README.md#checkexecutorhealth) - Check executor health
* [getExecutorDecision](docs/sdks/agents/README.md#getexecutordecision) - Get executor decision for a FlowSpec

### [Compute](docs/sdks/compute/README.md)

* [searchCompute](docs/sdks/compute/README.md#searchcompute) - Search compute passports
* [heartbeat](docs/sdks/compute/README.md#heartbeat) - Submit compute node heartbeat
* [getNodeHealth](docs/sdks/compute/README.md#getnodehealth) - Get compute node health

### [Disputes](docs/sdks/disputes/README.md)

* [open](docs/sdks/disputes/README.md#open) - Open a dispute on an escrow
* [submitEvidence](docs/sdks/disputes/README.md#submitevidence) - Submit evidence for a dispute
* [resolve](docs/sdks/disputes/README.md#resolve) - Resolve a dispute
* [appeal](docs/sdks/disputes/README.md#appeal) - Appeal a dispute decision
* [get](docs/sdks/disputes/README.md#get) - Get dispute details

### [Epochs](docs/sdks/epochs/README.md)

* [getCurrent](docs/sdks/epochs/README.md#getcurrent) - Get current epoch
* [list](docs/sdks/epochs/README.md#list) - List epochs
* [create](docs/sdks/epochs/README.md#create) - Create epoch
* [get](docs/sdks/epochs/README.md#get) - Get epoch
* [retry](docs/sdks/epochs/README.md#retry) - Retry failed epoch
* [verify](docs/sdks/epochs/README.md#verify) - Verify epoch anchor
* [getTransaction](docs/sdks/epochs/README.md#gettransaction) - Get epoch anchoring transaction
* [commitRoot](docs/sdks/epochs/README.md#commitroot) - Commit epoch root
* [commitRootsBatch](docs/sdks/epochs/README.md#commitrootsbatch) - Commit multiple epoch roots
* [getAnchoringHealth](docs/sdks/epochs/README.md#getanchoringhealth) - Anchoring service health
* [listReady](docs/sdks/epochs/README.md#listready) - Get epochs ready for finalization
* [getStats](docs/sdks/epochs/README.md#getstats) - Epoch statistics

### [Escrow](docs/sdks/escrow/README.md)

* [create](docs/sdks/escrow/README.md#create) - Create a time-locked escrow
* [release](docs/sdks/escrow/README.md#release) - Release escrow with verified receipt
* [dispute](docs/sdks/escrow/README.md#dispute) - Dispute an escrow
* [get](docs/sdks/escrow/README.md#get) - Get escrow details

### [Health](docs/sdks/health/README.md)

* [checkSystemHealth](docs/sdks/health/README.md#checksystemhealth) - Overall system health
* [checkLiveness](docs/sdks/health/README.md#checkliveness) - Liveness probe
* [checkReadiness](docs/sdks/health/README.md#checkreadiness) - Readiness probe
* [checkDatabaseHealth](docs/sdks/health/README.md#checkdatabasehealth) - Database health check
* [checkRedisHealth](docs/sdks/health/README.md#checkredishealth) - Redis health check
* [checkNangoHealth](docs/sdks/health/README.md#checknangohealth) - Nango service health check
* [getDetailedHealth](docs/sdks/health/README.md#getdetailedhealth) - Detailed health with statistics

### [Identity](docs/sdks/identity/README.md)

* [link](docs/sdks/identity/README.md#link) - Link addresses cross-chain
* [resolve](docs/sdks/identity/README.md#resolve) - Resolve cross-chain identity
* [get](docs/sdks/identity/README.md#get) - Resolve identity (GET)
* [getChains](docs/sdks/identity/README.md#getchains) - Get linked chains for identity
* [unlink](docs/sdks/identity/README.md#unlink) - Unlink a cross-chain address

### [Match](docs/sdks/match/README.md)

* [explain](docs/sdks/match/README.md#explain) - Evaluate policy against compute/model meta
* [compute](docs/sdks/match/README.md#compute) - Match compute for model
* [planRoute](docs/sdks/match/README.md#planroute) - Plan a route (match + resolve endpoint)

### [Modules](docs/sdks/modules/README.md)

* [install](docs/sdks/modules/README.md#install) - Install module on smart account
* [uninstall](docs/sdks/modules/README.md#uninstall) - Uninstall module from smart account
* [configurePolicy](docs/sdks/modules/README.md#configurepolicy) - Configure policy module
* [configurePayout](docs/sdks/modules/README.md#configurepayout) - Configure payout module
* [list](docs/sdks/modules/README.md#list) - List installed modules

### [Passports](docs/sdks/passports/README.md)

* [create](docs/sdks/passports/README.md#create) - Create a passport
* [list](docs/sdks/passports/README.md#list) - List passports
* [get](docs/sdks/passports/README.md#get) - Get a passport
* [update](docs/sdks/passports/README.md#update) - Update a passport
* [delete](docs/sdks/passports/README.md#delete) - Delete a passport (soft delete)
* [sync](docs/sdks/passports/README.md#sync) - Trigger on-chain sync for a passport
* [listPendingSync](docs/sdks/passports/README.md#listpendingsync) - Get passports pending sync
* [getStats](docs/sdks/passports/README.md#getstats) - Passport statistics
* [searchModels](docs/sdks/passports/README.md#searchmodels) - Search model passports
* [lucidListTools](docs/sdks/passports/README.md#lucidlisttools) - List tool passports
* [lucidListDatasets](docs/sdks/passports/README.md#lucidlistdatasets) - List dataset passports
* [lucidListAgentPassports](docs/sdks/passports/README.md#lucidlistagentpassports) - List agent passports
* [updatePricing](docs/sdks/passports/README.md#updatepricing) - Update passport pricing
* [updateEndpoints](docs/sdks/passports/README.md#updateendpoints) - Update passport endpoint URLs

### [Paymaster](docs/sdks/paymaster/README.md)

* [sponsor](docs/sdks/paymaster/README.md#sponsor) - Sponsor a UserOp with $LUCID
* [getRate](docs/sdks/paymaster/README.md#getrate) - Get LUCID/ETH exchange rate
* [estimate](docs/sdks/paymaster/README.md#estimate) - Estimate gas cost in $LUCID

### [Payouts](docs/sdks/payouts/README.md)

* [calculate](docs/sdks/payouts/README.md#calculate) - Calculate payout split
* [createFromReceipt](docs/sdks/payouts/README.md#createfromreceipt) - Create payout from receipt token data
* [get](docs/sdks/payouts/README.md#get) - Get payout by run_id
* [verify](docs/sdks/payouts/README.md#verify) - Verify payout split

### [Receipts](docs/sdks/receipts/README.md)

* [create](docs/sdks/receipts/README.md#create) - Create a receipt
* [get](docs/sdks/receipts/README.md#get) - Get a receipt
* [verify](docs/sdks/receipts/README.md#verify) - Verify a receipt (hash + signature + inclusion)
* [getProof](docs/sdks/receipts/README.md#getproof) - Get inclusion proof for receipt
* [lucidVerifyReceiptByHash](docs/sdks/receipts/README.md#lucidverifyreceiptbyhash) - Verify receipt by hash with inclusion proof and epoch info
* [getMmrRoot](docs/sdks/receipts/README.md#getmmrroot) - Get current MMR root
* [getSignerPubKey](docs/sdks/receipts/README.md#getsignerpubkey) - Get orchestrator signing public key

### [Run](docs/sdks/run/README.md)

* [inference](docs/sdks/run/README.md#inference) - Run inference (optionally streaming via SSE)
* [chatCompletions](docs/sdks/run/README.md#chatcompletions) - OpenAI-compatible chat completions

### [Shares](docs/sdks/shares/README.md)

* [lucidLaunchShareToken](docs/sdks/shares/README.md#lucidlaunchsharetoken) - Launch a share token for a passport
* [lucidGetShareToken](docs/sdks/shares/README.md#lucidgetsharetoken) - Get share token info for a passport
* [lucidTriggerRevenueAirdrop](docs/sdks/shares/README.md#lucidtriggerrevenueairdrop) - Trigger revenue airdrop for share token holders

### [Tba](docs/sdks/tba/README.md)

* [create](docs/sdks/tba/README.md#create) - Create TBA for passport NFT
* [get](docs/sdks/tba/README.md#get) - Get TBA address

### [ZkML](docs/sdks/zkml/README.md)

* [prove](docs/sdks/zkml/README.md#prove) - Generate zkML proof
* [verify](docs/sdks/zkml/README.md#verify) - Verify zkML proof
* [registerModel](docs/sdks/zkml/README.md#registermodel) - Register model circuit
* [listModels](docs/sdks/zkml/README.md#listmodels) - List registered model circuits

</details>
<!-- End Available Resources and Operations [operations] -->

<!-- Start Standalone functions [standalone-funcs] -->
## Standalone functions

All the methods listed above are available as standalone functions. These
functions are ideal for use in applications running in the browser, serverless
runtimes or other environments where application bundle size is a primary
concern. When using a bundler to build your application, all unused
functionality will be either excluded from the final bundle or tree-shaken away.

To read more about standalone functions, check [FUNCTIONS.md](./FUNCTIONS.md).

<details>

<summary>Available standalone functions</summary>

- [`agentsAccomplishAgentGoal`](docs/sdks/agents/README.md#accomplishagentgoal) - Plan and execute a workflow in one call
- [`agentsCheckAgentOrchestratorHealth`](docs/sdks/agents/README.md#checkagentorchestratorhealth) - Agent orchestrator health check
- [`agentsCheckExecutorHealth`](docs/sdks/agents/README.md#checkexecutorhealth) - Check executor health
- [`agentsExecuteAgentFlowspec`](docs/sdks/agents/README.md#executeagentflowspec) - Execute a FlowSpec
- [`agentsGenerateAgentProof`](docs/sdks/agents/README.md#generateagentproof) - Generate proof of contribution
- [`agentsGetAgentHistory`](docs/sdks/agents/README.md#getagenthistory) - Get agent MMR root history
- [`agentsGetAgentOrchestratorHistory`](docs/sdks/agents/README.md#getagentorchestratorhistory) - Get agent execution history for a tenant
- [`agentsGetAgentRoot`](docs/sdks/agents/README.md#getagentroot) - Get current MMR root for agent
- [`agentsGetAgentStats`](docs/sdks/agents/README.md#getagentstats) - Get agent statistics
- [`agentsGetExecutorDecision`](docs/sdks/agents/README.md#getexecutordecision) - Get executor decision for a FlowSpec
- [`agentsGetPlannerInfo`](docs/sdks/agents/README.md#getplannerinfo) - Get planner service info
- [`agentsInitAgent`](docs/sdks/agents/README.md#initagent) - Initialize an AI agent
- [`agentsListAgents`](docs/sdks/agents/README.md#listagents) - List all registered agents
- [`agentsPlanAgentWorkflow`](docs/sdks/agents/README.md#planagentworkflow) - Plan a workflow from a goal
- [`agentsPreviewAgentWorkflow`](docs/sdks/agents/README.md#previewagentworkflow) - Preview a workflow without executing
- [`agentsProcessAgentBatchEpochs`](docs/sdks/agents/README.md#processagentbatchepochs) - Process multiple epochs in batch
- [`agentsProcessAgentEpoch`](docs/sdks/agents/README.md#processagentepoch) - Process an epoch for an agent
- [`agentsValidateFlowspec`](docs/sdks/agents/README.md#validateflowspec) - Validate a FlowSpec structure
- [`agentsVerifyAgentMmr`](docs/sdks/agents/README.md#verifyagentmmr) - Verify MMR integrity for agent
- [`computeGetNodeHealth`](docs/sdks/compute/README.md#getnodehealth) - Get compute node health
- [`computeHeartbeat`](docs/sdks/compute/README.md#heartbeat) - Submit compute node heartbeat
- [`computeSearchCompute`](docs/sdks/compute/README.md#searchcompute) - Search compute passports
- [`disputesAppeal`](docs/sdks/disputes/README.md#appeal) - Appeal a dispute decision
- [`disputesGet`](docs/sdks/disputes/README.md#get) - Get dispute details
- [`disputesOpen`](docs/sdks/disputes/README.md#open) - Open a dispute on an escrow
- [`disputesResolve`](docs/sdks/disputes/README.md#resolve) - Resolve a dispute
- [`disputesSubmitEvidence`](docs/sdks/disputes/README.md#submitevidence) - Submit evidence for a dispute
- [`epochsCommitRoot`](docs/sdks/epochs/README.md#commitroot) - Commit epoch root
- [`epochsCommitRootsBatch`](docs/sdks/epochs/README.md#commitrootsbatch) - Commit multiple epoch roots
- [`epochsCreate`](docs/sdks/epochs/README.md#create) - Create epoch
- [`epochsGet`](docs/sdks/epochs/README.md#get) - Get epoch
- [`epochsGetAnchoringHealth`](docs/sdks/epochs/README.md#getanchoringhealth) - Anchoring service health
- [`epochsGetCurrent`](docs/sdks/epochs/README.md#getcurrent) - Get current epoch
- [`epochsGetStats`](docs/sdks/epochs/README.md#getstats) - Epoch statistics
- [`epochsGetTransaction`](docs/sdks/epochs/README.md#gettransaction) - Get epoch anchoring transaction
- [`epochsList`](docs/sdks/epochs/README.md#list) - List epochs
- [`epochsListReady`](docs/sdks/epochs/README.md#listready) - Get epochs ready for finalization
- [`epochsRetry`](docs/sdks/epochs/README.md#retry) - Retry failed epoch
- [`epochsVerify`](docs/sdks/epochs/README.md#verify) - Verify epoch anchor
- [`escrowCreate`](docs/sdks/escrow/README.md#create) - Create a time-locked escrow
- [`escrowDispute`](docs/sdks/escrow/README.md#dispute) - Dispute an escrow
- [`escrowGet`](docs/sdks/escrow/README.md#get) - Get escrow details
- [`escrowRelease`](docs/sdks/escrow/README.md#release) - Release escrow with verified receipt
- [`healthCheckDatabaseHealth`](docs/sdks/health/README.md#checkdatabasehealth) - Database health check
- [`healthCheckLiveness`](docs/sdks/health/README.md#checkliveness) - Liveness probe
- [`healthCheckNangoHealth`](docs/sdks/health/README.md#checknangohealth) - Nango service health check
- [`healthCheckReadiness`](docs/sdks/health/README.md#checkreadiness) - Readiness probe
- [`healthCheckRedisHealth`](docs/sdks/health/README.md#checkredishealth) - Redis health check
- [`healthCheckSystemHealth`](docs/sdks/health/README.md#checksystemhealth) - Overall system health
- [`healthGetDetailedHealth`](docs/sdks/health/README.md#getdetailedhealth) - Detailed health with statistics
- [`identityGet`](docs/sdks/identity/README.md#get) - Resolve identity (GET)
- [`identityGetChains`](docs/sdks/identity/README.md#getchains) - Get linked chains for identity
- [`identityLink`](docs/sdks/identity/README.md#link) - Link addresses cross-chain
- [`identityResolve`](docs/sdks/identity/README.md#resolve) - Resolve cross-chain identity
- [`identityUnlink`](docs/sdks/identity/README.md#unlink) - Unlink a cross-chain address
- [`matchCompute`](docs/sdks/match/README.md#compute) - Match compute for model
- [`matchExplain`](docs/sdks/match/README.md#explain) - Evaluate policy against compute/model meta
- [`matchPlanRoute`](docs/sdks/match/README.md#planroute) - Plan a route (match + resolve endpoint)
- [`modulesConfigurePayout`](docs/sdks/modules/README.md#configurepayout) - Configure payout module
- [`modulesConfigurePolicy`](docs/sdks/modules/README.md#configurepolicy) - Configure policy module
- [`modulesInstall`](docs/sdks/modules/README.md#install) - Install module on smart account
- [`modulesList`](docs/sdks/modules/README.md#list) - List installed modules
- [`modulesUninstall`](docs/sdks/modules/README.md#uninstall) - Uninstall module from smart account
- [`passportsCreate`](docs/sdks/passports/README.md#create) - Create a passport
- [`passportsDelete`](docs/sdks/passports/README.md#delete) - Delete a passport (soft delete)
- [`passportsGet`](docs/sdks/passports/README.md#get) - Get a passport
- [`passportsGetStats`](docs/sdks/passports/README.md#getstats) - Passport statistics
- [`passportsList`](docs/sdks/passports/README.md#list) - List passports
- [`passportsListPendingSync`](docs/sdks/passports/README.md#listpendingsync) - Get passports pending sync
- [`passportsLucidListAgentPassports`](docs/sdks/passports/README.md#lucidlistagentpassports) - List agent passports
- [`passportsLucidListDatasets`](docs/sdks/passports/README.md#lucidlistdatasets) - List dataset passports
- [`passportsLucidListTools`](docs/sdks/passports/README.md#lucidlisttools) - List tool passports
- [`passportsSearchModels`](docs/sdks/passports/README.md#searchmodels) - Search model passports
- [`passportsSync`](docs/sdks/passports/README.md#sync) - Trigger on-chain sync for a passport
- [`passportsUpdate`](docs/sdks/passports/README.md#update) - Update a passport
- [`passportsUpdateEndpoints`](docs/sdks/passports/README.md#updateendpoints) - Update passport endpoint URLs
- [`passportsUpdatePricing`](docs/sdks/passports/README.md#updatepricing) - Update passport pricing
- [`paymasterEstimate`](docs/sdks/paymaster/README.md#estimate) - Estimate gas cost in $LUCID
- [`paymasterGetRate`](docs/sdks/paymaster/README.md#getrate) - Get LUCID/ETH exchange rate
- [`paymasterSponsor`](docs/sdks/paymaster/README.md#sponsor) - Sponsor a UserOp with $LUCID
- [`payoutsCalculate`](docs/sdks/payouts/README.md#calculate) - Calculate payout split
- [`payoutsCreateFromReceipt`](docs/sdks/payouts/README.md#createfromreceipt) - Create payout from receipt token data
- [`payoutsGet`](docs/sdks/payouts/README.md#get) - Get payout by run_id
- [`payoutsVerify`](docs/sdks/payouts/README.md#verify) - Verify payout split
- [`receiptsCreate`](docs/sdks/receipts/README.md#create) - Create a receipt
- [`receiptsGet`](docs/sdks/receipts/README.md#get) - Get a receipt
- [`receiptsGetMmrRoot`](docs/sdks/receipts/README.md#getmmrroot) - Get current MMR root
- [`receiptsGetProof`](docs/sdks/receipts/README.md#getproof) - Get inclusion proof for receipt
- [`receiptsGetSignerPubKey`](docs/sdks/receipts/README.md#getsignerpubkey) - Get orchestrator signing public key
- [`receiptsLucidVerifyReceiptByHash`](docs/sdks/receipts/README.md#lucidverifyreceiptbyhash) - Verify receipt by hash with inclusion proof and epoch info
- [`receiptsVerify`](docs/sdks/receipts/README.md#verify) - Verify a receipt (hash + signature + inclusion)
- [`runChatCompletions`](docs/sdks/run/README.md#chatcompletions) - OpenAI-compatible chat completions
- [`runInference`](docs/sdks/run/README.md#inference) - Run inference (optionally streaming via SSE)
- [`sharesLucidGetShareToken`](docs/sdks/shares/README.md#lucidgetsharetoken) - Get share token info for a passport
- [`sharesLucidLaunchShareToken`](docs/sdks/shares/README.md#lucidlaunchsharetoken) - Launch a share token for a passport
- [`sharesLucidTriggerRevenueAirdrop`](docs/sdks/shares/README.md#lucidtriggerrevenueairdrop) - Trigger revenue airdrop for share token holders
- [`tbaCreate`](docs/sdks/tba/README.md#create) - Create TBA for passport NFT
- [`tbaGet`](docs/sdks/tba/README.md#get) - Get TBA address
- [`zkMLListModels`](docs/sdks/zkml/README.md#listmodels) - List registered model circuits
- [`zkMLProve`](docs/sdks/zkml/README.md#prove) - Generate zkML proof
- [`zkMLRegisterModel`](docs/sdks/zkml/README.md#registermodel) - Register model circuit
- [`zkMLVerify`](docs/sdks/zkml/README.md#verify) - Verify zkML proof

</details>
<!-- End Standalone functions [standalone-funcs] -->

<!-- Start Retries [retries] -->
## Retries

Some of the endpoints in this SDK support retries.  If you use the SDK without any configuration, it will fall back to the default retry strategy provided by the API.  However, the default retry strategy can be overridden on a per-operation basis, or across the entire SDK.

To change the default retry strategy for a single API call, simply provide a retryConfig object to the call:
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK();

async function run() {
  const result = await lucidSDK.passports.create({
    type: "dataset",
    owner: "<value>",
    metadata: {
      "key": "<value>",
      "key1": "<value>",
      "key2": "<value>",
    },
  }, {
    retries: {
      strategy: "backoff",
      backoff: {
        initialInterval: 1,
        maxInterval: 50,
        exponent: 1.1,
        maxElapsedTime: 100,
      },
      retryConnectionErrors: false,
    },
  });

  console.log(result);
}

run();

```

If you'd like to override the default retry strategy for all operations that support retries, you can provide a retryConfig at SDK initialization:
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK({
  retryConfig: {
    strategy: "backoff",
    backoff: {
      initialInterval: 1,
      maxInterval: 50,
      exponent: 1.1,
      maxElapsedTime: 100,
    },
    retryConnectionErrors: false,
  },
});

async function run() {
  const result = await lucidSDK.passports.create({
    type: "dataset",
    owner: "<value>",
    metadata: {
      "key": "<value>",
      "key1": "<value>",
      "key2": "<value>",
    },
  });

  console.log(result);
}

run();

```
<!-- End Retries [retries] -->

<!-- Start Error Handling [errors] -->
## Error Handling

[`LucidError`](./src/models/errors/luciderror.ts) is the base class for all HTTP error responses. It has the following properties:

| Property            | Type       | Description                                                                             |
| ------------------- | ---------- | --------------------------------------------------------------------------------------- |
| `error.message`     | `string`   | Error message                                                                           |
| `error.statusCode`  | `number`   | HTTP response status code eg `404`                                                      |
| `error.headers`     | `Headers`  | HTTP response headers                                                                   |
| `error.body`        | `string`   | HTTP body. Can be empty string if no body is returned.                                  |
| `error.rawResponse` | `Response` | Raw HTTP response                                                                       |
| `error.data$`       |            | Optional. Some errors may contain structured data. [See Error Classes](#error-classes). |

### Example
```typescript
import { LucidSDK } from "@lucid/sdk";
import * as errors from "@lucid/sdk/models/errors";

const lucidSDK = new LucidSDK();

async function run() {
  try {
    const result = await lucidSDK.passports.create({
      type: "dataset",
      owner: "<value>",
      metadata: {
        "key": "<value>",
        "key1": "<value>",
        "key2": "<value>",
      },
    });

    console.log(result);
  } catch (error) {
    // The base class for HTTP error responses
    if (error instanceof errors.LucidError) {
      console.log(error.message);
      console.log(error.statusCode);
      console.log(error.body);
      console.log(error.headers);

      // Depending on the method different errors may be thrown
      if (error instanceof errors.ErrorResponse) {
        console.log(error.data$.success); // boolean
        console.log(error.data$.error); // string
        console.log(error.data$.message); // string
        console.log(error.data$.errorCode); // string
        console.log(error.data$.details); // any
      }
    }
  }
}

run();

```

### Error Classes
**Primary errors:**
* [`LucidError`](./src/models/errors/luciderror.ts): The base class for HTTP error responses.
  * [`ErrorResponse`](./src/models/errors/errorresponse.ts): Bad Request. *

<details><summary>Less common errors (9)</summary>

<br />

**Network errors:**
* [`ConnectionError`](./src/models/errors/httpclienterrors.ts): HTTP client was unable to make a request to a server.
* [`RequestTimeoutError`](./src/models/errors/httpclienterrors.ts): HTTP request timed out due to an AbortSignal signal.
* [`RequestAbortedError`](./src/models/errors/httpclienterrors.ts): HTTP request was aborted by the client.
* [`InvalidRequestError`](./src/models/errors/httpclienterrors.ts): Any input used to create a request is invalid.
* [`UnexpectedClientError`](./src/models/errors/httpclienterrors.ts): Unrecognised or unexpected error.


**Inherit from [`LucidError`](./src/models/errors/luciderror.ts)**:
* [`HealthCheckResultError`](./src/models/errors/healthcheckresulterror.ts): Healthy. Status code `503`. Applicable to 3 of 102 methods.*
* [`SystemHealthError`](./src/models/errors/systemhealtherror.ts): Healthy. Status code `503`. Applicable to 1 of 102 methods.*
* [`ServiceUnavailableError`](./src/models/errors/serviceunavailableerror.ts): Not ready. Status code `503`. Applicable to 1 of 102 methods.*
* [`ResponseValidationError`](./src/models/errors/responsevalidationerror.ts): Type mismatch between the data returned from the server and the structure expected by the SDK. See `error.rawValue` for the raw value and `error.pretty()` for a nicely formatted multi-line string.

</details>

\* Check [the method documentation](#available-resources-and-operations) to see if the error is applicable.
<!-- End Error Handling [errors] -->

<!-- Start Server Selection [server] -->
## Server Selection

### Override Server URL Per-Client

The default server can be overridden globally by passing a URL to the `serverURL: string` optional parameter when initializing the SDK client instance. For example:
```typescript
import { LucidSDK } from "@lucid/sdk";

const lucidSDK = new LucidSDK({
  serverURL: "https://api.lucid.foundation",
});

async function run() {
  const result = await lucidSDK.passports.create({
    type: "dataset",
    owner: "<value>",
    metadata: {
      "key": "<value>",
      "key1": "<value>",
      "key2": "<value>",
    },
  });

  console.log(result);
}

run();

```
<!-- End Server Selection [server] -->

<!-- Start Custom HTTP Client [http-client] -->
## Custom HTTP Client

The TypeScript SDK makes API calls using an `HTTPClient` that wraps the native
[Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API). This
client is a thin wrapper around `fetch` and provides the ability to attach hooks
around the request lifecycle that can be used to modify the request or handle
errors and response.

The `HTTPClient` constructor takes an optional `fetcher` argument that can be
used to integrate a third-party HTTP client or when writing tests to mock out
the HTTP client and feed in fixtures.

The following example shows how to:
- route requests through a proxy server using [undici](https://www.npmjs.com/package/undici)'s ProxyAgent
- use the `"beforeRequest"` hook to add a custom header and a timeout to requests
- use the `"requestError"` hook to log errors

```typescript
import { LucidSDK } from "@lucid/sdk";
import { ProxyAgent } from "undici";
import { HTTPClient } from "@lucid/sdk/lib/http";

const dispatcher = new ProxyAgent("http://proxy.example.com:8080");

const httpClient = new HTTPClient({
  // 'fetcher' takes a function that has the same signature as native 'fetch'.
  fetcher: (input, init) =>
    // 'dispatcher' is specific to undici and not part of the standard Fetch API.
    fetch(input, { ...init, dispatcher } as RequestInit),
});

httpClient.addHook("beforeRequest", (request) => {
  const nextRequest = new Request(request, {
    signal: request.signal || AbortSignal.timeout(5000)
  });

  nextRequest.headers.set("x-custom-header", "custom value");

  return nextRequest;
});

httpClient.addHook("requestError", (error, request) => {
  console.group("Request Error");
  console.log("Reason:", `${error}`);
  console.log("Endpoint:", `${request.method} ${request.url}`);
  console.groupEnd();
});

const sdk = new LucidSDK({ httpClient: httpClient });
```
<!-- End Custom HTTP Client [http-client] -->

<!-- Start Debugging [debug] -->
## Debugging

You can setup your SDK to emit debug logs for SDK requests and responses.

You can pass a logger that matches `console`'s interface as an SDK option.

> [!WARNING]
> Beware that debug logging will reveal secrets, like API tokens in headers, in log messages printed to a console or files. It's recommended to use this feature only during local development and not in production.

```typescript
import { LucidSDK } from "@lucid/sdk";

const sdk = new LucidSDK({ debugLogger: console });
```

You can also enable a default debug logger by setting an environment variable `LUCID_DEBUG` to true.
<!-- End Debugging [debug] -->

<!-- Placeholder for Future Speakeasy SDK Sections -->

# Development

## Maturity

This SDK is in beta, and there may be breaking changes between versions without a major version update. Therefore, we recommend pinning usage
to a specific package version. This way, you can install the same version each time without breaking changes unless you are intentionally
looking for the latest version.

## Contributions

While we value open-source contributions to this SDK, this library is generated programmatically. Any manual changes added to internal files will be overwritten on the next generation. 
We look forward to hearing your feedback. Feel free to open a PR or an issue with a proof of concept and we'll do our best to include it in a future release. 

### SDK Created by [Speakeasy](https://www.speakeasy.com/?utm_source=raijin-labs-lucid-ai&utm_campaign=typescript)
