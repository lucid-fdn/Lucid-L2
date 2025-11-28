// Configuration Manager for Lucid L2 Browser Extension
// Centralized configuration for all extension components

class ConfigurationManager {
    constructor() {
        this.environments = {
            localnet: {
                rpcUrl: 'http://localhost:8899',
                commitment: 'processed',
                environment: 'localnet',
                lucidMint: '4sWEwy73f7ViLeuSYgBGRt9zZxH3VJ7SsBRitpBFCQSh',
                apiUrl: 'http://localhost:3001'
            },
            devnet: {
                rpcUrl: 'https://api.devnet.solana.com',
                commitment: 'confirmed',
                environment: 'devnet',
                lucidMint: 'FevHSnbJ3567nxaJoCBZMmdR6SKwB9xsTZgdFGJ9WoHQ',
                apiUrl: 'http://13.221.253.195:3001'
            },
            testnet: {
                rpcUrl: 'https://api.testnet.solana.com',
                commitment: 'confirmed',
                environment: 'testnet',
                lucidMint: '8FJLRcc681GxefHgsPg32ZdGAveQNTFLVy5GgmotiimG',
                apiUrl: 'http://13.221.253.195:3001'
            }
        };
        
        // Default to devnet for production
        this.currentEnvironment = 'devnet';
    }

    getConfig() {
        return this.environments[this.currentEnvironment];
    }

    setEnvironment(env) {
        if (this.environments[env]) {
            this.currentEnvironment = env;
            
            // Persist environment to storage for other components
            try {
                const cfg = this.getConfig();
                chrome.storage.local.set({
                    lucid_env: env,
                    lucid_network: cfg.environment,
                    lucid_api_url: cfg.apiUrl
                });
            } catch (e) {
                console.error('Failed to persist environment:', e);
            }
        } else {
            console.error(`Invalid environment: ${env}`);
        }
    }

    getCurrentEnvironment() {
        return this.currentEnvironment;
    }

    isDevnet() {
        return this.currentEnvironment === 'devnet';
    }

    isTestnet() {
        return this.currentEnvironment === 'testnet';
    }

    isLocalnet() {
        return this.currentEnvironment === 'localnet';
    }

    getApiUrl() {
        return this.getConfig().apiUrl;
    }

    getRpcUrl() {
        return this.getConfig().rpcUrl;
    }

    getLucidMint() {
        return this.getConfig().lucidMint;
    }

    // Load environment from storage (useful for initialization)
    async loadEnvironmentFromStorage() {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get(['lucid_env'], (result) => {
                    if (result.lucid_env && this.environments[result.lucid_env]) {
                        this.currentEnvironment = result.lucid_env;
                    }
                    resolve(this.currentEnvironment);
                });
            } catch (e) {
                console.error('Failed to load environment from storage:', e);
                resolve(this.currentEnvironment);
            }
        });
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ConfigurationManager = ConfigurationManager;
}

// CommonJS export (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConfigurationManager;
}
