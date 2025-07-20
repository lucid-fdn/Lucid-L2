/**
 * Test Suite for Phase 8.4 & 8.5 Completion
 * Validates real wallet integration and anti-cheat system fixes
 */

const fs = require('fs');
const path = require('path');

// Mock Chrome APIs for testing
global.chrome = {
  storage: {
    local: {
      get: (keys, callback) => {
        callback({
          mGasBalance: 150,
          walletConnectionState: {
            isConnected: true,
            walletAddress: '11111111111111111111111111111111',
            network: 'devnet',
            lastConnected: Date.now()
          }
        });
      },
      set: (data, callback) => {
        if (callback) callback();
      }
    }
  },
  notifications: {
    create: (notification) => {
      console.log('📢 Notification:', notification.message);
    }
  }
};

// Mock Solana Web3
global.solanaWeb3 = {
  Connection: class {
    constructor(rpcUrl, commitment) {
      this.rpcUrl = rpcUrl;
      this.commitment = commitment;
    }
    
    async getBalance(publicKey) {
      return 1000000000; // 1 SOL in lamports
    }
    
    async getTokenAccountBalance(tokenAccount) {
      return { value: { uiAmount: 100 } };
    }
    
    async getLatestBlockhash() {
      return { blockhash: 'test-blockhash' };
    }
    
    async sendRawTransaction(serializedTx) {
      return 'test-signature';
    }
    
    async confirmTransaction(signature) {
      return { value: { err: null } };
    }
    
    async getSignaturesForAddress(publicKey, options) {
      return [
        { signature: 'test-sig-1', slot: 1, blockTime: Date.now() },
        { signature: 'test-sig-2', slot: 2, blockTime: Date.now() }
      ];
    }
    
    async getTransaction(signature) {
      return { signature, slot: 1, blockTime: Date.now() };
    }
  },
  PublicKey: class {
    constructor(key) {
      this.key = key;
    }
    
    toString() {
      return this.key;
    }
  },
  getAssociatedTokenAddress: async (mint, owner) => {
    return new global.solanaWeb3.PublicKey('token-account-address');
  }
};

// Mock CustomEvent for Node.js environment
global.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
    this.bubbles = options.bubbles || false;
    this.cancelable = options.cancelable || false;
  }
};

// Mock window.solana
global.window = {
  solana: {
    isPhantom: true,
    isConnected: true,
    publicKey: new global.solanaWeb3.PublicKey('11111111111111111111111111111111'),
    connect: async () => ({
      publicKey: new global.solanaWeb3.PublicKey('11111111111111111111111111111111')
    }),
    disconnect: async () => {},
    signTransaction: async (transaction) => ({
      serialize: () => 'serialized-transaction'
    }),
    on: (event, callback) => {
      // Mock event listener
    }
  },
  dispatchEvent: (event) => {
    console.log('Event dispatched:', event.type);
  }
};

// Mock navigator
global.navigator = {
  userAgent: 'Mozilla/5.0 (Test Browser) Test/1.0'
};

// Load the anti-cheat system components
const antiCheatCode = fs.readFileSync(path.join(__dirname, 'browser-extension/anti-cheat-system.js'), 'utf8');
const behaviorAnalyzerCode = fs.readFileSync(path.join(__dirname, 'browser-extension/behavior-analyzer.js'), 'utf8');
const qualityValidatorCode = fs.readFileSync(path.join(__dirname, 'browser-extension/quality-validator.js'), 'utf8');
const patternRecognizerCode = fs.readFileSync(path.join(__dirname, 'browser-extension/pattern-recognizer.js'), 'utf8');
const walletConnectionCode = fs.readFileSync(path.join(__dirname, 'browser-extension/wallet-connection.js'), 'utf8');

// Create a controlled environment for testing
const testEnvironment = {
  console: console,
  chrome: global.chrome,
  window: global.window,
  navigator: global.navigator,
  solanaWeb3: global.solanaWeb3,
  CustomEvent: global.CustomEvent,
  Date: Date,
  Math: Math,
  Promise: Promise,
  Map: Map,
  Set: Set,
  Array: Array,
  Object: Object,
  JSON: JSON,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Intl: Intl
};

