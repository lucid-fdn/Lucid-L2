> **DEPRECATED** — This package is deprecated. Use `@lucid-l2/sdk` instead for the embeddable SDK, or the hosted API via platform-core.

# @lucid/sdk

TypeScript SDK for the Lucid AI infrastructure protocol.

## Install

```bash
npm install @lucid/sdk
```

## Quick Start

```typescript
import { createLucidSDK } from '@lucid/sdk/lucid';

const sdk = createLucidSDK({
  apiKey: 'lk_live_...',
  chain: 'base',
});
```

## Chat Completion

```typescript
const result = await sdk.run.chatCompletions({
  model: 'deepseek-v3',
  messages: [{ role: 'user', content: 'Hello' }],
});

console.log(result.choices[0].message.content);
```

## Create a Passport

```typescript
const passport = await sdk.passports.create({
  type: 'model',
  owner: '0x...',
  metadata: {
    name: 'my-model',
    format: 'safetensors',
  },
});
```

## Create an Escrow

The `chain` set in `createLucidSDK` is injected automatically into v2 endpoint requests. You can override it per call with `chainId`.

```typescript
// Uses the default chain ("base") set above
await sdk.escrow.create({
  beneficiary: '0x...',
  token: '0x...',
  amount: '100',
  duration: 3600,
});

// Override per call
await sdk.escrow.create({
  chainId: 'ethereum-sepolia',
  beneficiary: '0x...',
  token: '0x...',
  amount: '100',
  duration: 3600,
});
```

## Resource Namespaces

All resources are accessed as properties on the SDK instance:

| Namespace | Description |
|-----------|-------------|
| `sdk.passports` | Create, list, get, update, delete passports. Search models, tools, datasets, agents. |
| `sdk.run` | Inference and OpenAI-compatible chat completions |
| `sdk.escrow` | Create, release, dispute, and get time-locked escrows |
| `sdk.disputes` | Open, submit evidence, resolve, appeal disputes |
| `sdk.paymaster` | Sponsor UserOps, get LUCID/ETH rate, estimate gas |
| `sdk.identity` | Link/resolve/unlink cross-chain identities |
| `sdk.tba` | Create and get Token Bound Accounts for passport NFTs |
| `sdk.modules` | Install/uninstall/configure smart account modules |
| `sdk.zkML` | Generate and verify zkML proofs, register model circuits |
| `sdk.health` | System health, liveness, readiness, dependency checks |
| `sdk.agents` | Initialize agents, process epochs, generate proofs, orchestrate workflows |
| `sdk.epochs` | Epoch management and Solana anchoring |
| `sdk.receipts` | Create, get, verify receipts and inclusion proofs |
| `sdk.payouts` | Calculate and verify payout splits |
| `sdk.shares` | Launch share tokens, get token info, trigger airdrops |
| `sdk.compute` | Search compute passports, heartbeat, node health |
| `sdk.match` | Match compute for models, plan routes, explain policy |

## Vercel AI SDK Integration

Import from `@lucid/sdk/ai` to use Lucid as a Vercel AI SDK provider:

```typescript
import { createLucidProvider } from '@lucid/sdk/ai';
import { generateText, streamText } from 'ai';

const lucid = createLucidProvider({ apiKey: 'lk_live_...' });

// Non-streaming
const { text } = await generateText({
  model: lucid('gpt-4o'),
  prompt: 'Hello',
});

// Streaming
const stream = streamText({
  model: lucid('deepseek-v3'),
  messages: [{ role: 'user', content: 'Hello' }],
});

// Embeddings
import { embed } from 'ai';

const { embedding } = await embed({
  model: lucid.textEmbeddingModel('text-embedding-3-small'),
  value: 'How to deploy Next.js',
});
```

A default instance using `LUCID_API_KEY` from the environment is also available:

```typescript
import { lucid } from '@lucid/sdk/ai';

const { text } = await generateText({
  model: lucid('gpt-4o'),
  prompt: 'Hello',
});
```

## Authentication

The SDK supports bearer token authentication. Provide it via the `apiKey` option or the `LUCID_BEARER_AUTH` environment variable.

```typescript
// Option 1: Pass directly
const sdk = createLucidSDK({ apiKey: 'lk_live_...' });

// Option 2: Environment variable (auto-detected)
// Set LUCID_BEARER_AUTH=lk_live_...
const sdk = createLucidSDK();
```

When using the low-level `LucidSDK` class directly, the option is named `bearerAuth`:

```typescript
import { LucidSDK } from '@lucid/sdk';

const sdk = new LucidSDK({
  bearerAuth: process.env.LUCID_BEARER_AUTH,
});
```

## Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `apiKey` | `string` | Lucid API key (`lk_live_...` or `lk_test_...`). Falls back to `LUCID_BEARER_AUTH` env var. |
| `chain` | `string` | Default chain for v2 endpoints (e.g. `'base'`, `'ethereum-sepolia'`). Auto-injected into POST/PATCH requests. Can be overridden per call. |
| `serverURL` | `string` | Override the API base URL. Defaults to `https://api.lucid.foundation`. |
| `timeoutMs` | `number` | Request timeout in milliseconds. |

## Error Handling

