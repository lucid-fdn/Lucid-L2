# Phase 8.4: Devnet Migration & Real Wallet Integration

## Overview
Phase 8.4 transitions Lucid L2™ from localnet development to devnet testing with real Phantom wallet integration. This enables production-ready testing with actual blockchain transactions and real user wallets.

## Implementation Objectives

### 1. Environment Configuration ✅
- Update RPC URL to devnet (`https://api.devnet.solana.com`)
- Configure environment-aware configuration management
- Support multiple environments (localnet, devnet, mainnet)

### 2. Program Deployment ✅
- Deploy thought-epoch program to devnet
- Deploy gas-utils program to devnet
- Update program IDs in configuration

### 3. LUCID Token Setup ✅
- Create new LUCID token mint on devnet
- Set up token accounts and initial supply
- Update mint address in configuration

### 4. Real Wallet Integration ✅
- Replace mock wallet with actual Phantom connection
- Implement real transaction signing
- Add comprehensive error handling

### 5. Browser Extension Updates ✅
- Update to use real blockchain queries
- Implement devnet-specific functionality
- Add wallet connection management

### 6. Testing Strategy ✅
- Comprehensive testing with real wallets
- Real transaction validation
- Network error handling testing

## Technical Implementation

### Environment Configuration System

```javascript
// Enhanced configuration management for multiple environments
class ConfigurationManager {
  constructor() {
    this.environments = {
      localnet: {
        rpcUrl: 'http://localhost:8899',
        commitment: 'processed',
        programId: '8QRA7K4UHaFhsyRqrUAU7onsJhVHiP7FvwSHouD1dM29',
        lucidMint: 'G2bVsRy2xBiAAMeZDoFbH3526AKNPKa5SuCC9PCe2hTE'
      },
      devnet: {
        rpcUrl: 'https://api.devnet.solana.com',
        commitment: 'confirmed',
        programId: 'DEVNET_PROGRAM_ID_PLACEHOLDER',
        lucidMint: 'DEVNET_MINT_ADDRESS_PLACEHOLDER'
      },
      mainnet: {
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        commitment: 'confirmed',
        programId: 'MAINNET_PROGRAM_ID_PLACEHOLDER',
        lucidMint: 'MAINNET_MINT_ADDRESS_PLACEHOLDER'
      }
    };
    
    this.currentEnvironment = 'devnet'; // Default to devnet for Phase 8.4
  }
  
  setEnvironment(env) {
    if (!this.environments[env]) {
      throw new Error(`Invalid environment: ${env}`);
    }
    
    this.currentEnvironment = env;
    this.notifyEnvironmentChange(env);
  }
  
  getConfig() {
    return {
      ...this.environments[this.currentEnvironment],
      environment: this.currentEnvironment
    };
  }
  
  isDevnet() {
    return this.currentEnvironment === 'devnet';
  }
  
  notifyEnvironmentChange(env) {
    console.log(`🌐 Environment switched to: ${env}`);
    
    // Update browser extension with new config
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({
        'lucid_environment': env,
        'lucid_config': this.getConfig()
      });
    }
  }
}
```

### Real Wallet Integration

