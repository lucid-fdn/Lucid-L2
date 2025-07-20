// browser-extension/wallet-connection.js
// Real Phantom wallet integration for Phase 8.4 devnet migration

class RealWalletConnection {
  constructor(configManager) {
    this.configManager = configManager;
    this.wallet = null;
    this.balance = { sol: 0, lucid: 0, mGas: 0 };
    this.connection = null;
    this.errorHandler = new WalletErrorHandler();
    this.isConnected = false;
    this.isConnecting = false;
  }

  async connectWallet() {
    if (this.isConnecting) {
      return { success: false, error: 'Connection already in progress' };
    }

    this.isConnecting = true;

    try {
      // Check if Phantom is installed
      if (!window.solana || !window.solana.isPhantom) {
        throw new Error('Phantom wallet not found. Please install Phantom wallet.');
      }

      // Check if already connected
      if (window.solana.isConnected) {
        this.wallet = {
          address: window.solana.publicKey.toString(),
          publicKey: window.solana.publicKey
        };
      } else {
        // Request wallet connection
        const response = await window.solana.connect();
        this.wallet = {
          address: response.publicKey.toString(),
          publicKey: response.publicKey
        };
      }

      // Initialize connection to current network
      const config = this.configManager.getConfig();
      this.connection = new solanaWeb3.Connection(config.rpcUrl, config.commitment);

      // Query actual blockchain balances
      await this.updateRealBalances();

      // Set up wallet event listeners
      this.setupWalletListeners();

      this.isConnected = true;
      this.isConnecting = false;

      // Store connection state
      await this.storeConnectionState();

      return {
        success: true,
        wallet: this.wallet,
        balance: this.balance,
        network: config.environment
      };

    } catch (error) {
      this.isConnecting = false;
      return await this.errorHandler.handleWalletError(error, 'connect');
    }
  }

  async disconnectWallet() {
    try {
      if (window.solana && window.solana.isConnected) {
        await window.solana.disconnect();
      }

      this.wallet = null;
      this.balance = { sol: 0, lucid: 0, mGas: 0 };
      this.connection = null;
      this.isConnected = false;

      // Clear stored connection state
      await this.clearConnectionState();

      this.notifyBalanceUpdate();

      return { success: true };

    } catch (error) {
      return await this.errorHandler.handleWalletError(error, 'disconnect');
    }
  }

  async updateRealBalances() {
    if (!this.wallet || !this.connection) return;

    try {
      const config = this.configManager.getConfig();

      // Get SOL balance
      const solBalance = await this.connection.getBalance(this.wallet.publicKey);

      // Get LUCID token balance
      const lucidBalance = await this.getLucidTokenBalance();

      // Get mGas balance from extension storage
      const mGasBalance = await this.getMGasBalance();

      this.balance = {
        sol: solBalance / 1e9, // Convert lamports to SOL
        lucid: lucidBalance || 0,
        mGas: mGasBalance || 0
      };

      // Store balance in extension storage
      await this.storeBalance();

      // Notify UI of balance update
      this.notifyBalanceUpdate();

      console.log('💰 Balance updated:', this.balance);

    } catch (error) {
      console.error('Balance update failed:', error);
    }
  }

  async getLucidTokenBalance() {
    if (!this.wallet || !this.connection) return 0;

    try {
      const config = this.configManager.getConfig();
      const mintPubkey = new solanaWeb3.PublicKey(config.lucidMint);

      // Get associated token account
      const tokenAccount = await solanaWeb3.getAssociatedTokenAddress(
        mintPubkey,
        this.wallet.publicKey
      );

      // Get token balance
      const balance = await this.connection.getTokenAccountBalance(tokenAccount);
      return balance.value.uiAmount || 0;

    } catch (error) {
      console.log('LUCID token account not found or balance is 0');
      return 0;
    }
  }

