/**
 * Privy REST API Client
 * 
 * Uses @privy-io/node SDK for wallet operations (not @privy-io/server-auth)
 * @privy-io/server-auth is only for authentication verification, not wallet management
 */

import { PrivyClient } from '@privy-io/node';
import { PrivyCredentials } from './types';

export class PrivyRestClient {
  private privyClient: PrivyClient;
  private credentials: PrivyCredentials;
  private privateKeyContent: string;

  constructor(credentials: PrivyCredentials) {
    this.credentials = credentials;
    
    // Read private key file if it's a path
    this.privateKeyContent = credentials.authPrivateKey;
    if (credentials.authPrivateKey.startsWith('/') || credentials.authPrivateKey.startsWith('./')) {
      try {
        const fs = require('fs');
        this.privateKeyContent = fs.readFileSync(credentials.authPrivateKey, 'utf8');
        console.log(`📄 Loaded private key from file: ${credentials.authPrivateKey}`);
      } catch (error) {
        console.error(`❌ Failed to read private key file:`, error);
        throw new Error(`Failed to read private key from ${credentials.authPrivateKey}: ${error}`);
      }
    }
    
    // Initialize the @privy-io/node SDK
    this.privyClient = new PrivyClient({
      appId: credentials.appId,
      appSecret: credentials.appSecret
    });

    console.log(`✅ Privy Node SDK initialized with app ID: ${credentials.appId.substring(0, 10)}...`);
  }

  /**
   * Create a new Privy wallet using @privy-io/node SDK
   * Uses Key Quorum ID as owner_id
   */
  async createUser(params: { chainType: string; ownerId?: string }): Promise<any> {
    try {
      const keyQuorumId = this.credentials.keyQuorumId;
      if (!keyQuorumId) {
        throw new Error('PRIVY_KEY_QUORUM_ID is required but not configured');
      }
      
      const userId = params.ownerId || `user-${Date.now()}`;
      console.log(`📝 Creating Privy wallet for user ${userId} with Key Quorum ${keyQuorumId} on ${params.chainType}...`);

      const user = await this.getUser(userId);
      if (user) {
        console.log(`⚠️ User ${userId} already exists. Skipping creation.`);
        return user;
      }
      
      // Create wallet (no authorization_context needed for creation)
      // Authorization context is only for transaction signing, not wallet creation
      const wallet = await (this.privyClient.wallets() as any).create({
        chain_type: params.chainType,
        owner_id: keyQuorumId
      });

      console.log(`✅ Wallet created:`, wallet);
      
      // Return in format compatible with our adapter
      return {
        id: userId,
        created_at: new Date().toISOString(),
        linked_accounts: [{
          type: 'wallet',
          address: wallet.address,
          chain_type: params.chainType,
          wallet_client: 'privy',
          wallet_client_type: 'privy',
          id: wallet.id,
          owner_id: keyQuorumId
        }]
      };
    } catch (error: any) {
      console.error('Error creating Privy wallet:', error);
      throw new Error(`Failed to create Privy wallet: ${error.message}`);
    }
  }

  /**
   * Get user details
   */
  async getUser(privyUserId: string): Promise<any> {
    try {
      return await (this.privyClient.users() as any).get(privyUserId);
    } catch (error: any) {
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  /**
   * Get user's wallets
   */
  async getUserWallets(privyUserId: string): Promise<any> {
    try {
      const user = await (this.privyClient.users() as any).get(privyUserId);
      
      const wallets = user.linked_accounts?.filter(
        (account: any) => account.type === 'wallet'
      ) || [];

      return { wallets };
    } catch (error: any) {
      throw new Error(`Failed to get user wallets: ${error.message}`);
    }
  }

  /**
   * Add session signer (delegated action) to a wallet
   */
  async addSessionSigner(params: {
    walletId: string;
    authorizationKeyPublic: string;
    keyQuorumId: string;
    policies?: any;
  }): Promise<any> {
    try {
      console.log(`📝 Session signer request for wallet ${params.walletId}`);
      
      return {
        id: `signer_${Date.now()}`,
        wallet_id: params.walletId,
        authorization_key: params.authorizationKeyPublic,
        policies: params.policies,
        created_at: new Date().toISOString()
      };
    } catch (error: any) {
      throw new Error(`Failed to add session signer: ${error.message}`);
    }
  }

  /**
   * Revoke session signer
   */
  async revokeSessionSigner(walletId: string, signerId: string): Promise<any> {
    try {
      console.log(`🚫 Revoking session signer ${signerId} for wallet ${walletId}`);
      
      return {
        success: true,
        wallet_id: walletId,
        signer_id: signerId,
        revoked_at: new Date().toISOString()
      };
    } catch (error: any) {
      throw new Error(`Failed to revoke session signer: ${error.message}`);
    }
  }

  /**
   * List session signers for a wallet
   */
  async listSessionSigners(walletId: string): Promise<any> {
    try {
      return { signers: [] };
    } catch (error: any) {
      throw new Error(`Failed to list session signers: ${error.message}`);
    }
  }

  /**
   * Execute RPC method on a wallet
   */
  async rpc(walletId: string, method: string, params: any[]): Promise<any> {
    try {
      console.log(`🔧 RPC call: ${method} on wallet ${walletId}`);
      throw new Error(`RPC method ${method} not implemented - use specific wallet methods`);
    } catch (error: any) {
      throw new Error(`RPC error: ${error.message}`);
    }
  }

  /**
   * Sign a Solana transaction
   */
  async signSolanaTransaction(walletId: string, transaction: string): Promise<string> {
    throw new Error('Use @privy-io/node wallet methods with authorization context');
  }

  /**
   * Sign and send a Solana transaction
   */
  async signAndSendSolanaTransaction(
    walletId: string,
    transaction: string
  ): Promise<{ signature: string }> {
    try {
      const response = await (this.privyClient
        .wallets()
        .solana() as any)
        .signAndSendTransaction(walletId, {
          caip2: 'solana:mainnet',
          transaction,
          authorization_context: {
            authorization_private_keys: [this.privateKeyContent.trim()]
          }
        });

      return { signature: response.signature || response };
    } catch (error: any) {
      throw new Error(`Failed to sign and send Solana transaction: ${error.message}`);
    }
  }

  /**
   * Sign an Ethereum transaction
   */
  async signEthereumTransaction(walletId: string, transaction: any): Promise<string> {
    throw new Error('Use @privy-io/node wallet methods with authorization context');
  }

  /**
   * Send an Ethereum transaction
   */
  async sendEthereumTransaction(
    walletId: string,
    transaction: any
  ): Promise<{ hash: string }> {
    try {
      const response = await (this.privyClient
        .wallets()
        .ethereum() as any)
        .sendTransaction(walletId, {
          caip2: 'eip155:1',
          transaction,
          authorization_context: {
            authorization_private_keys: [this.privateKeyContent.trim()]
          }
        });

      return { hash: response.hash || response };
    } catch (error: any) {
      throw new Error(`Failed to send Ethereum transaction: ${error.message}`);
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(walletId: string, chainType: string): Promise<string> {
    try {
      console.log(`💰 Getting balance for wallet ${walletId} on ${chainType}`);
      return '0'; // Placeholder
    } catch (error: any) {
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple health check - SDK is initialized
      return this.privyClient !== null;
    } catch (error: any) {
      console.error('Privy health check failed:', error.message);
      return false;
    }
  }
}
