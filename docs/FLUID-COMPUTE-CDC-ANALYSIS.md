# 🔍 Analyse du Cahier des Charges - Fluid Compute (DePIN GPU API)

**Date d'analyse:** 27 Janvier 2026  
**Analysé par:** AI Expert Web3/AI  
**Version CDC:** v0 avec roadmap v1  
**Status:** Analyse complète avec recommandations

---

## 📊 RÉSUMÉ EXÉCUTIF

| Métrique | Valeur |
|----------|--------|
| Alignement CDC/Codebase | **~60%** |
| Composants existants | 12/20 |
| Composants manquants | 8/20 |
| Effort estimé v0 | **15-20 jours** |
| Risques identifiés | 3 critiques, 2 modérés |

**Verdict:** Le CDC est **globalement cohérent** avec la codebase existante. Les principaux gaps concernent le **Lucid Worker** (nouveau service à créer) et quelques extensions de schémas.

---

## 1. INVENTAIRE - CE QUI EXISTE DÉJÀ ✅

### 1.1 Smart Contracts Solana

| Contrat | Fichier | Fonctionnalités | Status |
|---------|---------|-----------------|--------|
| **lucid-passports** | `programs/lucid-passports/src/lib.rs` | Passports (Model, Dataset, Tool, Agent, Voice), Attestations, Version Links | ✅ Production-ready |
| **thought-epoch** | `programs/thought-epoch/src/lib.rs` | Commit MMR roots (single + batch) vers Solana PDA | ⚠️ Nécessite extension |
| **gas-utils** | `programs/gas-utils/src/lib.rs` | Utilitaires gas | ✅ OK |

### 1.2 Services Offchain

| Service | Fichier | Fonctionnalités | Status CDC |
|---------|---------|-----------------|------------|
| **receiptService** | `offchain/src/services/receiptService.ts` | Création receipts signés ed25519, hash canonique, verification | ✅ Aligné |
| **epochService** | `offchain/src/services/epochService.ts` | Gestion epochs (open, anchoring, anchored, failed) | ✅ Aligné |
| **anchoringService** | `offchain/src/services/anchoringService.ts` | Commit epoch roots vers Solana via thought-epoch | ✅ Aligné |
| **computeRegistry** | `offchain/src/services/computeRegistry.ts` | Registry in-memory avec heartbeat/TTL | ⚠️ Basique |
| **mmrService** | `offchain/src/services/mmrService.ts` | Service MMR | ✅ Aligné |
| **matchingEngine** | `offchain/src/services/matchingEngine.ts` | Matching model ↔ compute | ✅ Aligné |
| **policyEngine** | `offchain/src/services/policyEngine.ts` | Evaluation des policies | ✅ Aligné |
| **passportService** | `offchain/src/services/passportService.ts` | Gestion des passports | ✅ Aligné |

### 1.3 Utilitaires Crypto

| Utilitaire | Fichier | Fonctionnalités |
|------------|---------|-----------------|
| **MMR** | `offchain/src/utils/mmr.ts` | Merkle Mountain Range complet avec proofs |
| **Canonical JSON** | `offchain/src/utils/canonicalJson.ts` | Hashing déterministe JCS |
| **Signing** | `offchain/src/utils/signing.ts` | ed25519 signing/verification |
| **Hash** | `offchain/src/utils/hash.ts` | SHA256 canonique |
| **Merkle Tree** | `offchain/src/utils/merkleTree.ts` | Merkle tree avec proofs |

### 1.4 Schémas JSON Existants

| Schéma | Fichier | Status |
|--------|---------|--------|
| RunReceipt | `schemas/RunReceipt.schema.json` | ⚠️ À étendre |
| ModelMeta | `schemas/ModelMeta.schema.json` | ⚠️ À étendre |
| ComputeMeta | `schemas/ComputeMeta.schema.json` | ⚠️ À étendre |
| Policy | `schemas/Policy.schema.json` | ✅ OK |

### 1.5 API Endpoints Existants

