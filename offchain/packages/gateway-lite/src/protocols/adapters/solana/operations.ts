/**
 * Solana Protocol Adapter - Operation Definitions
 * 
 * Defines all available operations for the Solana blockchain.
 */

import { OperationDefinition } from '../../types';

export const SOLANA_OPERATIONS: OperationDefinition[] = [
  // =============================================================================
  // Balance and Account Operations
  // =============================================================================
  {
    id: 'getBalance',
    name: 'Get SOL Balance',
    description: 'Get the SOL balance for a wallet address',
    parameters: [
      {
        name: 'address',
        displayName: 'Wallet Address',
        type: 'address',
        required: true,
        description: 'Solana wallet address (base58 encoded)',
        placeholder: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      },
      {
        name: 'commitment',
        displayName: 'Commitment Level',
        type: 'select',
        required: false,
        default: 'confirmed',
        description: 'Commitment level for the query',
        options: [
          { label: 'Processed', value: 'processed' },
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Finalized', value: 'finalized' }
        ]
      }
    ],
    requiresAuth: false,
    isWrite: false,
    returns: 'Balance information in SOL and lamports',
    tags: ['balance', 'account', 'read-only'],
    example: '{"address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"}'
  },

  {
    id: 'getTokenBalance',
    name: 'Get Token Balance',
    description: 'Get the balance of a specific SPL token for a wallet',
    parameters: [
      {
        name: 'address',
        displayName: 'Wallet Address',
        type: 'address',
        required: true,
        description: 'Solana wallet address',
        placeholder: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      },
      {
        name: 'mint',
        displayName: 'Token Mint Address',
        type: 'address',
        required: true,
        description: 'SPL token mint address',
        placeholder: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      },
      {
        name: 'commitment',
        displayName: 'Commitment Level',
        type: 'select',
        required: false,
        default: 'confirmed',
        description: 'Commitment level for the query',
        options: [
          { label: 'Processed', value: 'processed' },
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Finalized', value: 'finalized' }
        ]
      }
    ],
    requiresAuth: false,
    isWrite: false,
    returns: 'Token balance with decimals and UI amount',
    tags: ['balance', 'token', 'spl', 'read-only'],
    example: '{"address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"}'
  },

  {
    id: 'getTokenAccounts',
    name: 'Get Token Accounts',
    description: 'List all token accounts owned by a wallet address',
    parameters: [
      {
        name: 'address',
        displayName: 'Wallet Address',
        type: 'address',
        required: true,
        description: 'Solana wallet address',
        placeholder: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      },
      {
        name: 'mint',
        displayName: 'Filter by Mint (Optional)',
        type: 'address',
        required: false,
        description: 'Filter by specific token mint address',
        placeholder: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      },
      {
        name: 'commitment',
        displayName: 'Commitment Level',
        type: 'select',
        required: false,
        default: 'confirmed',
        description: 'Commitment level for the query',
        options: [
          { label: 'Processed', value: 'processed' },
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Finalized', value: 'finalized' }
        ]
      }
    ],
    requiresAuth: false,
    isWrite: false,
    returns: 'Array of token account information',
    tags: ['account', 'token', 'spl', 'read-only'],
    example: '{"address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"}'
  },

  {
    id: 'getAccountInfo',
    name: 'Get Account Info',
    description: 'Get detailed account information including lamports, owner, and data',
    parameters: [
      {
        name: 'address',
        displayName: 'Account Address',
        type: 'address',
        required: true,
        description: 'Solana account address',
        placeholder: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      },
      {
        name: 'commitment',
        displayName: 'Commitment Level',
        type: 'select',
        required: false,
        default: 'confirmed',
        description: 'Commitment level for the query',
        options: [
          { label: 'Processed', value: 'processed' },
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Finalized', value: 'finalized' }
        ]
      }
    ],
    requiresAuth: false,
    isWrite: false,
    returns: 'Account information including owner and data',
    tags: ['account', 'info', 'read-only'],
    example: '{"address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"}'
  },

  // =============================================================================
  // Transaction Operations
  // =============================================================================
  {
    id: 'getTransaction',
    name: 'Get Transaction',
    description: 'Get detailed transaction information by signature',
    parameters: [
      {
        name: 'signature',
        displayName: 'Transaction Signature',
        type: 'string',
        required: true,
        description: 'Transaction signature (base58 encoded)',
        placeholder: '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW'
      },
      {
        name: 'commitment',
        displayName: 'Commitment Level',
        type: 'select',
        required: false,
        default: 'confirmed',
        description: 'Commitment level for the query',
        options: [
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Finalized', value: 'finalized' }
        ]
      }
    ],
    requiresAuth: false,
    isWrite: false,
    returns: 'Detailed transaction information',
    tags: ['transaction', 'history', 'read-only'],
    example: '{"signature": "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"}'
  },

  {
    id: 'getSignaturesForAddress',
    name: 'Get Transaction History',
    description: 'Get transaction signatures for a wallet address',
    parameters: [
      {
        name: 'address',
        displayName: 'Wallet Address',
        type: 'address',
        required: true,
        description: 'Solana wallet address',
        placeholder: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      },
      {
        name: 'limit',
        displayName: 'Limit',
        type: 'number',
        required: false,
        default: 10,
        description: 'Maximum number of signatures to return',
        validation: {
          min: 1,
          max: 1000
        }
      },
      {
        name: 'before',
        displayName: 'Before Signature',
        type: 'string',
        required: false,
        description: 'Start searching backwards from this signature',
        placeholder: '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW'
      },
      {
        name: 'commitment',
        displayName: 'Commitment Level',
        type: 'select',
        required: false,
        default: 'confirmed',
        description: 'Commitment level for the query',
        options: [
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Finalized', value: 'finalized' }
        ]
      }
    ],
    requiresAuth: false,
    isWrite: false,
    returns: 'Array of transaction signatures with metadata',
    tags: ['transaction', 'history', 'read-only'],
    example: '{"address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", "limit": 10}'
  },

  {
    id: 'getRecentBlockhash',
    name: 'Get Recent Blockhash',
    description: 'Get the most recent blockhash for transaction construction',
    parameters: [
      {
        name: 'commitment',
        displayName: 'Commitment Level',
        type: 'select',
        required: false,
        default: 'finalized',
        description: 'Commitment level for the query',
        options: [
          { label: 'Processed', value: 'processed' },
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Finalized', value: 'finalized' }
        ]
      }
    ],
    requiresAuth: false,
    isWrite: false,
    returns: 'Recent blockhash and last valid block height',
    tags: ['blockhash', 'transaction', 'read-only'],
    example: '{}'
  },

  // =============================================================================
  // Token Information Operations
  // =============================================================================
  {
    id: 'getTokenSupply',
    name: 'Get Token Supply',
    description: 'Get the total supply of a SPL token',
    parameters: [
      {
        name: 'mint',
        displayName: 'Token Mint Address',
        type: 'address',
        required: true,
        description: 'SPL token mint address',
        placeholder: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      },
      {
        name: 'commitment',
        displayName: 'Commitment Level',
        type: 'select',
        required: false,
        default: 'confirmed',
        description: 'Commitment level for the query',
        options: [
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Finalized', value: 'finalized' }
        ]
      }
    ],
    requiresAuth: false,
    isWrite: false,
    returns: 'Token supply information with decimals',
    tags: ['token', 'supply', 'spl', 'read-only'],
    example: '{"mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"}'
  },

  // =============================================================================
  // Transfer Operations (Write)
  // =============================================================================
  {
    id: 'transferSOL',
    name: 'Transfer SOL',
    description: 'Transfer native SOL from one wallet to another',
    parameters: [
      {
        name: 'toAddress',
        displayName: 'Recipient Address',
        type: 'address',
        required: true,
        description: 'Destination wallet address',
        placeholder: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      },
      {
        name: 'amount',
        displayName: 'Amount (SOL)',
        type: 'number',
        required: true,
        description: 'Amount of SOL to transfer',
        validation: {
          min: 0.000000001
        }
      },
      {
        name: 'commitment',
        displayName: 'Commitment Level',
        type: 'select',
        required: false,
        default: 'confirmed',
        description: 'Commitment level for confirmation',
        options: [
          { label: 'Processed', value: 'processed' },
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Finalized', value: 'finalized' }
        ]
      }
    ],
    requiresAuth: true,
    isWrite: true,
    returns: 'Transaction signature',
    tags: ['transfer', 'sol', 'write'],
    example: '{"toAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", "amount": 0.1}'
  },

  {
    id: 'transferToken',
    name: 'Transfer SPL Token',
    description: 'Transfer SPL tokens from one wallet to another',
    parameters: [
      {
        name: 'toAddress',
        displayName: 'Recipient Address',
        type: 'address',
        required: true,
        description: 'Destination wallet address',
        placeholder: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      },
      {
        name: 'mint',
        displayName: 'Token Mint Address',
        type: 'address',
        required: true,
        description: 'SPL token mint address',
        placeholder: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      },
      {
        name: 'amount',
        displayName: 'Amount',
        type: 'number',
        required: true,
        description: 'Amount of tokens to transfer (in token units)',
        validation: {
          min: 0
        }
      },
      {
        name: 'decimals',
        displayName: 'Decimals (Optional)',
        type: 'number',
        required: false,
        description: 'Token decimals (auto-detected if not provided)',
        validation: {
          min: 0,
          max: 9
        }
      },
      {
        name: 'commitment',
        displayName: 'Commitment Level',
        type: 'select',
        required: false,
        default: 'confirmed',
        description: 'Commitment level for confirmation',
        options: [
          { label: 'Processed', value: 'processed' },
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Finalized', value: 'finalized' }
        ]
      }
    ],
    requiresAuth: true,
    isWrite: true,
    returns: 'Transaction signature',
    tags: ['transfer', 'token', 'spl', 'write'],
    example: '{"toAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "amount": 100}'
  },

  // =============================================================================
  // Token Account Operations (Write)
  // =============================================================================
  {
    id: 'createTokenAccount',
    name: 'Create Token Account',
    description: 'Create an associated token account for a wallet and token mint',
    parameters: [
      {
        name: 'owner',
        displayName: 'Owner Address',
        type: 'address',
        required: true,
        description: 'Wallet address that will own the token account',
        placeholder: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      },
      {
        name: 'mint',
        displayName: 'Token Mint Address',
        type: 'address',
        required: true,
        description: 'SPL token mint address',
        placeholder: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      },
      {
        name: 'commitment',
        displayName: 'Commitment Level',
        type: 'select',
        required: false,
        default: 'confirmed',
        description: 'Commitment level for confirmation',
        options: [
          { label: 'Processed', value: 'processed' },
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Finalized', value: 'finalized' }
        ]
      }
    ],
    requiresAuth: true,
    isWrite: true,
    returns: 'Token account address and transaction signature',
    tags: ['token', 'account', 'create', 'spl', 'write'],
    example: '{"owner": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"}'
  },

  {
    id: 'closeTokenAccount',
    name: 'Close Token Account',
    description: 'Close a token account and reclaim rent to the destination address',
    parameters: [
      {
        name: 'tokenAccount',
        displayName: 'Token Account Address',
        type: 'address',
        required: true,
        description: 'Token account address to close',
        placeholder: 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG'
      },
      {
        name: 'destination',
        displayName: 'Destination Address (Optional)',
        type: 'address',
        required: false,
        description: 'Address to receive the rent (defaults to owner)',
        placeholder: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      },
      {
        name: 'commitment',
        displayName: 'Commitment Level',
        type: 'select',
        required: false,
        default: 'confirmed',
        description: 'Commitment level for confirmation',
        options: [
          { label: 'Processed', value: 'processed' },
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Finalized', value: 'finalized' }
        ]
      }
    ],
    requiresAuth: true,
    isWrite: true,
    returns: 'Transaction signature',
    tags: ['token', 'account', 'close', 'spl', 'write'],
    example: '{"tokenAccount": "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"}'
  }
];

/**
 * Get operation by ID
 */
export function getOperation(operationId: string): OperationDefinition | undefined {
  return SOLANA_OPERATIONS.find(op => op.id === operationId);
}

/**
 * Get all read-only operations
 */
export function getReadOnlyOperations(): OperationDefinition[] {
  return SOLANA_OPERATIONS.filter(op => !op.isWrite);
}

/**
 * Get all write operations
 */
export function getWriteOperations(): OperationDefinition[] {
  return SOLANA_OPERATIONS.filter(op => op.isWrite);
}
