# Privy Protocol Adapter

A Protocol SDK adapter for Privy embedded wallets with Session Signers (Delegated Actions) support, enabling autonomous n8n workflow execution while maintaining self-custodial wallet architecture.

## Overview

This adapter provides:
- ✅ Self-custodial user wallets (Privy embedded wallets)
- ✅ Autonomous server-side transaction signing via Session Signers
- ✅ Policy-based transaction controls (TTL, amount limits, allowlists)
- ✅ Full Solana and EVM support
- ✅ Comprehensive audit logging
- ✅ Secure credential management with encryption

## Architecture

```
n8n Workflows → Backend API → Privy Adapter → Session Signer Service
                                    ↓
                              Privy REST API
                                    ↓
                            User Embedded Wallets
```

## Features

### User & Wallet Management
- `createUser` - Create new Privy user with embedded wallet
- `getWallet` - Retrieve wallet details for a user

### Session Signer Management
- `addSessionSigner` - Grant server permission to sign transactions
- `revokeSessionSigner` - Remove signing permissions
- `listSessionSigners` - Get all active session signers

### Transaction Operations
**Solana:**
- `signSolanaTransaction` - Sign transaction offline
- `signAndSendSolanaTransaction` - Sign and broadcast to network

**Ethereum:**
- `signEthereumTransaction` - Sign transaction offline
- `sendEthereumTransaction` - Sign and broadcast to network

## Configuration

### Environment Variables

```bash
# Privy Credentials
PRIVY_APP_ID=your_app_id
PRIVY_APP_SECRET=your_app_secret
PRIVY_AUTH_PRIVATE_KEY=path/to/private-key.pem
PRIVY_KEY_QUORUM_ID=your_quorum_id
PRIVY_API_BASE_URL=https://api.privy.io/v1

# Encryption
PRIVY_SIGNER_ENCRYPTION_KEY=64_hex_character_key

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
```

### Generate Encryption Key

```bash
openssl rand -hex 32
```

### Generate Authorization Keys

```bash
# Generate private key
openssl ecparam -name prime256v1 -genkey -noout -out privy-auth-private.pem

# Extract public key
openssl ec -in privy-auth-private.pem -pubout -out privy-auth-public.pem

# Register public key in Privy Dashboard
cat privy-auth-public.pem
```

## Usage Examples

### 1. Create User and Wallet

```typescript
const result = await protocolManager.execute({
  protocolId: 'privy',
  operationId: 'createUser',
  parameters: {
    userId: 'user-123',
    chainType: 'solana'
  },
  userId: 'user-123'
});

console.log(result.data.walletId); // Privy wallet ID
console.log(result.data.address);   // Wallet address
```

### 2. Add Session Signer with Policies

```typescript
const result = await protocolManager.execute({
  protocolId: 'privy',
  operationId: 'addSessionSigner',
  parameters: {
    walletId: 'wallet-id',
    userId: 'user-123',
    ttl: 86400,              // 24 hours
    maxAmount: '1000000000', // 1 SOL per tx
    dailyLimit: '5000000000', // 5 SOL daily
    allowedPrograms: [
      'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB' // Jupiter
    ],
    requiresQuorum: false
  },
  userId: 'user-123'
});
```

### 3. Sign and Send Transaction

```typescript
const result = await protocolManager.execute({
  protocolId: 'privy',
  operationId: 'signAndSendSolanaTransaction',
  parameters: {
    walletId: 'wallet-id',
    userId: 'user-123',
    transaction: base64EncodedTransaction,
    n8nWorkflowId: 'workflow-123',
    n8nExecutionId: 'exec-456'
  },
  userId: 'user-123'
});

console.log(result.data.signature); // Transaction signature
```

## Policy Templates

### Conservative (Recommended for Production)

```typescript
{
  ttl: 86400,              // 24 hours
  maxAmount: '1000000000', // 1 SOL max per tx
  dailyLimit: '5000000000', // 5 SOL daily
  allowedPrograms: [
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB' // Jupiter only
  ],
  requiresQuorum: false
}
```

### Moderate

```typescript
{
  ttl: 604800,              // 7 days
  maxAmount: '10000000000', // 10 SOL max
  dailyLimit: '50000000000', // 50 SOL daily
  allowedPrograms: [],      // All programs
  requiresQuorum: false
}
```

### High-Value (Requires Quorum)

```typescript
{
  ttl: 3600,                // 1 hour
  maxAmount: '100000000000', // 100 SOL max
  dailyLimit: '500000000000', // 500 SOL daily
  allowedPrograms: [],
  requiresQuorum: true      // 2/2 signatures
}
```

## Security Features

### Policy Enforcement
- ✅ TTL limits (auto-expiry)
- ✅ Per-transaction amount limits
- ✅ Daily spending limits with automatic reset
- ✅ Program/contract allowlists
- ✅ Quorum approval support (2/2 signatures)

### Encryption
- ✅ Session signer private keys encrypted at rest
- ✅ AES-256-CBC encryption with unique IVs
- ✅ Secure key management via environment variables

