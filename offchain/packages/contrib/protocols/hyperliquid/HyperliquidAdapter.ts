/**
 * Hyperliquid Protocol Adapter
 * 
 * Reference implementation of a protocol adapter for Hyperliquid DEX.
 * Provides read-only market data and account information.
 */

import { BaseProtocolAdapter } from '../../../gateway-lite/src/protocols/BaseProtocolAdapter';
import {
  ProtocolMetadata,
  OperationDefinition,
  CredentialSchema,
  ExecutionContext,
  ExecutionResult,
  NetworkConfig,
  HealthStatus
} from '../../../gateway-lite/src/protocols/types';
import { HYPERLIQUID_OPERATIONS } from './operations';
import { HyperliquidCredentials } from './types';
import * as hl from '@nktkas/hyperliquid';

export class HyperliquidAdapter extends BaseProtocolAdapter {
  private infoClient: hl.InfoClient | null = null;
  private exchangeClient: hl.ExchangeClient | null = null;

  // =============================================================================
  // Protocol Metadata
  // =============================================================================

  getMetadata(): ProtocolMetadata {
    return {
      id: 'hyperliquid',
      name: 'Hyperliquid',
      category: 'dex',
      version: '1.0.0',
      description: 'Trade perpetuals and spot on Hyperliquid DEX. Access order books, positions, and market data.',
      icon: '/cryptos/hyperliquid.png',
      docsUrl: 'https://hyperliquid.gitbook.io/hyperliquid-docs',
      networks: ['mainnet', 'testnet'],
      tags: ['dex', 'perpetuals', 'orderbook', 'derivatives', 'web3'],
      author: 'Lucid Team',
      repository: 'https://github.com/yourusername/lucid'
    };
  }

  // =============================================================================
  // Operations
  // =============================================================================