```typescript
import * as errors from '@lucid/sdk/models/errors';

try {
  await sdk.passports.get({ passportId: 'invalid' });
} catch (error) {
  if (error instanceof errors.ErrorResponse) {
    console.log(error.statusCode);
    console.log(error.data$.error);
  }
}
```

## Post-Generation Note

This SDK is generated by [Speakeasy](https://www.speakeasy.com/). After running `speakeasy run`, apply custom patches:

```bash
npm run postgen
```

This runs `scripts/patch-hooks.mjs` to wire up the default chain hook and other custom behavior that survives regeneration.

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
* [@lucid/sdk](#lucidsdk)
  * [Install](#install)
  * [Quick Start](#quick-start)
  * [Chat Completion](#chat-completion)
  * [Create a Passport](#create-a-passport)
  * [Create an Escrow](#create-an-escrow)
  * [Resource Namespaces](#resource-namespaces)
  * [Vercel AI SDK Integration](#vercel-ai-sdk-integration)
  * [Authentication](#authentication)
  * [Configuration Options](#configuration-options)
  * [Error Handling](#error-handling)
  * [Post-Generation Note](#post-generation-note)
  * [SDK Installation](#sdk-installation)
  * [Requirements](#requirements)
  * [SDK Example Usage](#sdk-example-usage)
  * [Authentication](#authentication-1)
  * [Available Resources and Operations](#available-resources-and-operations)
  * [Standalone functions](#standalone-functions)
  * [Retries](#retries)
  * [Error Handling](#error-handling-1)
  * [Server Selection](#server-selection)
  * [Custom HTTP Client](#custom-http-client)
  * [Debugging](#debugging)

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

### [Payments](docs/sdks/payments/README.md)

* [getAssetPricing](docs/sdks/payments/README.md#getassetpricing) - Get asset pricing
* [setAssetPricing](docs/sdks/payments/README.md#setassetpricing) - Set asset pricing
* [deleteAssetPricing](docs/sdks/payments/README.md#deleteassetpricing) - Remove asset pricing
* [getAssetRevenue](docs/sdks/payments/README.md#getassetrevenue) - Get asset revenue summary
* [withdrawAssetRevenue](docs/sdks/payments/README.md#withdrawassetrevenue) - Withdraw asset revenue
* [getPaymentConfig](docs/sdks/payments/README.md#getpaymentconfig) - Get x402 payment configuration
* [setDefaultFacilitator](docs/sdks/payments/README.md#setdefaultfacilitator) - Set default payment facilitator
* [getSupportedChains](docs/sdks/payments/README.md#getsupportedchains) - List supported payment chains
* [subscribe](docs/sdks/payments/README.md#subscribe) - Subscribe to asset access

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
- [`paymentsDeleteAssetPricing`](docs/sdks/payments/README.md#deleteassetpricing) - Remove asset pricing
- [`paymentsGetAssetPricing`](docs/sdks/payments/README.md#getassetpricing) - Get asset pricing
- [`paymentsGetAssetRevenue`](docs/sdks/payments/README.md#getassetrevenue) - Get asset revenue summary
- [`paymentsGetPaymentConfig`](docs/sdks/payments/README.md#getpaymentconfig) - Get x402 payment configuration
- [`paymentsGetSupportedChains`](docs/sdks/payments/README.md#getsupportedchains) - List supported payment chains
- [`paymentsSetAssetPricing`](docs/sdks/payments/README.md#setassetpricing) - Set asset pricing
- [`paymentsSetDefaultFacilitator`](docs/sdks/payments/README.md#setdefaultfacilitator) - Set default payment facilitator
- [`paymentsSubscribe`](docs/sdks/payments/README.md#subscribe) - Subscribe to asset access
- [`paymentsWithdrawAssetRevenue`](docs/sdks/payments/README.md#withdrawassetrevenue) - Withdraw asset revenue
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

<details><summary>Less common errors (10)</summary>

<br />

**Network errors:**
* [`ConnectionError`](./src/models/errors/httpclienterrors.ts): HTTP client was unable to make a request to a server.
* [`RequestTimeoutError`](./src/models/errors/httpclienterrors.ts): HTTP request timed out due to an AbortSignal signal.
* [`RequestAbortedError`](./src/models/errors/httpclienterrors.ts): HTTP request was aborted by the client.
* [`InvalidRequestError`](./src/models/errors/httpclienterrors.ts): Any input used to create a request is invalid.
* [`UnexpectedClientError`](./src/models/errors/httpclienterrors.ts): Unrecognised or unexpected error.


**Inherit from [`LucidError`](./src/models/errors/luciderror.ts)**:
* [`X402PaymentRequiredError`](./src/models/errors/x402paymentrequirederror.ts): Payment Required (x402). Status code `402`. Applicable to 3 of 111 methods.*
* [`HealthCheckResultError`](./src/models/errors/healthcheckresulterror.ts): Healthy. Status code `503`. Applicable to 3 of 111 methods.*
* [`SystemHealthError`](./src/models/errors/systemhealtherror.ts): Healthy. Status code `503`. Applicable to 1 of 111 methods.*
* [`ServiceUnavailableError`](./src/models/errors/serviceunavailableerror.ts): Not ready. Status code `503`. Applicable to 1 of 111 methods.*
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
