# Security Hardening Quick Start Guide
**Status:** 🟡 In Progress (40% Complete)  
**Last Updated:** January 13, 2025

This guide walks you through implementing the critical security fixes identified in the production review.

---

## 🚀 **Phase 1: Immediate Setup (15 minutes)**

### Step 1: Generate Required Secrets

Run these commands to generate secure secrets:

```bash
cd Lucid-L2/offchain

# Generate N8N HMAC secret
echo "N8N_HMAC_SECRET=$(openssl rand -hex 32)" >> .env

# Generate Admin API key
echo "ADMIN_API_KEY=$(openssl rand -hex 32)" >> .env

# Generate encryption key for session signers
echo "PRIVY_SIGNER_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# Optional: Generate admin IP whitelist (comma-separated)
echo "ADMIN_IP_WHITELIST=127.0.0.1,::1" >> .env

# Display the generated secrets (DO NOT commit these!)
echo "=== Generated Secrets (Keep secure!) ==="
grep "_SECRET\|_KEY\|WHITELIST" .env
```

### Step 2: Run Database Migration

```bash
cd Lucid-L2/infrastructure

# Test connection first
psql $SUPABASE_URL -c "SELECT NOW();"

# Run the production hardening migration
psql $SUPABASE_URL -f migrations/20250213_production_hardening.sql

# Verify indexes were created
psql $SUPABASE_URL -c "
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('user_wallets', 'session_signers', 'signer_audit_log')
ORDER BY tablename, indexname;
"
```

### Step 3: Test Environment Validation

```bash
cd Lucid-L2/offchain

# This should now pass with all secrets generated
npm run dev

# You should see:
# ✅ Environment validation passed
# 📋 Environment Status table
```

### Step 4: Test Health Checks

```bash
# Start the server
npm run dev

# In another terminal, test health endpoints:
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
curl http://localhost:3000/health/database
curl http://localhost:3000/health/redis
curl http://localhost:3000/health/detailed | jq
```

**Expected Result:** All health checks should return `"status": "healthy"`

---

## 🔐 **Phase 2: KMS Integration (2-3 days)**

### Option A: AWS KMS (Recommended for AWS deployments)

#### 1. Create KMS Key

```bash
# Create KMS key for session signer encryption
aws kms create-key \
  --description "Lucid L2 Session Signer Encryption Key" \
  --key-usage ENCRYPT_DECRYPT \
  --origin AWS_KMS

# Save the KeyId from the response
export KMS_KEY_ID="your-key-id-here"

# Create alias for easier reference
aws kms create-alias \
  --alias-name alias/lucid-session-signers \
  --target-key-id $KMS_KEY_ID

# Add to .env
echo "AWS_KMS_KEY_ID=$KMS_KEY_ID" >> .env
echo "AWS_REGION=us-east-1" >> .env  # Your region
```

#### 2. Install AWS SDK

```bash
cd Lucid-L2/offchain
npm install @aws-sdk/client-kms
```

#### 3. Update PrivyAdapter

Create `offchain/src/utils/kmsEncryption.ts`:

```typescript
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

const kmsClient = new KMSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const keyId = process.env.AWS_KMS_KEY_ID!;

export async function encryptWithKMS(plaintext: string): Promise<string> {
  const command = new EncryptCommand({
    KeyId: keyId,
    Plaintext: Buffer.from(plaintext, 'utf8')
  });
  
  const response = await kmsClient.send(command);
  return Buffer.from(response.CiphertextBlob!).toString('base64');
}

export async function decryptWithKMS(ciphertext: string): Promise<string> {
  const command = new DecryptCommand({
    CiphertextBlob: Buffer.from(ciphertext, 'base64')
  });
  
  const response = await kmsClient.send(command);
  return Buffer.from(response.Plaintext!).toString('utf8');
}
```

#### 4. Update PrivyAdapter.ts

Replace the `encryptKey()` method:

