# 🚀 Plan Final d'Implémentation - Fluid Compute v0

**Date:** 29 Janvier 2026  
**Basé sur:** CDC-Fluid_Compute.md, FLUID-COMPUTE-CDC-ANALYSIS.md, EXECUTIVE-VERDICT-COUNTER-ANALYSIS.md  
**Status:** Prêt pour implémentation

---

## 📋 RÉSUMÉ EXÉCUTIF

| Métrique | Valeur |
|----------|--------|
| **Durée totale estimée** | 15-18 jours |
| **Phases** | 6 |
| **Composants à créer** | 3 (Worker, Indexer, Schemas) |
| **Composants à modifier** | 4 (Receipt, Epoch, Smart Contract, API) |
| **Priorité #1** | Extension des schemas (bloquant) |

---

## ✅ PRÉ-REQUIS VALIDÉS

| Composant | Status | Location |
|-----------|--------|----------|
| MMR Implementation | ✅ Existe | `offchain/src/utils/mmr.ts` |
| Receipt Service | ✅ Existe | `offchain/src/services/receiptService.ts` |
| Epoch Service | ✅ Existe | `offchain/src/services/epochService.ts` |
| Anchoring Service | ✅ Existe | `offchain/src/services/anchoringService.ts` |
| Matching Engine | ✅ Existe | `offchain/src/services/matchingEngine.ts` |
| Policy Engine | ✅ Existe | `offchain/src/services/policyEngine.ts` |
| thought-epoch Program | ✅ Existe | `programs/thought-epoch/src/lib.rs` |
| lucid-passports Program | ✅ Existe | `programs/lucid-passports/src/lib.rs` |
| ed25519 Signing | ✅ Existe | `offchain/src/utils/signing.ts` |

---

## 🎯 PHASE 1: Schemas (2 jours)

### 1.1 Créer nouveaux schemas

**Fichier:** `schemas/OfferQuote.schema.json`
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Lucid Offer Quote",
  "type": "object",
  "required": ["quote_id", "offer_id", "model_id", "price", "expires_at", "quote_hash", "quote_signature"],
  "properties": {
    "quote_id": { "type": "string", "format": "uuid" },
    "offer_id": { "type": "string" },
    "model_id": { "type": "string" },
    "price": {
      "type": "object",
      "properties": {
        "amount": { "type": "integer" },
        "currency": { "type": "string", "enum": ["lamports", "usd_cents"] }
      }
    },
    "expires_at": { "type": "integer" },
    "capacity_hint": { "type": "integer" },
    "terms_hash": { "type": "string" },
    "quote_signature": { "type": "string" },
    "quote_hash": { "type": "string" }
  }
}
```

**Fichier:** `schemas/JobRequest.schema.json`
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Lucid Job Request",
  "type": "object",
  "required": ["job_id", "model_id", "offer_id", "quote", "job_hash"],
  "properties": {
    "job_id": { "type": "string", "format": "uuid" },
    "model_id": { "type": "string" },
    "offer_id": { "type": "string" },
    "quote": { "$ref": "OfferQuote.schema.json" },
    "input": { "type": "object" },
    "input_ref": { "type": "string" },
    "job_hash": { "type": "string" }
  }
}
```

**Fichier:** `schemas/JobResult.schema.json`
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Lucid Job Result",
  "type": "object",
  "required": ["job_id", "status", "outputs_hash"],
  "properties": {
    "job_id": { "type": "string" },
    "status": { "type": "string", "enum": ["pending", "running", "completed", "failed"] },
    "output_ref": { "type": "string" },
    "outputs_hash": { "type": "string" },
    "metrics": {
      "type": "object",
      "properties": {
        "latency_ms": { "type": "integer" },
        "tokens_in": { "type": "integer" },
        "tokens_out": { "type": "integer" }
      }
    }
  }
}
```

### 1.2 Étendre schemas existants

**Fichier:** `schemas/RunReceipt.schema.json` - AJOUTER:
```json
{
  "properties": {
    "job_hash": { "type": "string" },
    "quote_hash": { "type": "string" },
    "node_id": { "type": "string" },
    "outputs_hash": { "type": "string" },
    "output_ref": { "type": "string" },
    "runtime_hash": { "type": "string" },
    "start_ts": { "type": "integer" },
    "end_ts": { "type": "integer" }
  }
}
```

**Fichier:** `schemas/ComputeMeta.schema.json` - AJOUTER:
```json
{
  "properties": {
    "operator_pubkey": { "type": "string" },
    "runtime_hash": { "type": "string" },
    "gpu_fingerprint": { "type": "string" }
  }
}
```

### 1.3 Livrables Phase 1
- [ ] `schemas/OfferQuote.schema.json`
- [ ] `schemas/JobRequest.schema.json`
- [ ] `schemas/JobResult.schema.json`
- [ ] `schemas/WorkerIdentity.schema.json`
- [ ] Extension `schemas/RunReceipt.schema.json`
- [ ] Extension `schemas/ComputeMeta.schema.json`
- [ ] Génération types TypeScript

---

## 🎯 PHASE 2: Receipt Service Extension (2 jours)

### 2.1 Modifier receiptService.ts

**Fichier:** `offchain/src/services/receiptService.ts`

```typescript
// ÉTENDRE ReceiptBody
export interface ReceiptBody {
  schema_version: '1.0';
  run_id: string;
  timestamp: number;
  trace_id?: string;
  policy_hash: string;
  model_passport_id: string;
  compute_passport_id: string;
  runtime: string;
  