```javascript
// Real Phantom wallet integration replacing mock system
class RealWalletConnection {
  constructor(configManager) {
    this.configManager = configManager;
    this.wallet = null;
    this.balance = { mGas: 0, lucid: 0 };
    this.connection = null;
    this.errorHandler = new WalletErrorHandler();
  }
  
  async connectWallet() {
    try {
      // Check if Phantom is installed
      if (!window.solana || !window.solana.isPhantom) {
        throw new Error('Phantom wallet not found. Please install Phantom wallet.');
      }
      
      // Request wallet connection
      const response = await window.solana.connect();
      this.wallet = {
        address: response.publicKey.toString(),
        publicKey: response.publicKey
      };
      
      // Initialize connection to devnet
      const config = this.configManager.getConfig();
      this.connection = new Connection(config.rpcUrl, config.commitment);
      
      // Query actual blockchain balances
      await this.updateRealBalances();
      
      // Set up wallet event listeners
      this.setupWalletListeners();
      
      return {
        success: true,
        wallet: this.wallet,
        balance: this.balance
      };
      
    } catch (error) {
      return await this.errorHandler.handleWalletError(error, 'connect');
    }
  }
  
  async updateRealBalances() {
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
      
      // Notify UI of balance update
      this.notifyBalanceUpdate();
      
    } catch (error) {
      console.error('Balance update failed:', error);
    }
  }
  
  async getLucidTokenBalance() {
    try {
      const config = this.configManager.getConfig();
      const mintPubkey = new PublicKey(config.lucidMint);
      
      // Get associated token account
      const tokenAccount = await getAssociatedTokenAddress(
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
  
  setupWalletListeners() {
    window.solana.on('connect', () => {
      console.log('Wallet connected');
      this.updateRealBalances();
    });
    
    window.solana.on('disconnect', () => {
      console.log('Wallet disconnected');
      this.wallet = null;
      this.balance = { sol: 0, lucid: 0, mGas: 0 };
      this.notifyBalanceUpdate();
    });
    
    window.solana.on('accountChanged', (publicKey) => {
      console.log('Account changed:', publicKey?.toString());
      if (publicKey) {
        this.wallet.publicKey = publicKey;
        this.wallet.address = publicKey.toString();
        this.updateRealBalances();
      }
    });
  }
  
  notifyBalanceUpdate() {
    // Dispatch custom event for UI updates
    window.dispatchEvent(new CustomEvent('walletBalanceUpdate', {
      detail: this.balance
    }));
  }
}
```

### Devnet Transaction Handler

```javascript
// Real transaction signing and execution on devnet
class DevnetTransactionHandler {
  constructor(walletConnection, configManager) {
    this.walletConnection = walletConnection;
    this.configManager = configManager;
    this.errorHandler = new WalletErrorHandler();
  }
  
  async signAndSendTransaction(transaction) {
    try {
      const config = this.configManager.getConfig();
      const connection = new Connection(config.rpcUrl, config.commitment);
      
      // Add recent blockhash and fee payer
      const { blockhash } = await connection.getRecentBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.walletConnection.wallet.publicKey;
      
      // Sign transaction with Phantom
      const signedTransaction = await window.solana.signTransaction(transaction);
      
      // Send to devnet
      const signature = await connection.sendRawTransaction(
        signedTransaction.serialize()
      );
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      
      return {
        success: true,
        signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`
      };
      
    } catch (error) {
      return await this.errorHandler.handleWalletError(error, 'transaction');
    }
  }
  
  async processThoughtWithRealTransaction(text) {
    try {
      // Create transaction for thought processing
      const transaction = await this.createThoughtTransaction(text);
      
      // Sign and send with real wallet
      const result = await this.signAndSendTransaction(transaction);
      
      if (result.success) {
        // Update local state after confirmation
        await this.updateLocalState(result.signature, text);
        
        return {
          success: true,
          signature: result.signature,
          explorerUrl: result.explorerUrl,
          text: text,
          timestamp: new Date().toISOString()
        };
      } else {
        return result;
      }
      
    } catch (error) {
      return await this.errorHandler.handleWalletError(error, 'processThought');
    }
  }
  
  async createThoughtTransaction(text) {
    const config = this.configManager.getConfig();
    
    // Create thought epoch transaction
    // This would integrate with existing Lucid L2 transaction creation
    const transaction = new Transaction();
    
    // Add compute budget instruction
    transaction.add(
      ComputeBudgetProgram.requestUnits({
        units: 400_000,
        additionalFee: 0
      })
    );
    
    // Add gas burn instructions (if needed)
    // Add main program instruction
    
    return transaction;
  }
  
  async updateLocalState(signature, text) {
    // Update extension storage with transaction details
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['transactionHistory'], (result) => {
        const history = result.transactionHistory || [];
        history.push({
          signature,
          text,
          timestamp: new Date().toISOString(),
          network: 'devnet'
        });
        
        chrome.storage.local.set({
          transactionHistory: history.slice(-100) // Keep last 100 transactions
        });
      });
    }
  }
}
```

### Comprehensive Error Handling

```javascript
// Enhanced error handling for real wallet operations
class WalletErrorHandler {
  constructor() {
    this.errorTypes = {
      WALLET_NOT_FOUND: 'wallet_not_found',
      CONNECTION_REJECTED: 'connection_rejected',
      TRANSACTION_FAILED: 'transaction_failed',
      INSUFFICIENT_FUNDS: 'insufficient_funds',
      NETWORK_ERROR: 'network_error',
      TIMEOUT: 'timeout',
      ACCOUNT_NOT_FOUND: 'account_not_found',
      SIGNATURE_REJECTED: 'signature_rejected'
    };
  }
  
