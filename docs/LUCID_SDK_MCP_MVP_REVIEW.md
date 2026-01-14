# LucidLayer — Review CdC (Lucid SDK + MCP) vs Codebase (Lucid-L2-main + llm-proxy)

Date: 2026-01-08

Auteur: Audit technique (Web3/AI)

---

## 0) Résumé exécutif

Le cahier des charges (CdC) vise un MVP **Passports → matching déterministe → exécution unifiée (OpenAI-ish) → receipts → paiements**, avec **chain jamais dans le hot path**.

Votre codebase actuelle couvre déjà des briques importantes :
- **On-chain** :
  - `programs/lucid-passports` (registry + versions + attestations)
  - `programs/thought-epoch` (commit de roots)
  - `programs/gas-utils` (collect/split via CPI pattern)
- **Off-chain** :
  - API Express + services (agent orchestration, MMR, HF sync, passport service)
  - MMR (proof-of-contribution) + IPFS-like storage
- **AI runtime** :
  - `llm-proxy` (FastAPI) : discovery/search + invocation multi-providers

Mais il manque les éléments qui relient ces briques en un MVP LucidLayer conforme au CdC : **metadata structurée (Model/Compute), matching engine, run gateway, receipt service signé, policy engine déterministe, idempotency, compute live state**.

---

## 1) Ce que votre codebase fait déjà bien (aligné CdC)

### 1.1 Passports (base)
**Existant** : `programs/lucid-passports/src/lib.rs` + `offchain/src/services/passportService.ts`
- Types d’assets : Model, Dataset, Tool, Agent, Voice, Other
- Versioning : `link_version`
- Attestations : `add_attestation`
- Status : Active/Deprecated/Superseded/Revoked

➡️ Ceci correspond à la vision “identity/pointers/proofs” du CdC.

### 1.2 Anchoring & preuves
**Existant** :
- `thought-epoch`: commit de root 32 bytes
- `offchain/src/utils/mmr.ts`: MMR + proofs

➡️ Très utile pour la pipeline “receipts root anchoring” (CdC §7), mais votre MMR est actuellement orienté “proof-of-contribution” (agent vectors), pas encore “run receipts”.

### 1.3 Économie / distribution
**Existant** :
- `gas-utils` : collecte + split

➡️ Bon point d’appui pour “payout split” minimal (CdC §6-7). Le CdC veut x402-style; en MVP vous pouvez “stubber” la partie règlement final, mais le split logic doit être prêt.

### 1.4 Execution / LLM
**Existant** :
- `llm-proxy` : discovery/search + invoke
- Offchain providers + router

➡️ C’est un bon backend pour l’ExecutionGateway du CdC, à condition d’y ajouter la résolution `passport:<id>` + match + policy.

---

## 2) Incohérences / gaps principaux (CdC vs codebase)

### GAP A — Passports: metadata Model/Compute sous-spécifiée (bloquant pour le matching)

Votre `lucid-passports` stocke surtout : `slug`, `content_cid`, `metadata_cid`, `license_code`, `policy_flags`.

Le CdC demande des champs **compute/matching** :
- Model: `format`, `runtime_recommended`, `context_length`, `quantizations`, `requirements.min_vram_gb`, `gpu_classes`, etc.
- Compute: `regions`, `residency_supported`, `hardware.gpu/vram`, `runtimes[]`, `capabilities.supports_streaming/attestation/cc_on`, `network.p95_ms_estimate`, `pricing`.

**Risque**: impossible d’avoir un matching déterministe sans un schéma strict.

**Solution MVP recommandée (sans surcharge on-chain)**
- Conserver `lucid-passports` minimal.
- Mettre les metadata spécialisées en **off-chain JSON** (S3/IPFS/Arweave/https) référencées par `metadata_cid` ou `manifest_uri`.
- Publier des **JSON Schemas versionnés** :
  - `ModelMeta.schema.json`
  - `ComputeMeta.schema.json`
  - `Policy.schema.json`
  - `RunReceipt.schema.json`