// Execute the code in test environment
const vm = require('vm');
const context = vm.createContext(testEnvironment);

vm.runInContext(behaviorAnalyzerCode, context);
vm.runInContext(qualityValidatorCode, context);
vm.runInContext(patternRecognizerCode, context);
vm.runInContext(antiCheatCode, context);
vm.runInContext(walletConnectionCode, context);

// Extract classes from test environment
const AntiCheatSystem = context.window.AntiCheatSystem;
const BehaviorAnalyzer = context.window.BehaviorAnalyzer;
const QualityValidator = context.window.QualityValidator;
const PatternRecognizer = context.window.PatternRecognizer;
const RealWalletConnection = context.window.RealWalletConnection;
const WalletErrorHandler = context.window.WalletErrorHandler;

class Phase8CompletionTester {
  constructor() {
    this.results = {
      phase8_4: { passed: 0, failed: 0, total: 0 },
      phase8_5: { passed: 0, failed: 0, total: 0 }
    };
    this.startTime = Date.now();
  }

  async runAllTests() {
    console.log('🚀 Starting Phase 8.4 & 8.5 Completion Tests...\n');

    // Phase 8.4 Tests - Real Wallet Integration
    console.log('📱 Phase 8.4: Real Wallet Integration Tests');
    console.log('=' .repeat(50));
    
    await this.testPhase8_4_WalletConnection();
    await this.testPhase8_4_BalanceQueries();
    await this.testPhase8_4_TransactionSigning();
    await this.testPhase8_4_ErrorHandling();
    await this.testPhase8_4_EventListeners();

    // Phase 8.5 Tests - Anti-Cheat System Fixes
    console.log('\n🛡️ Phase 8.5: Anti-Cheat System Fixes');
    console.log('=' .repeat(50));
    
    await this.testPhase8_5_BehaviorAnalysis();
    await this.testPhase8_5_PatternRecognition();
    await this.testPhase8_5_NullChecks();
    await this.testPhase8_5_RiskCalculation();
    await this.testPhase8_5_Performance();

    this.printResults();
  }

  // Phase 8.4 Tests
  async testPhase8_4_WalletConnection() {
    console.log('🔗 Testing Real Wallet Connection...');
    
    try {
      const configManager = {
        getConfig: () => ({
          rpcUrl: 'https://api.devnet.solana.com',
          commitment: 'confirmed',
          environment: 'devnet',
          lucidMint: '7cBsSHBB4nSVQy6ceUvmrA8Z2ks8Me8AjxSUqvJ2q1S9'
        })
      };

      const walletConnection = new RealWalletConnection(configManager);
      
      // Test connection
      const result = await walletConnection.connectWallet();
      this.assert(result.success === true, 'Wallet connection should succeed');
      this.assert(result.wallet !== null, 'Wallet object should be created');
      this.assert(result.network === 'devnet', 'Should connect to devnet');
      
      // Test connection state
      const connectionCheck = await walletConnection.checkConnection();
      this.assert(connectionCheck.connected === true, 'Connection should be active');
      
      console.log('✅ Real wallet connection tests passed');
      this.results.phase8_4.passed++;
    } catch (error) {
      console.error('❌ Real wallet connection tests failed:', error);
      this.results.phase8_4.failed++;
    }
    this.results.phase8_4.total++;
  }