```yaml
# Extraits de openapi.yaml - Endpoints existants alignés avec CDC

✅ POST /v1/passports           # Créer passport
✅ GET  /v1/passports           # Lister passports
✅ POST /v1/match               # Match model ↔ compute
✅ POST /v1/route               # Route avec endpoint
✅ POST /v1/run/inference       # Exécuter inference
✅ POST /v1/chat/completions    # OpenAI-compatible
✅ POST /v1/receipts            # Créer receipt
✅ GET  /v1/receipts/{id}       # Récupérer receipt
✅ GET  /v1/receipts/{id}/verify # Vérifier receipt
✅ GET  /v1/receipts/{id}/proof  # Proof d'inclusion
✅ GET  /v1/mmr/root            # Root MMR actuel
✅ POST /v1/compute/nodes/heartbeat # Heartbeat
✅ GET  /v1/epochs/current      # Epoch courant
✅ POST /v1/receipts/commit-root # Commit epoch
```

### 1.6 SDKs

| SDK | Location | Status |
|-----|----------|--------|
| TypeScript | `packages/sdk-js/` | ✅ Généré depuis OpenAPI |
| Python | `packages/sdk-py/` | ✅ Généré depuis OpenAPI |

---

## 2. INCOHÉRENCES IDENTIFIÉES 🔴

### 2.1 Schema Receipt - DIVERGENCE

**CDC demande (ExecutionReceipt):**
```typescript
{
  receipt_id: string;
  job_hash: string;        // ❌ MANQUANT
  quote_hash: string;      // ❌ MANQUANT
  model_ref: string;       // = model_passport_id ✅
  offer_ref: string;       // ❌ MANQUANT (offer passport CID)
  runtime_hash: string;    // ❌ MANQUANT (container digest)
  node_id: string;         // ❌ MANQUANT (worker identity)
  outputs_hash: string;    // ❌ MANQUANT
  output_ref: string;      // ❌ MANQUANT (S3/IPFS URI)
  timestamps: {start, end} // ❌ MANQUANT (seulement timestamp unique)
}
```

**Codebase actuelle (SignedReceipt):**
```typescript
{
  run_id: string;           // ≈ receipt_id
  policy_hash: string;      // ✅
  model_passport_id: string;// ✅
  compute_passport_id: string; // ✅
  runtime: string;          // ✅ (mais pas le hash)
  metrics: {ttft_ms, p95_ms, tokens_in, tokens_out} // ✅
  receipt_hash: string;     // ✅
  receipt_signature: string;// ✅
}
```

**Action requise:**
```typescript
// Champs à ajouter dans receiptService.ts
interface ExtendedReceiptBody {
  // ... existants ...
  job_hash?: string;
  quote_hash?: string;
  node_id?: string;
  outputs_hash?: string;
  output_ref?: string;
  runtime_hash?: string;
  start_ts?: number;
  end_ts?: number;
}
```

### 2.2 Smart Contract thought-epoch - INCOMPLET

**CDC demande (EpochRootPDA):**
```rust
pub struct EpochRootPDA {
    pub epoch_id: u64,        // ❌ MANQUANT
    pub epoch_root: [u8; 32], // = merkle_root ✅
    pub leaf_count: u32,      // ❌ MANQUANT
    pub timestamp: i64,       // ❌ MANQUANT
    pub mmr_size: u64,        // ❌ MANQUANT
}
```

**Codebase actuelle (EpochRecord):**
```rust
pub struct EpochRecord {
    pub merkle_root: [u8; 32],
    pub authority: Pubkey,
    // ❌ Manque: epoch_id, leaf_count, timestamp, mmr_size
}
```

**Impact:** Les vérificateurs externes ne peuvent pas facilement valider les epochs sans ces métadonnées on-chain.

**Solution proposée:**
```rust
#[account]
pub struct EpochRecord {
    pub merkle_root: [u8; 32],
    pub authority: Pubkey,
    pub epoch_id: u64,          // AJOUTER
    pub leaf_count: u32,        // AJOUTER
    pub timestamp: i64,         // AJOUTER
    pub mmr_size: u64,          // AJOUTER
    pub metadata_hash: [u8; 32],// AJOUTER (optionnel)
}
```

### 2.3 Passport Schemas - MANQUANTS

**CDC demande ces schémas additionnels:**

