# Privy + n8n Wallet Integration Guide

## 📋 Overview

This guide details the implementation of Privy embedded wallets with autonomous n8n workflow execution using Session Signers (Delegated Actions). This enables secure, server-side wallet operations for multi-user scenarios while maintaining self-custodial wallet architecture.

**Key Features:**
- ✅ Self-custodial user wallets (Privy embedded wallets)
- ✅ Autonomous n8n workflow execution (offline user)
- ✅ Policy-based transaction controls (TTL, limits, allowlists)
- ✅ Quorum approvals for sensitive operations (2/2 signatures)
- ✅ Full Solana and EVM support
- ✅ Secure credential management with KMS/encryption

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    n8n Workflows                             │
│         (Autonomous execution, no direct Privy calls)        │
└────────────────┬────────────────────────────────────────────┘
                 │ HTTP Node (Internal Auth)
                 │
    ┌────────────▼──────────────────────────────────────────┐
    │           Lucid Backend API                            │
    │  • Protocol Manager (routes to adapters)              │
    │  • Session Signer Service (manages keys/policies)     │
    │  • Privy Adapter (wallet operations)                  │
    └────────────┬──────────────────────────────────────────┘
                 │ HTTPS + privy-authorization-signature
                 │
    ┌────────────▼──────────────────────────────────────────┐
    │              Privy REST API                            │
    │  POST /v1/wallets/{wallet_id}/rpc                     │
    │  • signTransaction / signAndSendTransaction            │
    │  • Enforces policies server-side                      │
    └────────────┬──────────────────────────────────────────┘
                 │
    ┌────────────▼──────────────────────────────────────────┐
    │           User Embedded Wallets                        │
    │  (Self-custodial, with authorized session signers)    │
    └────────────────────────────────────────────────────────┘
```

---

## 📦 Phase 1: Prerequisites & Setup

### 1.1 Privy Account Setup

**Steps:**
1. Sign up at [dashboard.privy.io](https://dashboard.privy.io)
2. Create a new app
3. Note credentials:
   - `PRIVY_APP_ID`
   - `PRIVY_APP_SECRET`
4. Configure supported chains (Solana, Ethereum)
5. Enable embedded wallets

### 1.2 Generate Authorization Keys

Generate ECDSA key pair for server-side signing:

```bash
# Generate private key
openssl ecparam -name prime256v1 -genkey -noout -out privy-auth-private.pem

# Extract public key
openssl ec -in privy-auth-private.pem -pubout -out privy-auth-public.pem

# Display public key for Privy Dashboard
cat privy-auth-public.pem
```

**Register in Privy Dashboard:**
1. Go to Settings → Authorization Keys
2. Create new "Key Quorum" with threshold=1
3. Add your public key
4. Note the `KEY_QUORUM_ID`

### 1.3 Environment Variables

Add to `Lucid-L2/offchain/.env`:

```bash
# Privy Configuration
PRIVY_APP_ID=your_app_id_here
PRIVY_APP_SECRET=your_app_secret_here
PRIVY_AUTH_PRIVATE_KEY=path/to/privy-auth-private.pem
PRIVY_KEY_QUORUM_ID=your_key_quorum_id
PRIVY_API_BASE_URL=https://api.privy.io/v1

# Encryption for session signer storage
PRIVY_SIGNER_ENCRYPTION_KEY=generate_with_openssl_rand_32
```

### 1.4 Install Dependencies

```bash
cd Lucid-L2/offchain
npm install @privy-io/server-auth elliptic tweetnacl
```

---

## 🔧 Phase 2: Database Schema

### 2.1 Supabase Migration

Create `Lucid-L2/infrastructure/migrations/20250131_privy_wallets.sql`:

```sql
-- User wallets table
CREATE TABLE user_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  privy_user_id TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  wallet_id TEXT NOT NULL UNIQUE,  -- Privy wallet ID
  chain_type TEXT NOT NULL CHECK (chain_type IN ('solana', 'ethereum', 'base', 'polygon')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_user_chain UNIQUE (user_id, chain_type)
);

-- Session signers table
CREATE TABLE session_signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES user_wallets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  
  -- Privy signer details
  privy_signer_id TEXT NOT NULL,
  authorization_key_private TEXT NOT NULL,  -- Encrypted
  authorization_key_public TEXT NOT NULL,
  
  -- Policy configuration
  policy_id TEXT,
  ttl_seconds INTEGER,
  max_amount_lamports BIGINT,
  max_amount_wei TEXT,
  allowed_programs TEXT[],  -- Solana Program IDs
  allowed_contracts TEXT[], -- EVM contract addresses
  daily_limit_lamports BIGINT,
  daily_limit_wei TEXT,
  requires_quorum BOOLEAN DEFAULT false,
  
  -- Usage tracking
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  daily_usage_lamports BIGINT DEFAULT 0,
  daily_usage_wei TEXT DEFAULT '0',
  daily_usage_reset_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP,
  
  CONSTRAINT valid_expiry CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- Transaction audit log
CREATE TABLE signer_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signer_id UUID REFERENCES session_signers(id),
  wallet_id UUID REFERENCES user_wallets(id),
  user_id TEXT NOT NULL,
  
  -- Transaction details
  transaction_type TEXT NOT NULL,
  chain_type TEXT NOT NULL,
  amount_lamports BIGINT,
  amount_wei TEXT,
  program_id TEXT,
  contract_address TEXT,
  transaction_signature TEXT,
  transaction_hash TEXT,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('success', 'denied', 'error')),
  denial_reason TEXT,
  error_message TEXT,
  
  -- Metadata
  n8n_workflow_id TEXT,
  n8n_execution_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_user_wallets_user ON user_wallets(user_id);
