# DePIN Storage + NFT + Fractional Ownership Design

**Date:** 2026-02-26
**Status:** Implemented (Phases 1-4)

---

## Problem

Lucid-L2 has a fake IPFS implementation (`ipfsStorage.ts`) that stores files locally with generated `Qm...` CIDs. Nothing reaches real decentralized storage. Passport metadata lives in a local JSON file. There's no NFT layer for discoverability or trading, and no mechanism for fractional ownership or revenue sharing.

## Goals

1. Replace fake IPFS with real decentralized storage (Arweave + Lighthouse)
2. Mint Metaplex Core NFTs for all 5 asset types (Model, Compute, Tool, Agent, Dataset)
3. Enable fractional ownership via SPL Token-2022 share tokens with revenue distribution
4. Keep `lucid_passports` Anchor program as authoritative registry

---

## Architecture

### Storage Layers

| Layer | Tech | Data | Mutability | Cost |
|-------|------|------|------------|------|
| **Hot** | API + PassportStore (in-memory) | Live trust metrics, current pricing, endpoints, availability | Read/write, ephemeral | Free |
| **Permanent** | Arweave via Umi/Irys | NFT metadata JSON, attestation hashes, epoch proofs | Immutable | ~$0.00004 / 5KB |
| **Evolving** | Lighthouse (Filecoin+IPFS) | Agent memory cold lane, periodic trust snapshots | Mutable (new CIDs) | ~$0.001 / GB / mo |
| **On-chain** | Solana PDAs | Passport registry, payment gates, share configs, epoch roots | Write costs SOL | ~0.003 SOL / account |

### What Goes Where

**Hot lane (API)** — platform-computed, changes frequently:
- `trust_score`, `uptime_30d`, `p95_latency_ms`, `total_inferences`
- Current pricing (provider updates via API)
- Endpoint availability, heartbeat status
- Served via `GET /v1/models`, `GET /v1/passports/:id`

**Arweave (permanent)** — provider-declared at registration, immutable snapshot:
- NFT metadata JSON (name, description, image, attributes)
- ModelMeta / ComputeMeta / ToolMeta / AgentMeta (specs, capabilities, modality)
- Attestation certificate content
- Epoch MMR root proofs

**Lighthouse (evolving)** — changes over time:
- Agent memory vectors (cold lane archive)
- Periodic trust score snapshots (audit trail)
- Large dataset manifests

**On-chain PDA** — authoritative state:
- Passport: owner, asset_type, slug, version, content_cid, metadata_cid, status, policy_flags
- PaymentGate: vault, price, revenue, access count
- Attestation: type, hash, authority
- Share tokens: standard SPL mints (no custom PDA — revenue via off-chain airdrop)

### Dual Registration Flow

```
1. Provider submits passport metadata via API
2. Upload metadata JSON → Arweave (Umi/Irys) → arweave URI
3. register_passport() on lucid_passports → Passport PDA
4. Mint Metaplex Core NFT (same owner, URI = arweave link)
   - Attributes plugin: asset_type, provider, category, format
   - Royalties plugin: creator fees on secondary sale
5. (Optional) Create Share Token mint + RevenueVault PDA
```

---

## Phase 1: DePIN Storage

Replace `offchain/src/utils/ipfsStorage.ts` with a real storage interface.

### Interface

```typescript
interface DepinStorage {
  uploadJSON(data: object): Promise<{ uri: string; hash: string }>;
  uploadFile(buffer: Buffer, contentType: string): Promise<{ uri: string; hash: string }>;
  resolve(uri: string): Promise<Buffer>;
}
```

### Implementations

**ArweaveStorage** (via `@metaplex-foundation/umi-uploader-irys`)
- Pays with SOL from platform wallet
- Returns `https://arweave.net/{txId}` URIs
- Used for: NFT metadata, passport metadata snapshots, attestation proofs, epoch roots

**LighthouseStorage** (via `@lighthouse-web3/sdk`)
- Pays via Lighthouse API key (Filecoin deal endowment)
- Returns `ipfs://{cid}` URIs (pinned via IPFS + Filecoin)
- Used for: agent memory cold lane, large files, evolving data

**MockStorage** (replaces current fake ipfsStorage.ts)
- Local file storage with real SHA-256 CIDs
- Used for: development, testing

### Wiring

