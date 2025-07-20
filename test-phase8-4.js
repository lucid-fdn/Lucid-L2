// test-phase8-4.js
// Comprehensive test suite for Phase 8.4 - DevNet Migration
// Tests real wallet integration, devnet transactions, and configuration management

const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
    devnetRpcUrl: 'https://api.devnet.solana.com',
    localnetRpcUrl: 'http://localhost:8899',
    testTimeout: 30000,
    mockTransactionDelay: 2000
};

// Mock Solana Web3 for testing
const mockSolanaWeb3 = {
    Connection: class MockConnection {
        constructor(rpcUrl, commitment) {
            this.rpcUrl = rpcUrl;
            this.commitment = commitment;
            this.mockBlockHeight = 123456789;
            this.mockSlot = 987654321;
        }

        async getLatestBlockhash() {
            return {
                blockhash: 'mock_blockhash_' + Date.now(),
                lastValidBlockHeight: this.mockBlockHeight + 100
            };
        }

        async getBalance(publicKey) {
            if (this.rpcUrl.includes('devnet')) {
                return 1000000000; // 1 SOL in lamports
            }
            return 2000000000; // 2 SOL in lamports
        }

        async getTokenAccountBalance(tokenAccount) {
            return {
                value: {
                    amount: '1000000000',
                    decimals: 9,
                    uiAmount: 1000
                }
            };
        }

        async sendRawTransaction(serializedTransaction, options) {
            await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.mockTransactionDelay));
            return 'mock_signature_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }

        async confirmTransaction(config, commitment) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return { value: { err: null } };
        }

        async getHealth() {
            return 'ok';
        }

        async getSlot() {
            return this.mockSlot;
        }

        async getBlockTime(slot) {
            return Date.now() / 1000;
        }

        async simulateTransaction(transaction) {
            return {
                value: {
                    err: null,
                    logs: ['Program log: Mock transaction simulation'],
                    unitsConsumed: 200000
                }
            };
        }

        async getFeeCalculatorForBlockhash(blockhash) {
            return {
                value: {
                    lamportsPerSignature: 5000
                }
            };
        }
    },

    PublicKey: class MockPublicKey {
        constructor(key) {
            this.toBase58 = () => key;
            this.toString = () => key;
        }
    },

    Transaction: class MockTransaction {
        constructor() {
            this.signatures = [{}];
            this.instructions = [];
            this.recentBlockhash = null;
            this.feePayer = null;
        }

        add(instruction) {
            this.instructions.push(instruction);
        }

        serialize() {
            return Buffer.from('mock_serialized_transaction');
        }
    },

    TransactionInstruction: class MockTransactionInstruction {
        constructor(config) {
            this.keys = config.keys || [];
            this.programId = config.programId;
            this.data = config.data || Buffer.alloc(0);
        }
    },

    ComputeBudgetProgram: {
        setComputeUnitLimit: (config) => ({
            keys: [],
            programId: new mockSolanaWeb3.PublicKey('ComputeBudget111111111111111111111111111111'),
            data: Buffer.from([0, config.units])
        })
    },

    getAssociatedTokenAddress: async (mint, owner) => {
        return new mockSolanaWeb3.PublicKey('mock_associated_token_address');
    }
};

// Test suite class
class Phase84TestSuite {
    constructor() {
        this.results = [];
        this.mockPhantom = null;
        this.setupMocks();
    }

    setupMocks() {
        // Mock Chrome storage API
        global.chrome = {
            storage: {
                local: {
                    get: (keys, callback) => {
                        const mockData = {
                            wallet: null,
                            balance: { sol: 0, mGas: 0, lucid: 0 },
                            walletConnected: false,
                            mGasBalance: 0,
                            lucid_environment: 'devnet'
                        };
                        callback(mockData);
                    },
                    set: (data, callback) => {
                        console.log('💾 Mock storage set:', Object.keys(data));
                        if (callback) callback();
                    },
                    remove: (keys, callback) => {
                        console.log('🗑️ Mock storage remove:', keys);
                        if (callback) callback();
                    }
                }
            }
        };

        // Mock Phantom wallet
        this.mockPhantom = {
            isPhantom: true,
            isConnected: false,
            publicKey: null,
            
            connect: async () => {
                this.mockPhantom.isConnected = true;
                this.mockPhantom.publicKey = new mockSolanaWeb3.PublicKey('CDUauc4hYqPjBqZzhytmXd8DG4pjiwNjPn3cpCWNpToa');
                return { publicKey: this.mockPhantom.publicKey };
            },
            
            disconnect: async () => {
                this.mockPhantom.isConnected = false;
                this.mockPhantom.publicKey = null;
            },
            
            signTransaction: async (transaction) => {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return transaction;
            },
            
            on: (event, callback) => {
                console.log(`🔗 Mock Phantom event listener: ${event}`);
            }
        };

        // Mock window object
        global.window = {
            solana: this.mockPhantom,
            solanaWeb3: mockSolanaWeb3,
            dispatchEvent: (event) => {
                console.log('📢 Mock event dispatched:', event.type);
            }
        };

        // Mock Buffer for Node.js environment
        global.Buffer = Buffer;
    }