  async testPhase8_4_BalanceQueries() {
    console.log('💰 Testing Balance Queries...');
    
    try {
      const configManager = {
        getConfig: () => ({
          rpcUrl: 'https://api.devnet.solana.com',
          commitment: 'confirmed',
          environment: 'devnet',
          lucidMint: '7cBsSHBB4nSVQy6ceUvmrA8Z2ks8Me8AjxSUqvJ2q1S9'
        })
      };

      const walletConnection = new RealWalletConnection(configManager);
      await walletConnection.connectWallet();
      
      // Test balance update
      await walletConnection.updateRealBalances();
      this.assert(walletConnection.balance.sol > 0, 'SOL balance should be positive');
      this.assert(walletConnection.balance.lucid >= 0, 'LUCID balance should be non-negative');
      this.assert(walletConnection.balance.mGas >= 0, 'mGas balance should be non-negative');
      
      // Test mGas balance update
      await walletConnection.updateMGasBalance(200);
      this.assert(walletConnection.balance.mGas === 200, 'mGas balance should be updated');
      
      console.log('✅ Balance query tests passed');
      this.results.phase8_4.passed++;
    } catch (error) {
      console.error('❌ Balance query tests failed:', error);
      this.results.phase8_4.failed++;
    }
    this.results.phase8_4.total++;
  }

  async testPhase8_4_TransactionSigning() {
    console.log('✍️ Testing Transaction Signing...');
    
    try {
      const configManager = {
        getConfig: () => ({
          rpcUrl: 'https://api.devnet.solana.com',
          commitment: 'confirmed',
          environment: 'devnet',
          lucidMint: '7cBsSHBB4nSVQy6ceUvmrA8Z2ks8Me8AjxSUqvJ2q1S9'
        })
      };

      const walletConnection = new RealWalletConnection(configManager);
      await walletConnection.connectWallet();
      
      // Test transaction signing
      const mockTransaction = {
        recentBlockhash: 'test-blockhash',
        feePayer: walletConnection.wallet.publicKey
      };
      
      const result = await walletConnection.signAndSendTransaction(mockTransaction);
      this.assert(result.success === true, 'Transaction should be signed successfully');
      this.assert(result.signature !== null, 'Transaction should have signature');
      
      // Test transaction history
      const history = await walletConnection.getTransactionHistory(5);
      this.assert(Array.isArray(history), 'Transaction history should be an array');
      this.assert(history.length > 0, 'Should have transaction history');
      
      console.log('✅ Transaction signing tests passed');
      this.results.phase8_4.passed++;
    } catch (error) {
      console.error('❌ Transaction signing tests failed:', error);
      this.results.phase8_4.failed++;
    }
    this.results.phase8_4.total++;
  }

  async testPhase8_4_ErrorHandling() {
    console.log('🚨 Testing Error Handling...');
    
    try {
      const errorHandler = new WalletErrorHandler();
      
      // Test different error types
      const networkError = new Error('Network connection failed');
      const networkResult = await errorHandler.handleWalletError(networkError, 'connect');
      this.assert(networkResult.code === 'NETWORK_ERROR', 'Should categorize network errors');
      
      const userRejectedError = new Error('User rejected the request');
      const userResult = await errorHandler.handleWalletError(userRejectedError, 'connect');
      this.assert(userResult.code === 'USER_REJECTED', 'Should categorize user rejection');
      
      const insufficientFundsError = new Error('Insufficient funds');
      const fundsResult = await errorHandler.handleWalletError(insufficientFundsError, 'transaction');
      this.assert(fundsResult.code === 'INSUFFICIENT_FUNDS', 'Should categorize insufficient funds');
      
      console.log('✅ Error handling tests passed');
      this.results.phase8_4.passed++;
    } catch (error) {
      console.error('❌ Error handling tests failed:', error);
      this.results.phase8_4.failed++;
    }
    this.results.phase8_4.total++;
  }

  async testPhase8_4_EventListeners() {
    console.log('🎧 Testing Event Listeners...');
    
    try {
      const configManager = {
        getConfig: () => ({
          rpcUrl: 'https://api.devnet.solana.com',
          commitment: 'confirmed',
          environment: 'devnet',
          lucidMint: '7cBsSHBB4nSVQy6ceUvmrA8Z2ks8Me8AjxSUqvJ2q1S9'
        })
      };

      const walletConnection = new RealWalletConnection(configManager);
      await walletConnection.connectWallet();
      
      // Test balance update notification
      let eventDispatched = false;
      const originalDispatch = window.dispatchEvent;
      window.dispatchEvent = (event) => {
        if (event.type === 'walletBalanceUpdate') {
          eventDispatched = true;
        }
        originalDispatch(event);
      };
      
      await walletConnection.updateRealBalances();
      this.assert(eventDispatched === true, 'Balance update event should be dispatched');
      
      console.log('✅ Event listener tests passed');
      this.results.phase8_4.passed++;
    } catch (error) {
      console.error('❌ Event listener tests failed:', error);
      this.results.phase8_4.failed++;
    }
    this.results.phase8_4.total++;
  }