| Schéma | Description | Status |
|--------|-------------|--------|
| `ModelPassport` | hf_repo, hf_revision, artifacts, min_vram_gb, runtime, license, policy_tags | ⚠️ Partiel (ModelMeta) |
| `ComputeProviderPassport` | provider_id, operator_pubkey, endpoints, regions, policies | ❌ MANQUANT |
| `ComputeOfferPassport` | offer_id, gpu_type, vram_gb, region, runtime, sla_tier, quote_endpoint | ❌ MANQUANT |
| `OfferQuote` | quote_id, offer_id, model_id, price, expires_at, quote_signature | ❌ MANQUANT |
| `JobRequest` | job_id, model_id, offer_id, quote, input/input_ref, job_hash | ❌ MANQUANT |
| `JobResult` | job_id, status, output_ref, outputs_hash, metrics | ❌ MANQUANT |

### 2.4 Architecture Monorepo - DIVERGENCE NON-BLOQUANTE

**CDC propose:**
```
packages/
  schemas/
  crypto/
  sdk/
services/
  worker/
  router/
  receipt-service/
  indexer/
infra/
  docker/
  helm/
```

**Codebase actuelle:**
```
offchain/src/services/    ← tout est ici
packages/sdk-js/
packages/sdk-py/
schemas/
programs/
```

**Recommandation:** NE PAS refactorer le monorepo pour v0. Créer uniquement `services/worker/` comme nouveau service autonome.

---

## 3. ÉLÉMENTS MANQUANTS (À DÉVELOPPER) 🟡

### 3.1 Lucid Worker (GPU Node) - CRITIQUE ⚠️

**C'est le composant PRINCIPAL du CDC qui n'existe pas.**

**API Worker requise:**
```
POST /quote     → génère OfferQuote signé
POST /jobs      → soumet un job
GET  /jobs/{id} → status + result
GET  /health    → healthcheck
GET  /metrics   → prometheus
```

**Fonctionnalités requises:**
- [ ] Intégration HuggingFace Hub (pull-by-revision)
- [ ] Cache local de modèles avec LRU eviction
- [ ] Prewarm de modèles au boot
- [ ] Runtime adapter (vLLM / TGI)
- [ ] Signature de quotes ed25519
- [ ] Émission de receipts vers receipt-service
- [ ] Health checks GPU
- [ ] Métriques Prometheus

**Effort estimé:** 5-7 jours

### 3.2 OfferQuote System

**Schema requis:**
```json
{
  "quote_id": "uuid",
  "offer_id": "compute_offer_passport_id",
  "model_id": "model_passport_id",
  "price": {"amount": 100, "currency": "lamports"},
  "expires_at": 1706400000,
  "capacity_hint": {"available_slots": 5},
  "terms_hash": "sha256_of_pricing_rules",
  "quote_signature": "ed25519_signature",
  "quote_hash": "sha256_of_canonical_json"
}
```

**Impact sans ce système:** Pas de pricing dynamique, pas de marketplace.

### 3.3 LucidScan Indexer

**Fonctionnalités requises:**
- [ ] Watcher Solana pour `commit_epoch_root` events
- [ ] Storage PostgreSQL des epochs/tx
- [ ] API `POST /verify` pour vérification receipts
- [ ] Proof reconstruction

**Effort estimé:** 3 jours

### 3.4 Observabilité

**Manquant actuellement:**
- [ ] Endpoint `/metrics` Prometheus
- [ ] Structured JSON logging (Winston/Pino)
- [ ] OpenTelemetry tracing
- [ ] Métriques: queue depth, cache hit/miss, latency percentiles

**Effort estimé:** 2 jours

---

## 4. QUESTIONS CRITIQUES À RÉSOUDRE ❓

### Q1: Scope du GPU Worker pour v0 ?

**Options:**
1. **MVP Simplifié (Recommandé v0):** Worker proxy vers `llm-proxy/` existant
2. **Full Worker:** Service autonome avec vLLM/TGI intégré

**Recommandation:** Option 1 pour v0, réutiliser l'infrastructure `llm-proxy/` existante.

### Q2: Modification du smart contract thought-epoch ?

**Implications:**
- Redéploiement du programme sur devnet
- Migration des données existantes ?
- Mise à jour de `anchoringService.ts`

**Question:** Y a-t-il des epochs déjà anchored en production qui nécessitent une migration ?

### Q3: HuggingFace Integration

**Questions:**
- Compte HF Pro/Enterprise pour rate limiting ?
- Liste des modèles spécifiques à supporter en v0 ?
- Taille du cache local requis ?

### Q4: Storage backend pour outputs

**CDC mentionne:** S3/IPFS/Filecoin

**Codebase actuelle:** `utils/ipfsStorage.ts` existe