  // NOUVEAUX CHAMPS
  job_hash?: string;
  quote_hash?: string;
  node_id?: string;
  outputs_hash?: string;
  output_ref?: string;
  runtime_hash?: string;
  start_ts?: number;
  end_ts?: number;
  
  // Existants
  image_hash?: string;
  model_hash?: string;
  attestation?: object;
  metrics: {
    ttft_ms: number;
    p95_ms?: number;
    tokens_in: number;
    tokens_out: number;
  };
}
```

### 2.2 Modifier extractReceiptBody()

```typescript
function extractReceiptBody(receipt: SignedReceipt | ReceiptBody): ReceiptBody {
  const body: ReceiptBody = {
    // ... existants ...
  };

  // AJOUTER optionnels
  if (receipt.job_hash !== undefined) body.job_hash = receipt.job_hash;
  if (receipt.quote_hash !== undefined) body.quote_hash = receipt.quote_hash;
  if (receipt.node_id !== undefined) body.node_id = receipt.node_id;
  if (receipt.outputs_hash !== undefined) body.outputs_hash = receipt.outputs_hash;
  if (receipt.output_ref !== undefined) body.output_ref = receipt.output_ref;
  if (receipt.runtime_hash !== undefined) body.runtime_hash = receipt.runtime_hash;
  if (receipt.start_ts !== undefined) body.start_ts = receipt.start_ts;
  if (receipt.end_ts !== undefined) body.end_ts = receipt.end_ts;

  return body;
}
```

### 2.3 Livrables Phase 2
- [ ] Extension `ReceiptBody` interface
- [ ] Extension `RunReceiptInput` interface
- [ ] Mise à jour `extractReceiptBody()`
- [ ] Mise à jour validation schema
- [ ] Tests unitaires mis à jour

---

## 🎯 PHASE 3: Smart Contract Extension (3 jours)

### 3.1 Modifier thought-epoch

**Fichier:** `programs/thought-epoch/src/lib.rs`

```rust
// NOUVELLE STRUCTURE (backward compatible)
#[account]
pub struct EpochRecord {
    pub merkle_root: [u8; 32],
    pub authority: Pubkey,
    // NOUVEAUX CHAMPS
    pub epoch_id: u64,
    pub leaf_count: u32,
    pub timestamp: i64,
    pub mmr_size: u64,
}

// NOUVELLE INSTRUCTION
pub fn commit_epoch_v2(
    ctx: Context<CommitEpochV2>,
    epoch_id: u64,
    root: [u8; 32],
    leaf_count: u32,
    mmr_size: u64,
) -> Result<()> {
    let rec = &mut ctx.accounts.epoch_record;
    rec.merkle_root = root;
    rec.authority = *ctx.accounts.authority.key;
    rec.epoch_id = epoch_id;
    rec.leaf_count = leaf_count;
    rec.timestamp = Clock::get()?.unix_timestamp;
    rec.mmr_size = mmr_size;
    Ok(())
}

#[derive(Accounts)]
#[instruction(epoch_id: u64, root: [u8; 32], leaf_count: u32, mmr_size: u64)]
pub struct CommitEpochV2<'info> {
    #[account(
       init_if_needed,
       payer = authority,
       space = 8 + 32 + 32 + 8 + 4 + 8 + 8,
       seeds = [b"epoch_v2", authority.key().as_ref(), &epoch_id.to_le_bytes()],
       bump
    )]
    pub epoch_record: Account<'info, EpochRecord>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
```

### 3.2 Modifier anchoringService.ts

**Fichier:** `offchain/src/services/anchoringService.ts`

```typescript
// NOUVELLE FONCTION
export async function commitEpochRootV2(
  epoch_id: string,
  leaf_count: number,
  mmr_size: number
): Promise<AnchorResult> {
  const epoch = prepareEpochForFinalization(epoch_id);
  // ... utiliser commit_epoch_v2 instruction
}

