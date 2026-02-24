/**
 * Chain Configurations
 *
 * Predefined configs for all supported chains.
 * Add new chains here — no code changes needed elsewhere.
 */

import type { ChainConfig } from './types';

export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  // =========================================================================
  // EVM Mainnets
  // =========================================================================

  'apechain': {
    chainId: 'apechain',
    name: 'ApeChain',
    chainType: 'evm',
    evmChainId: 33139,
    rpcUrl: process.env.APECHAIN_RPC_URL || 'https://rpc.apechain.com/http',
    isTestnet: false,
    explorerUrl: 'https://apescan.io',
    nativeCurrency: { name: 'APE', symbol: 'APE', decimals: 18 },
    erc8004: {
      identityRegistry: process.env.APECHAIN_IDENTITY_REGISTRY,
      validationRegistry: process.env.APECHAIN_VALIDATION_REGISTRY,
      reputationRegistry: process.env.APECHAIN_REPUTATION_REGISTRY,
    },
  },

  'base': {
    chainId: 'base',
    name: 'Base',
    chainType: 'evm',
    evmChainId: 8453,
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    isTestnet: false,
    explorerUrl: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    erc8004: {
      identityRegistry: process.env.BASE_IDENTITY_REGISTRY,
      validationRegistry: process.env.BASE_VALIDATION_REGISTRY,
      reputationRegistry: process.env.BASE_REPUTATION_REGISTRY,
    },
    usdcAddress: process.env.BASE_USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    layerZeroEndpoint: '0x1a44076050125825900e736c501f859c50fE728c',
    lucidTokenAddress: process.env.BASE_LUCID_OFT_ADDRESS,
  },

  'ethereum': {
    chainId: 'ethereum',
    name: 'Ethereum',
    chainType: 'evm',
    evmChainId: 1,
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth.drpc.org',
    isTestnet: false,
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    erc8004: {
      identityRegistry: process.env.ETHEREUM_IDENTITY_REGISTRY,
      validationRegistry: process.env.ETHEREUM_VALIDATION_REGISTRY,
      reputationRegistry: process.env.ETHEREUM_REPUTATION_REGISTRY,
    },
    usdcAddress: process.env.ETHEREUM_USDC_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    layerZeroEndpoint: '0x1a44076050125825900e736c501f859c50fE728c',
    lucidTokenAddress: process.env.ETHEREUM_LUCID_OFT_ADDRESS,
  },

  'arbitrum': {
    chainId: 'arbitrum',
    name: 'Arbitrum One',
    chainType: 'evm',
    evmChainId: 42161,
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    isTestnet: false,
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    layerZeroEndpoint: '0x1a44076050125825900e736c501f859c50fE728c',
    lucidTokenAddress: process.env.ARBITRUM_LUCID_OFT_ADDRESS,
  },

  'avalanche': {
    chainId: 'avalanche',
    name: 'Avalanche C-Chain',
    chainType: 'evm',
    evmChainId: 43114,
    rpcUrl: process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
    isTestnet: false,
    explorerUrl: 'https://snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    usdcAddress: process.env.AVALANCHE_USDC_ADDRESS || '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  },

  'polygon': {
    chainId: 'polygon',
    name: 'Polygon PoS',
    chainType: 'evm',
    evmChainId: 137,
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    isTestnet: false,
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  },

  'monad': {
    chainId: 'monad',
    name: 'Monad',
    chainType: 'evm',
    evmChainId: 10143,
    rpcUrl: process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz',
    isTestnet: true,
    explorerUrl: 'https://testnet.monadexplorer.com',
    nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  },

  'megaeth': {
    chainId: 'megaeth',
    name: 'MegaETH',
    chainType: 'evm',
    evmChainId: 6342,
    rpcUrl: process.env.MEGAETH_RPC_URL || 'https://carrot.megaeth.com/rpc',
    isTestnet: true,
    explorerUrl: 'https://megaexplorer.xyz',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },

  // =========================================================================
  // EVM Testnets
  // =========================================================================

  'base-sepolia': {
    chainId: 'base-sepolia',
    name: 'Base Sepolia',
    chainType: 'evm',
    evmChainId: 84532,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    isTestnet: true,
    explorerUrl: 'https://sepolia.basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    erc8004: {
      identityRegistry: process.env.BASE_SEPOLIA_IDENTITY_REGISTRY,
      validationRegistry: process.env.BASE_SEPOLIA_VALIDATION_REGISTRY,
      reputationRegistry: process.env.BASE_SEPOLIA_REPUTATION_REGISTRY,
    },
    usdcAddress: process.env.BASE_SEPOLIA_USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    // Phase 3 contracts (populated on deploy)
    escrowContract: process.env.BASE_SEPOLIA_ESCROW_CONTRACT,
    arbitrationContract: process.env.BASE_SEPOLIA_ARBITRATION_CONTRACT,
    entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', // Canonical EntryPoint v0.7
    paymaster: process.env.BASE_SEPOLIA_PAYMASTER,
    modules: {
      policy: process.env.BASE_SEPOLIA_MODULE_POLICY,
      payout: process.env.BASE_SEPOLIA_MODULE_PAYOUT,
      receipt: process.env.BASE_SEPOLIA_MODULE_RECEIPT,
    },
    zkmlVerifier: process.env.BASE_SEPOLIA_ZKML_VERIFIER,
  },

  'ethereum-sepolia': {
    chainId: 'ethereum-sepolia',
    name: 'Ethereum Sepolia',
    chainType: 'evm',
    evmChainId: 11155111,
    rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
    isTestnet: true,
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    erc8004: {
      identityRegistry: process.env.ETHEREUM_SEPOLIA_IDENTITY_REGISTRY,
      validationRegistry: process.env.ETHEREUM_SEPOLIA_VALIDATION_REGISTRY,
      reputationRegistry: process.env.ETHEREUM_SEPOLIA_REPUTATION_REGISTRY,
    },
  },

  'apechain-testnet': {
    chainId: 'apechain-testnet',
    name: 'ApeChain Curtis Testnet',
    chainType: 'evm',
    evmChainId: 33111,
    rpcUrl: process.env.APECHAIN_TESTNET_RPC_URL || 'https://rpc.curtis.apechain.com/http',
    isTestnet: true,
    explorerUrl: 'https://curtis.apescan.io',
    nativeCurrency: { name: 'APE', symbol: 'APE', decimals: 18 },
    erc8004: {
      identityRegistry: process.env.APECHAIN_TESTNET_IDENTITY_REGISTRY,
      validationRegistry: process.env.APECHAIN_TESTNET_VALIDATION_REGISTRY,
      reputationRegistry: process.env.APECHAIN_TESTNET_REPUTATION_REGISTRY,
    },
  },

  // =========================================================================
  // Solana
  // =========================================================================

  'solana-devnet': {
    chainId: 'solana-devnet',
    name: 'Solana Devnet',
    chainType: 'solana',
    rpcUrl: process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com',
    isTestnet: true,
    explorerUrl: 'https://explorer.solana.com?cluster=devnet',
    nativeCurrency: { name: 'SOL', symbol: 'SOL', decimals: 9 },
  },

  'solana-mainnet': {
    chainId: 'solana-mainnet',
    name: 'Solana Mainnet',
    chainType: 'solana',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    isTestnet: false,
    explorerUrl: 'https://explorer.solana.com',
    nativeCurrency: { name: 'SOL', symbol: 'SOL', decimals: 9 },
  },
};

/** Get a chain config by ID */
export function getChainConfig(chainId: string): ChainConfig | undefined {
  return CHAIN_CONFIGS[chainId];
}

/** List all EVM chain configs */
export function getEVMChains(): ChainConfig[] {
  return Object.values(CHAIN_CONFIGS).filter((c) => c.chainType === 'evm');
}

/** List all Solana chain configs */
export function getSolanaChains(): ChainConfig[] {
  return Object.values(CHAIN_CONFIGS).filter((c) => c.chainType === 'solana');
}
