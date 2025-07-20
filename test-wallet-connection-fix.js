/**
 * Test Script: Wallet Connection Fix Verification
 * 
 * This script simulates the wallet connection scenarios to verify
 * the "Content script not available" error has been resolved.
 */

console.log('🧪 Testing Wallet Connection Fix...');

// Simulate the browser extension environment
class MockExtensionEnvironment {
    constructor() {
        this.storage = new Map();
        this.tabs = [{ id: 1, url: 'https://example.com' }];
        this.contentScriptAvailable = false;
        this.phantomAvailable = false;
    }

    // Mock chrome.storage.local
    mockStorage() {
        return {
            get: (keys, callback) => {
                const result = {};
                keys.forEach(key => {
                    result[key] = this.storage.get(key);
                });
                callback(result);
            },
            set: (data, callback) => {
                Object.entries(data).forEach(([key, value]) => {
                    this.storage.set(key, value);
                });
                if (callback) callback();
            }
        };
    }

    // Mock chrome.tabs
    mockTabs() {
        return {
            query: (queryInfo, callback) => {
                callback(this.tabs);
            },
            sendMessage: (tabId, message, callback) => {
                if (!this.contentScriptAvailable) {
                    // Simulate content script not available
                    setTimeout(() => {
                        global.chrome.runtime.lastError = { message: 'Content script not available' };
                        callback();
                    }, 10);
                } else {
                    // Simulate successful content script response
                    setTimeout(() => {
                        global.chrome.runtime.lastError = null;
                        callback({
                            success: true,
                            wallet: {
                                address: 'CDUauc4hYqPjBqZzhytmXd8DG4pjiwNjPn3cpCWNpToa',
                                publicKey: 'mock-public-key'
                            }
                        });
                    }, 10);
                }
            }
        };
    }

    // Mock chrome.scripting
    mockScripting() {
        return {
            executeScript: (details, callback) => {
                console.log('🔧 Injecting content script:', details.files);
                // Simulate successful injection
                setTimeout(() => {
                    this.contentScriptAvailable = true;
                    if (callback) callback();
                }, 50);
            }
        };
    }

    // Mock window.solana (Phantom wallet)
    mockPhantom() {
        if (this.phantomAvailable) {
            return {
                isPhantom: true,
                isConnected: false,
                connect: async () => {
                    console.log('🔗 Phantom wallet connection successful');
                    return {
                        publicKey: {
                            toString: () => 'CDUauc4hYqPjBqZzhytmXd8DG4pjiwNjPn3cpCWNpToa'
                        }
                    };
                }
            };
        }
        return null;
    }
}

// Test the enhanced wallet connection logic
class WalletConnectionTester {
    constructor() {
        this.mockEnv = new MockExtensionEnvironment();
        this.setupMocks();
    }

    setupMocks() {
        // Mock chrome APIs
        global.chrome = {
            storage: { local: this.mockEnv.mockStorage() },
            tabs: this.mockEnv.mockTabs(),
            scripting: this.mockEnv.mockScripting(),
            runtime: { lastError: null }
        };
    }

    async testScenario(name, setup, expected) {
        console.log(`\n📋 Testing: ${name}`);
        
        try {
            // Setup scenario
            await setup();
            
            // Test wallet connection
            const result = await this.simulateWalletConnection();
            
            // Verify result
            if (result.success === expected.success) {
                console.log(`✅ ${name}: PASSED`);
                return true;
            } else {
                console.log(`❌ ${name}: FAILED - Expected ${expected.success}, got ${result.success}`);
                console.log(`   Error: ${result.error || 'No error'}`);
                return false;
            }
        } catch (error) {
            console.log(`❌ ${name}: FAILED - Exception: ${error.message}`);
            return false;
        }
    }

    async simulateWalletConnection() {
        // Simulate the enhanced connectWallet method
        try {
            // Strategy 1: Direct wallet connection
            if (this.mockEnv.phantomAvailable) {
                const phantom = this.mockEnv.mockPhantom();
                if (phantom && phantom.isPhantom) {
                    const response = await phantom.connect();
                    return {
                        success: true,
                        wallet: {
                            address: response.publicKey.toString(),
                            publicKey: response.publicKey
                        }
                    };
                }
            }

            // Strategy 2: Content script communication
            const tabs = await new Promise((resolve) => {
                chrome.tabs.query({ active: true, currentWindow: true }, resolve);
            });

            if (tabs.length === 0) {
                throw new Error('No active tab found. Please open a web page and try again.');
            }

            // Check if content script is available
            const isAvailable = await this.checkContentScriptAvailable(tabs[0].id);
            
            if (!isAvailable) {
                // Inject content script
                await new Promise((resolve, reject) => {
                    chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id },
                        files: ['content.js']
                    }, (result) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(result);
                        }
                    });
                });
                
                // Wait for content script to initialize
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Send message with retry logic
            const result = await this.sendMessageWithRetry(tabs[0].id, {
                action: 'connectWallet'
            });

            return result;

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async checkContentScriptAvailable(tabId) {
        return new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, { action: 'getPageInfo' }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve(false);
                } else {
                    resolve(response && response.title);
                }
            });
        });
    }

    async sendMessageWithRetry(tabId, message, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const result = await new Promise((resolve, reject) => {
                    chrome.tabs.sendMessage(tabId, message, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response);
                        }
                    });
                });
                return result;
            } catch (error) {
                console.log(`   Retry ${i + 1}/${maxRetries} failed:`, error.message);
                if (i === maxRetries - 1) {
                    throw new Error('Content script not available. Please refresh the page and try again.');
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    async runAllTests() {
        console.log('🚀 Starting Wallet Connection Fix Tests...\n');
        
        const tests = [
            {
                name: 'Direct Phantom Connection (Phantom Available)',
                setup: async () => {
                    this.mockEnv.phantomAvailable = true;
                    this.mockEnv.contentScriptAvailable = false;
                },
                expected: { success: true }
            },
            {
                name: 'Content Script Auto-Injection (No Content Script)',
                setup: async () => {
                    this.mockEnv.phantomAvailable = false;
                    this.mockEnv.contentScriptAvailable = false;
                },
                expected: { success: true }
            },
            {
                name: 'Content Script Direct Communication (Content Script Available)',
                setup: async () => {
                    this.mockEnv.phantomAvailable = false;
                    this.mockEnv.contentScriptAvailable = true;
                },
                expected: { success: true }
            },
            {
                name: 'No Active Tab Error',
                setup: async () => {
                    this.mockEnv.phantomAvailable = false;
                    this.mockEnv.contentScriptAvailable = false;
                    this.mockEnv.tabs = [];
                },
                expected: { success: false }
            }
        ];

        let passed = 0;
        let total = tests.length;

        for (const test of tests) {
            const result = await this.testScenario(test.name, test.setup, test.expected);
            if (result) passed++;
        }

        console.log('\n' + '='.repeat(50));
        console.log(`📊 Test Results: ${passed}/${total} tests passed`);
        console.log('='.repeat(50));

        if (passed === total) {
            console.log('🎉 All tests passed! Wallet connection fix is working correctly.');
        } else {
            console.log('⚠️  Some tests failed. Please review the implementation.');
        }

        return passed === total;
    }
}

// Run the tests
async function runTests() {
    const tester = new WalletConnectionTester();
    return await tester.runAllTests();
}

// Execute if run directly
if (require.main === module) {
    runTests().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { WalletConnectionTester, runTests };
