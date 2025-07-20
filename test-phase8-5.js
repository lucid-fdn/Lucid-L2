/**
 * Test Suite for Phase 8.5: Anti-Cheat & Fraud Prevention System
 * Tests comprehensive fraud detection and prevention mechanisms
 */

const fs = require('fs');
const path = require('path');

// Mock Chrome APIs for testing
global.chrome = {
  storage: {
    local: {
      get: (keys, callback) => {
        callback({});
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

// Mock browser APIs
global.window = {};
global.navigator = {
  userAgent: 'Mozilla/5.0 (Test Browser) Test/1.0'
};

// Load the anti-cheat system components
const antiCheatCode = fs.readFileSync(path.join(__dirname, 'browser-extension/anti-cheat-system.js'), 'utf8');
const behaviorAnalyzerCode = fs.readFileSync(path.join(__dirname, 'browser-extension/behavior-analyzer.js'), 'utf8');
const qualityValidatorCode = fs.readFileSync(path.join(__dirname, 'browser-extension/quality-validator.js'), 'utf8');
const patternRecognizerCode = fs.readFileSync(path.join(__dirname, 'browser-extension/pattern-recognizer.js'), 'utf8');

// Create a controlled environment for testing
const testEnvironment = {
  console: console,
  chrome: global.chrome,
  window: global.window,
  navigator: global.navigator,
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

// Extract classes from test environment
const AntiCheatSystem = context.window.AntiCheatSystem;
const BehaviorAnalyzer = context.window.BehaviorAnalyzer;
const QualityValidator = context.window.QualityValidator;
const PatternRecognizer = context.window.PatternRecognizer;

class AntiCheatTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      total: 0
    };
  }

  async runTests() {
    console.log('🛡️ Starting Phase 8.5 Anti-Cheat System Tests...\n');

    await this.testAntiCheatInitialization();
    await this.testBehaviorAnalysis();
    await this.testRiskCalculation();
    await this.testFraudDetection();
    await this.testPerformance();
    await this.testEdgeCases();

    this.printResults();
  }

  async testAntiCheatInitialization() {
    console.log('🔧 Testing Anti-Cheat System Initialization...');
    
    try {
      const antiCheat = new AntiCheatSystem();
      this.assert(antiCheat !== null, 'Anti-cheat system should be created');
      this.assert(antiCheat.isInitialized === false, 'System should start uninitialized');
      
      await antiCheat.initialize();
      this.assert(antiCheat.isInitialized === true, 'System should be initialized');
      
      console.log('✅ Anti-cheat system initialization passed');
    } catch (error) {
      console.error('❌ Anti-cheat system initialization failed:', error);
      this.results.failed++;
    }
  }

  async testBehaviorAnalysis() {
    console.log('🔍 Testing Behavior Analysis...');
    
    try {
      const behaviorAnalyzer = new BehaviorAnalyzer();
      await behaviorAnalyzer.initialize();
      
      // Test normal human behavior
      const normalInteraction = {
        walletAddress: '11111111111111111111111111111111',
        text: 'Hello world, this is a normal human message.',
        keystrokeTimings: this.generateNormalKeystrokeData(),
        sessionDuration: 30000,
        thinkingTime: 5000,
        responseTime: 3000,
        mouseMovements: this.generateNormalMouseData()
      };
      
      const normalResult = await behaviorAnalyzer.analyze(normalInteraction);
      this.assert(normalResult.riskScore < 15, 'Normal behavior should have low risk score');
      this.assert(normalResult.confidence > 50, 'Normal behavior should have good confidence');
      
      // Test suspicious behavior
      const suspiciousInteraction = {
        walletAddress: '22222222222222222222222222222222',
        text: 'Bot generated response',
        keystrokeTimings: this.generateSuspiciousKeystrokeData(),
        sessionDuration: 1000,
        thinkingTime: 0,
        responseTime: 100,
        mouseMovements: []
      };
      
      const suspiciousResult = await behaviorAnalyzer.analyze(suspiciousInteraction);
      this.assert(suspiciousResult.riskScore > 15, 'Suspicious behavior should have high risk score');
      
      console.log('✅ Behavior analysis tests passed');
      console.log(`   Normal risk: ${normalResult.riskScore}, Suspicious risk: ${suspiciousResult.riskScore}`);
    } catch (error) {
      console.error('❌ Behavior analysis tests failed:', error);
      this.results.failed++;
    }
  }

  async testRiskCalculation() {
    console.log('⚖️ Testing Risk Calculation...');
    
    try {
      const antiCheat = new AntiCheatSystem();
      await antiCheat.initialize();
      
      // Test low risk scenario
      const lowRiskInteraction = {
        walletAddress: '33333333333333333333333333333333',
        text: 'This is a thoughtful human response with good quality.',
        keystrokeTimings: this.generateNormalKeystrokeData(),
        sessionDuration: 45000,
        thinkingTime: 8000,
        responseTime: 5000,
        mouseMovements: this.generateNormalMouseData()
      };
      
      const lowRiskResult = await antiCheat.analyzeInteraction(lowRiskInteraction);
      this.assert(lowRiskResult.blocked === false, 'Low risk should not be blocked');
      this.assert(lowRiskResult.rewardMultiplier === 1.0, 'Low risk should have full rewards');
      
      // Test high risk scenario
      const highRiskInteraction = {
        walletAddress: '44444444444444444444444444444444',
        text: 'x',
        keystrokeTimings: this.generateBotKeystrokeData(),
        sessionDuration: 500,
        thinkingTime: 0,
        responseTime: 50,
        mouseMovements: this.generateBotMouseData()
      };
      
      const highRiskResult = await antiCheat.analyzeInteraction(highRiskInteraction);
      this.assert(highRiskResult.riskScore.total > 50, 'High risk should have high total risk score');
      
      console.log('✅ Risk calculation tests passed');
      console.log(`   Low risk total: ${lowRiskResult.riskScore.total}, High risk total: ${highRiskResult.riskScore.total}`);
    } catch (error) {
      console.error('❌ Risk calculation tests failed:', error);
      this.results.failed++;
    }
  }

  async testFraudDetection() {
    console.log('🚨 Testing Fraud Detection...');
    
    try {
      const antiCheat = new AntiCheatSystem();
      await antiCheat.initialize();
      
      // Test bot-like behavior detection
      const botInteraction = {
        walletAddress: '55555555555555555555555555555555',
        text: 'Automated response',
        keystrokeTimings: this.generateBotKeystrokeData(),
        sessionDuration: 100,
        thinkingTime: 0,
        responseTime: 10,
        mouseMovements: this.generateBotMouseData()
      };
      
      const botResult = await antiCheat.analyzeInteraction(botInteraction);
      this.assert(botResult.riskScore.total > 60, 'Bot behavior should be detected');
      
      // Test farming behavior detection
      const farmingInteraction = {
        walletAddress: '66666666666666666666666666666666',
        text: 'Copy paste response',
        keystrokeTimings: [], // No keystroke data suggests copy-paste
        sessionDuration: 200,
        thinkingTime: 0,
        responseTime: 100,
        mouseMovements: []
      };
      
      const farmingResult = await antiCheat.analyzeInteraction(farmingInteraction);
      this.assert(farmingResult.riskScore.total > 40, 'Farming behavior should be detected');
      
      console.log('✅ Fraud detection tests passed');
      console.log(`   Bot risk: ${botResult.riskScore.total}, Farming risk: ${farmingResult.riskScore.total}`);
    } catch (error) {
      console.error('❌ Fraud detection tests failed:', error);
      this.results.failed++;
    }
  }

  async testPerformance() {
    console.log('⚡ Testing Performance...');
    
    try {
      const antiCheat = new AntiCheatSystem();
      await antiCheat.initialize();
      
      const testInteraction = {
        walletAddress: '77777777777777777777777777777777',
        text: 'Performance test message',
        keystrokeTimings: this.generateNormalKeystrokeData(),
        sessionDuration: 25000,
        thinkingTime: 3000,
        responseTime: 2000,
        mouseMovements: this.generateNormalMouseData()
      };
      
      const startTime = Date.now();
      const result = await antiCheat.analyzeInteraction(testInteraction);
      const endTime = Date.now();
      
      const processingTime = endTime - startTime;
      this.assert(processingTime < 1000, 'Analysis should complete within 1 second');
      this.assert(result.processingTime < 500, 'Reported processing time should be reasonable');
      
      console.log('✅ Performance tests passed');
      console.log(`   Processing time: ${processingTime}ms, Reported time: ${result.processingTime}ms`);
    } catch (error) {
      console.error('❌ Performance tests failed:', error);
      this.results.failed++;
    }
  }

  async testEdgeCases() {
    console.log('🔍 Testing Edge Cases...');
    
    try {
      const antiCheat = new AntiCheatSystem();
      await antiCheat.initialize();
      
      // Test with minimal data
      const minimalInteraction = {
        walletAddress: '88888888888888888888888888888888',
        text: 'Hi'
      };
      
      const minimalResult = await antiCheat.analyzeInteraction(minimalInteraction);
      this.assert(minimalResult !== null, 'Should handle minimal data');
      this.assert(minimalResult.fallback !== true, 'Should not fallback with minimal data');
      
      // Test with empty data
      const emptyInteraction = {
        walletAddress: '99999999999999999999999999999999',
        text: ''
      };
      
      const emptyResult = await antiCheat.analyzeInteraction(emptyInteraction);
      this.assert(emptyResult !== null, 'Should handle empty data');
      
      // Test with null wallet address
      const nullWalletInteraction = {
        walletAddress: null,
        text: 'Test message'
      };
      
      const nullResult = await antiCheat.analyzeInteraction(nullWalletInteraction);
      this.assert(nullResult !== null, 'Should handle null wallet address');
      
      console.log('✅ Edge case tests passed');
    } catch (error) {
      console.error('❌ Edge case tests failed:', error);
      this.results.failed++;
    }
  }

  generateNormalKeystrokeData() {
    const data = [];
    let timestamp = Date.now();
    const text = 'Hello world, this is a normal human message.';
    
    for (let i = 0; i < text.length; i++) {
      // Add natural variation in timing
      const baseInterval = 120 + Math.random() * 80; // 120-200ms base
      const variation = (Math.random() - 0.5) * 40; // ±20ms variation
      timestamp += baseInterval + variation;
      
      // Add occasional longer pauses (thinking)
      if (Math.random() < 0.1) {
        timestamp += 500 + Math.random() * 1000;
      }
      
      data.push({
        key: text[i],
        timestamp: timestamp
      });
    }
    
    return data;
  }

  generateSuspiciousKeystrokeData() {
    const data = [];
    let timestamp = Date.now();
    const text = 'Bot generated response';
    
    for (let i = 0; i < text.length; i++) {
      // Very uniform timing (suspicious)
      timestamp += 80; // Exactly 80ms between each keystroke
      
      data.push({
        key: text[i],
        timestamp: timestamp
      });
    }
    
    return data;
  }

  generateBotKeystrokeData() {
    const data = [];
    let timestamp = Date.now();
    const text = 'Automated response';
    
    for (let i = 0; i < text.length; i++) {
      // Inhuman speed and uniformity
      timestamp += 20; // 20ms between keystrokes (too fast)
      
      data.push({
        key: text[i],
        timestamp: timestamp
      });
    }
    
    return data;
  }

  generateNormalMouseData() {
    const data = [];
    let timestamp = Date.now();
    
    // Generate natural mouse movement curve
    for (let i = 0; i < 50; i++) {
      const x = 100 + i * 5 + Math.random() * 10;
      const y = 100 + Math.sin(i * 0.2) * 20 + Math.random() * 5;
      timestamp += 16 + Math.random() * 8; // ~60fps with variation
      
      data.push({ x, y, timestamp });
    }
    
    return data;
  }

  generateBotMouseData() {
    const data = [];
    let timestamp = Date.now();
    
    // Generate perfectly straight line (suspicious)
    for (let i = 0; i < 20; i++) {
      const x = 100 + i * 10; // Perfectly straight
      const y = 100; // No variation
      timestamp += 16; // Exactly 16ms intervals
      
      data.push({ x, y, timestamp });
    }
    
    return data;
  }

  assert(condition, message) {
    this.results.total++;
    if (condition) {
      this.results.passed++;
    } else {
      this.results.failed++;
      console.error(`❌ Assertion failed: ${message}`);
    }
  }

  printResults() {
    console.log('\n📊 Test Results Summary:');
    console.log(`Total Tests: ${this.results.total}`);
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);
    console.log(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`);
    
    if (this.results.failed === 0) {
      console.log('🎉 All tests passed! Anti-cheat system is working correctly.');
    } else {
      console.log('⚠️ Some tests failed. Please review the implementation.');
    }
  }
}

// Run the tests
async function runTests() {
  const tester = new AntiCheatTester();
  await tester.runTests();
}

// Export for use in other modules
module.exports = { AntiCheatTester };

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}
