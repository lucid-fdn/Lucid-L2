// offchain/src/utils/config.ts
import { PublicKey } from '@solana/web3.js';

// Version 1.1 - Lucid L2 Configuration with Environment Support
export const CONFIG_VERSION = '1.1';

// Environment types
export type Environment = 'localnet' | 'devnet' | 'testnet' | 'mainnet';

// Environment configuration
export interface EnvironmentConfig {
  rpcUrl: string;
  commitment: string;
  programId: PublicKey;
  lucidMint: PublicKey;
}

// Configuration Manager Class
export class ConfigurationManager {
  private environments: Record<Environment, EnvironmentConfig> = {
    localnet: {
      rpcUrl: 'http://localhost:8899',
      commitment: 'processed',
      programId: new PublicKey('J1JNYJB41UeyyR3qYFjwxZ2RsD71JRm3ULYZG6bLhm3c'),
      lucidMint: new PublicKey('4sWEwy73f7ViLeuSYgBGRt9zZxH3VJ7SsBRitpBFCQSh')
    },
    devnet: {
      rpcUrl: 'https://api.devnet.solana.com',
      commitment: 'confirmed',
      programId: new PublicKey('GdbWhvXLg55ACeauwTPB4rXpcgHxjKyT6YuTGeH5orCo'),
      lucidMint: new PublicKey('79rh6D6ejAWKo1zRbBocpfnLiP5wu5HaJPkazDWsFuQm') // LUCID token created on devnet
    },
    testnet: {
      rpcUrl: 'https://api.testnet.solana.com',
      commitment: 'confirmed',
      programId: new PublicKey('11111111111111111111111111111111'),
      lucidMint: new PublicKey('11111111111111111111111111111111')
    },
    mainnet: {
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      commitment: 'confirmed',
      programId: new PublicKey('11111111111111111111111111111111'),
      lucidMint: new PublicKey('11111111111111111111111111111111')
    }
  };

  private currentEnvironment: Environment = 'devnet'; // Default to devnet for Phase 8.4 - Real wallet integration

  setEnvironment(env: Environment): void {
    if (!this.environments[env]) {
      throw new Error(`Invalid environment: ${env}`);
    }
    this.currentEnvironment = env;
    this.notifyEnvironmentChange(env);
  }

  getConfig(): EnvironmentConfig & { environment: Environment } {
    return {
      ...this.environments[this.currentEnvironment],
      environment: this.currentEnvironment
    };
  }

  isDevnet(): boolean {
    return this.currentEnvironment === 'devnet';
  }

  isLocalnet(): boolean {
    return this.currentEnvironment === 'localnet';
  }

  isMainnet(): boolean {
    return this.currentEnvironment === 'mainnet';
  }

  private notifyEnvironmentChange(env: Environment): void {
    console.log(`🌐 Environment switched to: ${env}`);
    
    // Update browser extension with new config if available
    if (typeof window !== 'undefined' && (window as any).chrome && (window as any).chrome.storage) {
      (window as any).chrome.storage.local.set({
        'lucid_environment': env,
        'lucid_config': this.getConfig()
      });
    }
  }
}

// Global configuration manager instance
export const configManager = new ConfigurationManager();

// Gas rates and costs
export const IGAS_PER_CALL = 1;      // 1 LUCID per inference call
export const MGAS_PER_ROOT = 5;      // 5 LUCID per memory write
export const IGAS_PER_BATCH = 2;     // 2 LUCID per batch operation

// Token configuration - now uses configManager for environment-aware settings
export const LUCID_DECIMALS = 9;

// Solana configuration - now uses configManager for environment-aware settings  
export const COMPUTE_UNITS = 400_000;

// API configuration
export const API_PORT = 3001;
export const MAX_BATCH_SIZE = 10;

// Environment-aware getters (replace static exports)
export function getCurrentConfig() {
  return configManager.getConfig();
}

export function getLUCID_MINT() {
  return getCurrentConfig().lucidMint;
}

export function getRPC_URL() {
  return getCurrentConfig().rpcUrl;
}

export function getPROGRAM_ID() {
  return getCurrentConfig().programId;
}

export function getCOMMITMENT() {
  return getCurrentConfig().commitment;
}

// Legacy exports for backward compatibility
export const LUCID_MINT = configManager.getConfig().lucidMint;
export const RPC_URL = configManager.getConfig().rpcUrl;
export const PROGRAM_ID = configManager.getConfig().programId; 
export const COMMITMENT = configManager.getConfig().commitment;

/**
 * Internal LLM is NOT required for Lucid’s core goal (capture external LLM messages and commit their hash).
 * Keep it configurable:
 *  - USE_INTERNAL_LLM = false → strictly hash text provided by the extension (no OpenAI/mock calls)
 *  - USE_INTERNAL_LLM = true  → route text through internal LLM provider and then hash the AI response
 */
// LLM configuration
export const LLM_CONFIG = {
  provider: 'llmproxy', // Using llm-proxy for multi-model support
  model: 'openai-gpt35-turbo', // Default model via Eden AI
  apiKey: process.env.OPENAI_API_KEY || '', // Not needed for llm-proxy, but kept for compatibility
  baseUrl: 'http://localhost:8001', // llm-proxy URL
  maxTokens: 150,
  temperature: 0.7,
  fallbackProviders: ['mock'] // Fallback to mock if llm-proxy is unavailable
};

// Toggle internal LLM usage (true = use llm-proxy for AI responses)
export const USE_INTERNAL_LLM = true;

// n8n Orchestrator Configuration
export const N8N_CONFIG = {
  enabled: process.env.N8N_ENABLED === 'true' || false, // Set to true to use n8n
  url: process.env.N8N_URL || 'http://localhost:5678',
  hmacSecret: process.env.N8N_HMAC_SECRET || '', // Must match n8n/.env
  timeout: 30000 // 30 seconds
};

// Direct exports for easier access
export const N8N_ENABLED = N8N_CONFIG.enabled;
export const N8N_URL = N8N_CONFIG.url;
export const N8N_HMAC_SECRET = N8N_CONFIG.hmacSecret;

// Development configuration
export const MEMORY_WALLET_PATH = './memory-wallet.json';