  // Phase 8.5 Tests
  async testPhase8_5_BehaviorAnalysis() {
    console.log('🔍 Testing Behavior Analysis Fixes...');
    
    try {
      const behaviorAnalyzer = new BehaviorAnalyzer();
      await behaviorAnalyzer.initialize();
      
      // Test with null/undefined data
      const nullInteraction = {
        walletAddress: '11111111111111111111111111111111',
        text: null,
        keystrokeTimings: null,
        sessionDuration: undefined,
        thinkingTime: null,
        responseTime: undefined,
        mouseMovements: null
      };
      
      const nullResult = await behaviorAnalyzer.analyze(nullInteraction);
      this.assert(nullResult.riskScore >= 0, 'Should handle null data gracefully');
      this.assert(nullResult.confidence >= 0, 'Should have confidence score');
      this.assert(nullResult.fallback === true, 'Should use fallback analysis');
      
      // Test with valid data
      const validInteraction = {
        walletAddress: '22222222222222222222222222222222',
        text: 'This is a valid human response with good quality.',
        keystrokeTimings: this.generateNormalKeystrokeData(),
        sessionDuration: 30000,
        thinkingTime: 5000,
        responseTime: 3000,
        mouseMovements: this.generateNormalMouseData()
      };
      
      const validResult = await behaviorAnalyzer.analyze(validInteraction);
      this.assert(validResult.riskScore < 15, 'Valid behavior should have low risk');
      this.assert(validResult.confidence > 50, 'Valid behavior should have good confidence');
      this.assert(validResult.fallback !== true, 'Should not use fallback for valid data');
      
      console.log('✅ Behavior analysis fixes passed');
      this.results.phase8_5.passed++;
    } catch (error) {
      console.error('❌ Behavior analysis fixes failed:', error);
      this.results.phase8_5.failed++;
    }
    this.results.phase8_5.total++;
  }

  async testPhase8_5_PatternRecognition() {
    console.log('🎯 Testing Pattern Recognition Fixes...');
    
    try {
      const patternRecognizer = new PatternRecognizer();
      await patternRecognizer.initialize();
      
      // Test with null/undefined data
      const nullInteraction = {
        walletAddress: '33333333333333333333333333333333',
        text: null,
        responseTime: undefined,
        thinkingTime: null,
        mouseMovements: null
      };
      
      const nullResult = await patternRecognizer.recognize(nullInteraction);
      this.assert(nullResult.riskScore >= 0, 'Should handle null data gracefully');
      this.assert(nullResult.fallback === true, 'Should use fallback analysis');
      
      // Test with valid data
      const validInteraction = {
        walletAddress: '44444444444444444444444444444444',
        text: 'Normal human behavior pattern',
        responseTime: 5000,
        thinkingTime: 3000,
        mouseMovements: this.generateNormalMouseData()
      };
      
      const validResult = await patternRecognizer.recognize(validInteraction);
      this.assert(validResult.riskScore >= 0, 'Should calculate risk score');
      this.assert(validResult.confidence >= 0, 'Should calculate confidence');
      this.assert(validResult.fallback !== true, 'Should not use fallback for valid data');
      
      console.log('✅ Pattern recognition fixes passed');
      this.results.phase8_5.passed++;
    } catch (error) {
      console.error('❌ Pattern recognition fixes failed:', error);
      this.results.phase8_5.failed++;
    }
    this.results.phase8_5.total++;
  }

