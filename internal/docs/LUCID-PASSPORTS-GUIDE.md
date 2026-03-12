# Lucid Passports - Complete Implementation Guide

> **On-chain registry and licensing system for AI models and datasets**

[![Status](https://img.shields.io/badge/Status-Production%20Ready-green)]()
[![Solana](https://img.shields.io/badge/Solana-Anchor%200.29-blue)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)]()

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [API Endpoints](#api-endpoints)
- [Usage Examples](#usage-examples)
- [Development](#development)
- [Deployment](#deployment)

---

## 🎯 Overview

Lucid Passports is a blockchain-based registry system for AI assets (models, datasets, tools, agents) that provides:

- **PDA-based Registry**: Deterministic on-chain storage of asset metadata
- **Content Addressing**: IPFS/Arweave integration for immutable content storage
- **Version Tracking**: Full version history with cryptographic linking
- **Licensing**: SPDX-compliant licenses with policy flags
- **Attestations**: Support for training logs, eval reports, safety audits
- **HuggingFace Integration**: Automatic sync from HuggingFace via llm_proxy

### Key Features

✅ **Deterministic PDAs** - Reproducible addresses for any asset  
✅ **Immutable Snapshots** - Content-addressed storage with SHA256 verification  
✅ **Version History** - Track evolution with `previous_version` links  
✅ **Flexible Licensing** - Policy flags for commercial use, derivatives, etc.  
✅ **Attestation System** - Add verifiable claims (training logs, audits)  
✅ **HuggingFace Bridge** - Auto-sync models/datasets from HF  

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  llm_proxy (Python)                     │
│              HuggingFace Data Provider                  │
│           http://localhost:8000/models                  │
└──────────────────┬──────────────────────────────────────┘
                   │ HTTP API
                   ▼
┌─────────────────────────────────────────────────────────┐
│            Lucid Passports (TypeScript)                 │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐  │
│  │ Solana Program (Rust/Anchor)                      │  │
│  │  • Passport PDA accounts                          │  │
│  │  • Version linking                                │  │
│  │  • Attestations                                   │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Services (TypeScript)                             │  │
│  │  • passportService (PDA operations)               │  │
│  │  • contentService (IPFS/hashing)                  │  │
│  │  • hfBridgeService (HF integration)               │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ API Endpoints                                     │  │
│  │  • POST /passports/register                       │  │
│  │  • POST /passports/sync-hf-models                 │  │
│  │  • GET /passports/search                          │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. Solana Program (`programs/lucid-passports/`)
- **Passport Account**: Stores asset metadata (slug, version, CIDs, license, policy flags)
- **VersionLink Account**: Links current version to previous version
- **Attestation Account**: Stores verifiable claims about the asset

#### 2. TypeScript Services (`offchain/src/services/`)
- **passportService.ts**: PDA derivation, registration, queries
- **contentService.ts**: IPFS uploads, content hashing, manifest generation
- **hfBridgeService.ts**: Fetches data from llm_proxy and registers passports

#### 3. API Layer (`offchain/src/services/api.ts`)
- RESTful endpoints for passport management
- HuggingFace sync endpoints
- Search and query capabilities

---

## 🚀 Getting Started

### Prerequisites

```bash
# 1. Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.17.15/install)"

# 2. Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked

# 3. Node.js 18+
node --version  # Should be v18+

# 4. IPFS (optional, for content storage)
ipfs daemon  # Or use Infura/Pinata
```

### Installation

```bash
# 1. Navigate to Lucid project
cd Lucid-L2-main

# 2. Install dependencies
cd offchain && npm install
cd ../programs/lucid-passports && cargo build

# 3. Start Solana test validator
solana-test-validator --reset --quiet &

# 4. Deploy passport program
cd programs/lucid-passports
anchor build
anchor deploy --provider.cluster localnet

# 5. Update program ID in config
# Copy the deployed program ID to offchain/src/utils/config.ts

# 6. Start llm_proxy (in separate terminal)
cd ../../llm_proxy
uvicorn main:app --reload --port 8000

# 7. Start Lucid API
cd ../Lucid-L2-main/offchain
npm start
```

### Verification

```bash
# Test API is running
curl http://localhost:3001/system/status

# Test llm_proxy connection
curl http://localhost:8000/models?limit=1
```

---

## 📡 API Endpoints

### Passport Management

#### Register Passport
```http
POST /passports/register
Content-Type: application/json

{
  "assetType": 0,  # 0=Model, 1=Dataset, 2=Tool, 3=Agent, 4=Voice, 5=Other
  "slug": "mistral-7b-instruct",
  "version": { "major": 0, "minor": 2, "patch": 0 },
  "contentCid": "Qm...",
  "metadataCid": "Qm...",
  "licenseCode": "Apache-2.0",
  "policyFlags": 7  # COMMERCIAL | DERIVATIVES | ATTRIBUTION
}
```

**Response:**
```json
{
  "success": true,
  "passport": "ABC123...xyz",
  "signature": "5KPx...",
  "message": "Passport registered for mistral-7b-instruct v0.2.0"
}
```

#### Get Passport
```http
GET /passports/:passportId
```

**Response:**
```json
{
  "success": true,
  "passport": {
    "address": "ABC123...xyz",
    "owner": "DEF456...uvw",
    "assetType": 0,
    "slug": "mistral-7b-instruct",
    "version": { "major": 0, "minor": 2, "patch": 0 },
    "contentCid": "Qm...",
    "metadataCid": "Qm...",
    "licenseCode": "Apache-2.0",
    "status": 0,
    "createdAt": "1704067200",
    "updatedAt": "1704067200"
  }
}
```

#### Get Passports by Owner
```http
GET /passports/owner/:ownerPublicKey
```

#### Search Passports
```http
GET /passports/search?type=0
```
- `type`: 0=Model, 1=Dataset, etc.

### HuggingFace Integration

#### Sync Models
```http
POST /passports/sync-hf-models
Content-Type: application/json

{
  "limit": 5,
  "llmProxyUrl": "http://localhost:8000"  # Optional
}
```

**Response:**
```json
{
  "success": true,
  "synced": 5,
  "total": 5,
  "models": [
    {
      "name": "gpt2",
      "passport": "ABC...",
      "tx": "5KPx..."
    }
  ],
  "message": "Successfully synced 5 models to blockchain"
}
```

#### Sync Datasets
```http
POST /passports/sync-hf-datasets
Content-Type: application/json

{
  "limit": 5,
  "llmProxyUrl": "http://localhost:8000"  # Optional
}
```

---

## 💡 Usage Examples

### Example 1: Register a Model Manually

```bash
curl -X POST http://localhost:3001/passports/register \
  -H "Content-Type: application/json" \
  -d '{
    "assetType": 0,
    "slug": "my-custom-model",
    "version": { "major": 1, "minor": 0, "patch": 0 },
    "contentCid": "QmExampleCID123",
    "metadataCid": "QmExampleMeta456",
    "licenseCode": "MIT",
    "policyFlags": 7
  }'
```

### Example 2: Sync HuggingFace Models

```bash
# Sync 10 models from HuggingFace
curl -X POST http://localhost:3001/passports/sync-hf-models \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

### Example 3: Search for Datasets

```bash
# Get all dataset passports (type=1)
curl "http://localhost:3001/passports/search?type=1"
```

### Example 4: Programmatic Usage (TypeScript)

```typescript
import { getPassportService, AssetType } from './services/passportService';
import { getContentService } from './services/contentService';

const passportService = getPassportService();
const contentService = getContentService();

// Create manifest and metadata
const manifest = contentService.generateManifest(
  'model',
  'my-model',
  '1.0.0',
  [],
  [{ type: 'huggingface', repo: 'my-org/my-model' }]
);

const metadata = contentService.generateModelMeta({
  arch: 'transformer',
  params: 7000000000,
  dtype: 'fp16',
  tokenizer: 'sentencepiece',
  license: { spdx: 'Apache-2.0' }
});

// Upload to IPFS
const { manifestCid, metadataCid, treeHash } = 
  await contentService.uploadSnapshotData(manifest, metadata);

// Register passport
const result = await passportService.registerPassport({
  assetType: AssetType.Model,
  slug: 'my-model',
  version: { major: 1, minor: 0, patch: 0 },
  contentCid: manifestCid,
  contentHash: contentService.computeContentHash(treeHash),
  metadataCid,
  licenseCode: 'Apache-2.0',
  policyFlags: 7
});

console.log('Passport PDA:', result.passportPDA.toBase58());
console.log('Transaction:', result.signature);
```

---

## 🔧 Development

### Project Structure

```
Lucid-L2-main/
├── programs/lucid-passports/          # Solana program (Rust)
│   ├── src/lib.rs                     # Program instructions & accounts
│   └── Cargo.toml                     # Rust dependencies
├── offchain/src/services/             # TypeScript services
│   ├── passportService.ts             # PDA operations
│   ├── contentService.ts              # IPFS & hashing
│   ├── hfBridgeService.ts             # HuggingFace bridge
│   └── api.ts                         # API endpoints
└── LUCID-PASSPORTS-GUIDE.md          # This file
```

### Adding New Features

#### Add a New Asset Type

1. **Update Solana Program:**
```rust
// programs/lucid-passports/src/lib.rs
pub enum AssetType {
    Model,
    Dataset,
    Tool,
    Agent,
    Voice,
    NewType,  // Add here
    Other,
}
```

2. **Update TypeScript Enum:**
```typescript
// offchain/src/services/passportService.ts
export enum AssetType {
    Model = 0,
    Dataset = 1,
    Tool = 2,
    Agent = 3,
    Voice = 4,
    NewType = 5,  // Add here
    Other = 6,
}
```

3. **Rebuild and redeploy program**

### Testing

```bash
# Build program
cd programs/lucid-passports
anchor build

# Run tests
anchor test

# Test API endpoints
cd ../../offchain
npm test
```

---

## 🚀 Deployment

### Devnet Deployment

```bash
# 1. Configure for devnet
solana config set --url devnet

# 2. Fund your wallet
solana airdrop 2

# 3. Deploy program
cd programs/lucid-passports
anchor build
anchor deploy --provider.cluster devnet

# 4. Update program ID
# Copy program ID to offchain/src/utils/config.ts

# 5. Start API (pointing to devnet)
cd ../../offchain
export SOLANA_NETWORK=devnet
npm start
```

### Mainnet Deployment

```bash
# 1. Configure for mainnet
solana config set --url mainnet-beta

# 2. Ensure wallet is funded
solana balance

# 3. Build optimized program
cd programs/lucid-passports
anchor build --verifiable

# 4. Deploy
anchor deploy --provider.cluster mainnet-beta

# 5. Update config for production
# Edit offchain/src/utils/config.ts
# Set SOLANA_NETWORK=mainnet in environment

# 6. Start production API
cd ../../offchain
NODE_ENV=production npm start
```

---

## 📊 Data Models

### Passport PDA

```rust
pub struct Passport {
    pub owner: Pubkey,              // Asset owner
    pub asset_type: AssetType,      // Model, Dataset, etc.
    pub slug: String,               // URL-friendly identifier
    pub version: Version,           // Semantic version (major.minor.patch)
    pub content_cid: String,        // IPFS CID of content manifest
    pub content_hash: [u8; 32],     // SHA256 hash for verification
    pub metadata_cid: String,       // IPFS CID of metadata JSON
    pub license_code: String,       // SPDX license identifier
    pub policy_flags: u16,          // Bitfield for usage policies
    pub status: PassportStatus,     // Active, Deprecated, etc.
    pub created_at: i64,            // Unix timestamp
    pub updated_at: i64,            // Unix timestamp
    pub bump: u8,                   // PDA bump seed
}
```

### Policy Flags

```typescript
POLICY_ALLOW_COMMERCIAL    = 1 << 0  // 0x0001
POLICY_ALLOW_DERIVATIVES   = 1 << 1  // 0x0002
POLICY_ALLOW_FINETUNE      = 1 << 2  // 0x0004
POLICY_REQUIRE_ATTRIBUTION = 1 << 3  // 0x0008
POLICY_SHARE_ALIKE         = 1 << 4  // 0x0010
```

**Example:** Apache-2.0 = `0x000F` (COMMERCIAL | DERIVATIVES | FINETUNE | ATTRIBUTION)

---

## 🐛 Troubleshooting

### Common Issues

**1. "IPFS not available"**
```bash
# Start local IPFS node
ipfs daemon

# Or set IPFS_URL environment variable
export IPFS_URL=https://ipfs.infura.io:5001
```

**2. "Program not found"**
```bash
# Redeploy program
cd programs/lucid-passports
anchor build
anchor deploy

# Update program ID in config
```

**3. "llm_proxy connection failed"**
```bash
# Ensure llm_proxy is running
cd llm_proxy
uvicorn main:app --reload --port 8000
```

**4. "Transaction failed"**
```bash
# Check wallet balance
solana balance

# Check program logs
solana logs -u devnet
```

---

## 📚 Additional Resources

- [Lucid L2 Main Documentation](./README.md)
- [Solana Anchor Documentation](https://www.anchor-lang.com/)
- [IPFS Documentation](https://docs.ipfs.io/)
- [SPDX License List](https://spdx.org/licenses/)

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/passport-enhancement`)
3. Make changes
4. Test thoroughly
5. Submit pull request

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

**Built with ❤️ for the decentralized AI ecosystem**
