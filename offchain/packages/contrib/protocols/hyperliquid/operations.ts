/**
 * Hyperliquid Protocol Adapter - Operation Definitions
 * 
 * Defines all available operations for the Hyperliquid protocol.
 */

import { OperationDefinition } from '../../../gateway-lite/src/protocols/types';

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
  },

  // =============================================================================
  // Trading Operations (Write)
  // =============================================================================
  {
    id: 'placeOrder',
    name: 'Place Order',
    description: 'Place a new order (market, limit, stop-loss, take-profit, or trailing stop)',
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
          { label: 'ARB-USD', value: 'ARB' },
          { label: 'AVAX-USD', value: 'AVAX' }
        ]
      },
      {
        name: 'side',
        displayName: 'Side',
        type: 'select',
        required: true,
        description: 'Buy or Sell',
        options: [
          { label: 'Buy', value: 'BUY' },
          { label: 'Sell', value: 'SELL' }
        ]
      },
      {
        name: 'orderType',
        displayName: 'Order Type',
        type: 'select',
        required: true,
        description: 'Type of order',
        options: [
          { label: 'Market', value: 'market' },
          { label: 'Limit', value: 'limit' },
          { label: 'Stop Loss', value: 'stop-loss' },
          { label: 'Take Profit', value: 'take-profit' },
          { label: 'Trailing Stop', value: 'trailing-stop' }
        ]
      },
      {
        name: 'size',
        displayName: 'Size',
        type: 'number',
        required: true,
        description: 'Order size in base currency',
        validation: {
          min: 0.0001
        }
      },
      {
        name: 'price',
        displayName: 'Price',
        type: 'number',
        required: false,
        description: 'Limit price (required for limit orders)',
        validation: {
          min: 0
        }
      },
      {
        name: 'triggerPrice',
        displayName: 'Trigger Price',
        type: 'number',
        required: false,
        description: 'Trigger price for stop-loss or take-profit orders',
        validation: {
          min: 0
        }
      },
      {
        name: 'trailAmount',
        displayName: 'Trail Amount',
        type: 'number',
        required: false,
        description: 'Trail amount for trailing stop orders (USD or %)',
        validation: {
          min: 0
        }
      },
      {
        name: 'reduceOnly',
        displayName: 'Reduce Only',
        type: 'boolean',
        required: false,
        default: false,
        description: 'Order will only reduce position size'
      },
      {
        name: 'postOnly',
        displayName: 'Post Only',
        type: 'boolean',
        required: false,
        default: false,
        description: 'Order will only be placed as maker'
      },
      {
        name: 'timeInForce',
        displayName: 'Time In Force',
        type: 'select',
        required: false,
        default: 'GTC',
        description: 'Order time in force',
        options: [
          { label: 'Good Till Cancel', value: 'GTC' },
          { label: 'Immediate or Cancel', value: 'IOC' },
          { label: 'Fill or Kill', value: 'FOK' }
        ]
      }
    ],
    requiresAuth: true,
    isWrite: true,
    returns: 'Order confirmation with order ID and status',
    tags: ['trading', 'order', 'write'],
    example: '{"symbol": "BTC", "side": "BUY", "orderType": "limit", "size": 0.01, "price": 45000}'
  },

  {
    id: 'cancelOrder',
    name: 'Cancel Order',
    description: 'Cancel an existing open order',
    parameters: [
      {
        name: 'orderId',
        displayName: 'Order ID',
        type: 'string',
        required: true,
        description: 'ID of the order to cancel'
      },
      {
        name: 'symbol',
        displayName: 'Trading Pair',
        type: 'select',
        required: true,
        description: 'Trading pair of the order',
        options: [
          { label: 'BTC-USD', value: 'BTC' },
          { label: 'ETH-USD', value: 'ETH' },
          { label: 'SOL-USD', value: 'SOL' }
        ]
      }
    ],
    requiresAuth: true,
    isWrite: true,
    returns: 'Cancellation confirmation',
    tags: ['trading', 'order', 'cancel', 'write'],
    example: '{"orderId": "123456", "symbol": "BTC"}'
  },

  {
    id: 'cancelAllOrders',
    name: 'Cancel All Orders',
    description: 'Cancel all open orders for a symbol or all symbols',
    parameters: [
      {
        name: 'symbol',
        displayName: 'Trading Pair (Optional)',
        type: 'select',
        required: false,
        description: 'Cancel orders for specific symbol, or leave empty for all',
        options: [
          { label: 'All Symbols', value: '' },
          { label: 'BTC-USD', value: 'BTC' },
          { label: 'ETH-USD', value: 'ETH' },
          { label: 'SOL-USD', value: 'SOL' }
        ]
      }
    ],
    requiresAuth: true,
    isWrite: true,
    returns: 'Array of cancelled order IDs',
    tags: ['trading', 'order', 'cancel', 'write'],
    example: '{"symbol": "BTC"}'
  },

  {
    id: 'modifyOrder',
    name: 'Modify Order',
    description: 'Modify an existing open order (price and/or size)',
    parameters: [
      {
        name: 'orderId',
        displayName: 'Order ID',
        type: 'string',
        required: true,
        description: 'ID of the order to modify'
      },
      {
        name: 'symbol',
        displayName: 'Trading Pair',
        type: 'select',
        required: true,
        description: 'Trading pair of the order',
        options: [
          { label: 'BTC-USD', value: 'BTC' },
          { label: 'ETH-USD', value: 'ETH' },
          { label: 'SOL-USD', value: 'SOL' }
        ]
      },
      {
        name: 'newPrice',
        displayName: 'New Price',
        type: 'number',
        required: false,
        description: 'New limit price (optional)',
        validation: {
          min: 0
        }
      },
      {
        name: 'newSize',
        displayName: 'New Size',
        type: 'number',
        required: false,
        description: 'New order size (optional)',
        validation: {
          min: 0.0001
        }
      }
    ],
    requiresAuth: true,
    isWrite: true,
    returns: 'Modified order confirmation',
    tags: ['trading', 'order', 'modify', 'write'],
    example: '{"orderId": "123456", "symbol": "BTC", "newPrice": 46000}'
  },

  {
    id: 'closePosition',
    name: 'Close Position',
    description: 'Close an open position at market price',
    parameters: [
      {
        name: 'symbol',
        displayName: 'Trading Pair',
        type: 'select',
        required: true,
        description: 'Trading pair to close position',
        options: [
          { label: 'BTC-USD', value: 'BTC' },
          { label: 'ETH-USD', value: 'ETH' },
          { label: 'SOL-USD', value: 'SOL' }
        ]
      },
      {
        name: 'percentage',
        displayName: 'Close Percentage',
        type: 'number',
        required: false,
        default: 100,
        description: 'Percentage of position to close (1-100)',
        validation: {
          min: 1,
          max: 100
        }
      }
    ],
    requiresAuth: true,
    isWrite: true,
    returns: 'Position close confirmation',
    tags: ['trading', 'position', 'close', 'write'],
    example: '{"symbol": "BTC", "percentage": 100}'
  },

  {
    id: 'updateLeverage',
    name: 'Update Leverage',
    description: 'Update leverage for a trading pair',
    parameters: [
      {
        name: 'symbol',
        displayName: 'Trading Pair',
        type: 'select',
        required: true,
        description: 'Trading pair to update leverage',
        options: [
          { label: 'BTC-USD', value: 'BTC' },
          { label: 'ETH-USD', value: 'ETH' },
          { label: 'SOL-USD', value: 'SOL' }
        ]
      },
      {
        name: 'leverage',
        displayName: 'Leverage',
        type: 'number',
        required: true,
        description: 'New leverage value (1-50x)',
        validation: {
          min: 1,
          max: 50
        }
      },
      {
        name: 'crossMargin',
        displayName: 'Cross Margin',
        type: 'boolean',
        required: false,
        default: false,
        description: 'Use cross margin mode (vs isolated)'
      }
    ],
    requiresAuth: true,
    isWrite: true,
    returns: 'Leverage update confirmation',
    tags: ['trading', 'leverage', 'margin', 'write'],
    example: '{"symbol": "BTC", "leverage": 10, "crossMargin": false}'
  }
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