**Question:** Quel backend privilégier pour v0 ?

---

## 5. PLAN D'IMPLÉMENTATION v0 PROPOSÉ

### Phase 1: Compléter les Schemas (2 jours)

```
schemas/
├── OfferQuote.schema.json           # NOUVEAU
├── ComputeOfferPassport.schema.json # NOUVEAU
├── ComputeProviderPassport.schema.json # NOUVEAU
├── JobRequest.schema.json           # NOUVEAU
├── JobResult.schema.json            # NOUVEAU
├── ModelMeta.schema.json            # ÉTENDRE (hf_revision, min_vram_gb)
├── ComputeMeta.schema.json          # ÉTENDRE
└── RunReceipt.schema.json           # ÉTENDRE (quote_hash, outputs_hash, node_id)
```

**Livrables:**
- [ ] 5 nouveaux schémas JSON
- [ ] Extensions des schémas existants
- [ ] Types TypeScript générés
- [ ] Tests de validation

### Phase 2: Modifier Smart Contract (3 jours)

**Fichier:** `programs/thought-epoch/src/lib.rs`

```rust
// Avant
pub struct EpochRecord {
    pub merkle_root: [u8; 32],
    pub authority: Pubkey,
}

// Après
pub struct EpochRecord {
    pub merkle_root: [u8; 32],
    pub authority: Pubkey,
    pub epoch_id: u64,
    pub leaf_count: u32,
    pub timestamp: i64,
    pub mmr_size: u64,
}

// Nouvelle instruction
pub fn commit_epoch_v2(
    ctx: Context<CommitEpochV2>,
    epoch_id: u64,
    root: [u8; 32],
    leaf_count: u32,
    mmr_size: u64,
) -> Result<()>
```

**Livrables:**
- [ ] Smart contract mis à jour
- [ ] Tests localnet
- [ ] Déploiement devnet
- [ ] `anchoringService.ts` mis à jour

### Phase 3: Lucid Worker MVP (5-7 jours)

**Structure proposée:**
```
services/
└── worker/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts
    │   ├── api/
    │   │   ├── quoteHandler.ts
    │   │   ├── jobHandler.ts
    │   │   ├── healthHandler.ts
    │   │   └── metricsHandler.ts
    │   ├── runtime/
    │   │   ├── RuntimeAdapter.ts
    │   │   ├── VllmAdapter.ts
    │   │   └── TgiAdapter.ts
    │   ├── cache/
    │   │   ├── ModelCache.ts
    │   │   └── HfHubClient.ts
    │   ├── signing/
    │   │   └── QuoteSigner.ts
    │   └── config/
    │       └── env.ts
    └── tests/
```

**Livrables:**
- [ ] Service autonome dockerisé
- [ ] API: /quote, /jobs, /jobs/{id}, /health, /metrics
- [ ] Intégration HF Hub
- [ ] Cache LRU
- [ ] Signature ed25519 quotes
- [ ] Envoi receipts
- [ ] Tests unitaires + integration

### Phase 4: Étendre receiptService (2 jours)

**Fichier:** `offchain/src/services/receiptService.ts`

**Modifications:**
```typescript
interface ExtendedReceiptBody {
  // Existants
  schema_version: '1.0';
  run_id: string;
  timestamp: number;
  // ...
  
  // AJOUTS pour CDC
  job_hash?: string;
  quote_hash?: string;
  node_id?: string;
  outputs_hash?: string;
  output_ref?: string;
  runtime_hash?: string;
  start_ts?: number;
  end_ts?: number;
}
```

### Phase 5: Observabilité (2 jours)

**Fichiers à créer:**
```
offchain/src/
├── metrics/
│   ├── prometheus.ts
│   └── registry.ts
└── logging/
    └── structuredLogger.ts
```

**Métriques à exposer:**
```
lucid_request_latency_seconds
lucid_queue_depth
lucid_cache_hits_total
lucid_cache_misses_total
lucid_hf_download_seconds
lucid_job_success_total
lucid_job_failure_total
lucid_epoch_commits_total
```

### Phase 6: LucidScan Indexer MVP (3 jours)

**Structure:**
```
services/
└── indexer/
    ├── Dockerfile
    ├── src/
    │   ├── index.ts
    │   ├── watcher/
    │   │   └── solanaWatcher.ts
    │   ├── storage/
    │   │   └── epochStore.ts
    │   └── api/
    │       └── verifyHandler.ts
    └── migrations/
```