  getOperations(): OperationDefinition[] {
    return HYPERLIQUID_OPERATIONS;
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
          type: 'apiKey', // Using apiKey type for network selection
          required: true,
          description: 'Select Mainnet or Testnet'
        },
        {
          name: 'address',
          label: 'Wallet Address (Optional)',
          type: 'address',
          required: false,
          description: 'Your Ethereum wallet address for account queries (0x...)',
          pattern: '^0x[a-fA-F0-9]{40}$'
        }
      ],
      instructions: 'For read-only market data, no credentials are needed. To query your account data (positions, orders), provide your wallet address.',
      setupUrl: 'https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api'
    };
  }

  // =============================================================================
  // Networks
  // =============================================================================

  getSupportedNetworks(): NetworkConfig[] {
    return [
      {
        id: 'mainnet',
        name: 'Mainnet',
        isTestnet: false,
        rpcUrl: 'https://api.hyperliquid.xyz',
        metadata: {
          apiEndpoint: 'https://api.hyperliquid.xyz',
          wsEndpoint: 'wss://api.hyperliquid.xyz/ws'
        }
      },
      {
        id: 'testnet',
        name: 'Testnet',
        isTestnet: true,
        rpcUrl: 'https://api.hyperliquid-testnet.xyz',
        metadata: {
          apiEndpoint: 'https://api.hyperliquid-testnet.xyz',
          wsEndpoint: 'wss://api.hyperliquid-testnet.xyz/ws'
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
    const isTestnet = network.isTestnet;

    // Initialize Hyperliquid InfoClient
    this.infoClient = new hl.InfoClient({
      transport: new hl.HttpTransport({
        isTestnet,
        timeout: config.timeout || 10000
      })
    });

    console.log(`✅ Hyperliquid adapter initialized for ${network.name}`);
  }

  async cleanup(): Promise<void> {
    this.infoClient = null;
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

    if (!this.infoClient) {
      return this.error('InfoClient not initialized', 'NOT_INITIALIZED');
    }

    try {
      // Route to appropriate handler based on operation
      switch (operationId) {
        // Market Data Operations
        case 'getL2Book':
          return await this.handleGetL2Book(parameters);
        
        case 'getAllMids':
          return await this.handleGetAllMids(parameters);
        
        case 'getMarketMeta':
          return await this.handleGetMarketMeta(parameters);
        
        case 'getRecentTrades':
          return await this.handleGetRecentTrades(parameters);
        
        case 'getFundingHistory':
          return await this.handleGetFundingHistory(parameters);
        
        // User Account Operations
        case 'getUserState':
          return await this.handleGetUserState(parameters, context);
        
        case 'getOpenOrders':
          return await this.handleGetOpenOrders(parameters, context);
        
        case 'getUserFills':
          return await this.handleGetUserFills(parameters, context);
        
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

  private async handleGetL2Book(params: Record<string, unknown>): Promise<ExecutionResult> {
    const { result, duration } = await this.measure(async () => {
      return await this.infoClient!.l2Book({
        coin: params.symbol as string
      });
    });

    return this.success(result, { duration });
  }

  private async handleGetAllMids(params: Record<string, unknown>): Promise<ExecutionResult> {
    const { result, duration } = await this.measure(async () => {
      return await this.infoClient!.allMids();
    });

    return this.success(result, { duration });
  }

  private async handleGetMarketMeta(params: Record<string, unknown>): Promise<ExecutionResult> {
    const { result, duration } = await this.measure(async () => {
      return await this.infoClient!.meta();
    });

    return this.success(result, { duration });
  }

  private async handleGetRecentTrades(params: Record<string, unknown>): Promise<ExecutionResult> {
    const { result, duration } = await this.measure(async () => {
      return await this.infoClient!.recentTrades({
        coin: params.symbol as string
      });
    });

    // Apply limit if specified
    const limit = params.limit as number | undefined;
    const trades = limit ? result.slice(0, limit) : result;

    return this.success(trades, { duration, totalTrades: result.length });
  }

  private async handleGetFundingHistory(params: Record<string, unknown>): Promise<ExecutionResult> {
    const { result, duration } = await this.measure(async () => {
      const requestParams: any = {
        coin: params.symbol as string
      };
      
      // Only include startTime/endTime if provided
      if (params.startTime !== undefined) {
        requestParams.startTime = params.startTime as number;
      }
      if (params.endTime !== undefined) {
        requestParams.endTime = params.endTime as number;
      }
      
      return await this.infoClient!.fundingHistory(requestParams);
    });

    return this.success(result, { duration });
  }

  private async handleGetUserState(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const address = this.getUserAddress(params, context);
    
    const { result, duration } = await this.measure(async () => {
      return await this.infoClient!.clearinghouseState({
        user: address
      });
    });

    return this.success(result, { duration, address });
  }

  private async handleGetOpenOrders(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const address = this.getUserAddress(params, context);
    
    const { result, duration } = await this.measure(async () => {
      return await this.infoClient!.openOrders({
        user: address
      });
    });

    return this.success(result, { duration, address });
  }

  private async handleGetUserFills(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const address = this.getUserAddress(params, context);
    
    const { result, duration } = await this.measure(async () => {
      return await this.infoClient!.userFills({
        user: address
      });
    });

    return this.success(result, { duration, address });
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  /**
   * Extract user address from parameters or credentials
   */
  private getUserAddress(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): string {
    // First try from parameters
    if (params.address && typeof params.address === 'string') {
      return params.address;
    }

    // Then try from credentials
    if (context.credentials?.address && typeof context.credentials.address === 'string') {
      return context.credentials.address as string;
    }

    throw new Error('User address is required but not provided');
  }

  // =============================================================================
  // Health Check
  // =============================================================================

  async checkHealth(): Promise<HealthStatus> {
    if (!this.infoClient) {
      return {
        status: 'down',
        message: 'InfoClient not initialized',
        lastCheck: Date.now()
      };
    }

    try {
      const start = Date.now();
      await this.infoClient.allMids();
      const latency = Date.now() - start;

      return {
        status: 'healthy',
        message: 'All systems operational',
        lastCheck: Date.now(),
        networks: {
          [this.config.network || 'mainnet']: {
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