CREATE INDEX idx_user_wallets_privy_user ON user_wallets(privy_user_id);
CREATE INDEX idx_session_signers_wallet ON session_signers(wallet_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_session_signers_user ON session_signers(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_session_signers_expiry ON session_signers(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_audit_log_user ON signer_audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_wallet ON signer_audit_log(wallet_id, created_at DESC);
CREATE INDEX idx_audit_log_signer ON signer_audit_log(signer_id, created_at DESC);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_wallets_updated_at BEFORE UPDATE ON user_wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.2 Run Migration

```bash
cd Lucid-L2/infrastructure
# Apply migration to Supabase
npx supabase db push
```

---

## 💻 Phase 3: Privy Protocol Adapter

### 3.1 Directory Structure

```
Lucid-L2/offchain/src/protocols/adapters/privy/
├── index.ts                    # Export adapter
├── types.ts                    # TypeScript interfaces
├── operations.ts               # Operation definitions
├── PrivyAdapter.ts            # Main adapter implementation
├── PrivyRestClient.ts         # REST API client
├── SignatureGenerator.ts      # Auth signature generation
├── PolicyManager.ts           # Policy enforcement
└── README.md                  # Adapter documentation
```

### 3.2 Types Definition

Create `types.ts`:

```typescript
export interface PrivyCredentials {
  appId: string;
  appSecret: string;
  authPrivateKey: string;  // Path or base64
  keyQuorumId: string;
  apiBaseUrl?: string;
}

export interface SessionSignerConfig {
  walletId: string;
  userId: string;
  policies: {
    ttl?: number;              // Seconds
    maxAmount?: string;        // In base units (lamports/wei)
    allowedPrograms?: string[]; // Solana Program IDs
    allowedContracts?: string[]; // EVM contract addresses
    dailyLimit?: string;
    requiresQuorum?: boolean;
  };
}

export interface SignTransactionParams {
  walletId: string;
  userId: string;
  transaction: string;  // Base64 encoded
  chainType: 'solana' | 'ethereum';
}

export interface PrivyRPCRequest {
  jsonrpc: '2.0';
  method: string;
  params: any[];
  id: number;
}

export interface PrivyRPCResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number;
}
```

### 3.3 Operations Definition

Create `operations.ts`:

```typescript
import { OperationDefinition } from '../../types';

export const PRIVY_OPERATIONS: OperationDefinition[] = [
  // === User & Wallet Management ===
  {
    id: 'createUser',
    name: 'Create Privy User',
    description: 'Create a new Privy user with embedded wallet',
    parameters: [
      {
        name: 'userId',
        type: 'string',
        required: true,
        description: 'Your internal user ID'
      },
      {
        name: 'chainType',
        type: 'select',
        required: true,
        options: [
          { label: 'Solana', value: 'solana' },
          { label: 'Ethereum', value: 'ethereum' },
          { label: 'Base', value: 'base' },
          { label: 'Polygon', value: 'polygon' }
        ]
      }
    ],
    requiresAuth: true,
    isWrite: true
  },
  
  {
    id: 'getWallet',
    name: 'Get User Wallet',
    description: 'Retrieve wallet details for a user',
    parameters: [
      {
        name: 'userId',
        type: 'string',
        required: true
      },
      {
        name: 'chainType',
        type: 'select',
        required: true,
        options: [
          { label: 'Solana', value: 'solana' },
          { label: 'Ethereum', value: 'ethereum' }
        ]
      }
    ],
    requiresAuth: true,
    isWrite: false
  },
  
  // === Session Signer Management ===
  {
    id: 'addSessionSigner',
    name: 'Add Session Signer',
    description: 'Grant server permission to sign transactions autonomously',
    parameters: [
      {
        name: 'walletId',
        type: 'string',
        required: true,
        description: 'Privy wallet ID'
      },
      {
        name: 'userId',
        type: 'string',
        required: true
      },
      {
        name: 'ttl',
        type: 'number',
        required: false,
        description: 'Time-to-live in seconds (default: 86400 = 24h)'
      },
      {
        name: 'maxAmount',
        type: 'string',
        required: false,
        description: 'Max amount per transaction (lamports or wei)'
      },
      {
        name: 'dailyLimit',
        type: 'string',
        required: false,
        description: 'Daily spending limit (lamports or wei)'
      },
      {
        name: 'allowedPrograms',
        type: 'array',
        required: false,
        description: 'Allowed Solana Program IDs (empty = all allowed)'
      },
      {
        name: 'allowedContracts',
        type: 'array',
        required: false,
        description: 'Allowed EVM contract addresses (empty = all allowed)'
      },
      {
        name: 'requiresQuorum',
        type: 'boolean',
        required: false,
        description: 'Require 2/2 signatures (user + server)'
      }
    ],
    requiresAuth: true,
    isWrite: true
  },
  
  {
    id: 'revokeSessionSigner',
    name: 'Revoke Session Signer',
    description: 'Remove server signing permissions immediately',
    parameters: [
      {
        name: 'walletId',
        type: 'string',
        required: true
      },
      {
        name: 'signerId',
        type: 'string',
        required: true
      }
    ],
    requiresAuth: true,
    isWrite: true
  },
  
  {
    id: 'listSessionSigners',
    name: 'List Session Signers',
    description: 'Get all active session signers for a wallet',
    parameters: [
      {
        name: 'walletId',
        type: 'string',
        required: true
      }
    ],
    requiresAuth: true,
    isWrite: false
  },
  
  // === Transaction Operations (Solana) ===
  {
    id: 'signSolanaTransaction',
    name: 'Sign Solana Transaction',
    description: 'Sign a Solana transaction (offline)',
    parameters: [
      {
        name: 'walletId',
        type: 'string',
        required: true
      },
      {
        name: 'userId',
        type: 'string',
        required: true
      },
      {
        name: 'transaction',
        type: 'string',
        required: true,
        description: 'Base64 encoded transaction'
      }
    ],
    requiresAuth: true,
    isWrite: true
  },
  
  {
    id: 'signAndSendSolanaTransaction',
    name: 'Sign and Send Solana Transaction',
    description: 'Sign and broadcast Solana transaction to network',
    parameters: [
      {
        name: 'walletId',
        type: 'string',
        required: true
      },
      {
        name: 'userId',
        type: 'string',
        required: true
      },
      {
        name: 'transaction',
        type: 'string',
        required: true,
        description: 'Base64 encoded transaction'
      },
      {
        name: 'n8nWorkflowId',
        type: 'string',
        required: false,
        description: 'n8n workflow ID for audit'
      },
      {
        name: 'n8nExecutionId',
        type: 'string',
        required: false,
        description: 'n8n execution ID for audit'
      }
    ],
    requiresAuth: true,
    isWrite: true
  },
  
  // === Transaction Operations (Ethereum) ===
  {
    id: 'signEthereumTransaction',
    name: 'Sign Ethereum Transaction',
    description: 'Sign an Ethereum transaction (offline)',
    parameters: [
      {
        name: 'walletId',
        type: 'string',
        required: true
      },
      {
        name: 'userId',
        type: 'string',
        required: true
      },
      {
        name: 'transaction',
        type: 'object',
        required: true,
        description: 'Ethereum transaction object'
      }
    ],
    requiresAuth: true,
    isWrite: true
  },
  
  {
    id: 'sendEthereumTransaction',
    name: 'Send Ethereum Transaction',
    description: 'Sign and broadcast Ethereum transaction',
    parameters: [
      {
        name: 'walletId',
        type: 'string',
        required: true
      },
      {
        name: 'userId',
        type: 'string',
        required: true
      },
      {
        name: 'transaction',
        type: 'object',
        required: true
      },
      {
        name: 'n8nWorkflowId',
        type: 'string',
        required: false
      },
      {
        name: 'n8nExecutionId',
        type: 'string',
        required: false
      }
    ],
    requiresAuth: true,
    isWrite: true
  }
];
```

---

## 🔐 Phase 4: Session Signer Service

### 4.1 Service Implementation

Create `Lucid-L2/offchain/src/services/sessionSignerService.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import { SignatureGenerator } from '../protocols/adapters/privy/SignatureGenerator';
import crypto from 'crypto';

export interface SignerPolicy {
  ttl?: number;
  maxAmount?: string;
  allowedPrograms?: string[];
  allowedContracts?: string[];
  dailyLimit?: string;
  requiresQuorum?: boolean;
}

export class SessionSignerService {
  private supabase;
  private encryptionKey: string;
  
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    this.encryptionKey = process.env.PRIVY_SIGNER_ENCRYPTION_KEY!;
  }
  
  /**
   * Create a new session signer for a wallet
   */
  async createSessionSigner(
    walletId: string,
    userId: string,
    policies: SignerPolicy
  ) {
    // Generate new ECDSA key pair for this session
    const ec = require('elliptic').ec;
    const curve = new ec('p256');
    const keyPair = curve.genKeyPair();
    
    const privateKey = keyPair.getPrivate('hex');
    const publicKey = keyPair.getPublic('hex');
    
    // Encrypt private key
    const encryptedPrivateKey = this.encrypt(privateKey);
    
    // Calculate expiry
    const expiresAt = policies.ttl
      ? new Date(Date.now() + policies.ttl * 1000)
      : null;
    
    // Store in database
    const { data, error } = await this.supabase
      .from('session_signers')
      .insert({
        wallet_id: walletId,
        user_id: userId,
        authorization_key_private: encryptedPrivateKey,
        authorization_key_public: publicKey,
        ttl_seconds: policies.ttl,
        max_amount_lamports: policies.maxAmount,
        max_amount_wei: policies.maxAmount,
        allowed_programs: policies.allowedPrograms,
        allowed_contracts: policies.allowedContracts,
        daily_limit_lamports: policies.dailyLimit,
        daily_limit_wei: policies.dailyLimit,
        requires_quorum: policies.requiresQuorum || false,
        expires_at: expiresAt
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      signerId: data.id,
      publicKey,
      expiresAt: data.expires_at
    };
  }
  
  /**
   * Check if a transaction can be signed based on policies
   */
  async canSign(userId: string, walletId: string, transaction: any): Promise<{
    allowed: boolean;
    reason?: string;
    signer?: any;
  }> {
    // Get active signers for this wallet
    const { data: signers, error } = await this.supabase
      .from('session_signers')
      .select('*')
      .eq('user_id', userId)
      .eq('wallet_id', walletId)
      .is('revoked_at', null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
    
    if (error || !signers || signers.length === 0) {
      return { allowed: false, reason: 'No active session signer found' };
    }
    
    // Use the first active signer (could implement more sophisticated selection)
    const signer = signers[0];
    
    // Check TTL
    if (signer.expires_at && new Date(signer.expires_at) < new Date()) {
      return { allowed: false, reason: 'Session signer expired' };
    }
    
    // Check amount limit
    if (signer.max_amount_lamports && transaction.amount) {
      if (BigInt(transaction.amount) > BigInt(signer.max_amount_lamports)) {
        return { allowed: false, reason: 'Transaction amount exceeds limit' };
      }
    }
    
    // Check daily limit
    if (signer.daily_limit_lamports) {
      const today = new Date().toISOString().split('T')[0];
      const resetDate = new Date(signer.daily_usage_reset_at).toISOString().split('T')[0];
      
      let dailyUsage = signer.daily_usage_lamports;
      if (today !== resetDate) {
        dailyUsage = 0; // Reset daily usage
      }
      
      if (BigInt(dailyUsage) + BigInt(transaction.amount || 0) > BigInt(signer.daily_limit_lamports)) {
        return { allowed: false, reason: 'Daily limit exceeded' };
      }
    }
    
    // Check program allowlist (Solana)
    if (signer.allowed_programs && signer.allowed_programs.length > 0) {
      if (transaction.programId && !signer.allowed_programs.includes(transaction.programId)) {
        return { allowed: false, reason: 'Program ID not in allowlist' };
      }
    }
    
    // Check contract allowlist (EVM)
    if (signer.allowed_contracts && signer.allowed_contracts.length > 0) {
      if (transaction.to && !signer.allowed_contracts.includes(transaction.to.toLowerCase())) {
        return { allowed: false, reason: 'Contract address not in allowlist' };
      }
    }
    
    return { allowed: true, signer };
  }
  
  /**
   * Generate authorization signature for Privy API
   */
  async generateAuthSignature(
    userId: string,
    walletId: string,
    payload: any
  ): Promise<string> {
    // Get signer private key
    const { data: signer } = await this.supabase
      .from('session_signers')
      .select('authorization_key_private')
      .eq('user_id', userId)
      .eq('wallet_id', walletId)
      .is('revoked_at', null)
      .single();
    
    if (!signer) {
      throw new Error('No active session signer found');
    }
    
    // Decrypt private key
    const privateKey = this.decrypt(signer.authorization_key_private);
    
    // Generate signature
    const signatureGen = new SignatureGenerator(privateKey);
    return signatureGen.sign(payload);
  }
  
  /**
   * Revoke a session signer
   */
  async revokeSessionSigner(signerId: string, userId: string) {
    const { error } = await this.supabase
      .from('session_signers')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', signerId)
      .eq('user_id', userId);
    
    if (error) throw error;
  }
  
  /**
   * Update usage tracking after a transaction
   */
  async updateUsage(signerId: string, amount: string) {
    const { data: signer } = await this.supabase
      .from('session_signers')
      .select('*')
      .eq('id', signerId)
      .single();
    
    if (!signer) return;
    
    const today = new Date().toISOString().split('T')[0];
    const resetDate = new Date(signer.daily_usage_reset_at).toISOString().split('T')[0];
    
    let dailyUsage = signer.daily_usage_lamports;
    if (today !== resetDate) {
      dailyUsage = 0; // Reset
    }
    
    await this.supabase
      .from('session_signers')
      .update({
        usage_count: signer.usage_count + 1,
        last_used_at: new Date().toISOString(),
        daily_usage_lamports: dailyUsage + BigInt(amount || 0),
        daily_usage_reset_at: today !== resetDate ? new Date().toISOString() : signer.daily_usage_reset_at
      })
      .eq('id', signerId);
  }
  
  /**
   * Log transaction in audit log
   */
  async logTransaction(details: {
    signerId: string;
    walletId: string;
    userId: string;
    transactionType: string;
    chainType: string;
    amount?: string;
    programId?: string;
    contractAddress?: string;
    transactionSignature?: string;
    transactionHash?: string;
    status: 'success' | 'denied' | 'error';
    denialReason?: string;
    errorMessage?: string;
    n8nWorkflowId?: string;
    n8nExecutionId?: string;
  }) {
    await this.supabase
      .from('signer_audit_log')
      .insert({
        signer_id: details.signerId,
        wallet_id: details.walletId,
        user_id: details.userId,
        transaction_type: details.transactionType,
        chain_type: details.chainType,
        amount_lamports: details.amount,
        amount_wei: details.amount,
        program_id: details.programId,
        contract_address: details.contractAddress,
        transaction_signature: details.transactionSignature,
        transaction_hash: details.transactionHash,
        status: details.status,
        denial_reason: details.denialReason,
        error_message: details.errorMessage,
        n8n_workflow_id: details.n8nWorkflowId,
        n8n_execution_id: details.n8nExecutionId
      });
  }
  
  // Encryption helpers
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey, 'hex'),
      iv
    );
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }
  
  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey, 'hex'),
      iv
    );
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
```

---

## 🌐 Phase 5: Backend API Endpoints

### 5.1 Wallet Routes

Create `Lucid-L2/offchain/src/routes/walletRoutes.ts`:

```typescript
import express from 'express';
import { protocolManager } from '../services/protocolManager';
import { SessionSignerService } from '../services/sessionSignerService';

const router = express.Router();
const sessionSignerService = new SessionSignerService();

/**
 * POST /api/wallets/onboard
 * Create wallet and session signer for a user
 */
router.post('/onboard', async (req, res) => {
  try {
    const { userId, chainType, policies } = req.body;
    
    // Create wallet via Privy adapter
    const walletResult = await protocolManager.execute({
      protocolId: 'privy',
      operationId: 'createUser',
      parameters: { userId, chainType },
      userId,
      config: { network: 'mainnet' }
    });
    
    if (!walletResult.success) {
      return res.status(400).json({ error: walletResult.error });
    }
    
    // Add session signer
    const signerResult = await protocolManager.execute({
      protocolId: 'privy',
      operationId: 'addSessionSigner',
      parameters: {
        walletId: walletResult.data.walletId,
        userId,
        ...policies
      },
      userId
    });
    
    res.json({
      wallet: walletResult.data,
      sessionSigner: signerResult.data
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/wallets/:userId/:chainType
 * Get wallet for a user
 */
router.get('/:userId/:chainType', async (req, res) => {
  try {
    const { userId, chainType } = req.params;
    
    const result = await protocolManager.execute({
      protocolId: 'privy',
      operationId: 'getWallet',
      parameters: { userId, chainType },
      userId
    });
    
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }
    
    res.json(result.data);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/wallets/:walletId/sign-transaction
 * Sign a transaction with session signer
 */
router.post('/:walletId/sign-transaction', async (req, res) => {
  try {
    const { walletId } = req.params;
    const { userId, transaction, chainType, n8nWorkflowId, n8nExecutionId } = req.body;
    
    // Check if signing is allowed
    const canSign = await sessionSignerService.canSign(
      userId,
      walletId,
      transaction
    );
    
    if (!canSign.allowed) {
      // Log denial
      await sessionSignerService.logTransaction({
        signerId: canSign.signer?.id,
        walletId,
        userId,
        transactionType: 'sign',
        chainType,
        status: 'denied',
        denialReason: canSign.reason,
        n8nWorkflowId,
        n8nExecutionId
      });
      
      return res.status(403).json({ error: canSign.reason });
    }
    
    // Execute signing
    const operationId = chainType === 'solana' 
      ? 'signAndSendSolanaTransaction' 
      : 'sendEthereumTransaction';
    
    const result = await protocolManager.execute({
      protocolId: 'privy',
      operationId,
      parameters: {
        walletId,
        userId,
        transaction: chainType === 'solana' ? transaction : JSON.stringify(transaction),
        n8nWorkflowId,
        n8nExecutionId
      },
      userId
    });
    
    // Update usage and log
    if (result.success && canSign.signer) {
      await sessionSignerService.updateUsage(
        canSign.signer.id,
        transaction.amount || '0'
      );
      
      await sessionSignerService.logTransaction({
        signerId: canSign.signer.id,
        walletId,
        userId,
        transactionType: 'sign_and_send',
        chainType,
        amount: transaction.amount,
        programId: transaction.programId,
        contractAddress: transaction.to,
        transactionSignature: result.data.signature,
        transactionHash: result.data.hash,
        status: 'success',
        n8nWorkflowId,
        n8nExecutionId
      });
    }
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/wallets/:walletId/session-signers/:signerId
 * Revoke a session signer
 */
router.delete('/:walletId/session-signers/:signerId', async (req, res) => {
  try {
    const { walletId, signerId } = req.params;
    const { userId } = req.body;
    
    const result = await protocolManager.execute({
      protocolId: 'privy',
      operationId: 'revokeSessionSigner',
      parameters: { walletId, signerId },
      userId
    });
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

### 5.2 Register Routes

Add to `Lucid-L2/offchain/src/index.ts`:

```typescript
import walletRoutes from './routes/walletRoutes';

app.use('/api/wallets', walletRoutes);
```

---

## 📱 Phase 6: n8n Workflow Integration

### 6.1 HTTP Request Node Configuration

n8n workflows use HTTP Request nodes to call your backend API. No direct Privy API calls from n8n.

**Example n8n Workflow: Sign Solana Transaction**

```json
{
  "nodes": [
    {
      "parameters": {
        "url": "http://host.docker.internal:3001/api/wallets/{{ $json.walletId }}/sign-transaction",
        "method": "POST",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "userId",
              "value": "={{ $json.userId }}"
            },
            {
              "name": "transaction",
              "value": "={{ $json.transaction }}"
            },
            {
              "name": "chainType",
              "value": "solana"
            },
            {
              "name": "n8nWorkflowId",
              "value": "={{ $workflow.id }}"
            },
            {
              "name": "n8nExecutionId",
              "value": "={{ $execution.id }}"
            }
          ]
        },
        "options": {}
      },
      "name": "Sign Transaction via Backend",
      "type": "n8n-nodes-base.httpRequest",
      "position": [250, 300]
    }
  ]
}
```

### 6.2 Example: Autonomous Trading Workflow

```json
{
  "name": "Autonomous Solana Trading",
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": {
          "interval": [{"field": "minutes", "value": 5}]
        }
      }
    },
    {
      "name": "Get User Wallet",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://host.docker.internal:3001/api/wallets/user123/solana",
        "method": "GET"
      }
    },
    {
      "name": "Build Swap Transaction",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// Build Solana transaction\nreturn items;"
      }
    },
    {
      "name": "Sign and Send Transaction",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://host.docker.internal:3001/api/wallets/{{ $json.walletId }}/sign-transaction",
        "method": "POST"
      }
    }
  ]
}
```

### 6.3 Dynamic Options for n8n Nodes

Create a generic options endpoint:

```typescript
// Lucid-L2/offchain/src/routes/walletRoutes.ts

