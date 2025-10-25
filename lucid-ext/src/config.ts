// Environment configuration for Lucid Extension
// Based on NODE_ENV, selects appropriate API endpoints and network settings

export type Environment = 'development' | 'staging' | 'production';

export interface Config {
  apiUrl: string;
  network: 'devnet' | 'testnet' | 'mainnet-beta';
  environment: Environment;
  privyAppId: string;
  debug: boolean;
}

const getEnvironment = (): Environment => {
  const env = import.meta.env.MODE || 'development';
  if (env === 'production') return 'production';
  if (env === 'staging') return 'staging';
  return 'development';
};

const configs: Record<Environment, Omit<Config, 'environment'>> = {
  development: {
    apiUrl: 'http://localhost:3001',
    network: 'devnet',
    privyAppId: import.meta.env.VITE_PRIVY_APP_ID || '',
    debug: true,
  },
  staging: {
    apiUrl: 'https://api.staging.lucid-l2.com',
    network: 'testnet',
    privyAppId: import.meta.env.VITE_PRIVY_APP_ID || '',
    debug: true,
  },
  production: {
    apiUrl: 'https://api.lucid-l2.com',
    network: 'mainnet-beta',
    privyAppId: import.meta.env.VITE_PRIVY_APP_ID || '',
    debug: false,
  },
};

const environment = getEnvironment();
const config: Config = {
  ...configs[environment],
  environment,
};

// Log configuration on load (only in debug mode)
if (config.debug) {
  console.log('[Lucid Extension] Configuration loaded:', {
    environment: config.environment,
    apiUrl: config.apiUrl,
    network: config.network,
    privyAppId: config.privyAppId ? '***' + config.privyAppId.slice(-4) : 'NOT SET',
  });
}

export default config;
