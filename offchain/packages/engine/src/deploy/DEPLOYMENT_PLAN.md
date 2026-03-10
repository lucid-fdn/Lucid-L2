# One-Click Agent Deployment Plan

## Vision

Deploy any Lucid agent to any infrastructure provider with a single SDK call:

```typescript
const result = await agent.deploy({
  target: 'nosana',           // railway | akash | phala | ionet | nosana | docker
  gpu: 'rtx-4090',            // optional, provider-mapped
  region: 'us-east',          // optional
})
console.log(result.url)       // https://agent-xyz.nos.run
console.log(result.proof)     // { attestation, chain_tx }
```

No Dockerfile authoring. No SDL files. No GraphQL. The SDK builds the image, pushes it, deploys it, and returns a live URL with cryptographic proof.

---

## Current State (Honest Assessment)

| Provider | Status | What Works | What's Missing |
|----------|--------|-----------|----------------|
| Docker | Working | File generation, docker-compose, env vars | No image build, no push |
| Railway | Partial | GraphQL service creation, env var injection | No Docker image source, no domain generation |
| Akash | Stub | SDL generation only | No on-chain tx, no bid flow, no manifest |
| Phala | Stub | Placeholder API calls | Guessed endpoints (not real Phala Cloud API) |
| io.net | Stub | Placeholder API calls | Fabricated endpoints |
| Nosana | Missing | N/A | Not implemented |

---

## Provider API Specifications (Verified)

### 1. Railway (PaaS)

- **API**: GraphQL at `https://backboard.railway.com/graphql/v2`
- **Auth**: `Authorization: Bearer <RAILWAY_API_TOKEN>`
- **Image support**: Docker Hub, GHCR, GitLab CR, Quay.io. Private images on Pro plan.
- **Key mutations**: `serviceCreate(input: { name, projectId, source: { image } })`, `variableUpsert`, `serviceDelete`
- **Domain**: Auto-generated `*.up.railway.app`
- **Scaling**: Dashboard only (no API mutation)
- **SDK**: None (raw GraphQL)
- **Best for**: CPU-only agents, simplest DX

### 2. Akash Network (DePIN, Cosmos)

- **On-chain SDK**: `@akashnetwork/akash-api` (protobuf types) + `@cosmjs/stargate` (signing/broadcast)
- **Managed API**: Akash Console at `console-api.akash.network` (avoids wallet management)
- **Deploy flow**: Generate SDL v2.0 → `MsgCreateDeployment` → receive bids → `MsgCreateLease` → send manifest
- **SDL format**: YAML with services (image, env, expose), profiles (cpu/ram/storage/gpu), deployment (count)
- **GPU support**: Explicit `gpu` section in SDL profile
- **Best for**: Cost-optimized GPU workloads, decentralized deployments

### 3. Phala Network (TEE)

- **API**: REST at `https://cloud-api.phala.com/api/v1`
- **Auth**: `Authorization: Bearer phak_<key>` + header `X-Phala-Version: 2026-01-21`
- **SDK**: `@phala/cloud` (official, type-safe, full lifecycle)
- **Deploy flow** (two-phase):
  1. `provisionCvm({ name, compose_file: { docker_compose_file }, instance_type })` → returns `{ compose_hash, app_id, app_env_encrypt_pubkey }`
  2. Encrypt env vars with `encryptEnvVars(vars, pubkey)`
  3. `commitCvmProvision({ app_id, compose_hash, encrypted_env, env_keys })`
  4. CVM auto-starts, poll `getCvmState({ id })` until `status === 'running'`
- **URL format**: `https://<app_id>-<HOST_PORT>.dstack-prod5.phala.network`
- **Instance types**: `tdx.small` (2 vCPU/4GB $0.10/h), `tdx.medium` (4/8 $0.20/h), `tdx.large` (8/16 $0.40/h), GPU: H200 ($3.50/h), B200 ($3.80/h)
- **Lifecycle**: `startCvm`, `stopCvm`, `restartCvm`, `shutdownCvm`, `deleteCvm`
- **Updates**: `updateCvmEnvs`, `updateDockerCompose`, `updateCvmResources`
- **Logs**: via API or CLI `phala logs <name>`
- **Constraint**: x86/amd64 images only (no ARM)
- **Unique**: TEE attestation, encrypted env vars, hardware-verified execution
- **Best for**: Agents handling secrets, wallets, sensitive data

