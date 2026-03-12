// Browser Extension Privy-to-API Integration Bridge
// Connects Privy wallet authentication to Lucid L2 API endpoints

class PrivyAPIBridge {
  constructor() {
    this.apiUrl = 'https://www.lucid.foundation';
        this.privySession = null;
        this.isConnected = false;
        
        // Network configurations (defaults to testnet; can be changed via chrome.storage.local lucid_env)
        this.networkConfigs = {
            devnet: {
                rpcUrl: 'https://api.devnet.solana.com',
                programId: '9YhfaLoUZYLzu3xRQevRom4qj8oTf5TGpuoWptvStKDu',
                lucidMint: 'FevHSnbJ3567nxaJoCBZMmdR6SKwB9xsTZgdFGJ9WoHQ',
                environment: 'devnet'
            },
            testnet: {
                rpcUrl: 'https://api.testnet.solana.com',
                // Program/mint may differ on testnet; using devnet values as placeholders for balance queries
                programId: '9YhfaLoUZYLzu3xRQevRom4qj8oTf5TGpuoWptvStKDu',
                lucidMint: '8FJLRcc681GxefHgsPg32ZdGAveQNTFLVy5GgmotiimG',
                environment: 'testnet'
            }
        };
        this.env = 'devnet';
    }

    async init() {
        // Load Privy session from storage
        await this.loadPrivySession();

        // Load desired network from storage (defaults to 'testnet')
        try {
            await new Promise((resolve) => {
                chrome.storage.local.get(['lucid_env','lucid_network'], (res) => {
                    this.env = res.lucid_env || res.lucid_network || this.env || 'testnet';
                    resolve();
                });
            });
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && (changes.lucid_env || changes.lucid_network)) {
                    this.env = (changes.lucid_env?.newValue) || (changes.lucid_network?.newValue) || this.env;
                }
            });
        } catch (_) {}

        // Listen for Privy authentication events
        this.setupPrivyEventListeners();
    }

    async loadPrivySession() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['privy_session'], (result) => {
                if (result.privy_session) {
                    this.privySession = result.privy_session;
                    this.isConnected = true;
                    console.log('✅ Privy session loaded:', this.privySession);
                } else {
                    console.log('❌ No Privy session found');
                }
                resolve();
            });
        });
    }

    setupPrivyEventListeners() {
        // Listen for Privy authentication messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'privy_authenticated') {
                this.handlePrivyAuthentication(message.payload);
                sendResponse({ success: true });
            } else if (message.type === 'privy_logged_out') {
                this.handlePrivyLogout();
                sendResponse({ success: true });
            }
        });
    }

    async handlePrivyAuthentication(payload) {
        console.log('🔗 Privy authentication received:', payload);
        
        this.privySession = payload;
        this.isConnected = true;
        
        // Save to storage
        chrome.storage.local.set({ privy_session: payload });
        
        // Notify UI components
        this.notifyWalletConnected(payload);
        
        // Get real blockchain balances
        await this.updateBlockchainBalances();
    }

    handlePrivyLogout() {
        console.log('🔓 Privy logout received');
        
        this.privySession = null;
        this.isConnected = false;
        
        // Clear all extension storage to ensure clean state
        chrome.storage.local.clear(() => {
            console.log('✅ All extension storage cleared');
        });
        
        // Notify UI components
        this.notifyWalletDisconnected();
    }

    notifyWalletConnected(session) {
        // Dispatch custom event for UI updates
        window.dispatchEvent(new CustomEvent('privyWalletConnected', {
            detail: {
                session,
                solanaAddress: session.solanaAddress,
                evmAddress: session.address,
                isConnected: true
            }
        }));
    }

    notifyWalletDisconnected() {
        // Dispatch custom event for UI updates
        window.dispatchEvent(new CustomEvent('privyWalletDisconnected', {
            detail: {
                isConnected: false
            }
        }));
    }

    async updateBlockchainBalances() {
        if (!this.privySession?.solanaAddress) {
            console.log('No Solana address available for balance update');
            return;
        }

        try {
            // Get SOL balance
            const solBalance = await this.getSolanaBalance(this.privySession.solanaAddress);
            
            // Get LUCID token balance
            const lucidBalance = await this.getLucidTokenBalance(this.privySession.solanaAddress);
            
            const balances = {
                sol: solBalance,
                lucid: lucidBalance,
                mGas: await this.getMGasBalance() // From extension storage
            };

            // Update UI with real balances
            this.notifyBalanceUpdate(balances);
            
            return balances;
        } catch (error) {
            console.error('Failed to update blockchain balances:', error);
            return null;
        }
    }

    async getSolanaBalance(address) {
        try {
            const cfg = this.getNetworkConfig();
            const response = await fetch(cfg.rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getBalance',
                    params: [address]
                })
            });

            const data = await response.json();
            return data.result?.value ? data.result.value / 1e9 : 0; // Convert lamports to SOL
        } catch (error) {
            console.error('Failed to get SOL balance:', error);
            return 0;
        }
    }

    async getLucidTokenBalance(address) {
        try {
            // Get associated token account for LUCID
            const cfg = this.getNetworkConfig();
            const response = await fetch(cfg.rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getTokenAccountsByOwner',
                    params: [
                        address,
                        { mint: cfg.lucidMint },
                        { encoding: 'jsonParsed' }
                    ]
                })
            });

            const data = await response.json();
            const accounts = data.result?.value || [];
            
            if (accounts.length > 0) {
                const tokenAmount = accounts[0].account.data.parsed.info.tokenAmount;
                return parseFloat(tokenAmount.uiAmountString || '0');
            }
            
            return 0;
        } catch (error) {
            console.error('Failed to get LUCID balance:', error);
            return 0;
        }
    }

    async getMGasBalance() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['mGasBalance'], (result) => {
                resolve(result.mGasBalance || 0);
            });
        });
    }

    notifyBalanceUpdate(balances) {
        window.dispatchEvent(new CustomEvent('walletBalanceUpdate', {
            detail: {
                balance: balances,
                wallet: this.privySession,
                isConnected: this.isConnected
            }
        }));
    }

    // Main API integration method - processes thoughts using Lucid L2 API
    async processThought(text) {
        if (!this.isConnected || !this.privySession) {
            throw new Error('Wallet not connected. Please connect your wallet first.');
        }

        try {
            // Use Solana address if available, otherwise fall back to EVM address
            const walletAddress = this.privySession.solanaAddress || this.privySession.address;
            
            const env = this.env || 'testnet';
            const cfg = this.getNetworkConfig();
            console.log('🚀 Processing thought with Lucid L2 API:', {
                text: text.substring(0, 50) + '...',
                wallet: walletAddress,
                environment: env
            });

            // Call the Lucid L2 API
            const response = await fetch(`${this.apiUrl}/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text,
                    wallet: walletAddress,
                    environment: env
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            console.log('✅ Thought processed successfully:', {
                signature: result.txSignature,
                root: result.root,
                gasUsed: '6 LUCID (1 iGas + 5 mGas)'
            });

            // Update local balances after successful transaction
            await this.updateBlockchainBalances();

            return {
                success: true,
                signature: result.txSignature,
                root: result.root,
                response: result.response || 'Thought processed and committed to devnet!',
                explorerUrl: `https://explorer.solana.com/tx/${result.txSignature}?cluster=${env}`,
                gasUsed: { iGas: 1, mGas: 5, total: 6 }
            };

        } catch (error) {
            console.error('❌ Failed to process thought:', error);
            throw new Error(`Failed to process thought: ${error.message}`);
        }
    }

    // Batch processing method
    async processBatchThoughts(thoughts) {
        if (!this.isConnected || !this.privySession) {
            throw new Error('Wallet not connected. Please connect your wallet first.');
        }

        try {
            const walletAddress = this.privySession.solanaAddress || this.privySession.address;
            
            const env = this.env || 'testnet';
            const cfg = this.getNetworkConfig();
            console.log('🚀 Processing batch thoughts with Lucid L2 API:', {
                count: thoughts.length,
                wallet: walletAddress,
                environment: env
            });

            // Call the Lucid L2 batch API
            const response = await fetch(`${this.apiUrl}/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    texts: thoughts,
                    wallet: walletAddress,
                    environment: env
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            console.log('✅ Batch thoughts processed successfully:', {
                signature: result.txSignature,
                roots: result.roots.length,
                gasUsed: `${2 + (thoughts.length * 5)} LUCID (2 iGas + ${thoughts.length * 5} mGas)`
            });

            // Update local balances after successful transaction
            await this.updateBlockchainBalances();

            return {
                success: true,
                signature: result.txSignature,
                roots: result.roots,
                response: `${thoughts.length} thoughts processed and committed to devnet!`,
                explorerUrl: `https://explorer.solana.com/tx/${result.txSignature}?cluster=${env}`,
                gasUsed: { iGas: 2, mGas: thoughts.length * 5, total: 2 + (thoughts.length * 5) }
            };

        } catch (error) {
            console.error('❌ Failed to process batch thoughts:', error);
            throw new Error(`Failed to process batch thoughts: ${error.message}`);
        }
    }

    // Connect wallet using Privy (opens auth popup)
    async connectWallet() {
        try {
            console.log('🔗 Opening Privy authentication...');
            
            // Open Solana wallet connection
            const authUrl = chrome.runtime.getURL('auth.html');
            
            return new Promise((resolve, reject) => {
                // Create popup window
                chrome.windows.create({
                    url: authUrl,
                    type: 'popup',
                    width: 400,
                    height: 600,
                    focused: true
                }, (window) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    // Listen for authentication completion
                    const onMessage = (message) => {
                        if (message.type === 'privy_authenticated') {
                            chrome.runtime.onMessage.removeListener(onMessage);
                            this.handlePrivyAuthentication(message.payload);
                            resolve({
                                success: true,
                                wallet: message.payload,
                                message: 'Wallet connected successfully!'
                            });
                        }
                    };

                    chrome.runtime.onMessage.addListener(onMessage);

                    // Handle popup close without authentication
                    const checkClosed = setInterval(() => {
                        chrome.windows.get(window.id, (win) => {
                            if (chrome.runtime.lastError || !win) {
                                clearInterval(checkClosed);
                                chrome.runtime.onMessage.removeListener(onMessage);
                                if (!this.isConnected) {
                                    reject(new Error('Authentication was cancelled'));
                                }
                            }
                        });
                    }, 1000);
                });
            });

        } catch (error) {
            console.error('❌ Wallet connection failed:', error);
            throw new Error(`Wallet connection failed: ${error.message}`);
        }
    }

    // Disconnect wallet
    async disconnectWallet() {
        try {
            console.log('🔓 Disconnecting wallet...');
            
            // Force logout by clearing storage directly (no popup needed)
            this.handlePrivyLogout();
            
            return {
                success: true,
                message: 'Wallet disconnected!'
            };

        } catch (error) {
            console.error('❌ Wallet disconnection failed:', error);
            // Force logout even if popup fails
            this.handlePrivyLogout();
            return { success: true, message: 'Wallet disconnected (error fallback)' };
        }
    }

    // Get current wallet info
    getWalletInfo() {
        if (!this.isConnected || !this.privySession) {
            return null;
        }

        // Prioritize Solana address for devnet usage
        const primaryAddress = this.privySession.solanaAddress || this.privySession.address;
        const hasRequiredSolanaWallet = !!this.privySession.solanaAddress;

        return {
            address: primaryAddress,
            solanaAddress: this.privySession.solanaAddress,
            evmAddress: this.privySession.address,
            walletType: this.privySession.solanaWalletType || this.privySession.walletType,
            userId: this.privySession.userId,
            isConnected: this.isConnected,
            network: this.env || 'testnet',
            preferredWallet: this.privySession.preferredWallet || (hasRequiredSolanaWallet ? 'solana' : 'evm'),
            hasRequiredSolanaWallet,
            needsSolanaWallet: !hasRequiredSolanaWallet
        };
    }

    // Check if wallet is connected
    isWalletConnected() {
        return this.isConnected && this.privySession;
    }

    // Get Solana address (prioritized over EVM)
    getSolanaAddress() {
        return this.privySession?.solanaAddress || this.privySession?.address || null;
    }

    // Get network configuration
    getNetworkConfig() {
        return (this.networkConfigs && this.networkConfigs[this.env]) 
            ? this.networkConfigs[this.env] 
            : (this.networkConfigs?.testnet || this.networkConfigs?.devnet);
    }

    // Error handling helper
    createErrorResponse(error, operation = 'wallet operation') {
        return {
            success: false,
            error: error.message,
            operation,
            timestamp: Date.now(),
            recoverable: !error.message.includes('not found') && !error.message.includes('not supported')
        };
    }
}

// Global instance for browser extension
window.privyAPIBridge = new PrivyAPIBridge();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.privyAPIBridge.init();
    });
} else {
    window.privyAPIBridge.init();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PrivyAPIBridge;
}