### GAP B — Matching engine absent

Le CdC exige :
- filtres hard requirements (runtime/format, VRAM, max_context, policy)
- scoring (cost/latency/reliability)
- sortie `MatchResult` et `match/explain`

**Solution MVP** : créer `matchingEngine` off-chain (pur, déterministe) et endpoints :
- `POST /v1/match`
- `POST /v1/match/explain`

### GAP C — Policy engine non défini (policy_hash ≠ policy enforcement)

Le CdC veut policy residency/attestation/latency/cost/privacy.
Actuellement pas de moteur d’évaluation déterministe.

**Solution MVP**
- `policy.evaluate(model_meta, compute_meta, request_ctx, policy)`
  - retourne `{allowed, reasons[], policy_hash}`
- reasons = enum stable (machine-readable)

### GAP D — Execution gateway unifiée manquante

Vous avez `handleRun`/`handleBatch`, orienté “commit hash on chain”.
Le CdC veut :
- `run.inference({ model_passport_id, input, policy, stream })`
- si possible façade OpenAI-compat `client.responses.create({ model: "passport:<id>" })`

**Solution MVP**
- `ExecutionGateway` qui :
  1) resolve model passport + model meta
  2) list compute passports + compute meta
  3) match
  4) route vers compute endpoint (via llm-proxy ou direct)
  5) return hot path response
  6) enqueue receipt async

### GAP E — Receipt service + ancrage + vérification

Vous ancrez des roots (thought-epoch/MMR), mais pas de **receipt JSON standard**, ni de stockage, ni de vérification, ni de “who signs”.

**Solution MVP**
- `ReceiptService` qui:
  - construit receipt (hash canonique)
  - signe receipt
  - store off-chain (S3/IPFS)
  - append leaf dans MMR epoch
  - commit root on-chain (async)
  - expose `get_receipt`, `get_proof`, `verify`

### GAP F — Paiements / split automatique (stub mais cohérent)

Le CdC veut “distribuer automatiquement les paiements aux bons acteurs”.
Votre `gas-utils` est un bon socle.

**Solution MVP**
- Définir un split simple (bps) dans le receipt (ou dans policy/economics).
- Exécuter `gas-utils.collect_and_split` dans la transaction d’ancrage (ou lors d’une settlement step).
- Laisser “pricing dynamique/marketplace” en v2.

### GAP G — MCP server “standard” (MCP SDK) manquant

Vous avez un “mcpRegistry” interne, mais le CdC veut un **MCP server** avec tools stricts:
- `lucid_search_models`, `lucid_get_passport`, `lucid_match`, `lucid_run_inference`, `lucid_get_receipt`, `lucid_verify_receipt`

**Solution MVP**
- Nouveau package `packages/mcp-server` basé sur `@modelcontextprotocol/sdk`.

---

## 3) Gaps additionnels (critiques) — suite à votre feedback

### 3.1 Receipt authenticity (signature) — **non négociable**
Sans signature, on prouve juste “ce JSON a été ancré”, pas “ce JSON représente une exécution réelle”.

**Fix MVP** : ajouter dans `RunReceipt` :
- `receipt_hash`
- `receipt_signature`
- `signer_pubkey`
- `signer_type: compute | orchestrator`

**Trust models**
- Compute-signed (préféré)
- Orchestrator-signed (MVP acceptable)

### 3.2 Canonicalisation/hashing standard — **verrouiller**
Sinon cross-lang JS/Python cassera.

**Fix MVP** : RFC 8785 (JCS) + sha256.
- Ajouter golden tests et vecteurs de test.

### 3.3 Policy engine expliquable / déterministe
**Fix MVP** : policy restricted + reasons codes + `match/explain`.

### 3.4 Run identity / idempotency / replay
**Fix MVP**
- `run_id` = ULID (ou hash fingerprint+nonce)
- Support `Idempotency-Key` sur `/v1/route`
- Receipt builder idempotent.

### 3.5 Compute live state (health/load) minimal
Matching statique seul ne marche pas en conditions réelles.

