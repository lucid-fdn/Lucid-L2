# 🚀 Déployer Fluid Compute sur Runpod — Guide Pas à Pas

**Objectif** : Mettre en production le worker `worker-gpu-vllm` sur un GPU Runpod.  
**Durée estimée** : ~1h (hors téléchargement du modèle)  
**Difficulté** : Intermédiaire

---

## Vue d'ensemble : Qu'est-ce qu'on déploie ?

```
┌─────────────────────────────────────────────────────┐
│                   Pod Runpod (GPU)                   │
│                                                      │
│  ┌──────────┐     ┌──────────────────────────────┐  │
│  │  vLLM    │◄───►│  worker-gpu-vllm (Node.js)   │  │
│  │ (Python) │     │                              │  │
│  │ port 8000│     │  Endpoints:                  │  │
│  └──────────┘     │  - /health, /identity        │  │
│                   │  - /quote, /jobs (auth)       │  │
│                   │  - /metrics (Prometheus)      │  │
│                   │  port 8080                    │  │
│                   └──────────────────────────────┘  │
│                          │                           │
│                          ▼                           │
│                    ┌──────────┐                      │
│                    │  Redis   │ (état des jobs)       │
│                    └──────────┘                      │
│                          │                           │
│                          ▼                           │
│                    ┌──────────┐                      │
│                    │  S3      │ (résultats)           │
│                    └──────────┘                      │
└─────────────────────────────────────────────────────┘
```

