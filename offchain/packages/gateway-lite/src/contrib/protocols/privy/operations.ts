import { OperationDefinition } from '../../../protocols/types';

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