**Fix MVP**
- Endpoint heartbeat + TTL cache
- Matching filtre “healthy + last_seen”

---

## 4) Recommandations architecture MVP (sans surcharge)

### 4.1 Garder la chain hors hot path
- Exécution inference = off-chain
- Receipts = async (post-response)
- Anchoring = batch epochs

### 4.2 Ne pas gonfler le programme passports
- Stocker metadata spécialisées off-chain (JSON schema strict)
- On-chain = pointer + owner + version + attestation/policy flags

### 4.3 Réutiliser thought-epoch/MMR mais clarifier l’usage
- MMR leaf = `sha256(JCS(receipt))`
- Root = commit sur Solana

**Mais**: `thought-epoch` actuel est “par authority”. Pour multi-tenant, prévoir :
- soit nouveaux seeds incluant `project_id`/`epoch_id`
- soit mini-program `receipt-roots`.

### 4.4 Utiliser llm-proxy comme backend d’exécution
- Il fournit déjà routing multi-provider
- Votre ExecutionGateway doit “wrap” llm-proxy avec passports+match+policy+receipt.

---

## 5) Roadmap MVP (découpée en lots/PRs)

### PR0 — Schemas + Canonical JSON + Golden tests (bloquant)
- `schemas/*.schema.json`
- `canonicalJson` RFC8785 JS + Python
- golden corpus + expected hashes

### PR1 — Policy Engine + match/explain
- `policyEngine` (pure)
- `POST /v1/match/explain`

### PR2 — Compute registry + heartbeat
- `POST /v1/compute/nodes/heartbeat`
- TTL store (memory/Redis)

### PR3 — Matching engine
- `POST /v1/match`
- `MatchResult` stable

### PR4 — ExecutionGateway (route)
- `POST /v1/route` (streaming si possible)
- OpenAI-ish payload translation

### PR5 — Receipts pipeline
- `RunReceipt` builder + signature + store
- MMR append + commit root async
- `GET /v1/receipts/:run_id`, `/proof`, `/verify`

### PR6 — Paiements (stub cohérent)
- intégrer `gas-utils` split minimal
- wiring recipients: model owner / compute owner / lucid fee

### PR7 — MCP server standard
- `packages/mcp-server`
- tools list + strict JSON output

---

## 6) Questions à valider (avant implémentation)

### Q1 — Receipt signer MVP
- **Option 1**: Orchestrator-signed (rapide, trust Lucid)
- **Option 2**: Compute-signed (meilleur, nécessite clés compute nodes)

➡️ Quel choix pour le MVP ?

**Recommandation (expert, MVP-first)**
- **MVP = Orchestrator-signed** : plus rapide, 1 seul acteur à opérer, permet d’avoir tout de suite `verify()` (signature + inclusion + anchoring) sans exiger une infra compute node.
- **Upgrade path = Compute-signed** : dès que vous avez 1-2 compute nodes Lucid (vLLM/TGI) en prod, vous basculez le `signer_type` à `compute` et vous vérifiez la clé via le Compute Passport.

**Pourquoi**
- La signature compute est “meilleure” en théorie, mais en MVP elle vous force à opérer un parc de compute nodes + gestion de clés + rotation, sinon vous avez un système partiellement inutilisable.
- Orchestrator-signed n’empêche pas la compat future : le champ `signer_type` rend le modèle extensible.

### Q2 — Anchoring on-chain
- **Option 1**: Réutiliser `thought-epoch` (quick win) mais seeds à revoir pour multi-tenant.
- **Option 2**: Créer mini-program `receipt-roots` (plus propre).

➡️ Quel choix pour le MVP ?

**Décision utilisateur**
- ✅ **Option 1**: Réutiliser `thought-epoch` en MVP.

**Recommandation associée**
- Garder `thought-epoch` **mais** prévoir dès maintenant des seeds multi-tenant au moment où vous passez à “project/epoch”: sinon vous serez bloqués quand il faudra des receipts par projet.
- Variante MVP légère: ajouter un `project_id: [u8;32]` dans les seeds *sans changer la taille des accounts* (toujours root 32 bytes).