// NOUVEAU DISCRIMINATOR
const COMMIT_EPOCH_V2_DISCRIMINATOR = Buffer.from([/* sha256("global:commit_epoch_v2")[0:8] */]);
```

### 3.3 Livrables Phase 3
- [ ] Nouvelle struct `EpochRecord` étendue
- [ ] Nouvelle instruction `commit_epoch_v2`
- [ ] Tests localnet
- [ ] Déploiement devnet
- [ ] Mise à jour `anchoringService.ts`
- [ ] Tests intégration

---

## 🎯 PHASE 4: Lucid Worker (5-7 jours)

### 4.1 Structure du Worker

```
services/
└── worker/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts              # Entry point
    │   ├── config.ts             # Environment config
    │   ├── api/
    │   │   ├── routes.ts         # Express routes
    │   │   ├── quoteHandler.ts   # POST /quote
    │   │   ├── jobHandler.ts     # POST /jobs, GET /jobs/:id
    │   │   ├── healthHandler.ts  # GET /health
    │   │   └── metricsHandler.ts # GET /metrics
    │   ├── services/
    │   │   ├── quoteService.ts   # Quote generation + signing
    │   │   ├── jobService.ts     # Job execution
    │   │   ├── receiptEmitter.ts # Send receipts to offchain
    │   │   └── modelCache.ts     # HF cache management
    │   ├── runtime/
    │   │   ├── RuntimeAdapter.ts # Interface
    │   │   ├── VllmAdapter.ts    # vLLM implementation
    │   │   └── TgiAdapter.ts     # TGI implementation
    │   ├── signing/
    │   │   └── workerSigner.ts   # Worker ed25519 keys
    │   └── types/
    │       └── index.ts          # TypeScript types
    └── tests/
        ├── quote.test.ts
        └── job.test.ts
```

### 4.2 API Endpoints

```typescript
// POST /quote
interface QuoteRequest {
  offer_id: string;
  model_id: string;
  constraints?: {
    max_cost?: number;
    max_latency_ms?: number;
  };
}

interface QuoteResponse {
  quote_id: string;
  offer_id: string;
  model_id: string;
  price: { amount: number; currency: string };
  expires_at: number;
  quote_hash: string;
  quote_signature: string;
}

// POST /jobs
interface JobRequest {
  job_id: string;
  model_id: string;
  offer_id: string;
  quote: QuoteResponse;
  input: { prompt?: string; messages?: ChatMessage[] };
}

interface JobResponse {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
}

// GET /jobs/:id
interface JobStatusResponse {
  job_id: string;
  status: string;
  result?: {
    output_ref: string;
    outputs_hash: string;
    metrics: { latency_ms: number; tokens_in: number; tokens_out: number };
  };
  error?: string;
}
```

### 4.3 Worker Identity

```typescript
// services/worker/src/signing/workerSigner.ts
export interface WorkerIdentity {
  worker_id: string;           // UUID
  provider_passport_id: string;
  runtime_hash: string;        // Docker image digest
  gpu_fingerprint: string;     // GPU info
  operator_pubkey: string;     // ed25519 pubkey
}

export function getWorkerIdentity(): WorkerIdentity {
  return {
    worker_id: process.env.WORKER_ID || uuid(),
    provider_passport_id: process.env.PROVIDER_PASSPORT_ID!,
    runtime_hash: process.env.RUNTIME_HASH || 'dev',
    gpu_fingerprint: detectGPU(),
    operator_pubkey: getWorkerPublicKey(),
  };
}
```

### 4.4 Livrables Phase 4
- [ ] Service Worker dockerisé
- [ ] `POST /quote` avec signature
- [ ] `POST /jobs` avec job_hash
- [ ] `GET /jobs/:id` avec status
- [ ] `GET /health` et `GET /metrics`
- [ ] VllmAdapter implementation
- [ ] ModelCache avec LRU
- [ ] Receipt emission vers offchain
- [ ] Tests unitaires + integration
- [ ] Documentation déploiement

---

## 🎯 PHASE 5: Observabilité (1-2 jours)

### 5.1 Prometheus Metrics

**Fichier:** `offchain/src/metrics/prometheus.ts`

```typescript
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export const registry = new Registry();