  async getMGasBalance() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['mGasBalance'], (result) => {
          resolve(result.mGasBalance || 0);
        });
      } else {
        resolve(0);
      }
    });
  }

  async updateMGasBalance(amount) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ mGasBalance: amount }, () => {
          this.balance.mGas = amount;
          this.notifyBalanceUpdate();
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  setupWalletListeners() {
    if (!window.solana) return;

    window.solana.on('connect', () => {
      console.log('🔗 Wallet connected');
      this.isConnected = true;
      this.updateRealBalances();
    });

    window.solana.on('disconnect', () => {
      console.log('🔌 Wallet disconnected');
      this.wallet = null;
      this.balance = { sol: 0, lucid: 0, mGas: 0 };
      this.isConnected = false;
      this.notifyBalanceUpdate();
    });

    window.solana.on('accountChanged', (publicKey) => {
      console.log('👤 Account changed:', publicKey?.toString());
      if (publicKey) {
        this.wallet.publicKey = publicKey;
        this.wallet.address = publicKey.toString();
        this.updateRealBalances();
      }
    });
  }

  async storeConnectionState() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const state = {
        isConnected: this.isConnected,
        walletAddress: this.wallet?.address,
        network: this.configManager.getConfig().environment,
        lastConnected: Date.now()
      };
      
      await new Promise(resolve => {
        chrome.storage.local.set({ walletConnectionState: state }, resolve);
      });
    }
  }

  async clearConnectionState() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await new Promise(resolve => {
        chrome.storage.local.remove(['walletConnectionState'], resolve);
      });
    }
  }

  async storeBalance() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await new Promise(resolve => {
        chrome.storage.local.set({ 
          walletBalance: this.balance,
          lastBalanceUpdate: Date.now()
        }, resolve);
      });
    }
  }

  notifyBalanceUpdate() {
    // Dispatch custom event for UI updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('walletBalanceUpdate', {
        detail: {
          balance: this.balance,
          wallet: this.wallet
        }
      }));
    }
  }

  async checkConnection() {
    if (!window.solana) {
      return { connected: false, error: 'Phantom wallet not installed' };
    }

    const connected = window.solana.isConnected;
    
    if (connected && !this.isConnected) {
      // Re-establish connection if wallet is connected but we're not tracking it
      await this.connectWallet();
    }

    return { connected: this.isConnected, wallet: this.wallet };
  }

  getWalletInfo() {
    return {
      isConnected: this.isConnected,
      wallet: this.wallet,
      balance: this.balance,
      network: this.configManager.getConfig().environment
    };
  }

  // New method: Sign and send transaction
  async signAndSendTransaction(transaction) {
    if (!this.wallet || !this.connection) {
      throw new Error('Wallet not connected');
    }

    try {
      // Get latest blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.wallet.publicKey;

      // Sign transaction
      const signedTx = await window.solana.signTransaction(transaction);

      // Send transaction
      const signature = await this.connection.sendRawTransaction(signedTx.serialize());

      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(signature);

      return {
        success: true,
        signature,
        confirmation
      };

    } catch (error) {
      console.error('Transaction failed:', error);
      throw error;
    }
  }

  // New method: Get transaction history
  async getTransactionHistory(limit = 10) {
    if (!this.wallet || !this.connection) {
      return [];
    }

    try {
      const signatures = await this.connection.getSignaturesForAddress(
        this.wallet.publicKey,
        { limit }
      );

      const transactions = await Promise.all(
        signatures.map(async (sig) => {
          try {
            const tx = await this.connection.getTransaction(sig.signature);
            return {
              signature: sig.signature,
              slot: sig.slot,
              blockTime: sig.blockTime,
              transaction: tx
            };
          } catch (error) {
            console.warn('Failed to fetch transaction:', sig.signature);
            return null;
          }
        })
      );

      return transactions.filter(tx => tx !== null);

    } catch (error) {
      console.error('Failed to get transaction history:', error);
      return [];
    }
  }
}