1. `passportSyncService.ts` — before `register_passport()`, upload metadata to Arweave, set `metadata_cid`
2. `mmrService.ts` — at epoch finalization, upload proof to Arweave, set CID in `commit_epoch`
3. Environment: `DEPIN_STORAGE=arweave|lighthouse|mock` (default: mock for dev)

---

## Phase 2: Metaplex Core NFT Mirror

Mint a Core NFT for every registered passport. This gives us:
- Wallet visibility (Phantom, Backpack show Core NFTs)
- Marketplace listing (Tensor, Magic Eden support Core)
- DAS API search without custom indexer

### 5 Collections

| Collection | Asset Types |
|------------|-------------|
| `lucid-models` | Model passports |
| `lucid-compute` | Compute node passports |
| `lucid-tools` | Tool passports |
| `lucid-agents` | Agent passports |
| `lucid-datasets` | Dataset passports |

### NFT Structure

```typescript
// Core NFT creation (via Umi)
{
  name: passport.name,
  uri: arweaveMetadataUri,  // from Phase 1
  collection: collectionAddress,  // per asset type
  plugins: [
    // Attributes — DAS-searchable
    {
      type: 'Attributes',
      attributeList: [
        { key: 'asset_type', value: 'model' },
        { key: 'provider', value: 'openai' },
        { key: 'category', value: 'coding' },
        { key: 'format', value: 'api' },
        { key: 'passport_pda', value: passportPDA.toBase58() },
      ]
    },
    // Royalties — enforce on secondary sales
    {
      type: 'Royalties',
      basisPoints: 500,  // 5%
      creators: [{ address: protocolWallet, percentage: 100 }]
    }
  ]
}
```

### DAS API Usage

```typescript
// Search all model passports by a provider
const assets = await dasApi.searchAssets({
  grouping: ['collection', modelCollectionAddress],
  // Client-side filter by attribute (DAS doesn't support attribute filtering directly)
});
```

---

## Phase 3: Fractional Ownership (Share Tokens)

Two sub-phases: token launch (Metaplex Genesis) + revenue distribution (custom).

### Phase 3a: Token Launch via Metaplex Genesis

Genesis is Metaplex's on-chain TGE (Token Generation Event) platform. It handles the entire token sale flow — no custom sale code needed.