### Phase 7: Tests E2E (2 jours)

**Scénarios de test:**
1. `quote → job → receipt → mmr → solana commit`
2. `proof verification against epoch root`
3. `cold start model pull`
4. `warm cache latency`
5. `concurrent job execution`

---

## 6. CE QU'ON NE FAIT PAS EN v0 ❌

**Aligné avec la section "v0 Scope lock" du CDC:**

| Feature | Raison du report |
|---------|------------------|
| Slashing | Complexité économique |
| Decentralized validators | Pas nécessaire si Lucid opère les nodes |
| ZK proofs | Overhead technique majeur |
| Dynamic marketplace pricing | Un seul opérateur en v0 |
| On-chain passport anchors complets | PassportAnchorPDA optionnel |

---

## 7. RISQUES ET MITIGATIONS

### Risques Critiques 🔴

| Risque | Impact | Mitigation |
|--------|--------|------------|
| **Smart contract upgrade** | Epochs existants invalides | Versionner le PDA, support backward-compat |
| **HF rate limiting** | Téléchargements bloqués | Cache agressif, prewarm, HF Pro account |
| **GPU availability** | Workers indisponibles | Health checks, fallback providers |

### Risques Modérés 🟡

| Risque | Impact | Mitigation |
|--------|--------|------------|
| **Schéma drift** | Receipts incompatibles | Versionning strict, migration tools |
| **Latency increase** | UX dégradée | Métriques, alerting, optimisation |

---

## 8. RECOMMANDATIONS FINALES

### Priorités v0 (dans l'ordre)

1. **Schemas** - Fondation pour tout le reste
2. **Smart contract** - Bloque l'anchoring amélioré
3. **Lucid Worker** - Cœur de la fonctionnalité GPU
4. **Receipt extensions** - Alignement avec CDC
5. **Observabilité** - Production-readiness
6. **Indexer** - Vérification publique

### Ne pas faire maintenant

- ❌ Refactoring monorepo complet
- ❌ Multi-provider marketplace
- ❌ ZK attestations
- ❌ Decentralized validators

### Prochaines étapes

1. **Valider les questions Q1-Q4** avec l'équipe
2. **Confirmer le plan** avec stakeholders
3. **Toggle en Act Mode** pour commencer l'implémentation

---

## ANNEXE A: Mapping CDC → Codebase

| Élément CDC | Fichier Codebase | Status |
|-------------|------------------|--------|
| Lucid Worker | `services/worker/` | 🆕 À créer |
| Receipt Service | `offchain/src/services/receiptService.ts` | ✅ Existe |
| MMR Builder | `offchain/src/utils/mmr.ts` | ✅ Existe |
| Epoch Service | `offchain/src/services/epochService.ts` | ✅ Existe |
| Anchoring | `offchain/src/services/anchoringService.ts` | ✅ Existe |
| thought-epoch | `programs/thought-epoch/src/lib.rs` | ⚠️ À étendre |
| lucid-passports | `programs/lucid-passports/src/lib.rs` | ✅ Existe |
| Passport Resolver | `offchain/src/services/passportService.ts` | ✅ Existe |
| Matching Engine | `offchain/src/services/matchingEngine.ts` | ✅ Existe |
| Router | `/v1/route` endpoint | ✅ Existe |
| LucidScan | `services/indexer/` | 🆕 À créer |
| SDK | `packages/sdk-js/`, `packages/sdk-py/` | ✅ Existe |

## ANNEXE B: Estimation Effort

| Phase | Jours | Dépendances |
|-------|-------|-------------|
| Phase 1: Schemas | 2 | Aucune |
| Phase 2: Smart Contract | 3 | Phase 1 |
| Phase 3: Lucid Worker | 5-7 | Phase 1 |
| Phase 4: Receipt Extensions | 2 | Phase 1 |
| Phase 5: Observabilité | 2 | Phase 3 |
| Phase 6: Indexer | 3 | Phase 2 |
| Phase 7: Tests E2E | 2 | Phase 1-6 |
| **TOTAL** | **19-21 jours** | |

---

*Document généré le 27 Janvier 2026*  
*Basé sur l'analyse de CDC-Fluid_Compute.md et de la codebase Lucid-L2*