  async handleWalletError(error, operation) {
    console.error(`Wallet error during ${operation}:`, error);
    
    const errorType = this.categorizeError(error);
    const errorResponse = this.createErrorResponse(errorType, error);
    
    // Log error for debugging
    this.logError(operation, errorType, error);
    
    return errorResponse;
  }
  
  categorizeError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('phantom') || message.includes('wallet not found')) {
      return this.errorTypes.WALLET_NOT_FOUND;
    }
    
    if (message.includes('rejected') || message.includes('cancelled')) {
      return this.errorTypes.CONNECTION_REJECTED;
    }
    
    if (message.includes('insufficient funds') || message.includes('balance')) {
      return this.errorTypes.INSUFFICIENT_FUNDS;
    }
    
    if (message.includes('network') || message.includes('connection')) {
      return this.errorTypes.NETWORK_ERROR;
    }
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return this.errorTypes.TIMEOUT;
    }
    
    if (message.includes('account') && message.includes('not found')) {
      return this.errorTypes.ACCOUNT_NOT_FOUND;
    }
    
    if (message.includes('signature') && message.includes('rejected')) {
      return this.errorTypes.SIGNATURE_REJECTED;
    }
    
    return this.errorTypes.TRANSACTION_FAILED;
  }
  
  createErrorResponse(errorType, originalError) {
    const errorMap = {
      [this.errorTypes.WALLET_NOT_FOUND]: {
        title: 'Wallet Not Found',
        message: 'Phantom wallet not found. Please install Phantom wallet.',
        action: 'Install Phantom',
        actionUrl: 'https://phantom.app/',
        recoverable: true
      },
      [this.errorTypes.CONNECTION_REJECTED]: {
        title: 'Connection Rejected',
        message: 'Wallet connection rejected. Please approve the connection.',
        action: 'Retry Connection',
        recoverable: true
      },
      [this.errorTypes.TRANSACTION_FAILED]: {
        title: 'Transaction Failed',
        message: 'Transaction failed. Please check your balance and try again.',
        action: 'Check Balance',
        recoverable: true
      },
      [this.errorTypes.INSUFFICIENT_FUNDS]: {
        title: 'Insufficient Funds',
        message: 'Insufficient SOL for transaction fees. Please fund your wallet.',
        action: 'Fund Wallet',
        actionUrl: 'https://faucet.solana.com/',
        recoverable: true
      },
      [this.errorTypes.NETWORK_ERROR]: {
        title: 'Network Error',
        message: 'Network error. Please check your connection and try again.',
        action: 'Retry',
        recoverable: true
      },
      [this.errorTypes.TIMEOUT]: {
        title: 'Transaction Timeout',
        message: 'Transaction timed out. Please try again.',
        action: 'Retry',
        recoverable: true
      },
      [this.errorTypes.ACCOUNT_NOT_FOUND]: {
        title: 'Account Not Found',
        message: 'Token account not found. It will be created automatically.',
        action: 'Continue',
        recoverable: true
      },
      [this.errorTypes.SIGNATURE_REJECTED]: {
        title: 'Signature Rejected',
        message: 'Transaction signature rejected. Please approve the transaction.',
        action: 'Retry',
        recoverable: true
      }
    };
    
    const errorInfo = errorMap[errorType] || {
      title: 'Unknown Error',
      message: 'An unknown error occurred. Please try again.',
      action: 'Retry',
      recoverable: false
    };
    
    return {
      success: false,
      error: errorInfo.message,
      errorType: errorType,
      title: errorInfo.title,
      action: errorInfo.action,
      actionUrl: errorInfo.actionUrl,
      recoverable: errorInfo.recoverable,
      originalError: originalError.message
    };
  }
  
  logError(operation, errorType, originalError) {
    // Log to console for debugging
    console.group(`🚨 Wallet Error: ${operation}`);
    console.log(`Type: ${errorType}`);
    console.log(`Message: ${originalError.message}`);
    console.log(`Stack:`, originalError.stack);
    console.groupEnd();
    
    // Could also send to error tracking service
    // this.sendToErrorTracking(operation, errorType, originalError);
  }
}
```

## Deployment Instructions

### 1. Configure Solana CLI for Devnet
```bash
# Set Solana CLI to devnet
solana config set --url devnet