**En résumé** : Le conteneur Docker démarre vLLM (serveur d'inférence IA), puis le worker Node.js qui expose une API HTTP. Le worker reçoit des requêtes, fait tourner le modèle via vLLM, signe les résultats, et les stocke sur S3.

---

## Prérequis — Ce dont tu as besoin AVANT de commencer

| # | Quoi | Pourquoi | Comment l'obtenir |
|---|------|----------|-------------------|
| 1 | **Compte Runpod** | Héberger le GPU | [runpod.io](https://runpod.io) — créer un compte, ajouter des crédits |
| 2 | **Docker Hub** | Héberger l'image Docker | [hub.docker.com](https://hub.docker.com) — compte gratuit suffit |
| 3 | **Bucket S3 AWS** | Stocker les résultats d'inférence | AWS Console → S3 → Create Bucket |
| 4 | **Instance Redis** | Persister l'état des jobs | [Upstash](https://upstash.com) (gratuit) ou Redis Cloud |
| 5 | **Clé ed25519** | Signer les receipts | Générée à l'étape 2 ci-dessous |

---

## Étape 1 : Builder l'image Docker (sur ta machine locale)

### 1.1 Compiler le code TypeScript

```bash
cd Lucid-L2/offchain

# Installer les dépendances
npm install

# Compiler
npm run build
# → ça crée le dossier dist/ avec le JS compilé
```

### 1.2 Builder l'image Docker

```bash
cd Lucid-L2

# Choisir un tag UNIQUE (jamais :latest)
VERSION="1.0.0-$(git rev-parse --short HEAD)"
echo "Version: $VERSION"

# Builder (noter le -f pour spécifier le Dockerfile)
docker build -f Dockerfile.worker-gpu-vllm -t lucidlayer/worker-gpu-vllm:$VERSION .

# Le Dockerfile.worker-gpu-vllm :
# - Base NVIDIA CUDA 12.1 + Python + Node.js 20
# - Installe vLLM + PyTorch
# - Compile le TypeScript (offchain/src → dist/)
# - Copie entrypoint.sh qui démarre vLLM puis le worker
```

### 1.3 Pusher sur Docker Hub

```bash
# Se connecter à Docker Hub
docker login

# Pusher
docker push lucidlayer/worker-gpu-vllm:$VERSION

# IMPORTANT : noter le digest de l'image
docker inspect --format='{{index .RepoDigests 0}}' lucidlayer/worker-gpu-vllm:$VERSION
# → Copie le sha256:xxxx... — c'est ton RUNTIME_HASH
```

**📝 Note le résultat** — tu auras besoin de :
- `$VERSION` (ex: `1.0.0-abc1234`)
- Le digest `sha256:xxxxx...`

---

## Étape 2 : Générer la clé de signature du worker

Le worker signe chaque receipt avec une clé ed25519. Tu dois la générer une fois :

```bash
# Avec Node.js
node -e "
const crypto = require('crypto');
const { generateKeyPairSync } = crypto;
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const privBytes = privateKey.export({ type: 'pkcs8', format: 'der' });
const pubBytes = publicKey.export({ type: 'spki', format: 'der' });
// Les 32 derniers bytes de DER sont la clé brute
const privRaw = privBytes.slice(-32);
const pubRaw = pubBytes.slice(-32);
const combined = Buffer.concat([privRaw, pubRaw]);
console.log('WORKER_SECRET_KEY_JSON=' + JSON.stringify(Array.from(combined)));
console.log('PUBLIC_KEY (pour vérification)=' + pubRaw.toString('hex'));
"
```

**📝 Note les résultats** :
- `WORKER_SECRET_KEY_JSON=[1,2,3,...]` — clé privée (garder SECRÈTE)
- La clé publique — pour vérification

---

## Étape 3 : Préparer les services externes

### 3.1 Redis (pour l'état des jobs)

**Option facile : Upstash (gratuit)**
1. Aller sur [upstash.com](https://upstash.com)
2. Créer une base Redis
3. Copier l'URL de connexion : `redis://default:xxxx@us1-xxx.upstash.io:6379`

**📝 Note** : `REDIS_URL=redis://default:xxxx@us1-xxx.upstash.io:6379`

### 3.2 S3 (pour les résultats)

1. AWS Console → S3 → Créer un bucket (ex: `lucid-compute-outputs`)
2. IAM → Créer un user avec accès S3
3. Récupérer `AWS_ACCESS_KEY_ID` et `AWS_SECRET_ACCESS_KEY`

**📝 Note** :
- `S3_BUCKET=lucid-compute-outputs`
- `S3_REGION=us-east-1`
- `AWS_ACCESS_KEY_ID=AKIAYWJ7LTFZD4QIJIUI`
- `AWS_SECRET_ACCESS_KEY=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`

### 3.3 Choisir le modèle (avec révision épinglée)

Tu dois choisir un modèle HuggingFace avec une **révision spécifique** (pas "latest") :

```bash
# Trouver la dernière révision d'un modèle
# Aller sur https://huggingface.co/meta-llama/Llama-2-7b-chat-hf/commits/main
# Copier le hash du commit le plus récent
# Exemple : a1b2c3d4e5f6...
```

**📝 Note** : `VLLM_MODEL_ID=meta-llama/Llama-2-7b-chat-hf@a1b2c3d4e5f6`

---

## Étape 4 : Créer le Pod sur Runpod

### 4.1 Se connecter à Runpod

1. Aller sur [runpod.io/console](https://runpod.io/console)
2. Se connecter

### 4.2 Créer un Pod (PAS un "Serverless Endpoint" !)

> ⚠️ **IMPORTANT** : Utiliser **"Pods"** et non **"Serverless"**. 
> Serverless = cold start, le Pod s'éteint. On veut always-on.

1. Cliquer sur **"Pods"** dans le menu gauche
2. Cliquer sur **"+ Deploy"** ou **"Create Pod"**
3. Configurer :

| Paramètre | Valeur |
|-----------|--------|
| **GPU** | A10G (dev/test ~$0.28/h) ou A100 40GB (prod ~$1.14/h) |
| **Container Image** | `lucidlayer/worker-gpu-vllm:1.0.0-abc1234` (ton tag de l'étape 1) |
| **Container Disk** | 20 GB |
| **Volume Disk** | 100 GB (monté sur `/models` pour le cache modèle) |
| **Volume Mount Path** | `/models` |
| **Expose HTTP Ports** | `8080` |

### 4.3 Configurer les variables d'environnement

Dans la section "Environment Variables" du Pod, ajouter **toutes** ces variables :

```
# === IDENTITÉ DU WORKER ===
WORKER_ID=worker-runpod-001
PROVIDER_PASSPORT_ID=compute_provider_lucid_cloud
EXECUTION_MODE=byo_runtime

# === CLÉ DE SIGNATURE (de l'étape 2) ===
WORKER_SECRET_KEY_JSON=[144,242,242,10,165,242,208,46,78,237,171,54,12,102,89,43,226,160,46,66,19,196,165,217,80,81,117,145,227,208,20,64,112,183,225,1,59,157,114,54,80,191,141,114,205,52,89,9,219,167,99,203,249,90,117,88,235,29,141,0,147,186,194,188]

# === AUTHENTIFICATION API ===
# Invente 2-3 clés API aléatoires (ex: openssl rand -hex 32)
WORKER_API_KEYS=1494b618e8b5b040d7c49299d774f5350deb7d2acf7ed17a953810428f2853de,1494b618e8b5b040d7c49299d774f5350deb7d2acf7ed17a953810428f2853de,a517b948d741926bf52217a24fdf99716ebc297c3b02f5f0b7a7e7996b31bfd5
REQUIRE_AUTH=true

# === REDIS (de l'étape 3.1) ===
REDIS_URL=redis://default:AUO5AAIncDIzZTQwOWFiZmNlOTU0YTgyYjhhNjZhOGE0Y2NlNWUzN3AyMTczMzc@immune-vulture-17337.upstash.io:6379


# === S3 (de l'étape 3.2) ===
S3_BUCKET=lucid-compute-outputs
S3_PREFIX=v0/jobs
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAYWJ7LTFZD4QIJIUI
AWS_SECRET_ACCESS_KEY=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

# === RUNTIME HASH (de l'étape 1.3) ===
RUNTIME_HASH=sha256:78270c1d438e426a7eeb5ac8600d00cae139b278a8d0c293e6f640e4555051fd

# === vLLM / MODÈLE (de l'étape 3.3) ===
VLLM_MODEL_ID=meta-llama/Llama-2-7b-chat-hf@a1b2c3d4e5f6
VLLM_HOST=localhost
VLLM_PORT=8000
VLLM_MODEL_DIR=/models
VLLM_TENSOR_PARALLEL_SIZE=1

# === MODÈLES AUTORISÉS ===
SUPPORTED_MODELS=meta-llama/Llama-2-7b-chat-hf@a1b2c3d4e5f6
MODEL_ALLOWLIST=meta-llama/Llama-2-7b-chat-hf
ENFORCE_MODEL_ALLOWLIST=true

# === PRICING & LIMITES ===
OFFER_ID=compute_offer_lucid_a100
PRICE_PER_1K_INPUT=10
PRICE_PER_1K_OUTPUT=30
MAX_INPUT_TOKENS=4096
MAX_OUTPUT_TOKENS=2048
MAX_CONCURRENT_JOBS=3
JOB_TIMEOUT_SECONDS=300
QUOTE_TTL_SECONDS=300
```

### 4.4 Lancer le Pod

Cliquer sur **"Deploy"**. 

Le démarrage prend **5-15 minutes** la première fois (téléchargement du modèle). Les fois suivantes, grâce au volume persistant `/models`, ce sera plus rapide.

---

## Étape 5 : Vérifier que ça marche

Une fois le Pod en statut "Running", récupère l'URL :

```bash
# L'URL est visible dans la console Runpod, format :
ENDPOINT="https://xxxxxx-8080.proxy.runpod.net"
WORKER_API_KEY="cle-api-1-xxxxxxxxxx"  # Une des clés de WORKER_API_KEYS
```

### Test 1 — Health check (pas besoin d'auth)

```bash
curl -s "$ENDPOINT/health" | jq .
```

**✅ Attendu** :
```json
{
  "status": "healthy",
  "worker_id": "worker-runpod-001",
  "execution_mode": "byo_runtime",
  "gpu_available": true,
  "queue_depth": 0
}
```

Si tu vois `"status": "unhealthy"` → le vLLM n'est probablement pas encore prêt. Attendre 2-3 min.

### Test 2 — Identity (pas besoin d'auth)

```bash
curl -s "$ENDPOINT/identity" | jq .
```

**✅ Vérifier que** :
- `runtime_hash` n'est PAS null
- `gpu_fingerprint` n'est PAS null (ex: `NVIDIA-A10G-24GB`)
- `operator_pubkey` est présent

### Test 3 — Metrics (pas besoin d'auth)

```bash
curl -s "$ENDPOINT/metrics"
```

**✅ Attendu** : Du texte format Prometheus avec `fc_worker_info`, `fc_jobs_total`, etc.

### Test 4 — Quote (AVEC auth)

```bash
curl -s -X POST "$ENDPOINT/quote" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "offer_id": "compute_offer_lucid_a100",
    "model_id": "meta-llama/Llama-2-7b-chat-hf@a1b2c3d4e5f6",
    "estimated_input_tokens": 100,
    "estimated_output_tokens": 100
  }' | jq .
```

**✅ Attendu** : Un objet `OfferQuote` avec `quote_id`, `quote_hash`, etc.

Si tu reçois `401` → vérifie que la clé API est bien dans `WORKER_API_KEYS`.
Si tu reçois `403` → le modèle n'est pas dans `MODEL_ALLOWLIST`.

### Test 5 — Job complet (AVEC auth)

```bash
# 1. Obtenir un quote
QUOTE=$(curl -s -X POST "$ENDPOINT/quote" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "offer_id": "compute_offer_lucid_a100",
    "model_id": "meta-llama/Llama-2-7b-chat-hf@a1b2c3d4e5f6",
    "estimated_input_tokens": 100,
    "estimated_output_tokens": 100
  }')

# 2. Soumettre un job
JOB_ID="test-$(date +%s)"
JOB_RESPONSE=$(curl -s -X POST "$ENDPOINT/jobs" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"job_id\": \"$JOB_ID\",
    \"model_id\": \"meta-llama/Llama-2-7b-chat-hf@a1b2c3d4e5f6\",
    \"offer_id\": \"compute_offer_lucid_a100\",
    \"quote\": $QUOTE,
    \"input\": {
      \"messages\": [{\"role\": \"user\", \"content\": \"Dis bonjour en une phrase.\"}]
    }
  }")

echo "Job soumis: $JOB_RESPONSE" | jq .

# 3. Attendre et récupérer le résultat (attendre ~10s)
sleep 10
curl -s "$ENDPOINT/jobs/$JOB_ID" \
  -H "Authorization: Bearer $WORKER_API_KEY" | jq .
```

**✅ Attendu** : Un `JobResult` avec :
- `status: "completed"`
- `runtime_hash` non null
- `gpu_fingerprint` non null
- `outputs_hash` présent
- `receipt` signé

---

## Résumé des erreurs courantes

| Erreur | Cause probable | Solution |
|--------|---------------|----------|
| `VLLM connection refused` | vLLM pas encore démarré | Attendre 5 min, vérifier les logs |
| `401 Unauthorized` | Pas de header `Authorization` | Ajouter `-H "Authorization: Bearer $WORKER_API_KEY"` |
| `403 Model not allowed` | Modèle pas dans l'allowlist | Vérifier `MODEL_ALLOWLIST` |
| `runtime_hash: null` | `RUNTIME_HASH` pas configuré | Ajouter la variable d'environnement |
| `gpu_fingerprint: null` | Pas de GPU détecté | Vérifier que le Pod a bien un GPU |
| Le Pod redémarre en boucle | Erreur dans entrypoint.sh | Vérifier les logs dans la console Runpod |
| Modèle trop long à charger | Première fois, pas de cache | Le volume `/models` doit être persistant |

---

## Combien ça coûte ?

| GPU | Prix/heure | Recommandé pour |
|-----|-----------|-----------------|
| A10G (24GB) | ~$0.28/h | Dev/test, petits modèles (7B) |
| L4 (24GB) | ~$0.24/h | Dev/test |
| A100 40GB | ~$1.14/h | Production, modèles 7B-13B |
| A100 80GB | ~$1.64/h | Production, modèles 70B |
| H100 (80GB) | ~$3.29/h | High performance |

**💡 Pour commencer** : Prend un **A10G** (~$7/jour). Tu pourras upgrader en A100 après.

---

## Schéma récapitulatif des étapes

```
Étape 1: Build Docker image (ta machine locale)
    ↓
Étape 2: Générer clé ed25519 (ta machine locale)
    ↓
Étape 3: Préparer Redis + S3 + choisir modèle
    ↓
Étape 4: Créer Pod Runpod + configurer env vars
    ↓
Étape 5: Tester avec curl (health → identity → quote → job)
    ↓
✅ Fluid Compute v0 Pass A opérationnel !
```

---

## Fichiers de référence

- [Guide technique complet](./FLUID-COMPUTE-RUNPOD-DEPLOYMENT.md) — Tous les détails
- [Entrypoint script](../offchain/src/workers/worker-gpu-vllm/entrypoint.sh) — Ce qui démarre dans le container
- [Worker code](../offchain/src/workers/worker-gpu-vllm/index.ts) — Le code du worker
- [Acceptance Checklist](../FLUID-COMPUTE-V0-ACCEPTANCE-CHECKLIST.md) — Critères d'acceptation