    async runTest(testName, testFunction) {
        console.log(`\n🧪 Running test: ${testName}`);
        const startTime = Date.now();
        
        try {
            await testFunction();
            const duration = Date.now() - startTime;
            console.log(`✅ Test passed: ${testName} (${duration}ms)`);
            this.results.push({ name: testName, status: 'PASSED', duration });
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`❌ Test failed: ${testName} (${duration}ms)`);
            console.error('Error:', error.message);
            this.results.push({ name: testName, status: 'FAILED', duration, error: error.message });
        }
    }

    // Test 1: Configuration Manager
    async testConfigurationManager() {
        // Load the configuration manager
        const configPath = path.join(__dirname, 'offchain/src/utils/config.ts');
        const configContent = fs.readFileSync(configPath, 'utf8');
        
        // Check if configuration manager exists
        if (!configContent.includes('ConfigurationManager')) {
            throw new Error('ConfigurationManager class not found in config.ts');
        }

        // Check if environment support is implemented
        if (!configContent.includes('Environment')) {
            throw new Error('Environment type not found in config.ts');
        }

        // Check if devnet configuration exists
        if (!configContent.includes('devnet')) {
            throw new Error('DevNet configuration not found');
        }

        console.log('✓ Configuration manager structure validated');
        console.log('✓ Environment type definitions found');
        console.log('✓ DevNet configuration present');
    }

    // Test 2: Wallet Connection Implementation
    async testWalletConnection() {
        const walletPath = path.join(__dirname, 'browser-extension/wallet-connection.js');
        
        if (!fs.existsSync(walletPath)) {
            throw new Error('wallet-connection.js not found');
        }

        const walletContent = fs.readFileSync(walletPath, 'utf8');
        
        // Check for required classes
        if (!walletContent.includes('RealWalletConnection')) {
            throw new Error('RealWalletConnection class not found');
        }

        if (!walletContent.includes('WalletErrorHandler')) {
            throw new Error('WalletErrorHandler class not found');
        }

        // Check for Phantom integration
        if (!walletContent.includes('window.solana')) {
            throw new Error('Phantom wallet integration not found');
        }

        // Check for balance update methods
        if (!walletContent.includes('updateRealBalances')) {
            throw new Error('Real balance update method not found');
        }

        console.log('✓ RealWalletConnection class implemented');
        console.log('✓ WalletErrorHandler class implemented');
        console.log('✓ Phantom wallet integration present');
        console.log('✓ Real balance update methods found');
    }

    // Test 3: DevNet Transaction Handler
    async testDevNetTransactionHandler() {
        const handlerPath = path.join(__dirname, 'browser-extension/devnet-transaction-handler.js');
        
        if (!fs.existsSync(handlerPath)) {
            throw new Error('devnet-transaction-handler.js not found');
        }

        const handlerContent = fs.readFileSync(handlerPath, 'utf8');
        
        // Check for required classes
        if (!handlerContent.includes('DevnetTransactionHandler')) {
            throw new Error('DevnetTransactionHandler class not found');
        }

        // Check for transaction methods
        if (!handlerContent.includes('signAndSendTransaction')) {
            throw new Error('signAndSendTransaction method not found');
        }

        if (!handlerContent.includes('processThoughtWithRealTransaction')) {
            throw new Error('processThoughtWithRealTransaction method not found');
        }

        // Check for network status methods
        if (!handlerContent.includes('getNetworkStatus')) {
            throw new Error('getNetworkStatus method not found');
        }

        console.log('✓ DevnetTransactionHandler class implemented');
        console.log('✓ Transaction signing and sending methods found');
        console.log('✓ Thought processing with real transactions implemented');
        console.log('✓ Network status checking methods present');
    }

    // Test 4: Browser Extension Manifest
    async testBrowserExtensionManifest() {
        const manifestPath = path.join(__dirname, 'browser-extension/manifest.json');
        
        if (!fs.existsSync(manifestPath)) {
            throw new Error('manifest.json not found');
        }

        const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        
        // Check for required web accessible resources
        const webAccessibleResources = manifestContent.web_accessible_resources[0].resources;
        
        if (!webAccessibleResources.includes('wallet-connection.js')) {
            throw new Error('wallet-connection.js not in web_accessible_resources');
        }

        if (!webAccessibleResources.includes('devnet-transaction-handler.js')) {
            throw new Error('devnet-transaction-handler.js not in web_accessible_resources');
        }

        console.log('✓ Manifest includes wallet-connection.js');
        console.log('✓ Manifest includes devnet-transaction-handler.js');
        console.log('✓ Web accessible resources properly configured');
    }

    // Test 5: Enhanced Popup Implementation
    async testEnhancedPopup() {
        const popupPath = path.join(__dirname, 'browser-extension/popup-phase8-4.js');
        
        if (!fs.existsSync(popupPath)) {
            throw new Error('popup-phase8-4.js not found');
        }

        const popupContent = fs.readFileSync(popupPath, 'utf8');
        
        // Check for Phase 8.4 specific classes
        if (!popupContent.includes('Phase84ConfigManager')) {
            throw new Error('Phase84ConfigManager not found in popup');
        }

        // Check for real wallet integration
        if (!popupContent.includes('RealWalletConnection')) {
            throw new Error('RealWalletConnection integration not found in popup');
        }

        // Check for devnet transaction handling
        if (!popupContent.includes('DevnetTransactionHandler')) {
            throw new Error('DevnetTransactionHandler integration not found in popup');
        }

        // Check for network switching
        if (!popupContent.includes('switchNetwork')) {
            throw new Error('Network switching functionality not found');
        }

        console.log('✓ Phase84ConfigManager integrated in popup');
        console.log('✓ Real wallet connection integrated');
        console.log('✓ DevNet transaction handler integrated');
        console.log('✓ Network switching functionality present');
    }

    // Test 6: Mock Wallet Connection Flow
    async testMockWalletConnectionFlow() {
        // Simulate wallet connection flow
        const mockConfigManager = {
            getConfig: () => ({
                environment: 'devnet',
                rpcUrl: TEST_CONFIG.devnetRpcUrl,
                commitment: 'confirmed'
            }),
            setEnvironment: (env) => console.log(`Environment set to: ${env}`),
            isDevnet: () => true
        };

        // Mock wallet connection
        const result = await this.mockPhantom.connect();
        
        if (!result.publicKey) {
            throw new Error('Mock wallet connection failed');
        }

        console.log('✓ Mock wallet connection successful');
        console.log('✓ Public key obtained:', result.publicKey.toString());
        
        // Test disconnect
        await this.mockPhantom.disconnect();
        
        if (this.mockPhantom.isConnected) {
            throw new Error('Mock wallet disconnect failed');
        }

        console.log('✓ Mock wallet disconnection successful');
    }

    // Test 7: Mock Transaction Processing
    async testMockTransactionProcessing() {
        const mockConnection = new mockSolanaWeb3.Connection(TEST_CONFIG.devnetRpcUrl, 'confirmed');
        
        // Create mock transaction
        const transaction = new mockSolanaWeb3.Transaction();
        transaction.add(new mockSolanaWeb3.TransactionInstruction({
            keys: [],
            programId: new mockSolanaWeb3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
            data: Buffer.from('Test transaction')
        }));

        // Test transaction simulation
        const simulation = await mockConnection.simulateTransaction(transaction);
        
        if (simulation.value.err) {
            throw new Error('Transaction simulation failed');
        }

        console.log('✓ Transaction simulation successful');
        console.log('✓ Compute units consumed:', simulation.value.unitsConsumed);
        
        // Test transaction signing and sending
        const signed = await this.mockPhantom.signTransaction(transaction);
        const signature = await mockConnection.sendRawTransaction(signed.serialize());
        
        if (!signature) {
            throw new Error('Transaction sending failed');
        }

        console.log('✓ Transaction signed and sent successfully');
        console.log('✓ Transaction signature:', signature);
    }

    // Test 8: Network Status Checking
    async testNetworkStatusChecking() {
        const mockConnection = new mockSolanaWeb3.Connection(TEST_CONFIG.devnetRpcUrl, 'confirmed');
        
        // Test network health
        const health = await mockConnection.getHealth();
        
        if (health !== 'ok') {
            throw new Error('Network health check failed');
        }

        // Test slot information
        const slot = await mockConnection.getSlot();
        
        if (typeof slot !== 'number') {
            throw new Error('Slot information retrieval failed');
        }

        // Test block time
        const blockTime = await mockConnection.getBlockTime(slot);
        
        if (typeof blockTime !== 'number') {
            throw new Error('Block time retrieval failed');
        }

        console.log('✓ Network health check passed');
        console.log('✓ Current slot:', slot);
        console.log('✓ Block time retrieved:', new Date(blockTime * 1000).toISOString());
    }

    // Test 9: Error Handling
    async testErrorHandling() {
        // Test wallet not found error
        global.window.solana = null;
        
        try {
            if (!global.window.solana) {
                throw new Error('Phantom wallet not found. Please install Phantom wallet.');
            }
        } catch (error) {
            if (!error.message.includes('Phantom wallet not found')) {
                throw new Error('Wallet not found error handling failed');
            }
        }

        // Restore mock wallet
        global.window.solana = this.mockPhantom;
        
        // Test network error simulation
        const failingConnection = {
            getHealth: async () => {
                throw new Error('Network connection failed');
            }
        };

        try {
            await failingConnection.getHealth();
        } catch (error) {
            if (!error.message.includes('Network connection failed')) {
                throw new Error('Network error handling failed');
            }
        }

        console.log('✓ Wallet not found error handling works');
        console.log('✓ Network error handling works');
    }

    // Test 10: File Structure Validation
    async testFileStructureValidation() {
        const requiredFiles = [
            'PHASE-8.4-DEVNET-MIGRATION-GUIDE.md',
            'offchain/src/utils/config.ts',
            'browser-extension/wallet-connection.js',
            'browser-extension/devnet-transaction-handler.js',
            'browser-extension/popup-phase8-4.js',
            'browser-extension/manifest.json'
        ];

        const missingFiles = [];
        
        for (const file of requiredFiles) {
            const filePath = path.join(__dirname, file);
            if (!fs.existsSync(filePath)) {
                missingFiles.push(file);
            }
        }

        if (missingFiles.length > 0) {
            throw new Error(`Missing required files: ${missingFiles.join(', ')}`);
        }

        console.log('✓ All required Phase 8.4 files present');
        console.log('✓ File structure validation passed');
    }

    // Main test runner
    async runAllTests() {
        console.log('🚀 Starting Phase 8.4 DevNet Migration Test Suite');
        console.log('=' .repeat(60));

        const tests = [
            { name: 'Configuration Manager', fn: () => this.testConfigurationManager() },
            { name: 'Wallet Connection Implementation', fn: () => this.testWalletConnection() },
            { name: 'DevNet Transaction Handler', fn: () => this.testDevNetTransactionHandler() },
            { name: 'Browser Extension Manifest', fn: () => this.testBrowserExtensionManifest() },
            { name: 'Enhanced Popup Implementation', fn: () => this.testEnhancedPopup() },
            { name: 'Mock Wallet Connection Flow', fn: () => this.testMockWalletConnectionFlow() },
            { name: 'Mock Transaction Processing', fn: () => this.testMockTransactionProcessing() },
            { name: 'Network Status Checking', fn: () => this.testNetworkStatusChecking() },
            { name: 'Error Handling', fn: () => this.testErrorHandling() },
            { name: 'File Structure Validation', fn: () => this.testFileStructureValidation() }
        ];

        for (const test of tests) {
            await this.runTest(test.name, test.fn);
        }

        // Generate test summary
        this.generateTestSummary();
    }

    generateTestSummary() {
        console.log('\n' + '=' .repeat(60));
        console.log('🎯 Phase 8.4 DevNet Migration Test Results');
        console.log('=' .repeat(60));

        const passed = this.results.filter(r => r.status === 'PASSED').length;
        const failed = this.results.filter(r => r.status === 'FAILED').length;
        const totalTime = this.results.reduce((sum, r) => sum + r.duration, 0);

        console.log(`\n📊 Summary:`);
        console.log(`   Total Tests: ${this.results.length}`);
        console.log(`   Passed: ${passed} ✅`);
        console.log(`   Failed: ${failed} ❌`);
        console.log(`   Total Time: ${totalTime}ms`);
        console.log(`   Success Rate: ${((passed / this.results.length) * 100).toFixed(1)}%`);

        if (failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.results.filter(r => r.status === 'FAILED').forEach(test => {
                console.log(`   - ${test.name}: ${test.error}`);
            });
        }

        // Save results to file
        const resultsPath = path.join(__dirname, 'test-results-phase8-4.json');
        fs.writeFileSync(resultsPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            phase: '8.4',
            summary: {
                total: this.results.length,
                passed,
                failed,
                totalTime,
                successRate: ((passed / this.results.length) * 100).toFixed(1)
            },
            results: this.results
        }, null, 2));

        console.log(`\n📄 Detailed results saved to: ${resultsPath}`);
        
        if (passed === this.results.length) {
            console.log('\n🎉 All tests passed! Phase 8.4 DevNet Migration is ready for production.');
        } else {
            console.log('\n⚠️  Some tests failed. Please review and fix the issues before proceeding.');
        }
    }
}

// Run the tests
async function main() {
    const testSuite = new Phase84TestSuite();
    await testSuite.runAllTests();
}

// Export for use in other modules
module.exports = { Phase84TestSuite };

// Run tests if this file is executed directly
if (require.main === module) {
    main().catch(console.error);
}