### 4. io.net (GPU DePIN)

- **API**: REST at `https://api.io.solutions/enterprise/v1/io-cloud/caas/`
- **Auth**: `X-API-KEY: <key>` (generate at `ai.io.net/ai/api-keys`)
- **Deploy flow**:
  1. `GET /hardware/max-gpus-per-container` → pick `hardware_id`
  2. `GET /available-replicas?hardware_id=203&hardware_qty=1` → pick `location_ids`
  3. `GET /price?hardware_id=203&duration_hours=24&...` → cost estimate
  4. `POST /deploy` with:
     ```json
     {
       "resource_private_name": "lucid-agent",
       "duration_hours": 24,
       "gpus_per_container": 1,
       "hardware_id": 203,
       "location_ids": [1],
       "container_config": {
         "replica_count": 1,
         "traffic_port": 3100,
         "entrypoint": ["node", "agent.js"],
         "env_variables": { "KEY": "val" },
         "secret_env_variables": { "SECRET": "val" }
       },
       "registry_config": {
         "image_url": "ghcr.io/raijinlabs/lucid-agents/agnt_abc:latest",
         "registry_username": "",
         "registry_secret": ""
       }
     }
     ```
  5. Response: `{ "status": "ok", "deployment_id": "uuid" }`
  6. `GET /deployment/{id}/containers` → `workers[].public_url`
- **Lifecycle**: `PATCH /deployment/{id}` (update config), `POST /deployment/{id}/extend` (extend time), `DELETE /deployment/{id}` (destroy)
- **Logs**: `GET /deployment/{id}/log/{container_id}?stream=stdout` (SSE)
- **Constraints**: HTTP only, single traffic port, min 1 GPU, no multi-node
- **Pricing**: Per-GPU per-hour, IO Credits (1 credit = $1 USD)
- **No SDK**: Build own HTTP client (OpenAPI specs available at `io.net/docs/openapi/caas/`)
- **Best for**: GPU inference endpoints

### 5. Nosana (Solana GPU)

- **API**: REST at `https://dashboard.k8s.prd.nos.ci/api`
- **Auth**: `Authorization: Bearer nos_xxx_<key>` (from deploy.nosana.com)
- **SDK**: `@nosana/kit` v2.1.7 (TypeScript, `@solana/kit` v5.4 based)
- **Deploy flow**:
  ```typescript
  import { createNosanaClient, NosanaNetwork } from '@nosana/kit'

  const client = createNosanaClient(NosanaNetwork.MAINNET, {
    api: { apiKey: process.env.NOSANA_API_KEY }
  })

  const deployment = await client.api.deployments.create({
    name: 'lucid-agent',
    market: '7AtiXMSH6R1jjBxrcYjehCkkSF7zvYWte63gwEDBcGHq', // GPU market address
    timeout: 60,
    replicas: 1,
    strategy: 'INFINITE', // persistent service (not batch!)
    job_definition: {
      version: '0.1',
      type: 'container',
      meta: { trigger: 'api' },
      ops: [{
        type: 'container/run',
        id: 'agent',
        args: {
          image: 'ghcr.io/raijinlabs/lucid-agents/agnt_abc:latest',
          cmd: '',
          expose: 3100,
          env: { KEY: 'val' },
        }
      }]
    }
  })

  await deployment.start()
  // URL: https://<id>.node.k8s.prd.nos.ci
  ```
- **Deployment states**: DRAFT → STARTING → RUNNING → STOPPING → STOPPED → ARCHIVED
- **Strategies**: `SIMPLE` (one-shot), `SIMPLE-EXTEND`, `SCHEDULED` (cron), `INFINITE` (persistent)
- **Lifecycle**: `deployment.start()`, `.stop()`, `.archive()`, `.updateReplicas(n)`, `.createRevision({...})`, `.updateTimeout(n)`
- **GPU selection**: Via market address (Solana pubkey). Discovery: `client.api.markets.list()`
- **Pricing**: Credits-based (purchase on dashboard) or NOS/SOL tokens in vaults
- **Best for**: Solana-native GPU agents, native DePIN alignment with Lucid

---

## Architecture: Image Build Pipeline

The critical missing piece: **how does agent code become a deployable Docker image?**