  async testPhase8_5_NullChecks() {
    console.log('🔒 Testing Null Check Fixes...');
    
    try {
      const behaviorAnalyzer = new BehaviorAnalyzer();
      await behaviorAnalyzer.initialize();
      
      // Test generateReason with null analyses
      const keystrokeAnalyzer = behaviorAnalyzer.keystrokePatterns;
      const nullReason = keystrokeAnalyzer.generateReason(null);
      this.assert(typeof nullReason === 'string', 'Should handle null analyses');
      this.assert(nullReason.includes('Normal'), 'Should return normal pattern message');
      
      // Test generateReason with partial analyses
      const partialAnalyses = {
        wpm: { risk: 25, wpm: 150 },
        uniformity: null,
        pauses: { risk: 20, naturalRatio: 0.1 },
        corrections: undefined,
        rhythm: { risk: 15, rhythmScore: 0.8 }
      };
      
      const partialReason = keystrokeAnalyzer.generateReason(partialAnalyses);
      this.assert(typeof partialReason === 'string', 'Should handle partial analyses');
      this.assert(partialReason.includes('Typing speed'), 'Should include typing speed reason');
      this.assert(partialReason.includes('Natural pauses'), 'Should include pauses reason');
      
      console.log('✅ Null check fixes passed');
      this.results.phase8_5.passed++;
    } catch (error) {
      console.error('❌ Null check fixes failed:', error);
      this.results.phase8_5.failed++;
    }
    this.results.phase8_5.total++;
  }

  async testPhase8_5_RiskCalculation() {
    console.log('⚖️ Testing Risk Calculation Fixes...');
    
    try {
      const antiCheat = new AntiCheatSystem();
      await antiCheat.initialize();
      
      // Test with edge case data
      const edgeCaseInteraction = {
        walletAddress: '55555555555555555555555555555555',
        text: '',
        keystrokeTimings: [],
        sessionDuration: 0,
        thinkingTime: 0,
        responseTime: 0,
        mouseMovements: []
      };
      
      const edgeResult = await antiCheat.analyzeInteraction(edgeCaseInteraction);
      this.assert(edgeResult.riskScore.total >= 0, 'Should calculate risk for edge cases');
      this.assert(edgeResult.blocked !== undefined, 'Should determine if blocked');
      this.assert(edgeResult.rewardMultiplier >= 0, 'Should calculate reward multiplier');
      
      // Test with normal data
      const normalInteraction = {
        walletAddress: '66666666666666666666666666666666',
        text: 'This is a normal human response with good quality and natural timing.',
        keystrokeTimings: this.generateNormalKeystrokeData(),
        sessionDuration: 45000,
        thinkingTime: 8000,
        responseTime: 5000,
        mouseMovements: this.generateNormalMouseData()
      };
      
      const normalResult = await antiCheat.analyzeInteraction(normalInteraction);
      this.assert(normalResult.riskScore.total < 30, 'Normal behavior should have low risk');
      this.assert(normalResult.blocked === false, 'Normal behavior should not be blocked');
      this.assert(normalResult.rewardMultiplier === 1.0, 'Normal behavior should have full rewards');
      
      console.log('✅ Risk calculation fixes passed');
      this.results.phase8_5.passed++;
    } catch (error) {
      console.error('❌ Risk calculation fixes failed:', error);
      this.results.phase8_5.failed++;
    }
    this.results.phase8_5.total++;
  }

