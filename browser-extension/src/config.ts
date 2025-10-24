// Environment configuration for Lucid L2 Browser Extension
export type Environment = 'development' | 'staging' | 'production';

export interface Config {
  environment: Environment;
  apiUrl: string;
  privyAppId: string;
  solana: {
    network: 'devnet' | 'testnet' | 'mainnet-beta';
    rpcUrl: string;
    lucidMint: string;
  };
  features: {
    debugMode: boolean;
    analytics: boolean;
  };
}

const configs: Record<Environment, Config> = {
  development: {
    environment: 'development',
    apiUrl: 'http://localhost:3001',
    privyAppId: 'cm7kvvobw020cisjqrkr9hr2m',
    solana: {
      network: 'devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      lucidMint: 'FevHSnbJ3567nxaJoCBZMmdR6SKwB9xsTZgdFGJ9WoHQ'
    },
    features: {
      debugMode: true,
      analytics: false
    }
  },
  staging: {
    environment: 'staging',
    apiUrl: 'https://api.staging.lucid-l2.com',
    privyAppId: 'cm7kvvobw020cisjqrkr9hr2m',
    solana: {
      network: 'testnet',
      rpcUrl: 'https://api.testnet.solana.com',
      lucidMint: '8FJLRcc681GxefHgsPg32ZdGAveQNTFLVy5GgmotiimG'
    },
    features: {
      debugMode: false,
      analytics: true
    }
  },
  production: {
    environment: 'production',
    apiUrl: 'https://api.lucid-l2.com',
    privyAppId: 'PRODUCTION_APP_ID_HERE', // TODO: Replace with production Privy App ID
    solana: {
      network: 'mainnet-beta',
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      lucidMint: 'MAINNET_MINT_ADDRESS_HERE' // TODO: Replace with mainnet LUCID mint
    },
    features: {
      debugMode: false,
      analytics: true
    }
  }
};

// Determine environment from build-time variable or default to development
const getEnvironment = (): Environment => {
  // @ts-ignore - injected by vite
  const envString = typeof process !== 'undefined' ? process.env.NODE_ENV : 'development';
  
  if (envString === 'production') return 'production';
  if (envString === 'staging') return 'staging';
  return 'development';
};

// Get configuration for current environment
export const config = configs[getEnvironment()];

// Runtime config getter (can be used to load from storage if needed)
export function getConfig(): Config {
  return config;
}

// Helper to check if running in development mode
export function isDevelopment(): boolean {
  return config.environment === 'development';
}

// Helper to check if debug mode is enabled
export function isDebugMode(): boolean {
  return config.features.debugMode;
}

// Log configuration on load (only in debug mode)
if (isDebugMode()) {
  console.log('🔧 Lucid L2 Extension Configuration:', {
    environment: config.environment,
    apiUrl: config.apiUrl,
    network: config.solana.network
  });
}
