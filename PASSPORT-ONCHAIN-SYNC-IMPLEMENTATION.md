# Passport On-Chain Sync Implementation

## Summary

Successfully implemented full on-chain passport sync for LucidLayer. Passports can now be registered and tracked on the Solana blockchain via the `lucid-passports` program.

## Deployed Program

- **Program ID**: `38yaXUezrbLyLDnAQ5jqFXPiFurr8qhw19gYnE6H9VsW`
- **Network**: Devnet
- **Deploy Transaction**: `2Z2b4msHo7DWb7w4uG3qrZUMRa8xCnrUA5kdWbfaWr4xedk195uksxS11kZSRXNYuDbdfDzadfZ8BQumKvtaHzwP`
- **Anchor Version**: 0.31.1

## Files Created/Modified

### New Files
- `offchain/src/services/passportSyncService.ts` - On-chain sync handler implementation
- `offchain/target/idl/lucid_passports.json` - Program IDL for Anchor client

### Modified Files
- `programs/lucid-passports/Cargo.toml` - Added `idl-build` feature
- `programs/lucid-passports/src/lib.rs` - Updated program ID, fixed attestation instruction
- `Anchor.toml` - Updated program ID for localnet and devnet
- `offchain/src/index.ts` - Wire up PassportSyncService at startup

## On-Chain Program Features

### Instructions

1. **register_passport** - Register a new AI asset passport
   - Parameters: asset_type, slug, version, content_cid, content_hash, metadata_cid, license_code, policy_flags
   - Creates PDA: `["passport", owner, asset_type, slug, version_bytes]`

2. **update_passport** - Update passport metadata or status
   - Parameters: metadata_cid (optional), status (optional)
   - Requires owner signature

3. **link_version** - Create version chain between passports
   - Links current passport to previous version
   - Creates PDA: `["version_link", current_passport]`

4. **add_attestation** - Add training logs, eval reports, etc.
   - Parameters: attestation_type, attestation_id, content_cid, description
   - Creates PDA: `["attestation", passport, attester, attestation_id]`

### Supported Asset Types
- Model (0)
- Dataset (1)
- Tool (2)
- Agent (3)
- Voice (4)
- Other (5)

### Passport Status
- Active
- Deprecated
- Superseded
- Revoked

### Policy Flags (Bitfield)
- `POLICY_ALLOW_COMMERCIAL` (1 << 0)
- `POLICY_ALLOW_DERIVATIVES` (1 << 1)
- `POLICY_ALLOW_FINETUNE` (1 << 2)
- `POLICY_REQUIRE_ATTRIBUTION` (1 << 3)
- `POLICY_SHARE_ALIKE` (1 << 4)

## PassportSyncService

The `PassportSyncService` implements the `OnChainSyncHandler` interface:

```typescript
interface OnChainSyncHandler {
  syncToChain(passport: Passport): Promise<{ pda: string; tx: string } | null>;
}
```

### Features
- Automatic PDA derivation based on passport metadata
- Creates new passports on-chain or updates existing ones
- Batch sync support
- Health check endpoint
- Graceful error handling for "already in use" scenarios

### Configuration

Environment variables:
- `PASSPORT_PROGRAM_ID` - Override program ID (default: devnet deployment)
- `PASSPORT_SYNC_ENABLED` - Set to "false" to disable sync (default: enabled)
- `RPC_URL` - Solana RPC endpoint (default: devnet)
- `SOLANA_KEYPAIR` - JSON array keypair for signing (fallback if solana config not available)

## Usage

### Automatic Sync
When a passport is created or updated via the PassportManager, it automatically syncs to chain if:
- `PASSPORT_SYNC_ENABLED` is not "false"
- PassportSyncService initialized successfully
- Solana keypair is available

### Manual Sync
```typescript
import { getPassportManager } from './services/passportManager';

// Sync a specific passport
const result = await getPassportManager().syncToChain(passportId);
// Returns: { pda: "...", tx: "..." } or error

// Get pending sync passports
const pending = await getPassportManager().getPendingSync();
```

### Direct Service Access
```typescript
import { getPassportSyncService } from './services/passportSyncService';

const syncService = getPassportSyncService();
await syncService.init();

// Check if passport exists on-chain
const exists = await syncService.passportExistsOnChain(passport);

// Get on-chain passport data
const onChainData = await syncService.getOnChainPassport(pdaAddress);

// Batch sync
const results = await syncService.syncBatch(passports);
```

## Testing

### Verify Program Deployment
```bash
solana program show 38yaXUezrbLyLDnAQ5jqFXPiFurr8qhw19gYnE6H9VsW
```

### Test Script
```bash
# Run the test script
./test-passport-sync.sh
```

### Manual API Test
```bash
# Create a passport (will auto-sync to chain)
curl -X POST http://localhost:3000/api/v1/passports \
  -H "Content-Type: application/json" \
  -d '{
    "type": "model",
    "owner": "YOUR_WALLET_ADDRESS",
    "name": "test-model",
    "version": "1.0.0",
    "metadata": {
      "slug": "test-model-v1",
      "license": "Apache-2.0",
      "allow_commercial": true
    }
  }'

# Response will include on_chain_pda and on_chain_tx if sync succeeded
```

## Explorer Links

- **Program**: https://explorer.solana.com/address/38yaXUezrbLyLDnAQ5jqFXPiFurr8qhw19gYnE6H9VsW?cluster=devnet
- **Deploy TX**: https://explorer.solana.com/tx/2Z2b4msHo7DWb7w4uG3qrZUMRa8xCnrUA5kdWbfaWr4xedk195uksxS11kZSRXNYuDbdfDzadfZ8BQumKvtaHzwP?cluster=devnet

## Next Steps

1. **Mainnet Deployment**: Deploy program to mainnet when ready
2. **IDL Upload**: Upload IDL to Anchor registry for easier client access
3. **Indexer**: Set up indexer to track all passport events
4. **Frontend Integration**: Update frontend to show on-chain status
