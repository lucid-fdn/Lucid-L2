/**
 * Privy Protocol Adapter
 * 
 * Integrates Privy embedded wallets with autonomous n8n workflow execution
 * using Session Signers (Delegated Actions) for secure, server-side operations.
 */

import { BaseProtocolAdapter } from '../../BaseProtocolAdapter';
import {
  ProtocolMetadata,
  OperationDefinition,
  CredentialSchema,
  ExecutionContext,
  ExecutionResult,
  NetworkConfig,
  HealthStatus
} from '../../types';
import { PRIVY_OPERATIONS } from './operations';
import { PrivyCredentials, SessionSignerConfig, SignTransactionParams } from './types';
import { PrivyRestClient } from './PrivyRestClient';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export class PrivyAdapter extends BaseProtocolAdapter {
  private client: PrivyRestClient | null = null;
  private supabase: SupabaseClient | null = null;

  // =============================================================================
  // Protocol Metadata
  // =============================================================================

  getMetadata(): ProtocolMetadata {
    return {
      id: 'privy',
      name: 'Privy Wallets',
      category: 'identity',
      version: '1.0.0',
      description: 'Self-custodial embedded wallets with autonomous n8n workflow execution. Secure server-side signing with policy-based controls.',
      icon: '/cryptos/privy.png',
      docsUrl: 'https://docs.privy.io',
      networks: ['mainnet', 'testnet'],
      tags: ['wallet', 'embedded', 'custody', 'session-signer', 'delegated-actions'],
      author: 'Lucid Team',
      repository: 'https://github.com/yourusername/lucid'
    };
  }

  // =============================================================================
  // Operations
  // =============================================================================

  getOperations(): OperationDefinition[] {
    return PRIVY_OPERATIONS;
  }

  // =============================================================================
  // Credentials
  // =============================================================================

  getCredentialSchema(): CredentialSchema {
    return {
      fields: [
        {
          name: 'appId',
          label: 'Privy App ID',
          type: 'apiKey',
          required: true,
          description: 'Your Privy application ID from dashboard.privy.io'
        },
        {
          name: 'appSecret',
          label: 'Privy App Secret',
          type: 'apiKey',
          required: true,
          description: 'Your Privy application secret key',
          encrypted: true
        },
        {
          name: 'authPrivateKey',
          label: 'Authorization Private Key Path',
          type: 'privateKey',
          required: true,
          description: 'Path to ECDSA private key file or hex-encoded key for signing requests',
          encrypted: true
        },
        {
          name: 'keyQuorumId',
          label: 'Key Quorum ID',
          type: 'apiKey',
          required: true,
          description: 'Your Key Quorum ID from Privy Dashboard'
        },
        {
          name: 'apiBaseUrl',
          label: 'API Base URL (Optional)',
          type: 'apiKey',
          required: false,
          description: 'Custom Privy API endpoint (default: https://api.privy.io/v1)'
        }
      ],
      instructions: 'Configure your Privy embedded wallet credentials. Generate ECDSA key pair using: openssl ecparam -name prime256v1 -genkey -noout -out privy-auth-private.pem',
      setupUrl: 'https://docs.privy.io/wallets/using-wallets/session-signers'
    };
  }

  // =============================================================================
  // Networks
  // =============================================================================

  getSupportedNetworks(): NetworkConfig[] {
    return [
      {
        id: 'mainnet',
        name: 'Mainnet (Multi-Chain)',
        isTestnet: false,
        rpcUrl: 'https://api.privy.io/v1',
        metadata: {
          supportedChains: ['solana', 'ethereum', 'base', 'polygon', 'arbitrum']
        }
      },
      {
        id: 'testnet',
        name: 'Testnet (Multi-Chain)',
        isTestnet: true,
        rpcUrl: 'https://api.privy.io/v1',
        metadata: {
          supportedChains: ['solana-devnet', 'ethereum-sepolia', 'base-sepolia']
        }
      }
    ];
  }

  // =============================================================================
  // Initialization
  // =============================================================================

  async initialize(config: any): Promise<void> {
    await super.initialize(config);

    const configCreds = (config as any).credentials || {};
    const credentials: PrivyCredentials = {
      appId: configCreds.appId || process.env.PRIVY_APP_ID!,
      appSecret: configCreds.appSecret || process.env.PRIVY_APP_SECRET!,
      authPrivateKey: configCreds.authPrivateKey || process.env.PRIVY_AUTH_PRIVATE_KEY!,
      keyQuorumId: configCreds.keyQuorumId || process.env.PRIVY_KEY_QUORUM_ID!,
      apiBaseUrl: configCreds.apiBaseUrl || process.env.PRIVY_API_BASE_URL
    };

    // Initialize Privy REST client
    this.client = new PrivyRestClient(credentials);

    // Initialize Supabase for database operations
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    console.log(`✅ Privy adapter initialized`);
  }

  async cleanup(): Promise<void> {
    this.client = null;
    this.supabase = null;
    await super.cleanup();
  }

  // =============================================================================
  // Operation Execution
  // =============================================================================

  async execute(
    operationId: string,
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    this.ensureInitialized();

    if (!this.client || !this.supabase) {
      return this.error('Privy client not initialized', 'NOT_INITIALIZED');
    }

    try {
      switch (operationId) {
        // User & Wallet Management
        case 'createUser':
          return await this.handleCreateUser(parameters, context);
        
        case 'getWallet':
          return await this.handleGetWallet(parameters, context);
        
        // Session Signer Management
        case 'addSessionSigner':
          return await this.handleAddSessionSigner(parameters, context);
        
        case 'revokeSessionSigner':
          return await this.handleRevokeSessionSigner(parameters, context);
        
        case 'listSessionSigners':
          return await this.handleListSessionSigners(parameters, context);
        
        // Transaction Operations (Solana)
        case 'signSolanaTransaction':
          return await this.handleSignSolanaTransaction(parameters, context);
        
        case 'signAndSendSolanaTransaction':
          return await this.handleSignAndSendSolanaTransaction(parameters, context);
        
        // Transaction Operations (Ethereum)
        case 'signEthereumTransaction':
          return await this.handleSignEthereumTransaction(parameters, context);
        
        case 'sendEthereumTransaction':
          return await this.handleSendEthereumTransaction(parameters, context);
        
        default:
          return this.error(`Unknown operation: ${operationId}`, 'UNKNOWN_OPERATION');
      }
    } catch (error) {
      return this.error(
        error instanceof Error ? error.message : 'Unknown error',
        'EXECUTION_ERROR'
      );
    }
  }

  // =============================================================================
  // Operation Handlers
  // =============================================================================

  /**
   * Create a new Privy user with embedded wallet
   */
  private async handleCreateUser(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const userId = params.userId as string;
    const chainType = params.chainType as string;

    const { result, duration } = await this.measure(async () => {
      // Check if user already exists
      const { data: existing } = await this.supabase!
        .from('user_wallets')
        .select('*')
        .eq('user_id', userId)
        .eq('chain_type', chainType)
        .single();

      if (existing) {
        return {
          walletId: existing.wallet_id,
          address: existing.wallet_address,
          chainType: existing.chain_type,
          privyUserId: existing.privy_user_id,
          existed: true
        };
      }

      // Create new Privy user with embedded wallet
      const privyUser = await this.client!.createUser({ chainType });
      
      // Extract wallet info
      const wallet = privyUser.linked_accounts?.find((acc: any) => 
        acc.type === 'wallet' && acc.chain_type === chainType
      );

      if (!wallet) {
        throw new Error('Wallet not created');
      }

      // Store in database
      const { data, error } = await this.supabase!
        .from('user_wallets')
        .insert({
          user_id: userId,
          privy_user_id: privyUser.id,
          wallet_address: wallet.address,
          wallet_id: wallet.id,
          chain_type: chainType
        })
        .select()
        .single();

      if (error) throw error;

      return {
        walletId: wallet.id,
        address: wallet.address,
        chainType: chainType,
        privyUserId: privyUser.id,
        existed: false
      };
    });

    return this.success(result, { duration });
  }

  /**
   * Get user wallet details
   */
  private async handleGetWallet(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const userId = params.userId as string;
    const chainType = params.chainType as string;

    const { result, duration } = await this.measure(async () => {
      const { data, error } = await this.supabase!
        .from('user_wallets')
        .select('*')
        .eq('user_id', userId)
        .eq('chain_type', chainType)
        .single();

      if (error || !data) {
        throw new Error(`Wallet not found for user ${userId} on ${chainType}`);
      }

      return {
        walletId: data.wallet_id,
        address: data.wallet_address,
        chainType: data.chain_type,
        privyUserId: data.privy_user_id,
        createdAt: data.created_at
      };
    });

    return this.success(result, { duration });
  }

  /**
   * Add session signer to enable autonomous transactions
   */
  private async handleAddSessionSigner(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const walletId = params.walletId as string;
    const userId = params.userId as string;

    const { result, duration } = await this.measure(async () => {
      // Get wallet from database
      const { data: wallet } = await this.supabase!
        .from('user_wallets')
        .select('*')
        .eq('wallet_id', walletId)
        .eq('user_id', userId)
        .single();

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Generate new ECDSA key pair for session signer
      const { ec } = await import('elliptic');
      const curve = new ec('p256');
      const keyPair = curve.genKeyPair();
      
      const privateKey = keyPair.getPrivate('hex');
      const publicKey = keyPair.getPublic('hex');

      // Prepare policies
      const policies: any = {};
      if (params.ttl) policies.ttl = params.ttl;
      if (params.maxAmount) policies.max_amount = params.maxAmount;
      if (params.allowedPrograms) policies.allowed_programs = params.allowedPrograms;
      if (params.allowedContracts) policies.allowed_contracts = params.allowedContracts;
      if (params.dailyLimit) policies.daily_limit = params.dailyLimit;
      if (params.requiresQuorum) policies.requires_quorum = params.requiresQuorum;

      // Add session signer via Privy API
      const configCreds = (this.config as any).credentials || {};
      const signerResponse = await this.client!.addSessionSigner({
        walletId,
        authorizationKeyPublic: publicKey,
        keyQuorumId: configCreds.keyQuorumId || process.env.PRIVY_KEY_QUORUM_ID!,
        policies: Object.keys(policies).length > 0 ? policies : undefined
      });

      // Encrypt and store in database
      const encryptedPrivateKey = this.encryptKey(privateKey);
      const expiresAt = params.ttl
        ? new Date(Date.now() + (params.ttl as number) * 1000)
        : null;

      const { data: signer, error } = await this.supabase!
        .from('session_signers')
        .insert({
          wallet_id: wallet.id,
          user_id: userId,
          privy_signer_id: signerResponse.id,
          authorization_key_private: encryptedPrivateKey,
          authorization_key_public: publicKey,
          ttl_seconds: params.ttl || null,
          max_amount_lamports: params.maxAmount || null,
          max_amount_wei: params.maxAmount || null,
          allowed_programs: params.allowedPrograms as string[] || null,
          allowed_contracts: params.allowedContracts as string[] || null,
          daily_limit_lamports: params.dailyLimit || null,
          daily_limit_wei: params.dailyLimit || null,
          requires_quorum: params.requiresQuorum || false,
          expires_at: expiresAt
        })
        .select()
        .single();

      if (error) throw error;

      return {
        signerId: signer.id,
        privySignerId: signerResponse.id,
        expiresAt: signer.expires_at,
        policies: {
          ttl: signer.ttl_seconds,
          maxAmount: signer.max_amount_lamports || signer.max_amount_wei,
          allowedPrograms: signer.allowed_programs,
          allowedContracts: signer.allowed_contracts,
          dailyLimit: signer.daily_limit_lamports || signer.daily_limit_wei,
          requiresQuorum: signer.requires_quorum
        }
      };
    });

    return this.success(result, { duration });
  }

  /**
   * Revoke session signer
   */
  private async handleRevokeSessionSigner(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const walletId = params.walletId as string;
    const signerId = params.signerId as string;

    const { result, duration } = await this.measure(async () => {
      // Get signer from database
      const { data: signer } = await this.supabase!
        .from('session_signers')
        .select('*')
        .eq('id', signerId)
        .single();

      if (!signer) {
        throw new Error('Session signer not found');
      }

      // Revoke via Privy API
      await this.client!.revokeSessionSigner(walletId, signer.privy_signer_id);

      // Update database
      await this.supabase!
        .from('session_signers')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', signerId);

      return { success: true, signerId };
    });

    return this.success(result, { duration });
  }

  /**
   * List session signers for a wallet
   */
  private async handleListSessionSigners(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const walletId = params.walletId as string;

    const { result, duration } = await this.measure(async () => {
      const { data: wallet } = await this.supabase!
        .from('user_wallets')
        .select('id')
        .eq('wallet_id', walletId)
        .single();

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const { data: signers } = await this.supabase!
        .from('session_signers')
        .select('*')
        .eq('wallet_id', wallet.id)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });

      return signers || [];
    });

    return this.success(result, { duration, count: result.length });
  }

  /**
   * Sign Solana transaction (offline)
   */
  private async handleSignSolanaTransaction(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const walletId = params.walletId as string;
    const transaction = params.transaction as string;

    const { result, duration } = await this.measure(async () => {
      const signedTx = await this.client!.signSolanaTransaction(walletId, transaction);
      return { signedTransaction: signedTx };
    });

    return this.success(result, { duration });
  }

  /**
   * Sign and send Solana transaction
   */
  private async handleSignAndSendSolanaTransaction(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const walletId = params.walletId as string;
    const userId = params.userId as string;
    const transaction = params.transaction as string;

    const { result, duration } = await this.measure(async () => {
      // Check policy enforcement
      const canSign = await this.checkCanSign(userId, walletId, params);
      if (!canSign.allowed) {
        throw new Error(`Transaction denied: ${canSign.reason}`);
      }

      // Sign and send
      const response = await this.client!.signAndSendSolanaTransaction(walletId, transaction);

      // Log transaction
      await this.logTransaction({
        userId,
        walletId,
        signerId: canSign.signerId,
        transactionType: 'signAndSend',
        chainType: 'solana',
        transactionSignature: response.signature,
        status: 'success',
        n8nWorkflowId: params.n8nWorkflowId as string,
        n8nExecutionId: params.n8nExecutionId as string
      });

      return response;
    });

    return this.success(result, { duration });
  }

  /**
   * Sign Ethereum transaction (offline)
   */
  private async handleSignEthereumTransaction(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const walletId = params.walletId as string;
    const transaction = params.transaction as any;

    const { result, duration } = await this.measure(async () => {
      const signedTx = await this.client!.signEthereumTransaction(walletId, transaction);
      return { signedTransaction: signedTx };
    });

    return this.success(result, { duration });
  }

  /**
   * Sign and send Ethereum transaction
   */
  private async handleSendEthereumTransaction(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const walletId = params.walletId as string;
    const userId = params.userId as string;
    const transaction = params.transaction as any;

    const { result, duration } = await this.measure(async () => {
      // Check policy enforcement
      const canSign = await this.checkCanSign(userId, walletId, params);
      if (!canSign.allowed) {
        throw new Error(`Transaction denied: ${canSign.reason}`);
      }

      // Sign and send
      const response = await this.client!.sendEthereumTransaction(walletId, transaction);

      // Log transaction
      await this.logTransaction({
        userId,
        walletId,
        signerId: canSign.signerId,
        transactionType: 'signAndSend',
        chainType: 'ethereum',
        transactionHash: response.hash,
        status: 'success',
        n8nWorkflowId: params.n8nWorkflowId as string,
        n8nExecutionId: params.n8nExecutionId as string
      });

      return response;
    });

    return this.success(result, { duration });
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  /**
   * Check if transaction can be signed based on policies
   */
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

    // Use first active signer (could implement more sophisticated selection)
    const signer = signers[0];

    // Check policies...
    // (Policy enforcement logic would go here)

    return { allowed: true, signerId: signer.id };
  }

  /**
   * Log transaction to audit table
   */
  private async logTransaction(details: {
    userId: string;
    walletId: string;
    signerId?: string;
    transactionType: string;
    chainType: string;
    transactionSignature?: string;
    transactionHash?: string;
    status: 'success' | 'denied' | 'error';
    denialReason?: string;
    errorMessage?: string;
    n8nWorkflowId?: string;
    n8nExecutionId?: string;
  }): Promise<void> {
    const { data: wallet } = await this.supabase!
      .from('user_wallets')
      .select('id')
      .eq('wallet_id', details.walletId)
      .single();

    await this.supabase!
      .from('signer_audit_log')
      .insert({
        signer_id: details.signerId,
        wallet_id: wallet?.id,
        user_id: details.userId,
        transaction_type: details.transactionType,
        chain_type: details.chainType,
        transaction_signature: details.transactionSignature,
        transaction_hash: details.transactionHash,
        status: details.status,
        denial_reason: details.denialReason,
        error_message: details.errorMessage,
        n8n_workflow_id: details.n8nWorkflowId,
        n8n_execution_id: details.n8nExecutionId
      });
  }

  /**
   * Simple encryption for private keys (for demo - use proper KMS in production)
   */
  private encryptKey(key: string): string {
    const crypto = require('crypto');
    const encryptionKey = process.env.PRIVY_SIGNER_ENCRYPTION_KEY || 'default-key-change-me';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(encryptionKey.padEnd(32, '0').slice(0, 32)), iv);
    let encrypted = cipher.update(key, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  // =============================================================================
  // Health Check
  // =============================================================================

  async checkHealth(): Promise<HealthStatus> {
    if (!this.client) {
      return {
        status: 'down',
        message: 'Privy client not initialized',
        lastCheck: Date.now()
      };
    }

    try {
      const start = Date.now();
      const healthy = await this.client.healthCheck();
      const latency = Date.now() - start;

      return {
        status: healthy ? 'healthy' : 'down',
        message: healthy ? 'All systems operational' : 'Health check failed',
        lastCheck: Date.now(),
        networks: {
          [this.config.network || 'mainnet']: {
            status: healthy ? 'healthy' : 'down',
            latency
          }
        }
      };
    } catch (error) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Health check failed',
        lastCheck: Date.now()
      };
    }
  }
}