### Audit Trail
- ✅ All transactions logged to `signer_audit_log` table
- ✅ Policy violations tracked with denial reasons
- ✅ n8n workflow/execution IDs captured
- ✅ Usage metrics and timestamps

## Database Schema

### user_wallets
Stores user wallet information:
- `id` - UUID primary key
- `user_id` - Your internal user ID
- `privy_user_id` - Privy user ID
- `wallet_address` - Blockchain address
- `wallet_id` - Privy wallet ID
- `chain_type` - solana | ethereum | base | polygon

### session_signers
Stores session signer details and policies:
- `id` - UUID primary key
- `wallet_id` - References user_wallets
- `privy_signer_id` - Privy signer ID
- `authorization_key_private` - Encrypted private key
- `authorization_key_public` - Public key
- Policy fields (ttl, limits, allowlists)
- Usage tracking fields

### signer_audit_log
Comprehensive transaction audit trail:
- `id` - UUID primary key
- `signer_id` - References session_signers
- `wallet_id` - References user_wallets
- Transaction details (type, amount, signature)
- Status (success | denied | error)
- n8n metadata (workflow_id, execution_id)

## SessionSignerService

The `SessionSignerService` provides core functionality:

### Methods

#### `createSessionSigner(walletId, userId, policies)`
Creates a new session signer with specified policies.

#### `canSign(userId, walletId, transaction)`
Checks if a transaction can be signed based on policies.

#### `getSignerPrivateKey(userId, walletId)`
Retrieves and decrypts the private key for signing.

#### `revokeSessionSigner(signerId, userId)`
Revokes a session signer immediately.

#### `updateUsage(signerId, amount)`
Updates usage tracking after a transaction.

#### `logTransaction(details)`
Logs transaction details to audit log.

#### `rotateExpiringSigners()`
Automatically rotates signers approaching expiry.

#### `cleanupOldSigners()`
Removes expired/revoked signers older than 30 days.

## Monitoring & Maintenance

### Daily Usage Query

```sql
SELECT 
  user_id,
  chain_type,
  COUNT(*) as tx_count,
  SUM(amount_lamports) as total_amount,
  DATE(created_at) as date
FROM signer_audit_log
WHERE status = 'success'
GROUP BY user_id, chain_type, DATE(created_at)
ORDER BY date DESC;
```

### Policy Violations

```sql
SELECT 
  user_id,
  denial_reason,
  COUNT(*) as attempt_count
FROM signer_audit_log
WHERE status = 'denied'
GROUP BY user_id, denial_reason
ORDER BY attempt_count DESC;
```

### Active Signers

```sql
SELECT 
  user_id,
  COUNT(*) as active_signers,
  MIN(expires_at) as earliest_expiry
FROM session_signers
WHERE revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at > NOW())
GROUP BY user_id;
```

## Troubleshooting

### Common Issues

**"No active session signer found"**
- Check signer hasn't expired (TTL)
- Verify not revoked
- Confirm user_id matches

**"Transaction amount exceeds limit"**
- Adjust maxAmount policy
- Split into smaller transactions

**"Program ID not in allowlist"**
- Add program to allowed_programs
- Remove allowlist to allow all programs

**"Daily limit exceeded"**
- Wait for daily reset (midnight UTC)
- Increase dailyLimit policy

### Debug Mode

```bash
PRIVY_DEBUG=true LOG_LEVEL=debug npm start
```

## Testing

```bash
# Unit tests
npm test src/protocols/adapters/privy

# Integration test
npm run test:privy-integration

# Test transaction signing
npm run test:privy-signing
```

## Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Authorization keys generated and registered
- [ ] Encryption key generated (32 bytes)
- [ ] Privy Dashboard configured
- [ ] Policy templates defined
- [ ] Monitoring alerts set up
- [ ] Audit logging enabled
- [ ] Key rotation scheduled
- [ ] Documentation reviewed

## Security Best Practices

### DO:
- ✅ Always encrypt session signer private keys
- ✅ Set conservative TTL limits (24h default)
- ✅ Use program/contract allowlists
- ✅ Enable daily limits
- ✅ Monitor for anomalies
- ✅ Rotate keys regularly
- ✅ Log all transactions
- ✅ Store credentials in environment variables

### DON'T:
- ❌ Expose Privy API directly to n8n
- ❌ Store unencrypted private keys
- ❌ Use unlimited TTL
- ❌ Skip policy enforcement
- ❌ Trust frontend input without validation
- ❌ Log private keys
- ❌ Reuse session signers across users
- ❌ Allow unlimited amounts

## Support

- Privy Documentation: https://docs.privy.io
- Session Signers Guide: https://docs.privy.io/wallets/using-wallets/session-signers
- Protocol SDK: `Lucid-L2/offchain/PROTOCOL-SDK-README.md`
- Integration Guide: `Lucid-L2/PRIVY-N8N-WALLET-INTEGRATION-GUIDE.md`

## License

MIT
