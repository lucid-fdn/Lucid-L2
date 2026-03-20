# Privy Wallet Integration

Privy protocol adapter for embedded wallets with Session Signers (Delegated Actions), enabling autonomous workflow execution while maintaining self-custodial wallet architecture.

## Architecture

```
Workflows → Backend API → Privy Adapter → Session Signer Service
                                ↓
                          Privy REST API
                                ↓
                        User Embedded Wallets
```

## Features

- Self-custodial user wallets (Privy embedded wallets)
- Autonomous server-side transaction signing via Session Signers
- Policy-based transaction controls (TTL, amount limits, allowlists)
- Full Solana and EVM support
- Audit logging + secure credential management

### Operations

**User & Wallet:** `createUser`, `getWallet`
**Session Signers:** `addSessionSigner`, `revokeSessionSigner`, `listSessionSigners`
**Solana:** `signSolanaTransaction`, `signAndSendSolanaTransaction`
**Ethereum:** `signEthereumTransaction`, `sendEthereumTransaction`

## Configuration

```bash
PRIVY_APP_ID=your_app_id
PRIVY_APP_SECRET=your_app_secret
PRIVY_AUTH_PRIVATE_KEY=path/to/private-key.pem
PRIVY_KEY_QUORUM_ID=your_quorum_id
PRIVY_API_BASE_URL=https://api.privy.io/v1
PRIVY_SIGNER_ENCRYPTION_KEY=64_hex_character_key  # openssl rand -hex 32
```

### Generate Auth Keys

```bash
openssl ecparam -name prime256v1 -genkey -noout -out privy-auth-private.pem
openssl ec -in privy-auth-private.pem -pubout -out privy-auth-public.pem
# Register public key in Privy Dashboard
```

## Policy Templates

| Level | TTL | Max/tx | Daily | Programs | Quorum |
|-------|-----|--------|-------|----------|--------|
| Conservative | 24h | 1 SOL | 5 SOL | Allowlist | No |
| Moderate | 7d | 10 SOL | 50 SOL | All | No |
| High-Value | 1h | 100 SOL | 500 SOL | All | Yes (2/2) |

## Security

- Session signer keys encrypted at rest (AES-256-CBC)
- All transactions logged to `signer_audit_log`
- Policy violations tracked with denial reasons
- Auto-expiry via TTL, daily limit reset at midnight UTC

## Database Tables

- `user_wallets` — user wallet info (address, chain_type, privy IDs)
- `session_signers` — signer details, policies, usage tracking
- `signer_audit_log` — transaction audit trail with n8n metadata

## Code Location

- Adapter: `offchain/packages/contrib/protocols/privy/`
- Session Signer Service: `offchain/packages/gateway-lite/src/services/sessionSignerService.ts`
- Routes: `offchain/packages/gateway-lite/src/routes/system/walletRoutes.ts`