```typescript
// OLD (line 468):
private encryptKey(key: string): string {
  // Demo encryption - DO NOT USE IN PRODUCTION
}

// NEW:
private async encryptKey(key: string): Promise<string> {
  const { encryptWithKMS } = await import('../../../utils/kmsEncryption');
  return await encryptWithKMS(key);
}

// Also update SessionSignerService.ts encrypt() and decrypt() methods
```

### Option B: HashiCorp Vault (Recommended for multi-cloud)

#### 1. Set up Vault

```bash
# Install Vault CLI
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install vault

# Start Vault dev server (for testing)
vault server -dev

# In another terminal, set environment
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='root'  # From dev server output

# Enable transit secrets engine
vault secrets enable transit

# Create encryption key
vault write -f transit/keys/lucid-session-signers
```

#### 2. Install Vault Client

```bash
cd Lucid-L2/offchain
npm install node-vault
```

#### 3. Create Vault Encryption Utility

See AWS KMS example above - similar pattern with Vault client.

---

## ⚖️ **Phase 3: Complete Policy Enforcement (1-2 days)**

### Update PrivyAdapter.ts `checkCanSign()` method

Location: `offchain/src/protocols/adapters/privy/PrivyAdapter.ts:402`

```typescript
private async checkCanSign(
  userId: string,
  walletId: string,
  transaction: Record<string, unknown>
): Promise<{ allowed: boolean; reason?: string; signerId?: string }> {
  const { data: wallet } = await this.supabase!
    .from('user_wallets')
    .select('id')
    .eq('wallet_id', walletId)
    .eq('user_id', userId)
    .single();

  if (!wallet) {
    return { allowed: false, reason: 'Wallet not found' };
  }

  const { data: signers } = await this.supabase!
    .from('session_signers')
    .select('*')
    .eq('wallet_id', wallet.id)
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  if (!signers || signers.length === 0) {
    return { allowed: false, reason: 'No active session signer found' };
  }

  const signer = signers[0];

  // 1. Check TTL / Expiry
  if (signer.expires_at && new Date(signer.expires_at) < new Date()) {
    return { allowed: false, reason: 'Session signer expired', signerId: signer.id };
  }

  // 2. Check single transaction amount limit
  const txAmount = transaction.amount ? BigInt(transaction.amount as string) : BigInt(0);
  if (signer.max_amount_lamports && txAmount > BigInt(signer.max_amount_lamports)) {
    return { 
      allowed: false, 
      reason: `Transaction amount ${txAmount} exceeds limit ${signer.max_amount_lamports}`,
      signerId: signer.id
    };
  }

  // 3. Check daily limit
  if (signer.daily_limit_lamports) {
    const today = new Date().toISOString().split('T')[0];
    const resetDate = new Date(signer.daily_usage_reset_at).toISOString().split('T')[0];
    
    let dailyUsage = BigInt(signer.daily_usage_lamports || 0);
    if (today !== resetDate) {
      dailyUsage = BigInt(0); // Reset if new day
    }
    
    const newDailyTotal = dailyUsage + txAmount;
    if (newDailyTotal > BigInt(signer.daily_limit_lamports)) {
      return {
        allowed: false,
        reason: `Daily limit exceeded: ${newDailyTotal} > ${signer.daily_limit_lamports}`,
        signerId: signer.id
      };
    }
  }

  // 4. Check program allowlist (Solana)
  if (signer.allowed_programs && signer.allowed_programs.length > 0) {
    const programId = transaction.programId as string;
    if (programId && !signer.allowed_programs.includes(programId)) {
      return {
        allowed: false,
        reason: `Program ${programId} not in allowlist`,
        signerId: signer.id
      };
    }
  }

  // 5. Check contract allowlist (EVM)
  if (signer.allowed_contracts && signer.allowed_contracts.length > 0) {
    const contractAddress = (transaction.to as string)?.toLowerCase();
    if (contractAddress && !signer.allowed_contracts.map(c => c.toLowerCase()).includes(contractAddress)) {
      return {
        allowed: false,
        reason: `Contract ${contractAddress} not in allowlist`,
        signerId: signer.id
      };
    }
  }

  // 6. Check if requires quorum (not yet implemented)
  if (signer.requires_quorum) {
    // TODO: Implement quorum signing logic
    return {
      allowed: false,
      reason: 'Quorum signing not yet implemented',
      signerId: signer.id
    };
  }

  return { allowed: true, signerId: signer.id };
}
```

