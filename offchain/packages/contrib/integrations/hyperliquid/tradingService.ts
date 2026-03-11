/**
 * Hyperliquid Trading Service
 * 
 * Bridges Privy embedded wallets with Hyperliquid trading operations.
 * Handles wallet resolution, transaction signing with session signers,
 * and policy enforcement for autonomous trading.
 * 
 * Uses @nktkas/hyperliquid SDK
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as hl from '@nktkas/hyperliquid';
import { ethers } from 'ethers';
import crypto from 'crypto';

export interface PlaceOrderParams {
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'market' | 'limit' | 'stop-loss' | 'take-profit' | 'trailing-stop';
  size: number;
  price?: number;
  triggerPrice?: number;
  trailAmount?: number;
  reduceOnly?: boolean;
  postOnly?: boolean;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  n8nWorkflowId?: string;
  n8nExecutionId?: string;
}

export interface CancelOrderParams {
  userId: string;
  orderId: string;
  symbol: string;
  n8nWorkflowId?: string;
  n8nExecutionId?: string;
}

export interface ModifyOrderParams {
  userId: string;
  orderId: string;
  symbol: string;
  newPrice?: number;
  newSize?: number;
  n8nWorkflowId?: string;
  n8nExecutionId?: string;
}

export interface ClosePositionParams {
  userId: string;
  symbol: string;
  percentage?: number;
  n8nWorkflowId?: string;
  n8nExecutionId?: string;
}

export interface UpdateLeverageParams {
  userId: string;
  symbol: string;
  leverage: number;
  crossMargin?: boolean;
  n8nWorkflowId?: string;
  n8nExecutionId?: string;
}

export class HyperliquidTradingService {
  private supabase: SupabaseClient;
  private infoClient: hl.InfoClient;
  private isTestnet: boolean;

  // Hardcoded symbol to asset ID mapping (common pairs)
  private readonly ASSET_MAP: Record<string, number> = {
    'BTC': 0,
    'ETH': 1,
    'SOL': 2,
    'ARB': 3,
    'AVAX': 4,
    'DOGE': 5
  };

  constructor(isTestnet: boolean = false) {
    this.isTestnet = isTestnet;
    
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Initialize InfoClient for queries
    this.infoClient = new hl.InfoClient({
      transport: new hl.HttpTransport({ isTestnet })
    });
  }

  /**
   * Get asset ID for a symbol
   */
  private getAssetId(symbol: string): number {
    const assetId = this.ASSET_MAP[symbol];
    if (assetId === undefined) {
      throw new Error(`Unknown symbol: ${symbol}. Add to ASSET_MAP in hyperliquidTradingService.ts`);
    }
    return assetId;
  }

  // ===========================================================================
  // Order Management
  // ===========================================================================

  /**
   * Place a new order on Hyperliquid
   */
  async placeOrder(params: PlaceOrderParams): Promise<any> {
    // 1. Get user's Privy wallet
    const wallet = await this.getUserWallet(params.userId, 'ethereum');
    
    // 2. Check policy enforcement
    const policyCheck = await this.checkCanTrade(params.userId, wallet.wallet_id, params);
    if (!policyCheck.allowed) {
      throw new Error(`Trade denied: ${policyCheck.reason}`);
    }

    // 3. Get session signer private key
    const signerKey = await this.getSessionSignerKey(policyCheck.signerId!);

    // 4. Get asset ID for symbol
    const assetId = this.getAssetId(params.symbol);

    // 5. Build order in Hyperliquid format
    const isBuy = params.side === 'BUY';
    let orderType: any;
    
    switch (params.orderType) {
      case 'market':
        // Market orders use limit with IOC (Immediate or Cancel)
        orderType = { limit: { tif: 'Ioc' } };
        break;
      case 'limit':
        orderType = { limit: { tif: params.timeInForce || 'Gtc' } };
        break;
      case 'stop-loss':
      case 'take-profit':
        orderType = {
          trigger: {
            triggerPx: params.triggerPrice?.toString() || '0',
            isMarket: true,
            tpsl: params.orderType === 'stop-loss' ? 'sl' : 'tp'
          }
        };
        break;
      default:
        orderType = { limit: { tif: 'Gtc' } };
    }

    const order = {
      a: assetId,
      b: isBuy,
      p: params.orderType === 'market' ? (isBuy ? '999999999' : '0') : (params.price?.toString() || '0'),
      s: params.size.toString(),
      r: params.reduceOnly || false,
      t: orderType
    };

    // 6. Create ExchangeClient with session signer
    const exchangeClient = new hl.ExchangeClient({
      wallet: signerKey, // Private key directly
      transport: new hl.HttpTransport({ isTestnet: this.isTestnet })
    });

    // 7. Submit order
    const result = await exchangeClient.order({
      orders: [order],
      grouping: 'na'
    });

    // 8. Log transaction
    await this.logTransaction({
      userId: params.userId,
      walletId: wallet.id,
      signerId: policyCheck.signerId,
      transactionType: 'placeOrder',
      chainType: 'ethereum',
      status: 'success',
      metadata: {
        symbol: params.symbol,
        side: params.side,
        orderType: params.orderType,
        size: params.size,
        result: result
      },
      n8nWorkflowId: params.n8nWorkflowId,
      n8nExecutionId: params.n8nExecutionId
    });

    return result;
  }

  /**
   * Cancel an existing order
   */
  async cancelOrder(params: CancelOrderParams): Promise<any> {
    const wallet = await this.getUserWallet(params.userId, 'ethereum');
    const policyCheck = await this.checkCanTrade(params.userId, wallet.wallet_id, params);
    
    if (!policyCheck.allowed) {
      throw new Error(`Cancel denied: ${policyCheck.reason}`);
    }

    const signerKey = await this.getSessionSignerKey(policyCheck.signerId!);
    const assetId = this.getAssetId(params.symbol);

    const exchangeClient = new hl.ExchangeClient({
      wallet: signerKey,
      transport: new hl.HttpTransport({ isTestnet: this.isTestnet })
    });

    const result = await exchangeClient.cancel({
      cancels: [{ a: assetId, o: parseInt(params.orderId) }]
    });

    await this.logTransaction({
      userId: params.userId,
      walletId: wallet.id,
      signerId: policyCheck.signerId,
      transactionType: 'cancelOrder',
      chainType: 'ethereum',
      status: 'success',
      metadata: { orderId: params.orderId, symbol: params.symbol },
      n8nWorkflowId: params.n8nWorkflowId,
      n8nExecutionId: params.n8nExecutionId
    });

    return result;
  }

  /**
   * Cancel all orders for a symbol or all symbols
   */
  async cancelAllOrders(params: { userId: string; symbol?: string; n8nWorkflowId?: string; n8nExecutionId?: string }): Promise<any> {
    const wallet = await this.getUserWallet(params.userId, 'ethereum');
    const policyCheck = await this.checkCanTrade(params.userId, wallet.wallet_id, params);
    
    if (!policyCheck.allowed) {
      throw new Error(`Cancel all denied: ${policyCheck.reason}`);
    }

    const signerKey = await this.getSessionSignerKey(policyCheck.signerId!);

    const exchangeClient = new hl.ExchangeClient({
      wallet: signerKey,
      transport: new hl.HttpTransport({ isTestnet: this.isTestnet })
    });

    // Get all open orders first
    const openOrders = await this.infoClient.openOrders({ user: wallet.wallet_address });

    // Filter by symbol if provided
    const ordersToCancel = params.symbol
      ? openOrders.filter((o: any) => o.coin === params.symbol)
      : openOrders;

    if (ordersToCancel.length === 0) {
      return { status: 'success', message: 'No orders to cancel' };
    }

    // Build cancel list
    const cancels = ordersToCancel.map((o: any) => ({
      a: this.getAssetId(o.coin),
      o: parseInt(o.oid)
    }));

    const result = await exchangeClient.cancel({ cancels });

    await this.logTransaction({
      userId: params.userId,
      walletId: wallet.id,
      signerId: policyCheck.signerId,
      transactionType: 'cancelAllOrders',
      chainType: 'ethereum',
      status: 'success',
      metadata: { symbol: params.symbol || 'ALL', count: cancels.length },
      n8nWorkflowId: params.n8nWorkflowId,
      n8nExecutionId: params.n8nExecutionId
    });

    return result;
  }

  /**
   * Modify an existing order
   */
  async modifyOrder(params: ModifyOrderParams): Promise<any> {
    const wallet = await this.getUserWallet(params.userId, 'ethereum');
    const policyCheck = await this.checkCanTrade(params.userId, wallet.wallet_id, params);
    
    if (!policyCheck.allowed) {
      throw new Error(`Modify denied: ${policyCheck.reason}`);
    }

    const signerKey = await this.getSessionSignerKey(policyCheck.signerId!);
    const assetId = this.getAssetId(params.symbol);

    const exchangeClient = new hl.ExchangeClient({
      wallet: signerKey,
      transport: new hl.HttpTransport({ isTestnet: this.isTestnet })
    });

    // Get existing order to preserve unchanged fields
    const openOrders = await this.infoClient.openOrders({ user: wallet.wallet_address });
    const existingOrder = openOrders.find((o: any) => o.oid === params.orderId);

    if (!existingOrder) {
      throw new Error(`Order ${params.orderId} not found`);
    }

    const result = await exchangeClient.modify({
      oid: parseInt(params.orderId),
      order: {
        a: assetId,
        b: existingOrder.side === 'B',
        p: params.newPrice?.toString() || existingOrder.limitPx,
        s: params.newSize?.toString() || existingOrder.sz,
        r: existingOrder.reduceOnly || false,
        t: { limit: { tif: 'Gtc' } }
      }
    });

    await this.logTransaction({
      userId: params.userId,
      walletId: wallet.id,
      signerId: policyCheck.signerId,
      transactionType: 'modifyOrder',
      chainType: 'ethereum',
      status: 'success',
      metadata: { orderId: params.orderId, newPrice: params.newPrice, newSize: params.newSize },
      n8nWorkflowId: params.n8nWorkflowId,
      n8nExecutionId: params.n8nExecutionId
    });

    return result;
  }

  /**
   * Close an open position
   */
  async closePosition(params: ClosePositionParams): Promise<any> {
    const wallet = await this.getUserWallet(params.userId, 'ethereum');
    
    // Get current position
    const userState = await this.infoClient.clearinghouseState({
      user: wallet.wallet_address
    });

    const position = userState.assetPositions.find(
      (p: any) => p.position.coin === params.symbol
    );

    if (!position || parseFloat(position.position.szi) === 0) {
      throw new Error(`No open position for ${params.symbol}`);
    }

    const positionSize = Math.abs(parseFloat(position.position.szi));
    const sizeToClose = (positionSize * (params.percentage || 100)) / 100;
    const isLong = parseFloat(position.position.szi) > 0;

    // Place opposite market order to close position
    return await this.placeOrder({
      userId: params.userId,
      symbol: params.symbol,
      side: isLong ? 'SELL' : 'BUY',
      orderType: 'market',
      size: sizeToClose,
      reduceOnly: true,
      n8nWorkflowId: params.n8nWorkflowId,
      n8nExecutionId: params.n8nExecutionId
    });
  }

  /**
   * Update leverage for a trading pair
   */
  async updateLeverage(params: UpdateLeverageParams): Promise<any> {
    const wallet = await this.getUserWallet(params.userId, 'ethereum');
    const policyCheck = await this.checkCanTrade(params.userId, wallet.wallet_id, params);
    
    if (!policyCheck.allowed) {
      throw new Error(`Leverage update denied: ${policyCheck.reason}`);
    }

    const signerKey = await this.getSessionSignerKey(policyCheck.signerId!);
    const assetId = this.getAssetId(params.symbol);

    const exchangeClient = new hl.ExchangeClient({
      wallet: signerKey,
      transport: new hl.HttpTransport({ isTestnet: this.isTestnet })
    });

    const result = await exchangeClient.updateLeverage({
      asset: assetId,
      isCross: params.crossMargin || false,
      leverage: params.leverage
    });

    await this.logTransaction({
      userId: params.userId,
      walletId: wallet.id,
      signerId: policyCheck.signerId,
      transactionType: 'updateLeverage',
      chainType: 'ethereum',
      status: 'success',
      metadata: { symbol: params.symbol, leverage: params.leverage },
      n8nWorkflowId: params.n8nWorkflowId,
      n8nExecutionId: params.n8nExecutionId
    });

    return result;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Get user's wallet from database
   */
  private async getUserWallet(userId: string, chainType: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('user_wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('chain_type', chainType)
      .single();

    if (error || !data) {
      throw new Error(`Wallet not found for user ${userId} on ${chainType}`);
    }

    return data;
  }

  /**
   * Check if user can execute trade based on session signer policies
   */
  private async checkCanTrade(userId: string, walletId: string, tradeParams: any): Promise<{ allowed: boolean; reason?: string; signerId?: string }> {
    const { data: wallet } = await this.supabase
      .from('user_wallets')
      .select('id')
      .eq('wallet_id', walletId)
      .eq('user_id', userId)
      .single();

    if (!wallet) {
      return { allowed: false, reason: 'Wallet not found' };
    }

    const { data: signers } = await this.supabase
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

    // TODO: Add policy enforcement (max_amount, daily_limit, allowed_programs)
    // For now, just verify signer exists and is active

    return { allowed: true, signerId: signer.id };
  }

  /**
   * Get decrypted session signer private key
   */
  private async getSessionSignerKey(signerId: string): Promise<string> {
    const { data: signer } = await this.supabase
      .from('session_signers')
      .select('authorization_key_private')
      .eq('id', signerId)
      .single();

    if (!signer) {
      throw new Error('Session signer not found');
    }

    // Decrypt the private key
    return this.decryptKey(signer.authorization_key_private);
  }

  /**
   * Decrypt private key (simple implementation - use KMS in production)
   */
  private decryptKey(encryptedKey: string): string {
    const encryptionKey = process.env.PRIVY_SIGNER_ENCRYPTION_KEY || 'default-key-change-me';
    const [ivHex, encrypted] = encryptedKey.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(encryptionKey.padEnd(32, '0').slice(0, 32)),
      iv
    );
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
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
    status: 'success' | 'denied' | 'error';
    metadata?: any;
    denialReason?: string;
    errorMessage?: string;
    n8nWorkflowId?: string;
    n8nExecutionId?: string;
  }): Promise<void> {
    await this.supabase
      .from('signer_audit_log')
      .insert({
        signer_id: details.signerId,
        wallet_id: details.walletId,
        user_id: details.userId,
        transaction_type: details.transactionType,
        chain_type: details.chainType,
        status: details.status,
        metadata: details.metadata,
        denial_reason: details.denialReason,
        error_message: details.errorMessage,
        n8n_workflow_id: details.n8nWorkflowId,
        n8n_execution_id: details.n8nExecutionId
      });
  }
}
