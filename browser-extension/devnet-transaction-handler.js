// browser-extension/devnet-transaction-handler.js
// Real transaction signing and execution on devnet for Phase 8.4

class DevnetTransactionHandler {
  constructor(walletConnection, configManager) {
    this.walletConnection = walletConnection;
    this.configManager = configManager;
    this.errorHandler = new WalletErrorHandler();
    this.connection = null;
    this.isProcessing = false;
  }

  async initialize() {
    const config = this.configManager.getConfig();
    this.connection = new solanaWeb3.Connection(config.rpcUrl, config.commitment);
    console.log(`🌐 Initialized transaction handler for ${config.environment} network`);
  }

  async signAndSendTransaction(transaction) {
    if (!this.walletConnection.isConnected) {
      throw new Error('Wallet not connected');
    }

    try {
      const config = this.configManager.getConfig();
      
      // Initialize connection if not already done
      if (!this.connection) {
        await this.initialize();
      }

      // Add recent blockhash and fee payer
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.walletConnection.wallet.publicKey;

      console.log('📝 Signing transaction...');
      
      // Sign transaction with Phantom
      const signedTransaction = await window.solana.signTransaction(transaction);

      console.log('🚀 Sending transaction to devnet...');
      
      // Send to devnet
      const signature = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        }
      );

      console.log('⏳ Waiting for confirmation...');
      
      // Wait for confirmation with timeout
      const confirmationPromise = this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');