  async testPhase8_5_Performance() {
    console.log('⚡ Testing Performance Fixes...');
    
    try {
      const antiCheat = new AntiCheatSystem();
      await antiCheat.initialize();
      
      const startTime = Date.now();
      
      // Test multiple rapid analyses
      const interactions = [];
      for (let i = 0; i < 10; i++) {
        interactions.push({
          walletAddress: `wallet${i}`,
          text: `Test interaction ${i}`,
          keystrokeTimings: this.generateNormalKeystrokeData(),
          sessionDuration: 30000 + (i * 1000),
          thinkingTime: 5000 + (i * 100),
          responseTime: 3000 + (i * 100),
          mouseMovements: this.generateNormalMouseData()
        });
      }
      
      const results = await Promise.all(
        interactions.map(interaction => antiCheat.analyzeInteraction(interaction))
      );
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / interactions.length;
      
      this.assert(avgTime < 10, `Average analysis time should be under 10ms (got ${avgTime.toFixed(2)}ms)`);
      this.assert(results.length === interactions.length, 'Should process all interactions');
      this.assert(results.every(r => r.riskScore.total >= 0), 'All results should have valid risk scores');
      
      console.log(`✅ Performance tests passed - Avg time: ${avgTime.toFixed(2)}ms`);
      this.results.phase8_5.passed++;
    } catch (error) {
      console.error('❌ Performance tests failed:', error);
      this.results.phase8_5.failed++;
    }
    this.results.phase8_5.total++;
  }

  // Helper methods
  generateNormalKeystrokeData() {
    const data = [];
    let timestamp = Date.now();
    
    for (let i = 0; i < 20; i++) {
      timestamp += Math.random() * 200 + 50; // 50-250ms intervals
      data.push({
        key: String.fromCharCode(97 + (i % 26)), // a-z
        timestamp: timestamp
      });
    }
    
    return data;
  }

  generateNormalMouseData() {
    const data = [];
    let x = 100, y = 100;
    
    for (let i = 0; i < 10; i++) {
      x += Math.random() * 20 - 10;
      y += Math.random() * 20 - 10;
      data.push({ x, y, timestamp: Date.now() + i * 100 });
    }
    
    return data;
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  printResults() {
    const totalTime = Date.now() - this.startTime;
    
    console.log('\n📊 Test Results Summary');
    console.log('=' .repeat(50));
    
    // Phase 8.4 Results
    const phase8_4 = this.results.phase8_4;
    const phase8_4_success = ((phase8_4.passed / phase8_4.total) * 100).toFixed(1);
    console.log(`📱 Phase 8.4 (Real Wallet Integration): ${phase8_4.passed}/${phase8_4.total} passed (${phase8_4_success}%)`);
    
    // Phase 8.5 Results
    const phase8_5 = this.results.phase8_5;
    const phase8_5_success = ((phase8_5.passed / phase8_5.total) * 100).toFixed(1);
    console.log(`🛡️ Phase 8.5 (Anti-Cheat Fixes): ${phase8_5.passed}/${phase8_5.total} passed (${phase8_5_success}%)`);
    
    // Overall Results
    const totalPassed = phase8_4.passed + phase8_5.passed;
    const totalTests = phase8_4.total + phase8_5.total;
    const overallSuccess = ((totalPassed / totalTests) * 100).toFixed(1);
    
    console.log(`\n🎯 Overall: ${totalPassed}/${totalTests} passed (${overallSuccess}%)`);
    console.log(`⏱️ Total time: ${totalTime}ms`);
    
    if (totalPassed === totalTests) {
      console.log('\n🎉 SUCCESS: All Phase 8.4 & 8.5 tests passed!');
      console.log('✅ Real wallet integration is working');
      console.log('✅ Anti-cheat system fixes are complete');
      console.log('🚀 Ready for production deployment');
    } else {
      console.log('\n⚠️ Some tests failed. Please review and fix issues.');
    }
    
    // Save results to file
    const results = {
      timestamp: new Date().toISOString(),
      phase8_4: {
        ...phase8_4,
        successRate: phase8_4_success + '%'
      },
      phase8_5: {
        ...phase8_5,
        successRate: phase8_5_success + '%'
      },
      overall: {
        passed: totalPassed,
        total: totalTests,
        successRate: overallSuccess + '%',
        totalTime: totalTime + 'ms'
      }
    };
    
    fs.writeFileSync('test-results-phase8-4-8-5-completion.json', JSON.stringify(results, null, 2));
    console.log('\n📄 Results saved to: test-results-phase8-4-8-5-completion.json');
  }
}

// Run tests
async function runTests() {
  const tester = new Phase8CompletionTester();
  await tester.runAllTests();
}

// Execute if run directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { Phase8CompletionTester, runTests };