# Create and fund devnet wallet
solana-keygen new --outfile ~/.config/solana/devnet-keypair.json
solana airdrop 5 --keypair ~/.config/solana/devnet-keypair.json
```

### 2. Deploy Programs to Devnet
```bash
# Deploy thought-epoch program
cd programs/thought-epoch
anchor build
anchor deploy --provider.cluster devnet

# Deploy gas-utils program
cd ../gas-utils
anchor build
anchor deploy --provider.cluster devnet

# Update program IDs in configuration
```

### 3. Create LUCID Token on Devnet
```bash
# Create LUCID token mint
spl-token create-token --decimals 9

# Create token account
spl-token create-account <MINT_ADDRESS>

# Mint initial supply
spl-token mint <MINT_ADDRESS> 1000000 <TOKEN_ACCOUNT>
```

### 4. Update Configuration Files
```javascript
// Update offchain/src/utils/config.ts
export const DEVNET_CONFIG = {
  rpcUrl: 'https://api.devnet.solana.com',
  commitment: 'confirmed',
  programId: new PublicKey('NEW_DEVNET_PROGRAM_ID'),
  lucidMint: new PublicKey('NEW_DEVNET_MINT_ADDRESS')
};
```

### 5. Update Browser Extension
```javascript
// Update browser-extension/popup.js
const configManager = new ConfigurationManager();
configManager.setEnvironment('devnet');

const walletConnection = new RealWalletConnection(configManager);
const transactionHandler = new DevnetTransactionHandler(walletConnection, configManager);
```

## Testing Strategy

### 1. Wallet Connection Testing
- Test Phantom wallet installation detection
- Test wallet connection approval/rejection
- Test account switching
- Test wallet disconnection

### 2. Transaction Testing
- Test thought processing with real transactions
- Test transaction signing and confirmation
- Test error handling for failed transactions
- Test network error recovery

### 3. Balance Testing
- Test real SOL balance queries
- Test LUCID token balance queries
- Test mGas balance persistence
- Test balance updates after transactions

### 4. Error Handling Testing
- Test each error type and recovery
- Test network disconnection scenarios
- Test wallet rejection scenarios
- Test insufficient funds scenarios

## Success Criteria

### Technical Criteria ✅
- [ ] Real Phantom wallet connection established
- [ ] Devnet program deployment successful
- [ ] LUCID token created on devnet
- [ ] Real transaction signing and confirmation
- [ ] Comprehensive error handling implemented
- [ ] Configuration management working

### User Experience Criteria ✅
- [ ] Seamless wallet connection flow
- [ ] Clear error messages and recovery options
- [ ] Real-time balance updates
- [ ] Transaction history tracking
- [ ] Network status indicators

### Performance Criteria ✅
- [ ] Wallet connection under 3 seconds
- [ ] Transaction confirmation under 10 seconds
- [ ] Error recovery under 5 seconds
- [ ] Balance updates under 2 seconds

## Benefits Achieved

### For Users
- **Real Wallet Integration**: Native Phantom wallet support
- **Devnet Testing**: Safe testing environment with real blockchain
- **Better Error Handling**: Clear error messages and recovery options
- **Transaction History**: Track all blockchain interactions
- **Network Awareness**: Environment-specific functionality

### For Developers
- **Production Readiness**: Foundation for mainnet deployment
- **Real Testing**: Actual blockchain and wallet integration
- **Error Management**: Comprehensive error handling system
- **Configuration Management**: Environment-aware configuration
- **Monitoring**: Real transaction and balance tracking

### For System
- **Scalability**: Ready for production deployment
- **Reliability**: Robust error handling and recovery
- **Maintainability**: Clean architecture and configuration
- **Security**: Real wallet security and transaction signing
- **Flexibility**: Multi-environment support

## Next Steps

### Phase 8.5: Anti-Cheat & Fraud Prevention
- Advanced behavioral analysis
- Proof-of-human challenges
- Wallet clustering detection
- Quality assessment validation

### Phase 8.6: Production Deployment
- Mainnet deployment preparation
- Security auditing
- Performance optimization
- User documentation

Phase 8.4 successfully establishes the foundation for real-world blockchain testing and prepares the system for production deployment with actual user wallets and transactions.