      // Add timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Transaction timeout')), 30000);
      });

      await Promise.race([confirmationPromise, timeoutPromise]);

      console.log('✅ Transaction confirmed:', signature);

      return {
        success: true,
        signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        network: config.environment
      };

    } catch (error) {
      console.error('❌ Transaction failed:', error);
      return await this.errorHandler.handleWalletError(error, 'transaction');
    }
  }

  async processThoughtWithRealTransaction(text) {
    if (this.isProcessing) {
      return { success: false, error: 'Transaction already in progress' };
    }

    this.isProcessing = true;

    try {
      // Create transaction for thought processing
      const transaction = await this.createThoughtTransaction(text);
      
      // Sign and send with real wallet
      const result = await this.signAndSendTransaction(transaction);
      
      if (result.success) {
        // Update local state after confirmation
        await this.updateLocalState(result.signature, text);
        
        // Update mGas balance based on earnings
        await this.updateMGasEarnings(text);
        
        return {
          success: true,
          signature: result.signature,
          explorerUrl: result.explorerUrl,
          text: text,
          timestamp: new Date().toISOString(),
          network: result.network
        };
      } else {
        return result;
      }
      
    } catch (error) {
      return await this.errorHandler.handleWalletError(error, 'processThought');
    } finally {
      this.isProcessing = false;
    }
  }

  async createThoughtTransaction(text) {
    const config = this.configManager.getConfig();
    
    // Create new transaction
    const transaction = new solanaWeb3.Transaction();
    
    // Add compute budget instruction
    transaction.add(
      solanaWeb3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000
      })
    );

    // For Phase 8.4, we'll simulate the transaction creation
    // In a real implementation, this would integrate with the existing Lucid L2 transaction creation
    
    // Add a memo instruction as a placeholder for the actual thought processing
    const memoInstruction = new solanaWeb3.TransactionInstruction({
      keys: [],
      programId: new solanaWeb3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      data: Buffer.from(`Lucid L2 Thought: ${text}`)
    });
    
    transaction.add(memoInstruction);

    // In a real implementation, you would add:
    // - Gas burn instructions
    // - Actual program instructions for thought processing
    // - PDA creation/update instructions

    return transaction;
  }

  async updateLocalState(signature, text) {
    try {
      // Update extension storage with transaction details
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const transactionData = {
          signature,
          text,
          timestamp: new Date().toISOString(),
          network: this.configManager.getConfig().environment,
          type: 'thought_processing'
        };

        // Get existing transaction history
        chrome.storage.local.get(['transactionHistory'], (result) => {
          const history = result.transactionHistory || [];
          history.push(transactionData);
          
          // Keep only last 100 transactions
          const trimmedHistory = history.slice(-100);
          
          chrome.storage.local.set({
            transactionHistory: trimmedHistory,
            lastTransaction: transactionData
          });
        });

        // Update statistics
        chrome.storage.local.get(['userStats'], (result) => {
          const stats = result.userStats || {
            totalTransactions: 0,
            totalThoughts: 0,
            devnetTransactions: 0,
            lastActivity: null
          };

          stats.totalTransactions++;
          stats.totalThoughts++;
          stats.devnetTransactions++;
          stats.lastActivity = new Date().toISOString();

          chrome.storage.local.set({ userStats: stats });
        });
      }
    } catch (error) {
      console.error('Failed to update local state:', error);
    }
  }

  async updateMGasEarnings(text) {
    try {
      // Calculate mGas earnings based on text processing
      const baseReward = 10; // Base mGas reward
      const qualityBonus = this.calculateQualityBonus(text);
      const totalEarned = baseReward + qualityBonus;

      // Get current mGas balance
      const currentBalance = await this.walletConnection.getMGasBalance();
      const newBalance = currentBalance + totalEarned;

      // Update mGas balance
      await this.walletConnection.updateMGasBalance(newBalance);

      // Store earning details
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['earningHistory'], (result) => {
          const history = result.earningHistory || [];
          history.push({
            timestamp: new Date().toISOString(),
            amount: totalEarned,
            baseReward,
            qualityBonus,
            text: text.substring(0, 100) + '...', // Store truncated text
            network: 'devnet'
          });

          chrome.storage.local.set({
            earningHistory: history.slice(-100) // Keep last 100 earnings
          });
        });
      }

      console.log(`💰 Earned ${totalEarned} mGas for thought processing`);
      return totalEarned;

    } catch (error) {
      console.error('Failed to update mGas earnings:', error);
      return 0;
    }
  }

  calculateQualityBonus(text) {
    // Simple quality assessment for bonus calculation
    let bonus = 0;
    
    // Length bonus
    if (text.length > 50) bonus += 2;
    if (text.length > 100) bonus += 3;
    
    // Complexity bonus
    if (text.includes('?')) bonus += 1;
    if (text.split(' ').length > 20) bonus += 2;
    
    // Creative keywords bonus
    const creativeKeywords = ['create', 'design', 'imagine', 'innovate', 'build'];
    const hasCreativeKeywords = creativeKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );
    if (hasCreativeKeywords) bonus += 3;
    
    return Math.min(bonus, 10); // Cap at 10 mGas bonus
  }

  async getTransactionHistory() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['transactionHistory'], (result) => {
          resolve(result.transactionHistory || []);
        });
      } else {
        resolve([]);
      }
    });
  }

  async getNetworkStatus() {
    try {
      if (!this.connection) {
        await this.initialize();
      }

      const config = this.configManager.getConfig();
      const health = await this.connection.getHealth();
      const slot = await this.connection.getSlot();
      const blockTime = await this.connection.getBlockTime(slot);

      return {
        network: config.environment,
        rpcUrl: config.rpcUrl,
        health: health,
        currentSlot: slot,
        blockTime: blockTime,
        isConnected: true
      };

    } catch (error) {
      console.error('Network status check failed:', error);
      return {
        network: this.configManager.getConfig().environment,
        rpcUrl: this.configManager.getConfig().rpcUrl,
        health: 'error',
        isConnected: false,
        error: error.message
      };
    }
  }

  async simulateTransaction(transaction) {
    try {
      if (!this.connection) {
        await this.initialize();
      }

      const simulation = await this.connection.simulateTransaction(transaction);
      
      return {
        success: !simulation.value.err,
        logs: simulation.value.logs,
        error: simulation.value.err,
        unitsConsumed: simulation.value.unitsConsumed
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async estimateTransactionFee(transaction) {
    try {
      if (!this.connection) {
        await this.initialize();
      }

      const feeCalculator = await this.connection.getFeeCalculatorForBlockhash(
        transaction.recentBlockhash
      );
      
      const fee = feeCalculator.value 
        ? feeCalculator.value.lamportsPerSignature * transaction.signatures.length
        : 5000; // Default fee estimate

      return {
        fee: fee,
        feeInSOL: fee / 1e9,
        currency: 'SOL'
      };

    } catch (error) {
      return {
        fee: 5000,
        feeInSOL: 0.000005,
        currency: 'SOL',
        error: error.message
      };
    }
  }

  getProcessingStatus() {
    return {
      isProcessing: this.isProcessing,
      network: this.configManager.getConfig().environment,
      walletConnected: this.walletConnection.isConnected,
      connectionInitialized: this.connection !== null
    };
  }
}

// Export for use in other files
if (typeof window !== 'undefined') {
  window.DevnetTransactionHandler = DevnetTransactionHandler;
}