class WalletErrorHandler {
  constructor() {
    this.errorTypes = {
      NETWORK_ERROR: 'network_error',
      WALLET_NOT_FOUND: 'wallet_not_found',
      CONNECTION_FAILED: 'connection_failed',
      USER_REJECTED: 'user_rejected',
      INSUFFICIENT_FUNDS: 'insufficient_funds',
      TRANSACTION_FAILED: 'transaction_failed',
      UNKNOWN_ERROR: 'unknown_error'
    };
  }

  async handleWalletError(error, operation) {
    const errorType = this.categorizeError(error);
    const errorResponse = this.createErrorResponse(errorType, error);
    
    // Log error for debugging
    this.logError(operation, errorType, error);
    
    return errorResponse;
  }

  categorizeError(error) {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('phantom') || message.includes('wallet not found')) {
      return this.errorTypes.WALLET_NOT_FOUND;
    }
    
    if (message.includes('user rejected') || message.includes('user cancelled')) {
      return this.errorTypes.USER_REJECTED;
    }
    
    if (message.includes('network') || message.includes('connection')) {
      return this.errorTypes.NETWORK_ERROR;
    }
    
    if (message.includes('insufficient') || message.includes('balance')) {
      return this.errorTypes.INSUFFICIENT_FUNDS;
    }
    
    if (message.includes('transaction') || message.includes('signature')) {
      return this.errorTypes.TRANSACTION_FAILED;
    }
    
    return this.errorTypes.UNKNOWN_ERROR;
  }

  createErrorResponse(errorType, originalError) {
    const responses = {
      [this.errorTypes.WALLET_NOT_FOUND]: {
        success: false,
        error: 'Phantom wallet not found',
        details: 'Please install Phantom wallet extension and refresh the page',
        code: 'WALLET_NOT_FOUND',
        recoverable: true
      },
      [this.errorTypes.USER_REJECTED]: {
        success: false,
        error: 'Connection cancelled',
        details: 'You cancelled the wallet connection request',
        code: 'USER_REJECTED',
        recoverable: true
      },
      [this.errorTypes.NETWORK_ERROR]: {
        success: false,
        error: 'Network connection failed',
        details: 'Unable to connect to Solana network. Please check your internet connection.',
        code: 'NETWORK_ERROR',
        recoverable: true
      },
      [this.errorTypes.INSUFFICIENT_FUNDS]: {
        success: false,
        error: 'Insufficient funds',
        details: 'Your wallet does not have enough SOL or LUCID tokens for this operation',
        code: 'INSUFFICIENT_FUNDS',
        recoverable: true
      },
      [this.errorTypes.TRANSACTION_FAILED]: {
        success: false,
        error: 'Transaction failed',
        details: 'The transaction could not be completed. Please try again.',
        code: 'TRANSACTION_FAILED',
        recoverable: true
      },
      [this.errorTypes.UNKNOWN_ERROR]: {
        success: false,
        error: 'Unknown error occurred',
        details: originalError.message || 'An unexpected error occurred',
        code: 'UNKNOWN_ERROR',
        recoverable: false
      }
    };

    return responses[errorType] || responses[this.errorTypes.UNKNOWN_ERROR];
  }

  logError(operation, errorType, originalError) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation,
      errorType,
      message: originalError.message,
      stack: originalError.stack,
      userAgent: navigator.userAgent
    };

    console.error('Wallet Error:', logEntry);

    // Store error in extension storage for debugging
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['walletErrors'], (result) => {
        const errors = result.walletErrors || [];
        errors.push(logEntry);
        
        // Keep only last 50 errors
        if (errors.length > 50) {
          errors.shift();
        }
        
        chrome.storage.local.set({ walletErrors: errors });
      });
    }
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.RealWalletConnection = RealWalletConnection;
  window.WalletErrorHandler = WalletErrorHandler;
}