/**
 * GET /api/wallets/options/:optionType
 * Provide dynamic options for n8n nodes
 */
router.get('/options/:optionType', async (req, res) => {
  const { optionType } = req.params;
  const { userId } = req.query;
  
  try {
    switch (optionType) {
      case 'chains':
        res.json([
          { name: 'Solana', value: 'solana' },
          { name: 'Ethereum', value: 'ethereum' },
          { name: 'Base', value: 'base' }
        ]);
        break;
        
      case 'userWallets':
        // Fetch user's wallets from database
        const wallets = await fetchUserWallets(userId);
        res.json(wallets.map(w => ({
          name: `${w.chain_type} - ${w.wallet_address.slice(0, 8)}...`,
          value: w.wallet_id
        })));
        break;
        
      case 'allowedPrograms':
        // Return common Solana programs
        res.json([
          { name: 'Jupiter Aggregator', value: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB' },
          { name: 'Raydium AMM', value: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8' },
          { name: 'Orca Whirlpool', value: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc' }
        ]);
        break;
        
      default:
        res.status(404).json({ error: 'Unknown option type' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## 🔐 Phase 7: Security & Production

### 7.1 Security Checklist

**✅ Credential Storage:**
- [ ] Privy credentials stored in environment variables (not in code)
- [ ] Session signer private keys encrypted in database
- [ ] n8n uses encrypted credentials for API calls
- [ ] Persistent encryption key configured (N8N_ENCRYPTION_KEY)

**✅ Access Control:**
- [ ] HMAC authentication on all n8n → Backend calls
- [ ] User authorization verified before wallet operations
- [ ] Rate limiting on wallet endpoints
- [ ] IP whitelisting for production

**✅ Policy Enforcement:**
- [ ] TTL limits on session signers (default: 24h)
- [ ] Transaction amount limits enforced
- [ ] Daily spending limits tracked
- [ ] Program/contract allowlists configured
- [ ] Auto-expiry of old signers

**✅ Monitoring:**
- [ ] Transaction audit logs enabled
- [ ] Alert on policy violations
- [ ] Alert on unusual usage patterns
- [ ] Daily usage reports
- [ ] Signer expiry notifications

### 7.2 Policy Templates

**Conservative (Default):**
```typescript
{
  ttl: 86400,              // 24 hours
  maxAmount: '1000000000', // 1 SOL max per transaction
  dailyLimit: '5000000000', // 5 SOL daily
  allowedPrograms: [
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB' // Jupiter only
  ],
  requiresQuorum: false
}
```

**Moderate:**
```typescript
{
  ttl: 604800,              // 7 days
  maxAmount: '10000000000', // 10 SOL max
  dailyLimit: '50000000000', // 50 SOL daily
  allowedPrograms: [],      // All programs allowed
  requiresQuorum: false
}
```

**High-Value (Requires Quorum):**
```typescript
{
  ttl: 3600,                // 1 hour
  maxAmount: '100000000000', // 100 SOL max
  dailyLimit: '500000000000', // 500 SOL daily
  allowedPrograms: [],
  requiresQuorum: true      // 2/2 signatures required
}
```

### 7.3 Key Rotation Strategy

```typescript
// Lucid-L2/offchain/src/services/sessionSignerService.ts

/**
 * Rotate session signers periodically
 */
async rotateExpiringSigne rs() {
  const threshold = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h before expiry
  
  const { data: expiring } = await this.supabase
    .from('session_signers')
    .select('*')
    .is('revoked_at', null)
    .lt('expires_at', threshold.toISOString());
  
  for (const signer of expiring || []) {
    // Create new signer with same policies
    const newSigner = await this.createSessionSigner(
      signer.wallet_id,
      signer.user_id,
      {
        ttl: signer.ttl_seconds,
        maxAmount: signer.max_amount_lamports,
        allowedPrograms: signer.allowed_programs,
        dailyLimit: signer.daily_limit_lamports,
        requiresQuorum: signer.requires_quorum
      }
    );
    
    // Revoke old signer
    await this.revokeSessionSigner(signer.id, signer.user_id);
    
    console.log(`Rotated signer ${signer.id} → ${newSigner.signerId}`);
  }
}
```

**Add cron job:**
```bash
# Run every 6 hours
0 */6 * * * cd /home/admin/Lucid/Lucid-L2/offchain && node -e "require('./dist/services/sessionSignerService').SessionSignerService.rotateExpiring()"
```

---

## 👤 Phase 8: User Onboarding Flow

### 8.1 Consent Flow (Required Once)

Users must grant permission to add session signer. Three implementation options:

**Option A: Web Interface**

Create `Lucid-L2/privy-onboarding/index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Wallet Setup - Lucid</title>
  <script src="https://unpkg.com/@privy-io/react-auth@latest/dist/index.js"></script>
</head>
<body>
  <div id="privy-onboarding">
    <h1>Connect Your Wallet</h1>
    <button id="connect-btn">Connect with Privy</button>
    <button id="grant-permission-btn" style="display:none">Grant Automation Permission</button>
  </div>
  
  <script>
    // Initialize Privy client
    const privy = PrivyAuth.init({
      appId: 'YOUR_PRIVY_APP_ID'
    });
    
    // Step 1: Login
    document.getElementById('connect-btn').onclick = async () => {
      await privy.login();
      document.getElementById('grant-permission-btn').style.display = 'block';
    };
    
    // Step 2: Grant permission (add session signer)
    document.getElementById('grant-permission-btn').onclick = async () => {
      const wallet = privy.getActiveWallet();
      
      // Call your backend to add session signer
      const response = await fetch('/api/wallets/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: privy.user.id,
          chainType: 'solana',
          policies: {
            ttl: 86400,
            maxAmount: '1000000000',
            allowedPrograms: ['JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB']
          }
        })
      });
      
      alert('Permission granted! n8n workflows can now trade on your behalf.');
    };
  </script>
</body>
</html>
```

**Option B: CLI Tool**

```bash
# Lucid-L2/offchain/scripts/onboard-user.ts
ts-node scripts/onboard-user.ts --userId=user123 --chain=solana
```

**Option C: Integrate into Existing UI**

Add to your multi-user wrapper/browser extension.

### 8.2 User Communication

**Email Template:**
```
Subject: Grant Automation Permission for Your Wallet

Hi [User],

To enable automated trading on Lucid, we need one-time permission to sign 
transactions on your behalf.

Your wallet remains self-custodial and secure:
✓ Permissions limited by policies you approve
✓ Maximum transaction size: [X SOL/ETH]
✓ Daily spending limit: [Y SOL/ETH]
✓ Expires after: [Z hours/days]
✓ Revocable anytime

[Grant Permission] [Learn More]
```

---

## 🧪 Phase 9: Testing

### 9.1 Unit Tests

```typescript
// Lucid-L2/offchain/src/protocols/adapters/privy/__tests__/PrivyAdapter.test.ts

describe('PrivyAdapter', () => {
  it('should create a wallet for a user', async () => {
    const result = await adapter.execute('createUser', {
      userId: 'test-user',
      chainType: 'solana'
    }, context);
    
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('walletId');
    expect(result.data).toHaveProperty('address');
  });
  
  it('should add session signer with policies', async () => {
    const result = await adapter.execute('addSessionSigner', {
      walletId: 'test-wallet-id',
      userId: 'test-user',
      ttl: 86400,
      maxAmount: '1000000000'
    }, context);
    
    expect(result.success).toBe(true);
  });
  
  it('should deny transaction exceeding limits', async () => {
    const result = await sessionSignerService.canSign(
      'test-user',
      'test-wallet',
      { amount: '99999999999' } // Exceeds limit
    );
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceeds limit');
  });
});
```

### 9.2 Integration Tests

```bash
# Test end-to-end flow
cd Lucid-L2/offchain

# 1. Create test user and wallet
curl -X POST http://localhost:3001/api/wallets/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-001",
    "chainType": "solana",
    "policies": {
      "ttl": 3600,
      "maxAmount": "1000000000"
    }
  }'

# 2. Build test transaction
# (Use Jupiter SDK or similar to build a real Solana transaction)

# 3. Sign via backend
curl -X POST http://localhost:3001/api/wallets/WALLET_ID/sign-transaction \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-001",
    "transaction": "BASE64_ENCODED_TRANSACTION",
    "chainType": "solana",
    "n8nWorkflowId": "test-workflow",
    "n8nExecutionId": "test-exec-001"
  }'

# 4. Verify in audit log
# Check signer_audit_log table in Supabase
```

### 9.3 n8n Workflow Testing

1. Import test workflow: `Lucid-L2/n8n/workflows/privy-wallet-test.json`
2. Configure with test user ID
3. Trigger manually
4. Verify transaction in Solscan/Etherscan
5. Check audit logs

---

## 📊 Phase 10: Monitoring & Maintenance

### 10.1 Monitoring Dashboard

Query audit logs for insights:

```sql
-- Daily transaction volume per user
SELECT 
  user_id,
  chain_type,
  COUNT(*) as tx_count,
  SUM(amount_lamports) as total_amount,
  DATE(created_at) as date
FROM signer_audit_log
WHERE status = 'success'
GROUP BY user_id, chain_type, DATE(created_at)
ORDER BY date DESC, total_amount DESC;

-- Policy violation attempts
SELECT 
  user_id,
  denial_reason,
  COUNT(*) as attempt_count,
  MAX(created_at) as last_attempt
FROM signer_audit_log
WHERE status = 'denied'
GROUP BY user_id, denial_reason
ORDER BY attempt_count DESC;

-- Active session signers by expiry
SELECT 
  user_id,
  COUNT(*) as active_signers,
  MIN(expires_at) as earliest_expiry,
  MAX(expires_at) as latest_expiry
FROM session_signers
WHERE revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at > NOW())
GROUP BY user_id;
```

### 10.2 Alerting

```typescript
// Lucid-L2/offchain/src/services/alertService.ts

class AlertService {
  /**
   * Alert on suspicious activity
   */
  async checkAnomalies() {
    // High frequency transactions
    const { data: highFreq } = await this.supabase
      .rpc('get_high_frequency_users', { threshold: 100 }); // 100 tx/hour
    
    if (highFreq && highFreq.length > 0) {
      await this.sendAlert('High frequency trading detected', highFreq);
    }
    
    // Unusual amounts
    const { data: largeAmounts } = await this.supabase
      .from('signer_audit_log')
      .select('*')
      .eq('status', 'success')
      .gte('amount_lamports', '100000000000') // > 100 SOL
      .gte('created_at', new Date(Date.now() - 3600000).toISOString());
    
    if (largeAmounts && largeAmounts.length > 0) {
      await this.sendAlert('Large transaction detected', largeAmounts);
    }
  }
  
  async sendAlert(title: string, data: any) {
    // Send to Slack, email, or monitoring system
    console.error(`🚨 ALERT: ${title}`, data);
  }
}
```

### 10.3 Cleanup Tasks

```typescript
/**
 * Clean up expired/revoked signers
 */
async cleanupOldSigners() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  
  await this.supabase
    .from('session_signers')
    .delete()
    .or(`revoked_at.lt.${cutoff.toISOString()},expires_at.lt.${cutoff.toISOString()}`);
}

/**
 * Archive old audit logs
 */
async archiveOldLogs() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
  
  // Move to archive table
  await this.supabase.rpc('archive_old_audit_logs', { cutoff_date: cutoff });
}
```

---

## 🚀 Phase 11: Deployment

### 11.1 Deployment Checklist

**Pre-deployment:**
- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] Privy Dashboard configured correctly
- [ ] Authorization keys generated and registered
- [ ] Tests passing
- [ ] Security review completed

**Deployment:**
```bash
# 1. Build backend
cd Lucid-L2/offchain
npm run build

# 2. Deploy database migrations
cd ../infrastructure
npx supabase db push --linked

# 3. Restart backend API
pm2 restart lucid-api

# 4. Restart n8n (if needed)
cd ../n8n
docker-compose restart n8n

# 5. Verify health
curl http://localhost:3001/health
curl http://localhost:5678/
```

**Post-deployment:**
- [ ] Monitor logs for errors
- [ ] Verify first user onboarding
- [ ] Test transaction signing
- [ ] Check audit logs
- [ ] Set up alerts

### 11.2 Rollback Plan

```bash
# If issues arise:

# 1. Revert database migration
cd Lucid-L2/infrastructure
npx supabase db reset --linked

# 2. Disable Privy adapter
# Comment out in src/protocols/adapters/index.ts

# 3. Restart services
pm2 restart lucid-api
docker-compose restart n8n
```

---

## 📚 Phase 12: Documentation

### 12.1 User Guide

Create `PRIVY-USER-GUIDE.md` for end users:

```markdown
# How to Connect Your Wallet for Automated Trading

## Step 1: Initial Setup
1. Visit [your-app-url]/wallet-setup
2. Click "Connect Wallet"
3. Choose your login method (email, phone, etc.)
4. Your wallet will be created automatically

## Step 2: Grant Automation Permission
1. Review the permissions being requested:
   - Maximum per transaction: X SOL
   - Daily limit: Y SOL
   - Expires after: Z hours
2. Click "Grant Permission"
3. Confirm in the popup

## Step 3: Configure Automation
1. Set your trading strategy in Settings
2. Enable automation toggle
3. Your wallet will now trade automatically!

## Revoking Permission
To revoke automation permission at any time:
1. Go to Settings → Wallet
2. Click "Revoke Automation"
3. Confirm revocation

Your funds are always safe and under your control.
```

### 12.2 Developer Guide

Create `PRIVY-DEVELOPER-GUIDE.md`:

```markdown
# Privy Integration - Developer Guide

## Adding New Operations

1. Define operation in `operations.ts`
2. Implement handler in `PrivyAdapter.ts`
3. Add to Protocol Registry
4. Update tests
5. Document in README

## Creating Custom Policies

```typescript
const customPolicy = {
  ttl: 604800,  // 1 week
  maxAmount: '5000000000',  // 5 SOL
  allowedPrograms: [
    'CUSTOM_PROGRAM_ID_1',
    'CUSTOM_PROGRAM_ID_2'
  ],
  dailyLimit: '10000000000',
  requiresQuorum: false
};
```

## Troubleshooting

### "No active session signer found"
- Check signer hasn't expired
- Verify not revoked
- Check user_id matches

### "Program ID not in allowlist"
- Add program to allowed_programs array
- Or remove allowlist to allow all programs

### "Daily limit exceeded"
- Wait for daily reset (midnight UTC)
- Or increase daily_limit policy
```

---

## 🔍 Phase 13: Common Use Cases

### 13.1 Automated DCA (Dollar Cost Averaging)

```typescript
// n8n workflow: Buy SOL every day

{
  "trigger": "Schedule (daily at 9am)",
  "nodes": [
    {
      "name": "Get User Wallet",
      "operation": "GET /api/wallets/:userId/solana"
    },
    {
      "name": "Build Jupiter Swap",
      "code": "// Build USDC → SOL swap transaction"
    },
    {
      "name": "Sign and Send",
      "operation": "POST /api/wallets/:walletId/sign-transaction"
    },
    {
      "name": "Notify User",
      "operation": "Send email with transaction link"
    }
  ]
}
```

### 13.2 Limit Orders

```typescript
// n8n workflow: Execute when price condition met

{
  "trigger": "Schedule (every 5 minutes)",
  "nodes": [
    {
      "name": "Check SOL Price",
      "operation": "HTTP Request to price oracle"
    },
    {
      "name": "Price Condition",
      "if": "{{ $json.price <= TARGET_PRICE }}"
    },
    {
      "name": "Execute Swap",
      "operation": "POST /api/wallets/:walletId/sign-transaction"
    }
  ]
}
```

### 13.3 Telegram Trading Bot

```typescript
// Telegram bot receives command: /buy SOL 1

{
  "trigger": "Telegram bot webhook",
  "nodes": [
    {
      "name": "Parse Command",
      "code": "// Extract amount and token"
    },
    {
      "name": "Verify User",
      "operation": "Check user has active session signer"
    },
    {
      "name": "Build Transaction",
      "operation": "Jupiter SDK"
    },
    {
      "name": "Sign and Send",
      "operation": "POST /api/wallets/:walletId/sign-transaction"
    },
    {
      "name": "Reply to User",
      "operation": "Telegram: Transaction confirmed!"
    }
  ]
}
```

---

## 🛡️ Security Best Practices

### ✅ DO:

1. **Always encrypt session signer private keys in database**
2. **Set conservative TTL limits** (24h default)
3. **Use program/contract allowlists** for known protocols
4. **Enable daily limits** to prevent runaways
5. **Log all transactions** for audit trail
6. **Rotate keys regularly** (automated rotation recommended)
7. **Monitor for anomalies** (high frequency, large amounts)
8. **Use quorum approvals** for high-value operations
9. **Validate user consent** before creating signers
10. **Store Privy credentials in env vars**, never in code

### ❌ DON'T:

1. **Never expose Privy API directly to n8n workflows**
2. **Never store unencrypted private keys**
3. **Never use unlimited TTL** (always set expiry)
4. **Never skip policy enforcement** checks
5. **Never trust frontend input** without validation
6. **Never log private keys** or sensitive data
7. **Don't reuse session signers** across users
8. **Don't allow* unlimited amounts** or programs

---

## 📖 API Reference

### Backend Endpoints

#### Create Wallet & Session Signer

```http
POST /api/wallets/onboard
Content-Type: application/json

{
  "userId": "string",
  "chainType": "solana" | "ethereum",
  "policies": {
    "ttl": 86400,
    "maxAmount": "1000000000",
    "allowedPrograms": ["program_id_1"],
    "dailyLimit": "5000000000"
  }
}

Response: {
  "wallet": {
    "walletId": "string",
    "address": "string",
    "chainType": "string"
  },
  "sessionSigner": {
    "signerId": "string",
    "expiresAt": "timestamp"
  }
}
```

#### Sign Transaction

```http
POST /api/wallets/:walletId/sign-transaction
Content-Type: application/json

{
  "userId": "string",
  "transaction": "base64_encoded_transaction",
  "chainType": "solana" | "ethereum",
  "n8nWorkflowId": "string",
  "n8nExecutionId": "string"
}

Response: {
  "success": true,
  "data": {
    "signature": "string",
    "hash": "string"
  }
}

Error Response (403): {
  "error": "Transaction amount exceeds limit"
}
```

#### Revoke Session Signer

```http
DELETE /api/wallets/:walletId/session-signers/:signerId
Content-Type: application/json

{
  "userId": "string"
}

Response: {
  "success": true
}
```

---

## 🎯 Implementation Roadmap

### Week 1: Infrastructure
- [x] Privy account setup
- [ ] Generate authorization keys
- [ ] Configure environment variables
- [ ] Create database schema
- [ ] Run migrations

### Week 2: Core Services
- [ ] Implement SessionSignerService
- [ ] Create PrivyRestClient
- [ ] Build SignatureGenerator
- [ ] Implement PolicyManager
- [ ] Add encryption utilities

### Week 3: Protocol Adapter
- [ ] Create PrivyAdapter
- [ ] Define all operations
- [ ] Implement Solana operations
- [ ] Implement Ethereum operations
- [ ] Register adapter

### Week 4: Backend API
- [ ] Create wallet routes
- [ ] Add policy enforcement
- [ ] Implement audit logging
- [ ] Add dynamic options endpoint
- [ ] Integration testing

### Week 5: n8n Integration
- [ ] Create example workflows
- [ ] Test autonomous execution
- [ ] Configure HMAC authentication
- [ ] Performance testing
- [ ] Documentation

### Week 6: User Onboarding
- [ ] Build consent UI
- [ ] User communication templates
- [ ] Onboarding flow testing
- [ ] User guide creation
- [ ] Beta testing

### Week 7: Production
- [ ] Security audit
- [ ] Load testing
- [ ] Monitoring setup
- [ ] Alert configuration
- [ ] Production deployment

---

## 🆘 Troubleshooting

### Common Issues

**❌ "Failed to generate authorization signature"**
- **Cause:** Private key not found or incorrectly formatted
- **Fix:** Verify PRIVY_AUTH_PRIVATE_KEY path, check file permissions

**❌ "Session signer expired"**
- **Cause:** TTL exceeded
- **Fix:** Implement auto-rotation, or user must re-grant permission

**❌ "Transaction amount exceeds limit"**
- **Cause:** Policy violation
- **Fix:** Adjust maxAmount policy or split into smaller transactions

**❌ "Program ID not in allowlist"**
- **Cause:** Trying to interact with non-whitelisted program
- **Fix:** Add program to allowed_programs or remove allowlist

**❌ "Daily limit exceeded"**
- **Cause:** User hit daily spending cap
- **Fix:** Wait for UTC midnight reset, or increase dailyLimit

### Debug Mode

Enable verbose logging:

```bash
# Lucid-L2/offchain/.env
PRIVY_DEBUG=true
LOG_LEVEL=debug
```

Check logs:

```bash
# Backend logs
tail -f logs/lucid-api.log | grep PRIVY

# n8n execution logs
docker-compose logs -f n8n | grep wallet
```

---

## 📞 Support & Resources

### Privy Documentation
- [Embedded Wallets](https://docs.privy.io/wallets/overview)
- [Session Signers](https://docs.privy.io/wallets/using-wallets/session-signers/overview)
- [Policies & Controls](https://docs.privy.io/controls/overview)
- [REST API Reference](https://docs.privy.io/api-reference/introduction)

### Lucid Resources
- Protocol SDK: `Lucid-L2/offchain/PROTOCOL-SDK-README.md`
- n8n Integration: `Lucid-L2/N8N-INTEGRATION-GUIDE.md`
- Supabase Schema: `Lucid-L2/infrastructure/README.md`

### Community
- Privy Slack: [privy.io/slack](https://privy.io/slack)
- GitHub Issues: [your-repo/issues](https://github.com/your-org/lucid/issues)

---

## ✅ Completion Checklist

Before going live, verify:

- [ ] ✅ Privy account created and configured
- [ ] ✅ Authorization keys generated and registered
- [ ] ✅ Environment variables set correctly
- [ ] ✅ Database schema deployed
- [ ] ✅ SessionSignerService implemented
- [ ] ✅ PrivyAdapter created and registered
- [ ] ✅ Backend API endpoints working
- [ ] ✅ n8n workflows configured
- [ ] ✅ User onboarding flow tested
- [ ] ✅ Policy templates defined
- [ ] ✅ Security checklist completed
- [ ] ✅ Monitoring and alerts configured
- [ ] ✅ Documentation complete
- [ ] ✅ Team trained on system
- [ ] ✅ Beta testing successful
- [ ] ✅ Production deployment planned

---

## 🎉 Quick Start (After Implementation)

### For End Users:

1. Visit wallet setup page
2. Connect with email/phone
3. Grant automation permission
4. Start trading!

### For Developers:

```bash
# 1. Clone repo
git clone https://github.com/your-org/lucid
cd Lucid-L2/offchain

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your Privy credentials

# 4. Run migrations
cd ../infrastructure
npx supabase db push

# 5. Start services
cd ../offchain
npm run dev

# 6. Test
curl http://localhost:3001/api/wallets/onboard -X POST \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","chainType":"solana","policies":{}}'
```

---

## 📝 Next Steps

After completing this integration:

1. **Optimize Policies** - Fine-tune based on user feedback
2. **Add More Chains** - Expand beyond Solana/Ethereum
3. **Custom n8n Nodes** - Create Privy-specific nodes for better UX
4. **Advanced Features** - Multi-sig, hardware wallet integration
5. **Analytics Dashboard** - Build admin UI for monitoring
6. **Mobile SDK** - Enable mobile app wallet integration
7. **Cross-Chain** - Bridge operations between chains

---

**Version:** 1.0.0  
**Last Updated:** 2025-01-31  
**Maintainer:** Lucid Team
</final_file_content>

IMPORTANT: For any future changes to this file, use the final_file_content shown above as your reference. This content reflects the current state of the file, including any auto-formatting (e.g., if you used single quotes but the formatter converted them to double quotes). Always base your SEARCH/REPLACE operations on this final version to ensure accuracy.


<task_progress>
- [x] Create comprehensive implementation guide
- [x] Document architecture and data flow
- [x] Define database schema with migrations
- [x] Specify Protocol Adapter structure
- [x] Detail Session Signer Service implementation
- [x] Document Backend API endpoints
- [x] Provide n8n workflow examples
- [x] Include security best practices
- [x] Add testing strategies
- [x] Create deployment checklist
- [x] Document troubleshooting steps
- [x] Provide API reference
- [x] Include user and developer guides