### Q3 — Passports metadata location
- **Option A (reco)**: metadata spécialisées off-chain (JSON schema strict)
- **Option B**: PDAs spécialisées on-chain

➡️ Validez-vous Option A ?

**Recommandation (tranchée)**
- **MVP = Option A (metadata off-chain, schema strict)**.

**Pourquoi Option B paraît logique mais est un piège en MVP**
- Les metadata Model/Compute vont bouger (runtimes, versions, regions, pricing, endpoints). Sur Solana, toute extension de compte = migration complexe.
- Les structs “riches” coûtent cher (space, rent) et limitent l’évolution.
- L’objectif CdC = chain **pas hot path** : l’indexing + matching ne doit pas dépendre de lire de gros comptes on-chain.

**Comment obtenir l’avantage d’Option B (immutabilité) sans la dette**
- Stocker metadata en JSON off-chain + calculer `metadata_hash` (sha256 JCS).
- Mettre `metadata_hash` dans le Passport (ou dans une attestation) pour garantir l’intégrité.
- Ainsi, vous pouvez changer de schéma (v1 → v1.1) en gardant une preuve cryptographique.

**Conclusion**
- Option A vous donne l’agilité + l’évolutivité.
- On peut ajouter plus tard un “checkpoint on-chain” des hashes, sans stocker tout le JSON.

### Q4 — llm-proxy
- garder séparé comme service
- ou intégrer dans mono-repo

➡️ On le garde séparé (recommandé) ?

**Recommandation (tranchée)**
- **Oui, garder `llm-proxy` séparé** comme service d’exécution/discovery générique.

**Pourquoi**
- Cela évite d’alourdir `Lucid-L2-main` (qui est déjà très large: extension, n8n, agents, solana, rewards).
- `llm-proxy` peut évoluer indépendamment (providers, caching, rate limiting).

**Mais**
- L’API “LucidLayer MVP” ne doit pas exposer `llm-proxy` directement : elle doit passer par votre `ExecutionGateway` (qui fait passport→match→policy→route→receipt).

### Q5 — Payouts
- voulez-vous un stub (receipt contient split + settlement plus tard)
- ou voulez-vous un minimum “collect_and_split” activé dès MVP ?

**Recommandation (MVP cohérent, sans marketplace)**
- **MVP = stub de settlement + split calculé** (dans receipt) **et** un mode optionnel `collect_and_split` via `gas-utils` uniquement pour 1 flow simple.

Concrètement:
1. La run calcule `estimated_cost` + `revenue_split` et l’écrit dans le receipt.
2. Le paiement réel peut être **déclenché au moment de l’anchoring** (batch) ou en “settlement job”.

**Pourquoi**
- Les paiements en temps réel compliquent la latence + la fiabilité.
- Le CdC dit “chain jamais hot path”: settlement async est parfaitement aligné.

**MVP minimal de split**
- 3 recipients: `model_owner`, `compute_owner`, `lucid_fee`.
- split en basis points (bps) et vérifié côté service.

---

## 7) Notes “scalabilité / propreté”

- Toute logique déterministe (policy, match, hash) doit être **pure** et testée via golden tests.
- Streaming: si vous visez OpenAI-compat, commencer par SSE/Chunked, puis upgrader.
- Observability: `trace_id` dans request, match, receipt.
- API versioning: `/v1/*` dès maintenant pour éviter la dette.

---

## 8) Fichiers / modules à créer (liste indicative)

Dans `Lucid-L2-main/offchain/src/`:
- `schemas/` (ou au niveau repo)
- `utils/canonicalJson.ts`
- `services/policyEngine.ts`
- `services/computeRegistry.ts`
- `services/matchingEngine.ts`
- `services/executionGateway.ts`
- `services/receiptService.ts`
- routes `/v1/*` (nouveau router) ou extension de `api.ts`

Dans un nouveau package:
- `packages/mcp-server/` (MCP SDK)

---