export const metrics = {
  requestLatency: new Histogram({
    name: 'lucid_request_latency_seconds',
    help: 'Request latency in seconds',
    labelNames: ['method', 'endpoint', 'status'],
    registers: [registry],
  }),
  
  jobsTotal: new Counter({
    name: 'lucid_jobs_total',
    help: 'Total jobs processed',
    labelNames: ['status', 'model_id'],
    registers: [registry],
  }),
  
  queueDepth: new Gauge({
    name: 'lucid_queue_depth',
    help: 'Current job queue depth',
    registers: [registry],
  }),
  
  cacheHits: new Counter({
    name: 'lucid_cache_hits_total',
    help: 'Model cache hits',
    registers: [registry],
  }),
  
  epochCommits: new Counter({
    name: 'lucid_epoch_commits_total',
    help: 'Epoch commits to Solana',
    labelNames: ['status'],
    registers: [registry],
  }),
};
```

### 5.2 Livrables Phase 5
- [ ] `GET /metrics` endpoint (offchain)
- [ ] `GET /metrics` endpoint (worker)
- [ ] Structured JSON logging
- [ ] Health check enrichi

---

## 🎯 PHASE 6: Tests E2E (2 jours)

### 6.1 Scénarios de test

```typescript
// tests/e2e/full-flow.test.ts

describe('Fluid Compute E2E', () => {
  it('quote → job → receipt → mmr → anchor', async () => {
    // 1. Request quote
    const quote = await worker.requestQuote({
      offer_id: 'test-offer',
      model_id: 'test-model',
    });
    expect(quote.quote_signature).toBeDefined();

    // 2. Submit job
    const job = await worker.submitJob({
      quote,
      input: { prompt: 'Hello' },
    });
    expect(job.job_id).toBeDefined();

    // 3. Wait for completion
    const result = await worker.waitForJob(job.job_id);
    expect(result.outputs_hash).toBeDefined();

    // 4. Verify receipt created
    const receipt = await offchain.getReceipt(job.job_id);
    expect(receipt.job_hash).toBeDefined();
    expect(receipt.quote_hash).toBe(quote.quote_hash);

    // 5. Verify MMR inclusion
    const proof = await offchain.getReceiptProof(job.job_id);
    expect(proof.valid).toBe(true);

    // 6. Commit epoch and verify
    await offchain.commitEpochRoot();
    const anchor = await offchain.verifyEpochAnchor(receipt.anchor.epoch_id);
    expect(anchor.valid).toBe(true);
  });
});
```

### 6.2 Livrables Phase 6
- [ ] Test E2E flow complet
- [ ] Test cold start model
- [ ] Test warm cache
- [ ] Test concurrent jobs
- [ ] Test fallback
- [ ] Load test

---

## 📅 PLANNING RÉCAPITULATIF

| Phase | Durée | Dépendances | Priorité |
|-------|-------|-------------|----------|
| **Phase 1: Schemas** | 2 jours | Aucune | 🔴 CRITIQUE |
| **Phase 2: Receipt Extension** | 2 jours | Phase 1 | 🔴 CRITIQUE |
| **Phase 3: Smart Contract** | 3 jours | Phase 1 | 🟠 HAUTE |
| **Phase 4: Worker** | 5-7 jours | Phase 1, 2 | 🔴 CRITIQUE |
| **Phase 5: Observabilité** | 1-2 jours | Phase 4 | 🟡 MOYENNE |
| **Phase 6: Tests E2E** | 2 jours | Phase 1-4 | 🟠 HAUTE |

**Total: 15-18 jours**

---

## 🚫 HORS SCOPE v0

| Feature | Raison |
|---------|--------|
| Slashing | Complexité économique |
| Decentralized validators | Lucid opère tous les nodes |
| ZK proofs | Overhead majeur |
| Multi-provider marketplace | Un seul opérateur |
| Worker Bootstrap Phase | Over-engineering |

---

## ✅ CHECKLIST DE DÉMARRAGE

### Jour 1 - Préparation
- [ ] Valider ce plan avec l'équipe
- [ ] Créer branch `feature/fluid-compute-v0`
- [ ] Setup environnement de dev
- [ ] Commencer Phase 1

### Questions à résoudre avant de commencer
1. **HuggingFace:** Avez-vous un compte HF Pro ?
2. **Modèles v0:** Liste des 5-10 modèles à supporter ?
3. **Storage:** S3 ou IPFS pour outputs ?
4. **GPU disponibles:** Types de GPU pour tests ?

---

## 📁 FICHIERS À CRÉER/MODIFIER

### Nouveaux fichiers
```
schemas/OfferQuote.schema.json
schemas/JobRequest.schema.json
schemas/JobResult.schema.json
schemas/WorkerIdentity.schema.json
services/worker/                    # Tout le dossier
offchain/src/metrics/prometheus.ts
tests/e2e/full-flow.test.ts
```

### Fichiers à modifier
```
schemas/RunReceipt.schema.json
schemas/ComputeMeta.schema.json
offchain/src/services/receiptService.ts
offchain/src/services/anchoringService.ts
programs/thought-epoch/src/lib.rs
```

---

**Prêt à démarrer l'implémentation !** 🚀