### Build Pipeline

```
Agent Code (generated RuntimeArtifact)
        │
        ▼
  ImageBuilder
        │
        ├── Local: docker build + docker push (dev/self-hosted)
        ├── Remote: GitHub Actions trigger (production)
        └── Buildless: Source upload (Railway only)
        │
        ▼
  GHCR: ghcr.io/raijinlabs/lucid-agents/{passport_id}:{version}
        │
        ▼
  Deployer.deploy(imageRef, config)
```

### ImageBuilder Interface

```typescript
interface ImageBuilder {
  build(artifact: RuntimeArtifact, passportId: string): Promise<ImageRef>
}

interface ImageRef {
  registry: string     // 'ghcr.io'
  repository: string   // 'raijinlabs/lucid-agents/agnt_abc123'
  tag: string          // 'v1' or 'latest'
  digest?: string      // sha256:... for immutability
  fullRef: string      // 'ghcr.io/raijinlabs/lucid-agents/agnt_abc123:v1'
}
```

### Base Dockerfile (generated)

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1
CMD ["node", "agent.js"]
```

---

## Rewritten Deployers

### Extended IDeployer Interface

```typescript
export interface IDeployer {
  readonly target: string
  readonly description: string
  readonly requiresImage: boolean  // NEW

  deploy(artifact: RuntimeArtifact, config: DeploymentConfig, passportId: string): Promise<DeploymentResult>
  status(deploymentId: string): Promise<DeploymentStatus>
  logs(deploymentId: string, options?: LogOptions): Promise<string>
  terminate(deploymentId: string): Promise<void>
  scale(deploymentId: string, replicas: number): Promise<void>
  isHealthy(): Promise<boolean>
  mapGpu?(requested: string): string | undefined  // NEW
}
```

### Railway (Rewrite)

```typescript
class RailwayDeployer implements IDeployer {
  readonly requiresImage = true

  async deploy(artifact, config, passportId) {
    // 1. serviceCreate with source.image = imageRef
    const svc = await this.graphql('mutation { serviceCreate(input: { name, projectId, source: { image: $ref } }) }')
    // 2. variableUpsert for each env var
    // 3. Poll deployment status until SUCCESS
    // 4. serviceDomainCreate for public URL
    return { success: true, deployment_id: svc.id, url: `https://${domain}.up.railway.app` }
  }
}
```

### Phala (Rewrite using @phala/cloud)

```typescript
import { createClient, encryptEnvVars } from '@phala/cloud'

class PhalaDeployer implements IDeployer {
  readonly requiresImage = true

  async deploy(artifact, config, passportId) {
    const client = createClient({ apiKey: process.env.PHALA_CLOUD_API_KEY })

    const compose = this.generateCompose(imageRef, envVars, port)
    const provision = await client.provisionCvm({
      name: `lucid-agent-${passportId.slice(0, 16)}`,
      compose_file: { docker_compose_file: compose, public_logs: true, gateway_enabled: true },
      instance_type: this.mapInstanceType(config),
    })

    const encrypted = await encryptEnvVars(envVars, provision.app_env_encrypt_pubkey!)
    await client.commitCvmProvision({
      app_id: provision.app_id!, compose_hash: provision.compose_hash,
      encrypted_env: encrypted, env_keys: Object.keys(envVars),
    })

    // Poll until running
    let state
    do {
      await sleep(5000)
      state = await client.getCvmState({ id: provision.app_id! })
    } while (state.status !== 'running')

    return {
      success: true, deployment_id: provision.app_id!,
      url: `https://${provision.app_id}-3100.dstack-prod5.phala.network`,
      metadata: { tee: true, attestation: provision.compose_hash },
    }
  }
}
```

### io.net (Rewrite using actual CaaS API)

```typescript
class IoNetDeployer implements IDeployer {
  readonly requiresImage = true
  private baseUrl = 'https://api.io.solutions/enterprise/v1/io-cloud/caas'