### Add Unit Tests

Create `offchain/src/protocols/adapters/privy/__tests__/PrivyAdapter.test.ts`:

```typescript
import { PrivyAdapter } from '../PrivyAdapter';

describe('PrivyAdapter Policy Enforcement', () => {
  let adapter: PrivyAdapter;

  beforeEach(() => {
    adapter = new PrivyAdapter();
  });

  test('should deny transaction exceeding amount limit', async () => {
    // Test implementation
  });

  test('should deny transaction exceeding daily limit', async () => {
    // Test implementation
  });

  test('should deny transaction to non-allowlisted program', async () => {
    // Test implementation
  });

  // Add more tests...
});
```

---

## 🔧 **Phase 4: Operational Setup (1 week)**

### 1. Set Up Cron Jobs

Create `/etc/cron.d/lucid-maintenance`:

```bash
# Cleanup expired session signers daily at 2 AM
0 2 * * * postgres psql $DATABASE_URL -c "SELECT cleanup_expired_signers();"

# Cleanup old audit logs weekly on Sunday at 3 AM
0 3 * * 0 postgres psql $DATABASE_URL -c "SELECT cleanup_old_audit_logs();"

# Cleanup expired OAuth states every hour
0 * * * * postgres psql $DATABASE_URL -c "SELECT cleanup_expired_oauth_states();"

# Refresh materialized view daily at 1 AM
0 1 * * * postgres psql $DATABASE_URL -c "SELECT refresh_user_wallet_stats();"
```

### 2. Set Up Monitoring Alerts

Example Datadog monitor configuration:

```yaml
# /etc/datadog/conf.d/lucid.yaml
init_config:

instances:
  - url: http://localhost:3000/health/detailed
    name: lucid_health
    timeout: 10
    check_certificate_expiration: false
    tags:
      - env:production
      - service:lucid-l2
```

### 3. Configure Log Aggregation

Add to `offchain/package.json`:

```json
"dependencies": {
  "winston": "^3.11.0",
  "winston-elasticsearch": "^0.17.4"
}
```

Create `offchain/src/utils/logger.ts`:

```typescript
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'lucid-l2' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

---

## ✅ **Verification Checklist**

Before deploying to production, verify:

- [ ] All secrets generated and stored securely
- [ ] Database migration applied successfully
- [ ] Environment validation passes on startup
- [ ] All health checks return "healthy"
- [ ] KMS integration completed and tested
- [ ] Policy enforcement logic completed
- [ ] Unit tests written and passing
- [ ] Cron jobs configured and tested
- [ ] Monitoring alerts set up
- [ ] Load testing completed (500 req/sec)
- [ ] Security audit/pen test performed
- [ ] Disaster recovery plan tested
- [ ] Documentation updated
- [ ] Team trained on new security features

---

## 📞 **Getting Help**

If you encounter issues:

1. Check logs: `tail -f offchain/error.log`
2. Test health checks: `curl http://localhost:3000/health/detailed`
3. Verify database: `psql $DATABASE_URL -c "SELECT * FROM system_health_summary;"`
4. Review environment: Check `.env` file has all required variables

---

## 📚 **Additional Resources**

- [AWS KMS Best Practices](https://docs.aws.amazon.com/kms/latest/developerguide/best-practices.html)
- [HashiCorp Vault Documentation](https://www.vaultproject.io/docs)
- [OWASP API Security](https://owasp.org/www-project-api-security/)
- [Production Review Document](./PRIVY-NANGO-PRODUCTION-REVIEW.md)
