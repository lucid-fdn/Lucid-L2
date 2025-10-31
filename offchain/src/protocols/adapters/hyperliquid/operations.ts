/**
 * Hyperliquid Protocol Adapter - Operation Definitions
 * 
 * Defines all available operations for the Hyperliquid protocol.
 */

import { OperationDefinition } from '../../types';

export const HYPERLIQUID_OPERATIONS: OperationDefinition[] = [
  // =============================================================================
  // Market Data Operations
  // =============================================================================
  {
    id: 'getL2Book',
    name: 'Get L2 Order Book',
    description: 'Fetch the Level 2 order book for a trading pair with bid/ask prices and sizes',
    parameters: [
      {
        name: 'symbol',
        displayName: 'Trading Pair',
        type: 'select',
        required: true,
        description: 'Trading pair symbol (e.g., BTC, ETH, SOL)',
        options: [
          { label: 'BTC-USD', value: 'BTC' },
          { label: 'ETH-USD', value: 'ETH' },
          { label: 'SOL-USD', value: 'SOL' },
          { label: 'ARB-USD', value: 'ARB' },
          { label: 'AVAX-USD', value: 'AVAX' },
          { label: 'DOGE-USD', value: 'DOGE' }
        ]
      }
    ],
    requiresAuth: false,
    isWrite: false,
    returns: 'L2Book with bids and asks',
    tags: ['market-data', 'orderbook', 'read-only'],
    example: '{"symbol": "BTC"}'
  },
  
  {
    id: 'getAllMids',
    name: 'Get All Mid Prices',
    description: 'Fetch mid prices for all available trading pairs',
    parameters: [],
    requiresAuth: false,
    isWrite: false,
    returns: 'Object mapping symbols to mid prices',
    tags: ['market-data', 'prices', 'read-only'],
    example: '{}'
  },

  {
    id: 'getMarketMeta',
    name: 'Get Market Metadata',
    description: 'Get metadata for all available markets including size decimals and configurations',
    parameters: [],
    requiresAuth: false,
    isWrite: false,
    returns: 'Array of market metadata',
    tags: ['market-data', 'metadata', 'read-only'],
    example: '{}'
  },

  {
    id: 'getRecentTrades',
    name: 'Get Recent Trades',
    description: 'Fetch recent trades for a specific trading pair',
    parameters: [
      {
        name: 'symbol',
        displayName: 'Trading Pair',
        type: 'select',
        required: true,
        description: 'Trading pair symbol',
        options: [
          { label: 'BTC-USD', value: 'BTC' },
          { label: 'ETH-USD', value: 'ETH' },
          { label: 'SOL-USD', value: 'SOL' },
          { label: 'ARB-USD', value: 'ARB' }
        ]
      },
      {
        name: 'limit',
        displayName: 'Limit',
        type: 'number',
        required: false,
        default: 100,
        description: 'Number of trades to fetch (max 100)',
        validation: {
          min: 1,
          max: 100
        }
      }
    ],
    requiresAuth: false,
    isWrite: false,
    returns: 'Array of recent trades',
    tags: ['market-data', 'trades', 'history', 'read-only'],
    example: '{"symbol": "ETH", "limit": 50}'
  },

  {
    id: 'getFundingHistory',
    name: 'Get Funding History',
    description: 'Fetch historical funding rates for a perpetual contract',
    parameters: [
      {
        name: 'symbol',
        displayName: 'Trading Pair',
        type: 'select',
        required: true,
        description: 'Perpetual contract symbol',
        options: [
          { label: 'BTC-USD', value: 'BTC' },
          { label: 'ETH-USD', value: 'ETH' },
          { label: 'SOL-USD', value: 'SOL' }
        ]
      },
      {
        name: 'startTime',
        displayName: 'Start Time',
        type: 'number',
        required: false,
        description: 'Unix timestamp in milliseconds (optional)',
        placeholder: '1640000000000'
      },
      {
        name: 'endTime',
        displayName: 'End Time',
        type: 'number',
        required: false,
        description: 'Unix timestamp in milliseconds (optional)',
        placeholder: '1650000000000'
      }
    ],
    requiresAuth: false,
    isWrite: false,
    returns: 'Array of funding rate history',
    tags: ['market-data', 'funding', 'perpetuals', 'read-only'],
    example: '{"symbol": "BTC"}'
  },

  // =============================================================================
  // User Account Operations (Read-Only)
  // =============================================================================
  {
    id: 'getUserState',
    name: 'Get User Account State',
    description: 'Fetch complete account state including positions, margin, and balance',
    parameters: [
      {
        name: 'address',
        displayName: 'Wallet Address',
        type: 'address',
        required: true,
        description: 'Ethereum wallet address (0x...)',
        placeholder: '0x...',
        pattern: '^0x[a-fA-F0-9]{40}$'
      }
    ],
    requiresAuth: true,
    isWrite: false,
    returns: 'Complete user state with positions and balances',
    tags: ['account', 'positions', 'balance', 'read-only'],
    example: '{"address": "0x..."}'
  },

  {
    id: 'getOpenOrders',
    name: 'Get Open Orders',
    description: 'Fetch all open orders for a user address',
    parameters: [
      {
        name: 'address',
        displayName: 'Wallet Address',
        type: 'address',
        required: true,
        description: 'Ethereum wallet address',
        placeholder: '0x...',
        pattern: '^0x[a-fA-F0-9]{40}$'
      }
    ],
    requiresAuth: true,
    isWrite: false,
    returns: 'Array of open orders',
    tags: ['account', 'orders', 'read-only'],
    example: '{"address": "0x..."}'
  },

  {
    id: 'getUserFills',
    name: 'Get User Fill History',
    description: 'Fetch historical fills (executed orders) for a user',
    parameters: [
      {
        name: 'address',
        displayName: 'Wallet Address',
        type: 'address',
        required: true,
        description: 'Ethereum wallet address',
        placeholder: '0x...',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      {
        name: 'startTime',
        displayName: 'Start Time',
        type: 'number',
        required: false,
        description: 'Unix timestamp in milliseconds',
        placeholder: '1640000000000'
      },
      {
        name: 'endTime',
        displayName: 'End Time',
        type: 'number',
        required: false,
        description: 'Unix timestamp in milliseconds',
        placeholder: '1650000000000'
      }
    ],
    requiresAuth: true,
    isWrite: false,
    returns: 'Array of fill history',
    tags: ['account', 'fills', 'history', 'read-only'],
    example: '{"address": "0x..."}'
  }

  // =============================================================================
  // Write Operations (Future Implementation)
  // =============================================================================
  // These will be added in future iterations:
  // - placeOrder
  // - cancelOrder  
  // - modifyOrder
  // - updateLeverage
  // - closePosition
];

/**
 * Get operation by ID
 */
export function getOperation(operationId: string): OperationDefinition | undefined {
  return HYPERLIQUID_OPERATIONS.find(op => op.id === operationId);
}

/**
 * Get all read-only operations
 */
export function getReadOnlyOperations(): OperationDefinition[] {
  return HYPERLIQUID_OPERATIONS.filter(op => !op.isWrite);
}

/**
 * Get all write operations
 */
export function getWriteOperations(): OperationDefinition[] {
  return HYPERLIQUID_OPERATIONS.filter(op => op.isWrite);
}