  async deploy(artifact, config, passportId) {
    // 1. Discover hardware
    const hw = await this.api('GET', '/hardware/max-gpus-per-container')
    const hardwareId = this.selectHardware(hw, config)

    // 2. Check availability
    const avail = await this.api('GET', `/available-replicas?hardware_id=${hardwareId}&hardware_qty=1`)
    const locationId = avail.data[0]?.id

    // 3. Deploy
    const result = await this.api('POST', '/deploy', {
      resource_private_name: `lucid-agent-${passportId.slice(0, 16)}`,
      duration_hours: 24,
      gpus_per_container: 1,
      hardware_id: hardwareId,
      location_ids: locationId ? [locationId] : [],
      container_config: {
        replica_count: config.replicas || 1,
        traffic_port: 3100,
        env_variables: envVars,
      },
      registry_config: { image_url: imageRef.fullRef },
    })

    // 4. Poll for public URL
    let publicUrl = null
    while (!publicUrl) {
      await sleep(10000)
      const containers = await this.api('GET', `/deployment/${result.deployment_id}/containers`)
      publicUrl = containers.data?.workers?.[0]?.public_url
    }

    return { success: true, deployment_id: result.deployment_id, url: publicUrl }
  }

  async logs(id) {
    const containers = await this.api('GET', `/deployment/${id}/containers`)
    const cid = containers.data?.workers?.[0]?.container_id
    if (!cid) return 'No containers found'
    // SSE stream from /deployment/{id}/log/{cid}?stream=stdout
    return await this.fetchText(`/deployment/${id}/log/${cid}?stream=stdout`)
  }

  async terminate(id) { await this.api('DELETE', `/deployment/${id}`) }

  private async api(method, path, body?) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { 'X-API-KEY': process.env.IONET_API_KEY!, 'Content-Type': 'application/json' },
    })
    return res.json()
  }
}
```

### Nosana (New)

```typescript
import { createNosanaClient, NosanaNetwork } from '@nosana/kit'

class NosanaDeployer implements IDeployer {
  readonly target = 'nosana'
  readonly description = 'Nosana Solana GPU deployment'
  readonly requiresImage = true

  async deploy(artifact, config, passportId) {
    const client = createNosanaClient(NosanaNetwork.MAINNET, {
      api: { apiKey: process.env.NOSANA_API_KEY! },
    })

    const deployment = await client.api.deployments.create({
      name: `lucid-agent-${passportId.slice(0, 16)}`,
      market: this.resolveMarket(config),
      timeout: 60,
      replicas: config.replicas || 1,
      strategy: 'INFINITE',
      job_definition: {
        version: '0.1', type: 'container', meta: { trigger: 'api' },
        ops: [{
          type: 'container/run', id: 'agent',
          args: { image: imageRef.fullRef, cmd: '', expose: 3100, env: envVars },
        }],
      },
    })

    await deployment.start()

    return {
      success: true, deployment_id: deployment.id, target: 'nosana',
      url: `https://${deployment.id}.node.k8s.prd.nos.ci`,
    }
  }

  async status(id) {
    const client = this.getClient()
    const dep = await client.api.deployments.get(id)
    return { deployment_id: id, status: this.mapStatus(dep.status), health: dep.status === 'RUNNING' ? 'healthy' : 'unknown' }
  }

  async scale(id, replicas) {
    const dep = await this.getClient().api.deployments.get(id)
    await dep.updateReplicas(replicas)
  }

  async terminate(id) {
    const dep = await this.getClient().api.deployments.get(id)
    await dep.stop()
    await dep.archive()
  }
}
```

---

## SDK DX: `agent.deploy()`

```typescript
const agent = createLucidAgent({
  apiKey: process.env.LUCID_API_KEY,
  agentPassportId: process.env.AGENT_PASSPORT_ID,
})

// One-click deploy
const result = await agent.deploy({
  target: 'nosana',
  gpu: 'rtx-4090',
  env: { CUSTOM_VAR: 'value' },
})

console.log(result.url)            // Live endpoint
console.log(result.deployment_id)  // For management

// Manage
const status = await agent.deployment.status(result.deployment_id)
const logs = await agent.deployment.logs(result.deployment_id)
await agent.deployment.scale(result.deployment_id, 3)
await agent.deployment.terminate(result.deployment_id)
```

### Behind the Scenes

```
agent.deploy({ target: 'nosana' })
        │
        ▼
  MCPGate POST /v1/agents/:id/deploy
        │
        ├── 1. Validate agent passport + plan permissions
        ├── 2. Generate RuntimeArtifact (adapter code gen)
        ├── 3. ImageBuilder.build() → push to GHCR
        ├── 4. deployer.deploy(imageRef, config)
        ├── 5. Store in agent_deployments table
        ├── 6. Emit receipt event (deploy action)
        └── 7. Return { url, deployment_id }
