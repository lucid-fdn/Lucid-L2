/**
 * Hyperliquid Protocol Adapter - Types
 * 
 * Type definitions specific to Hyperliquid protocol.
 */

// =============================================================================
// Market Data Types
// =============================================================================

export interface L2BookLevel {
  px: string;  // Price
  sz: string;  // Size
  n: number;   // Number of orders
}

export interface L2Book {
  coin: string;
  time: number;
  levels: [L2BookLevel[], L2BookLevel[]]; // [bids, asks]
}

export interface MarketMetadata {
  name: string;
  szDecimals: number;
}

export interface AllMids {
  [coin: string]: string; // coin -> mid price
}

export interface Trade {
  coin: string;
  side: 'A' | 'B'; // A = ask (sell), B = bid (buy)
  px: string;      // Price
  sz: string;      // Size  
  time: number;    // Timestamp
  hash: string;    // Transaction hash
}

export interface FundingHistory {
  coin: string;
  fundingRate: string;
  premium: string;
  time: number;
}

// =============================================================================
// User Account Types
// =============================================================================

export interface Position {
  coin: string;
  szi: string;           // Signed size (positive = long, negative = short)
  entryPx: string | null;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string | null;
  leverage: {
    type: string;
    value: number;
    rawUsd: string;
  };
  liquidationPx: string | null;
  marginUsed: string;
}

export interface OpenOrder {
  coin: string;
  side: 'A' | 'B';
  limitPx: string;
  sz: string;
  oid: number;
  timestamp: number;
  origSz: string;
  cloid?: string;
}

export interface UserState {
  assetPositions: Position[];
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  crossMaintenanceMarginUsed: string;
  withdrawable: string;
}

// =============================================================================
// Request/Response Types
// =============================================================================

export interface GetL2BookParams {
  symbol: string;
}

export interface GetMarketMetaParams {
  // No params needed - returns all markets
}

export interface GetAllMidsParams {
  // No params needed
}

export interface GetRecentTradesParams {
  symbol: string;
  limit?: number;
}

export interface GetFundingHistoryParams {
  symbol: string;
  startTime?: number;
  endTime?: number;
}

export interface GetUserStateParams {
  address: string;
}

export interface GetOpenOrdersParams {
  address: string;
}

export interface GetUserFillsParams {
  address: string;
  startTime?: number;
  endTime?: number;
}

// =============================================================================
// Credential Types
// =============================================================================

export interface HyperliquidCredentials {
  /** User's wallet address (read-only operations) */
  address?: string;
  
  /** Network selection */
  network: 'mainnet' | 'testnet';
  
  /** Optional: Agent wallet private key for write operations (future) */
  agentPrivateKey?: string;
}
