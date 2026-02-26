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
    lucidTokenAddress: process.env.BASE_LUCID_TOKEN_ADDRESS,
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
    lucidTokenAddress: process.env.ETHEREUM_LUCID_TOKEN_ADDRESS,
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
    lucidTokenAddress: process.env.ARBITRUM_LUCID_TOKEN_ADDRESS,
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
    lucidValidatorAddress: process.env.BASE_SEPOLIA_LUCID_VALIDATOR || '0x7695cd6F97d1434A2Ab5f778C6B02898385b14cc',
    lucidTokenAddress: process.env.BASE_SEPOLIA_LUCID_TOKEN || '0x17F583fc59b745E24C5078b9C8e4577b866cD7fc',
    escrowContract: process.env.BASE_SEPOLIA_ESCROW_CONTRACT || '0x060f76F82325B98bC595954F6b8c88083B43b379',
    arbitrationContract: process.env.BASE_SEPOLIA_ARBITRATION_CONTRACT || '0xc93b3E60503cAD1FEc11209F374A67D2886c6BA5',
    entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    paymaster: process.env.BASE_SEPOLIA_PAYMASTER || '0xd2671c81a7169E66Aa9B0db5D0bF865Cfd6868bD',
    modules: {
      policy: process.env.BASE_SEPOLIA_MODULE_POLICY || '0xe0263C014B66D4452CD42ec9693A830f5D28bC5F',
      payout: process.env.BASE_SEPOLIA_MODULE_PAYOUT || '0x51646afF187945B7F573503139A3a2c470064229',
      receipt: process.env.BASE_SEPOLIA_MODULE_RECEIPT || '0x00b811fD025A3B2606a83Ee9C4bF882f4612B745',
    },
    zkmlVerifier: process.env.BASE_SEPOLIA_ZKML_VERIFIER || '0xAA663967159E18A3Da2A8277FDDa35C0389e1462',
  },

  'ethereum-sepolia': {
    chainId: 'ethereum-sepolia',
    name: 'Ethereum Sepolia',
    chainType: 'evm',
    evmChainId: 11155111,
    rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
    isTestnet: true,
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    erc8004: {
      identityRegistry: process.env.ETHEREUM_SEPOLIA_IDENTITY_REGISTRY,
      validationRegistry: process.env.ETHEREUM_SEPOLIA_VALIDATION_REGISTRY,
      reputationRegistry: process.env.ETHEREUM_SEPOLIA_REPUTATION_REGISTRY,
    },
    lucidValidatorAddress: process.env.SEPOLIA_LUCID_VALIDATOR || '0x2f3F68fEF35D39711F78Ce75c5a7fbA35f80500e',
    lucidTokenAddress: process.env.SEPOLIA_LUCID_TOKEN || '0x060f76F82325B98bC595954F6b8c88083B43b379',
    escrowContract: process.env.SEPOLIA_ESCROW_CONTRACT || '0x3Aff9d80Cd91Fb9C4fE475155e60e9C473F55088',
    arbitrationContract: process.env.SEPOLIA_ARBITRATION_CONTRACT || '0x3D29D5dDAe2da5E571C015EfAbdfCab9A1B0F9BA',
    entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    paymaster: process.env.SEPOLIA_PAYMASTER || '0xafDcb7f7D75784076eC1f62DB13F7651A73789A2',
    modules: {
      policy: process.env.SEPOLIA_MODULE_POLICY || '0x1be63A49Ce0D65A010E2fF9038b81FEdf6AB1477',
      payout: process.env.SEPOLIA_MODULE_PAYOUT || '0xAec07214d21627dFD2131470B29a8372be21eF55',
      receipt: process.env.SEPOLIA_MODULE_RECEIPT || '0x7695cd6F97d1434A2Ab5f778C6B02898385b14cc',
    },
    zkmlVerifier: process.env.SEPOLIA_ZKML_VERIFIER || '0xd69Ce5E5AA5a68D55413766320b520eeA3fdFf98',
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
    lucidValidatorAddress: process.env.APECHAIN_TESTNET_LUCID_VALIDATOR || '0x2f3F68fEF35D39711F78Ce75c5a7fbA35f80500e',
    lucidTokenAddress: process.env.APECHAIN_TESTNET_LUCID_TOKEN || '0x585Fdf7ba18c550599412260aaA003ff006e111f',
    escrowContract: process.env.APECHAIN_TESTNET_ESCROW_CONTRACT || '0x3Aff9d80Cd91Fb9C4fE475155e60e9C473F55088',
    arbitrationContract: process.env.APECHAIN_TESTNET_ARBITRATION_CONTRACT || '0x912d97060bE413E2e28066B52AC4D82947A3f499',
    entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    paymaster: process.env.APECHAIN_TESTNET_PAYMASTER || '0xAA663967159E18A3Da2A8277FDDa35C0389e1462',
    modules: {
      policy: process.env.APECHAIN_TESTNET_MODULE_POLICY || '0x1be63A49Ce0D65A010E2fF9038b81FEdf6AB1477',
      payout: process.env.APECHAIN_TESTNET_MODULE_PAYOUT || '0xAec07214d21627dFD2131470B29a8372be21eF55',
      receipt: process.env.APECHAIN_TESTNET_MODULE_RECEIPT || '0x7695cd6F97d1434A2Ab5f778C6B02898385b14cc',
    },
    zkmlVerifier: process.env.APECHAIN_TESTNET_ZKML_VERIFIER || '0xd69Ce5E5AA5a68D55413766320b520eeA3fdFf98',
  },

  'avalanche-fuji': {
    chainId: 'avalanche-fuji',
    name: 'Avalanche Fuji Testnet',
    chainType: 'evm',
    evmChainId: 43113,
    rpcUrl: process.env.AVALANCHE_FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc',
    isTestnet: true,
    explorerUrl: 'https://testnet.snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
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
