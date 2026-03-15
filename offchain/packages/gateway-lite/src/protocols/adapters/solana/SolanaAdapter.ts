/**
 * Solana Protocol Adapter
 * 
 * Protocol adapter for Solana blockchain operations.
 * Provides read-only and write operations for SOL and SPL tokens.
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
import { SOLANA_OPERATIONS } from './operations';
import { SolanaCredentials } from './types';
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  Commitment
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  createCloseAccountInstruction,
  getAccount,
  getMint,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { logger } from '../../../../../engine/src/shared/lib/logger';

export class SolanaProtocolAdapter extends BaseProtocolAdapter {
  private connection: Connection | null = null;
  private keypair: Keypair | null = null;

  // =============================================================================
  // Protocol Metadata
  // =============================================================================

  getMetadata(): ProtocolMetadata {
    return {
      id: 'solana',
      name: 'Solana',
      category: 'defi',
      version: '1.0.0',
      description: 'Interact with Solana blockchain. Transfer SOL and SPL tokens, query balances, and manage token accounts.',
      icon: '/cryptos/solana.png',
      docsUrl: 'https://docs.solana.com',
      networks: ['mainnet-beta', 'testnet', 'devnet'],
      tags: ['blockchain', 'solana', 'spl', 'token', 'defi'],
      author: 'Lucid Team',
      repository: 'https://github.com/yourusername/lucid'
    };
  }

  // =============================================================================
  // Operations
  // =============================================================================

  getOperations(): OperationDefinition[] {
    return SOLANA_OPERATIONS;
  }

  // =============================================================================
  // Credentials
  // =============================================================================

  getCredentialSchema(): CredentialSchema {
    return {
      fields: [
        {
          name: 'network',
          label: 'Network',
          type: 'apiKey',
          required: true,
          description: 'Select Solana network'
        },
        {
          name: 'rpcEndpoint',
          label: 'Custom RPC Endpoint (Optional)',
          type: 'apiKey',
          required: false,
          description: 'Custom RPC endpoint URL (leave empty for default)'
        },
        {
          name: 'privateKey',
          label: 'Private Key (Optional)',
          type: 'privateKey',
          required: false,
          description: 'Base58 encoded private key for write operations'
        }
      ],
      instructions: 'For read-only operations (balances, transactions), no credentials are needed. For write operations (transfers, token accounts), provide a private key.',
      setupUrl: 'https://docs.solana.com/wallet-guide'
    };
  }

  // =============================================================================
  // Networks
  // =============================================================================

  getSupportedNetworks(): NetworkConfig[] {
    return [
      {
        id: 'mainnet-beta',
        name: 'Mainnet Beta',
        isTestnet: false,
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        metadata: {
          explorer: 'https://explorer.solana.com'
        }
      },
      {
        id: 'testnet',
        name: 'Testnet',
        isTestnet: true,
        rpcUrl: 'https://api.testnet.solana.com',
        metadata: {
          explorer: 'https://explorer.solana.com?cluster=testnet'
        }
      },
      {
        id: 'devnet',
        name: 'Devnet',
        isTestnet: true,
        rpcUrl: 'https://api.devnet.solana.com',
        metadata: {
          explorer: 'https://explorer.solana.com?cluster=devnet',
          faucet: 'https://faucet.solana.com'
        }
      }
    ];
  }

  // =============================================================================
  // Initialization
  // =============================================================================

  async initialize(config: any): Promise<void> {
    await super.initialize(config);
    
    const network = this.getCurrentNetwork();
    const credentials = config.credentials as SolanaCredentials;
    
    // Determine RPC endpoint
    const rpcEndpoint = credentials?.rpcEndpoint || (Array.isArray(network.rpcUrl) ? network.rpcUrl[0] : network.rpcUrl) || 'https://api.mainnet-beta.solana.com';
    
    // Get commitment level
    const commitment: Commitment = credentials?.commitment || 'confirmed';
    
    // Initialize connection
    this.connection = new Connection(rpcEndpoint, commitment);
    
    // Initialize keypair if private key provided
    if (credentials?.privateKey) {
      try {
        // Decode base58 private key
        const secretKey = this.decodeBase58(credentials.privateKey);
        this.keypair = Keypair.fromSecretKey(secretKey);
      } catch (error) {
        logger.warn('Failed to initialize keypair:', error);
        // Don't throw - allow read-only operations
      }
    }

    logger.info(`✅ Solana adapter initialized for ${network.name}`);
  }

  async cleanup(): Promise<void> {
    this.connection = null;
    this.keypair = null;
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

    if (!this.connection) {
      return this.error('Connection not initialized', 'NOT_INITIALIZED');
    }

    try {
      // Route to appropriate handler based on operation
      switch (operationId) {
        // Balance and Account Operations
        case 'getBalance':
          return await this.handleGetBalance(parameters);
        
        case 'getTokenBalance':
          return await this.handleGetTokenBalance(parameters);
        
        case 'getTokenAccounts':
          return await this.handleGetTokenAccounts(parameters);
        
        case 'getAccountInfo':
          return await this.handleGetAccountInfo(parameters);
        
        // Transaction Operations
        case 'getTransaction':
          return await this.handleGetTransaction(parameters);
        
        case 'getSignaturesForAddress':
          return await this.handleGetSignaturesForAddress(parameters);
        
        case 'getRecentBlockhash':
          return await this.handleGetRecentBlockhash(parameters);
        
        // Token Information
        case 'getTokenSupply':
          return await this.handleGetTokenSupply(parameters);
        
        // Write Operations
        case 'transferSOL':
          return await this.handleTransferSOL(parameters);
        
        case 'transferToken':
          return await this.handleTransferToken(parameters);
        
        case 'createTokenAccount':
          return await this.handleCreateTokenAccount(parameters);
        
        case 'closeTokenAccount':
          return await this.handleCloseTokenAccount(parameters);
        
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
  // Operation Handlers - Read Operations
  // =============================================================================

  private async handleGetBalance(params: Record<string, unknown>): Promise<ExecutionResult> {
    const address = new PublicKey(params.address as string);
    const commitment = (params.commitment as Commitment) || 'confirmed';
    
    const { result, duration } = await this.measure(async () => {
      const lamports = await this.connection!.getBalance(address, commitment);
      return {
        address: address.toBase58(),
        lamports,
        balance: lamports / LAMPORTS_PER_SOL
      };
    });

    return this.success(result, { duration, commitment });
  }

  private async handleGetTokenBalance(params: Record<string, unknown>): Promise<ExecutionResult> {
    const wallet = new PublicKey(params.address as string);
    const mint = new PublicKey(params.mint as string);
    const commitment = (params.commitment as Commitment) || 'confirmed';
    
    const { result, duration } = await this.measure(async () => {
      const tokenAccount = await getAssociatedTokenAddress(mint, wallet);
      const account = await getAccount(this.connection!, tokenAccount, commitment === 'processed' ? 'confirmed' : commitment as 'confirmed' | 'finalized');
      const mintInfo = await getMint(this.connection!, mint, commitment === 'processed' ? 'confirmed' : commitment as 'confirmed' | 'finalized');
      
      return {
        mint: mint.toBase58(),
        owner: wallet.toBase58(),
        amount: account.amount.toString(),
        decimals: mintInfo.decimals,
        uiAmount: Number(account.amount) / Math.pow(10, mintInfo.decimals),
        uiAmountString: (Number(account.amount) / Math.pow(10, mintInfo.decimals)).toString()
      };
    });

    return this.success(result, { duration, commitment });
  }

  private async handleGetTokenAccounts(params: Record<string, unknown>): Promise<ExecutionResult> {
    const wallet = new PublicKey(params.address as string);
    const commitment = (params.commitment as Commitment) || 'confirmed';
    
    const { result, duration } = await this.measure(async () => {
      const filters = params.mint
        ? { mint: new PublicKey(params.mint as string) }
        : undefined;
      
      const accounts = await this.connection!.getParsedTokenAccountsByOwner(
        wallet,
        filters || { programId: TOKEN_PROGRAM_ID },
        commitment
      );
      
      return accounts.value.map(account => ({
        pubkey: account.pubkey.toBase58(),
        mint: account.account.data.parsed.info.mint,
        owner: account.account.data.parsed.info.owner,
        amount: account.account.data.parsed.info.tokenAmount.amount,
        decimals: account.account.data.parsed.info.tokenAmount.decimals,
        uiAmount: account.account.data.parsed.info.tokenAmount.uiAmount,
        uiAmountString: account.account.data.parsed.info.tokenAmount.uiAmountString,
        state: account.account.data.parsed.info.state,
        isNative: account.account.data.parsed.info.isNative,
        rentExemptReserve: account.account.data.parsed.info.rentExemptReserve,
        closeAuthority: account.account.data.parsed.info.closeAuthority
      }));
    });

    return this.success(result, { duration, commitment, count: result.length });
  }

  private async handleGetAccountInfo(params: Record<string, unknown>): Promise<ExecutionResult> {
    const address = new PublicKey(params.address as string);
    const commitment = (params.commitment as Commitment) || 'confirmed';
    
    const { result, duration } = await this.measure(async () => {
      const account = await this.connection!.getAccountInfo(address, commitment);
      if (!account) {
        throw new Error('Account not found');
      }
      
      return {
        lamports: account.lamports,
        owner: account.owner.toBase58(),
        executable: account.executable,
        rentEpoch: account.rentEpoch,
        data: account.data.toString('base64')
      };
    });

    return this.success(result, { duration, commitment });
  }

  private async handleGetTransaction(params: Record<string, unknown>): Promise<ExecutionResult> {
    const signature = params.signature as string;
    const commitment = (params.commitment as Commitment) || 'confirmed';
    
    const { result, duration } = await this.measure(async () => {
      const tx = await this.connection!.getParsedTransaction(signature, {
        commitment: commitment === 'processed' ? 'confirmed' : commitment as 'confirmed' | 'finalized',
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx) {
        throw new Error('Transaction not found');
      }
      
      return tx;
    });

    return this.success(result, { duration, commitment });
  }

  private async handleGetSignaturesForAddress(params: Record<string, unknown>): Promise<ExecutionResult> {
    const address = new PublicKey(params.address as string);
    const limit = (params.limit as number) || 10;
    const commitment = (params.commitment as Commitment) || 'confirmed';
    
    const { result, duration } = await this.measure(async () => {
      const options: any = { limit };
      if (params.before) {
        options.before = params.before as string;
      }
      
      // Filter commitment to valid Finality type ('confirmed' | 'finalized')
      const finality = commitment === 'processed' ? 'confirmed' : commitment as 'confirmed' | 'finalized';
      return await this.connection!.getSignaturesForAddress(address, options, finality);
    });

    return this.success(result, { duration, commitment, count: result.length });
  }

  private async handleGetRecentBlockhash(params: Record<string, unknown>): Promise<ExecutionResult> {
    const commitment = (params.commitment as Commitment) || 'finalized';
    
    const { result, duration } = await this.measure(async () => {
      return await this.connection!.getLatestBlockhash(commitment);
    });

    return this.success(result, { duration, commitment });
  }

  private async handleGetTokenSupply(params: Record<string, unknown>): Promise<ExecutionResult> {
    const mint = new PublicKey(params.mint as string);
    const commitment = (params.commitment as Commitment) || 'confirmed';
    
    const { result, duration } = await this.measure(async () => {
      const supply = await this.connection!.getTokenSupply(mint, commitment);
      return supply.value;
    });

    return this.success(result, { duration, commitment });
  }

  // =============================================================================
  // Operation Handlers - Write Operations
  // =============================================================================

  private async handleTransferSOL(params: Record<string, unknown>): Promise<ExecutionResult> {
    if (!this.keypair) {
      return this.error('Private key required for transfers', 'AUTH_REQUIRED');
    }

    const toAddress = new PublicKey(params.toAddress as string);
    const amount = params.amount as number;
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    const commitment = (params.commitment as Commitment) || 'confirmed';
    
    const { result, duration } = await this.measure(async () => {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.keypair!.publicKey,
          toPubkey: toAddress,
          lamports
        })
      );
      
      const signature = await sendAndConfirmTransaction(
        this.connection!,
        transaction,
        [this.keypair!],
        { commitment }
      );
      
      return { signature };
    });

    return this.success(result, { duration, commitment, amount, lamports });
  }

  private async handleTransferToken(params: Record<string, unknown>): Promise<ExecutionResult> {
    if (!this.keypair) {
      return this.error('Private key required for transfers', 'AUTH_REQUIRED');
    }

    const toWallet = new PublicKey(params.toAddress as string);
    const mint = new PublicKey(params.mint as string);
    const amount = params.amount as number;
    const commitment = (params.commitment as Commitment) || 'confirmed';
    
    const { result, duration } = await this.measure(async () => {
      // Get or determine decimals
      let decimals = params.decimals as number | undefined;
      if (!decimals) {
        const mintInfo = await getMint(this.connection!, mint, commitment === 'processed' ? 'confirmed' : commitment as 'confirmed' | 'finalized');
        decimals = mintInfo.decimals;
      }
      
      const amountInSmallestUnit = Math.floor(amount * Math.pow(10, decimals));
      
      const fromTokenAccount = await getAssociatedTokenAddress(mint, this.keypair!.publicKey);
      const toTokenAccount = await getAssociatedTokenAddress(mint, toWallet);
      
      const transaction = new Transaction().add(
        createTransferInstruction(
          fromTokenAccount,
          toTokenAccount,
          this.keypair!.publicKey,
          amountInSmallestUnit
        )
      );
      
      const signature = await sendAndConfirmTransaction(
        this.connection!,
        transaction,
        [this.keypair!],
        { commitment: commitment === 'processed' ? 'confirmed' : commitment as 'confirmed' | 'finalized' }
      );
      
      return { signature };
    });

    return this.success(result, { duration, commitment, amount });
  }

  private async handleCreateTokenAccount(params: Record<string, unknown>): Promise<ExecutionResult> {
    if (!this.keypair) {
      return this.error('Private key required for account creation', 'AUTH_REQUIRED');
    }

    const owner = new PublicKey(params.owner as string);
    const mint = new PublicKey(params.mint as string);
    const commitment = (params.commitment as Commitment) || 'confirmed';
    
    const { result, duration } = await this.measure(async () => {
      const tokenAccount = await getAssociatedTokenAddress(mint, owner);
      
      const transaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          this.keypair!.publicKey,
          tokenAccount,
          owner,
          mint
        )
      );
      
      const signature = await sendAndConfirmTransaction(
        this.connection!,
        transaction,
        [this.keypair!],
        { commitment }
      );
      
      return {
        tokenAccount: tokenAccount.toBase58(),
        signature
      };
    });

    return this.success(result, { duration, commitment });
  }

  private async handleCloseTokenAccount(params: Record<string, unknown>): Promise<ExecutionResult> {
    if (!this.keypair) {
      return this.error('Private key required for closing accounts', 'AUTH_REQUIRED');
    }

    const tokenAccount = new PublicKey(params.tokenAccount as string);
    const destination = params.destination 
      ? new PublicKey(params.destination as string)
      : this.keypair!.publicKey;
    const commitment = (params.commitment as Commitment) || 'confirmed';
    
    const { result, duration } = await this.measure(async () => {
      const transaction = new Transaction().add(
        createCloseAccountInstruction(
          tokenAccount,
          destination,
          this.keypair!.publicKey
        )
      );
      
      const signature = await sendAndConfirmTransaction(
        this.connection!,
        transaction,
        [this.keypair!],
        { commitment }
      );
      
      return { signature };
    });

    return this.success(result, { duration, commitment });
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  private decodeBase58(str: string): Uint8Array {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const base = ALPHABET.length;
    
    let decoded = BigInt(0);
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const value = ALPHABET.indexOf(char);
      if (value === -1) {
        throw new Error(`Invalid base58 character: ${char}`);
      }
      decoded = decoded * BigInt(base) + BigInt(value);
    }
    
    // Convert to byte array
    const bytes: number[] = [];
    while (decoded > 0) {
      bytes.unshift(Number(decoded & BigInt(0xff)));
      decoded = decoded >> BigInt(8);
    }
    
    // Add leading zeros
    for (let i = 0; i < str.length && str[i] === '1'; i++) {
      bytes.unshift(0);
    }
    
    return new Uint8Array(bytes);
  }

  // =============================================================================
  // Health Check
  // =============================================================================

  async checkHealth(): Promise<HealthStatus> {
    if (!this.connection) {
      return {
        status: 'down',
        message: 'Connection not initialized',
        lastCheck: Date.now()
      };
    }

    try {
      const start = Date.now();
      await this.connection.getLatestBlockhash();
      const latency = Date.now() - start;

      return {
        status: 'healthy',
        message: 'All systems operational',
        lastCheck: Date.now(),
        networks: {
          [this.config.network || 'mainnet-beta']: {
            status: 'healthy',
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