**Why Genesis (not custom sale):**
- Fair price discovery (Launch Pool) or fixed price (Presale) — built-in
- Escrow: total supply minted to Genesis account, distributed after deposit window
- Proportional distribution: `userTokens = (userDeposit / totalDeposits) * totalSupply`
- 2% protocol fee on deposits (Metaplex's fee, not ours)
- Revoke mint/freeze authority post-launch (signals fixed supply)
- On-chain program: `GENSkbxvLc7iBQvEAJv3Y5wVMHGD3RjfCNwWgU8Tqgkc`

**Launch Flow:**
```
1. Create share token via Metaplex Create Token (name, symbol, URI, decimals)
   - URI points to Arweave metadata (from Phase 1)
   - Metadata includes: passport_pda, asset_type, revenue_split terms

2. Initialize Genesis Launch Pool:
   - Mint total supply to Genesis escrow (e.g., 10,000 shares)
   - Configure deposit window (e.g., 7 days)
   - Configure claim window (e.g., 30 days)
   - Set outflow bucket: Unlocked (treasury → passport owner)

3. Deposit Period:
   - Buyers deposit SOL during window
   - Price discovered at close: totalSOL / totalShares

4. Claim Period:
   - Buyers claim share tokens proportionally
   - Owner claims raised SOL from treasury bucket

5. Post-Launch:
   - Revoke mint authority (no more shares can be created)
   - Share tokens are standard SPL — tradeable on any DEX/marketplace
```

**Alternative: Genesis Presale** for known valuations (fixed price, first-come-first-served).

### Phase 3b: Revenue Distribution (Off-Chain Airdrop)

Genesis is one-time (TGE). Ongoing revenue sharing uses an off-chain airdrop job — **no custom Anchor program needed**. A token IS a share. Buy the token = own a share.

**Key insight:** Custom on-chain revenue vaults are over-engineered. Standard SPL tokens already track holder balances. We just snapshot holders and airdrop proportionally.

#### Revenue Airdrop Flow

```
1. Admin triggers airdrop (POST /v1/passports/:id/token/airdrop)
   OR cron job runs periodically (REVENUE_AIRDROP_INTERVAL)
2. Get all token holders via getTokenLargestAccounts(mintPubkey)
3. Filter zero-balance accounts
4. Calculate proportional share: (holderBalance / totalBalance) * amountLamports
5. Resolve token accounts → wallet owners via getAccount()
6. Batch SOL transfers (max 20 per tx) via SystemProgram.transfer()
7. Log distribution receipt
```

#### Implementation

```typescript
// offchain/src/jobs/revenueAirdrop.ts
export async function runRevenueAirdrop(
  passportId: string,
  tokenMint: string,
  amountLamports: number,
): Promise<AirdropResult>;
```

- **No custom Anchor program** — uses standard Solana RPC + SPL token queries
- **Batched transfers** — max 20 per transaction to stay within Solana limits
- **Idempotent** — can re-run safely (transfers are one-way SOL sends)

### What Genesis Replaces (No Custom Code Needed)

| Concern | Before (fully custom) | After (Genesis + Airdrop) |
|---------|----------------------|--------------------------|
| Token creation | Custom mint instruction | Metaplex Create Token / DirectMintLauncher |
| Token sale | Custom sale escrow | Genesis Launch Pool / Presale |
| Price discovery | Build AMM or fixed price | Genesis Launch Pool (proportional) |
| Revenue distribution | Custom RevenueVault PDA | Off-chain airdrop (snapshot + batch transfer) |
| Escrow | Custom escrow PDA | Genesis Account (built-in) |
| Authority revoke | Custom instruction | Genesis revokeMintAuthority |

### Token Launcher Providers (Swappable)

| Provider | Env Value | Use Case |
|----------|-----------|----------|
| `DirectMintLauncher` | `direct-mint` | Create SPL Token-2022, mint total supply to owner |
| `GenesisLauncher` | `genesis` | Metaplex Genesis TGE (Launch Pool / Presale) |
| `MockTokenLauncher` | `mock` | Dev/test (in-memory) |

Switch via `TOKEN_LAUNCHER=direct-mint|genesis|mock` env var.

### SPL Token-2022 Features (Optional Enhancements)

- **Transfer Fee Extension**: Protocol fee on share transfers (secondary market)
- **Metadata Extension**: Embed passport info directly in token mint
- **Permanent Delegate**: Protocol can freeze shares if needed (compliance)

---

## Phase 4: Compressed NFTs (Bubblegum v2)

For high-volume items where Core NFT cost (~0.003 SOL) is too expensive:

| Item | Volume | Use Bubblegum? |
|------|--------|----------------|
| Attestation certificates | 100s per model | Yes |
| Access receipts | 1000s per day | Yes |
| Passports (5 types) | 10s-100s | No, use Core |

Cost: ~0.00001 SOL per compressed NFT (300x cheaper than Core).

Compressed NFTs are still DAS-indexed and visible in wallets.

---

## Phase 5: Advanced Features

- **Freeze Delegate**: Lock passport NFT during staking periods
- **Burn Delegate**: Allow protocol to burn revoked passports
- **Update Delegate**: Protocol can update metadata URI when passport is updated
- **DAS-powered marketplace**: Search/filter passports by attributes without custom indexer

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@metaplex-foundation/umi` | latest | Client framework |
| `@metaplex-foundation/umi-bundle-defaults` | latest | Default plugins |
| `@metaplex-foundation/mpl-core` | latest | Core NFT creation |
| `@metaplex-foundation/umi-uploader-irys` | latest | Arweave uploads |
| `@metaplex-foundation/mpl-bubblegum` | latest | Compressed NFTs (Phase 4) |
| `@lighthouse-web3/sdk` | latest | Filecoin+IPFS uploads |
| `@solana/spl-token` | latest | Token-2022 operations |

---

## Implementation Priority

1. **Phase 1** — DePIN Storage (unblocks everything else)
2. **Phase 2** — Core NFT Mirror (discoverability, wallet integration)
3. **Phase 3** — Share Tokens (fractional ownership, revenue sharing)
4. **Phase 4** — Bubblegum v2 (attestation certs, access receipts)
5. **Phase 5** — Advanced plugins (staking, delegation, marketplace)

---

## What NOT to Change

- `lucid_passports` Anchor program — keep as-is, it's the authoritative registry
- PassportStore (in-memory) — still serves hot lane API queries
- Trust metrics — stay in hot lane, never on Arweave or on-chain
- Schema files (ModelMeta, ComputeMeta, ToolMeta, AgentMeta) — provider-declared data only