```

---

## GPU Abstraction Layer

| Abstract Name | Railway | Akash SDL | Phala Instance | io.net hardware_id | Nosana Market |
|--------------|---------|-----------|---------------|-------------------|---------------|
| `cpu` | default | cpu: 1.0 | `tdx.small` | N/A | N/A |
| `t4` | N/A | gpu: t4 | `tdx.gpu.small` | (lookup) | (lookup) |
| `a100` | N/A | gpu: a100 | `tdx.gpu.medium` | 203 | (market addr) |
| `h100` | N/A | gpu: h100 | N/A | (lookup) | (market addr) |
| `rtx-4090` | N/A | gpu: rtx4090 | N/A | (lookup) | `7Ati...cGHq` |

GPU lookup is dynamic: io.net → `GET /hardware/max-gpus-per-container`, Nosana → `client.api.markets.list()`.

---

## Auto-Injected Environment Variables

Every deployment gets these injected automatically:

```
LUCID_API_KEY=lk_<scoped_agent_key>
AGENT_PASSPORT_ID=agnt_abc123
TRUSTGATE_URL=https://api.lucid.run
MCPGATE_URL=https://mcp.lucid.run
LUCID_L2_URL=https://l2.lucid.run
PORT=3100
NODE_ENV=production
```

User env vars merge on top (user wins on conflict).

---

## Implementation Phases

### Phase A: Image Build Pipeline (Week 1)
- `ImageBuilder` interface + `LocalDockerBuilder` implementation
- Dockerfile template generation from RuntimeArtifact
- GHCR push with `GHCR_TOKEN` auth
- Integrate into DockerDeployer

### Phase B: Railway + Nosana (Week 2)
- Railway: Docker image source in `serviceCreate`, domain generation, status polling
- Nosana: New `NosanaDeployer` using `@nosana/kit`, `INFINITE` strategy
- Update factory to 6 deployers
- Integration tests with mock fetch

### Phase C: Phala + io.net (Week 3)
- Phala: Rewrite using `@phala/cloud`, two-phase CVM, encrypted env vars
- io.net: Rewrite using actual CaaS API, hardware discovery, real logs
- Both: real status, logs, terminate

### Phase D: Akash (Week 4)
- Akash Console Managed Wallet API (or raw Cosmos tx with `@akashnetwork/akash-api`)
- SDL generation + deployment + auto-bid acceptance

### Phase E: SDK + Health Monitor (Week 5)
- `agent.deploy()` in `@lucid/agent-sdk`
- MCPGate `/v1/agents/:id/deploy` endpoint
- `agentHealthMonitor` job (5-min interval)
- Auto-extend io.net/Nosana durations before expiry
- Persist to `agent_deployments` table

### Phase F: DX Polish (Week 6)
- `lucid deploy` CLI command
- Deploy dashboard in frontend
- Provider recommendation wizard (auto-select based on GPU/cost)
- Cost estimation before deploy
- Deployment log streaming

---

## New Dependencies

```
@phala/cloud          ^0.2.x    (Phala SDK)
@nosana/kit           ^2.1.x    (Nosana SDK)
```

Akash and io.net use raw HTTP (no SDK dependency needed). Only installed in `@lucid-l2/engine`.

---

## Competitive Edge

| Feature | Competitors | Lucid |
|---------|-----------|-------|
| Deploy targets | 1-2 providers | 6 (Docker, Railway, Akash, Phala, io.net, Nosana) |
| GPU access | Centralized only | DePIN (Akash, io.net, Nosana) + TEE (Phala) + PaaS (Railway) |
| One-click | CLI-heavy | `agent.deploy({ target: 'nosana' })` — one line |
| Verifiability | None | Every deploy receipted, MMR-provable, Solana-anchored |
| TEE | None | Phala with hardware attestation |
| Encrypted secrets | Plaintext | Phala encrypts env vars client-side before commit |
| Cost transparency | Opaque | Pre-deploy cost estimation |
| Image build | Manual | Auto-build from agent code |
| Health monitoring | Manual | Auto-health, auto-extend, auto-restart |
| Solana alignment | None | Nosana is native Solana GPU compute |
